// No scheduled/paid Firebase services. Uses a revision-checked snapshot already
// loaded by the admin. Activation in production is a separate release operation.
window.archiveOperations = (() => {
    const core = window.productLifecycle;
    const api = () => window.firebaseFunctions;
    const stateRef = () => api().doc(window.firebaseDb, '_maintenance', 'productLifecycle');
    const stamp = () => api().serverTimestamp();
    // Bounds maintenance writes, not the entire application's Firestore usage.
    // Security-rule lookups and UI refreshes also consume the read quota.
    const MAX_STEPS = 60;
    let running = false;
    function fail(message) { const error = new Error(message); error.isStockError = true; throw error; }
    async function readState() {
        const snap = await api().getDocFromServer(stateRef());
        return snap.exists() ? snap.data() : { revision: 0 };
    }
    async function revision(transaction) {
        const snap = await transaction.get(stateRef());
        return snap.exists() ? snap.data() : { revision: 0 };
    }
    function bump(transaction, state, extra = {}) {
        transaction.set(stateRef(), { ...state, enabled: state.enabled === true, ...extra, revision: (state.revision || 0) + 1 });
    }
    async function transact(work) {
        const generation = window.authGeneration || 0;
        for (let attempt = 0; attempt < 3; attempt++) {
            let observed;
            try {
                return await api().runTransaction(window.firebaseDb, async tx => {
                    if (generation !== (window.authGeneration || 0)) fail('Учётная запись сменилась. Откройте форму заново');
                    const state = await revision(tx);
                    observed = state.revision || 0;
                    return work(tx, state);
                });
            } catch (error) {
                // Rules can reject an optimistic transaction before Firestore
                // reports ABORTED if another tab has advanced the shared revision.
                // Retry only a proven revision conflict, with the same operation ID.
                if (error.code !== 'permission-denied' || attempt === 2 || observed === undefined ||
                    generation !== (window.authGeneration || 0)) throw error;
                const current = await readState();
                if ((current.revision || 0) === observed) throw error;
            }
        }
    }
    function stockPatch(product, stock) {
        const patch = { stock, lifecycleVersion: 1 };
        if (stock > 0) {
            patch.zeroStockSince = null;
            // Receiving/returning stock restores a deleted card. Reducing its
            // retained quantity must not silently restore it to the catalog.
            if (!product.isDeleted || stock > product.stock) Object.assign(patch, {
                isDeleted: false, deletedAt: null, deletionReason: null,
                deletedBy: null, purgeVersion: null,
                ...(product.isDeleted ? { restoredAt: stamp() } : {}) });
        }
        else if (product.stock !== 0 || !product.zeroStockSince)
            Object.assign(patch, { zeroStockSince: stamp(), zeroStockSinceSource: 'operation' });
        return patch;
    }
    async function changeStatus(id, restore = false) {
        return transact(async (tx, state) => {
            const ref = api().doc(window.firebaseDb, 'products', id);
            const row = await tx.get(ref);
            if (!row.exists()) fail('Карточка уже окончательно удалена');
            const p = row.data();
            if (!core.validStock(p)) fail('Сначала проверьте некорректный остаток');
            if (restore) {
                if (!p.isDeleted) return;
                tx.update(ref, { isDeleted: false, deletedAt: null, deletionReason: null,
                    deletedBy: null, purgeVersion: null, restoredAt: stamp(),
                    zeroStockSince: p.stock === 0 ? (p.zeroStockSince || stamp()) : null,
                    zeroStockSinceSource: p.zeroStockSinceSource || 'observed', lifecycleVersion: 1 });
            } else {
                if (p.isDeleted) return;
                tx.update(ref, { isDeleted: true, deletedAt: stamp(), deletionReason: 'manual',
                    deletedBy: window.firebaseAuth?.currentUser?.uid || window.currentUser?.uid || '',
                    purgeVersion: null });
            }
            bump(tx, state);
        });
    }
    async function updateProduct(id, data) {
        return transact(async (tx, state) => {
            const ref = api().doc(window.firebaseDb, 'products', id);
            const p = await tx.get(ref);
            if (!p.exists()) fail('Карточка уже окончательно удалена. Обновите каталог');
            tx.update(ref, { ...data, ...(p.data().purgeVersion ? { purgeVersion: null } : {}) });
            bump(tx, state);
        });
    }
    async function recordOpeningIncome(data) {
        const ref = api().doc(api().collection(window.firebaseDb, 'income'));
        return transact(async (tx, state) => {
            const row = await tx.get(api().doc(window.firebaseDb, 'products', data.productId));
            if (!row.exists()) fail('Товар уже удалён');
            tx.set(ref, { ...data, productSnapshot: core.snapshot({ id: data.productId, ...row.data() }, 'operation') });
            bump(tx, state);
        });
    }
    function contextActive(context) { return context.generation === (window.authGeneration || 0); }
    // One transaction attempt: conflicts stop maintenance, never multiply retries.
    async function step(context, work) {
        if (!contextActive(context)) fail('Учётная запись сменилась');
        const result = await api().runTransaction(window.firebaseDb, async tx => {
            const state = await revision(tx);
            if (!contextActive(context) || state.enabled !== true || state.runId !== context.runId ||
                (state.revision || 0) !== context.revision || (state.steps || 0) >= MAX_STEPS)
                fail('Данные изменились. Проверка продолжится при следующем запуске');
            const tracked = {
                get: ref => tx.get(ref),
                update: (ref, data) => { context.paths.add(ref.path); return tx.update(ref, data); },
                delete: ref => { context.paths.add(ref.path); return tx.delete(ref); }
            };
            const value = await work(tracked);
            bump(tx, state, { steps: (state.steps || 0) + 1 });
            return value;
        }, { maxAttempts: 1 });
        context.revision++;
        context.steps++;
        return result;
    }
    async function run({ products, income, sales, expectedRevision, generation }) {
        if (running || generation !== (window.authGeneration || 0)) return { skipped: true };
        running = true;
        const report = { archived: 0, purged: 0, initialized: 0, snapshots: 0, exceptions: [] };
        const paths = new Set();
        try {
            const runId = crypto.randomUUID();
            const claimed = await api().runTransaction(window.firebaseDb, async tx => {
                const state = await revision(tx);
                if (state.enabled !== true || (state.revision || 0) !== expectedRevision ||
                    Date.now() - core.millis(state.lastStartedAt) < core.DAY ||
                    generation !== (window.authGeneration || 0)) return false;
                tx.set(stateRef(), { ...state, runId, lastStartedAt: stamp(), steps: 0 });
                return true;
            }, { maxAttempts: 1 });
            if (!claimed) return { skipped: true };
            const clock = await readState();
            const now = core.millis(clock.lastStartedAt);
            if (!Number.isFinite(now)) fail('Не удалось получить серверное время проверки');
            const context = { runId, generation, revision: expectedRevision, steps: 0, paths };
            // Purge takes priority so initial migration cannot starve retention.
            const candidates = [...products].sort((a, b) => Number(!!b.isDeleted) - Number(!!a.isDeleted) || a.id.localeCompare(b.id));
            for (const p of candidates) {
                if (context.steps >= MAX_STEPS) break;
                if (!core.validStock(p)) { report.exceptions.push({ id: p.id, reason: 'Некорректный остаток' }); continue; }
                if (p.stock > 0 && !p.isDeleted) continue;
                const ref = api().doc(window.firebaseDb, 'products', p.id);
                if (p.isDeleted) {
                    const deadline = core.purgeDate(p.deletedAt);
                    if (!Number.isFinite(deadline)) {
                        report.exceptions.push({ id: p.id, reason: 'Неизвестна дата удаления' }); continue;
                    }
                    // Prepare large histories before expiration; never delete early.
                    if (!(now >= deadline - 30 * core.DAY)) continue;
                    const version = p.purgeVersion || runId + ':' + p.id;
                    const history = core.snapshot(p, version);
                    if (!Number.isFinite(history.cost) || history.cost < 0) {
                        report.exceptions.push({ id: p.id, reason: 'Неизвестна стоимость для исторических отчётов' }); continue;
                    }
                    const references = [
                        ...income.filter(i => i.productId === p.id).map(i => ({ collection: 'income', data: i })),
                        ...sales.filter(s => s.items?.some(i => i.productId === p.id)).map(s => ({ collection: 'sales', data: s }))
                    ];
                    const pending = references.filter(({ collection, data }) => collection === 'income'
                        ? data.productSnapshot?.version !== version
                        : data.items.some(i => i.productId === p.id && i.productSnapshot?.version !== version));
                    if (!p.purgeVersion) {
                        await step(context, async tx => {
                            const row = await tx.get(ref);
                            if (!row.exists() || !core.deleted(row.data())) fail('Товар восстановлен');
                            tx.update(ref, { purgeVersion: version });
                        });
                        p.purgeVersion = version;
                    }
                    for (const entry of pending) {
                        if (context.steps >= MAX_STEPS) break;
                        const savedPatch = await step(context, async tx => {
                            const row = await tx.get(ref);
                            const historyRef = api().doc(window.firebaseDb, entry.collection, entry.data.id);
                            const document = await tx.get(historyRef);
                            if (!row.exists() || row.data().purgeVersion !== version || !core.deleted(row.data())) fail('Товар изменён');
                            if (!document.exists()) fail('История изменилась');
                            const data = document.data();
                            const patch = entry.collection === 'income' ? { productSnapshot: history }
                                : { items: data.items.map(i => i.productId === p.id ? { ...i, productSnapshot: history } : i) };
                            tx.update(historyRef, patch);
                            return patch;
                        });
                        Object.assign(entry.data, savedPatch);
                        report.snapshots++;
                    }
                    const ready = references.every(({ collection, data }) => collection === 'income'
                        ? data.productSnapshot?.version === version
                        : data.items.filter(i => i.productId === p.id).every(i => i.productSnapshot?.version === version));
                    if (ready && now >= deadline && context.steps < MAX_STEPS) {
                        await step(context, async tx => {
                            const row = await tx.get(ref);
                            if (!row.exists() || !core.deleted(row.data()) || row.data().purgeVersion !== version ||
                                !(now >= core.purgeDate(row.data().deletedAt))) fail('Очистка отменена: товар изменён');
                            tx.delete(ref);
                        });
                        report.purged++;
                    }
                    continue;
                }
                let data = p, patch = null;
                if (!p.lifecycleVersion) {
                    const audit = core.audit(p, income, sales, now);
                    if (audit.since === undefined) { report.exceptions.push(audit); continue; }
                    patch = { lifecycleVersion: 1, isDeleted: false,
                        zeroStockSince: api().Timestamp.fromMillis(audit.since),
                        legacyCreatedAt: api().Timestamp.fromMillis(audit.created),
                        zeroStockSinceSource: 'legacy_history' };
                    data = { ...p, ...patch };
                }
                const shouldArchive = core.eligible(data, now);
                if (!patch && !shouldArchive) continue;
                await step(context, async tx => {
                    const row = await tx.get(ref);
                    if (!row.exists() || row.data().stock !== 0 || row.data().isDeleted) fail('Товар изменён');
                    tx.update(ref, { ...patch, ...(shouldArchive ? { isDeleted: true, deletedAt: stamp(),
                        deletionReason: 'zero_stock_30_days', deletedBy: 'maintenance', purgeVersion: null } : {}) });
                });
                if (patch) report.initialized++;
                if (shouldArchive) report.archived++;
            }
            report.steps = context.steps;
            report.paths = [...paths];
            return report;
        } catch (error) {
            return { ...report, paused: true, paths: [...paths], error: error.code || error.message };
        } finally { running = false; }
    }
    return { readState, revision, bump, transact, stockPatch, changeStatus, updateProduct, recordOpeningIncome, run, MAX_STEPS };
})();
