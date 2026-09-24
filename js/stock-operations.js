// Every document and its stock delta commit together, using server state.
// This never recalculates historical/opening stock from the journal.
window.stockOperations = (() => {
    const requests = new WeakMap();

    function fail(message) {
        const error = new Error(message);
        error.isStockError = true;
        throw error;
    }

    function canonical(value) {
        if (Array.isArray(value)) return value.map(canonical);
        if (value && typeof value === 'object') {
            return Object.fromEntries(
                Object.keys(value)
                    .sort()
                    .filter((key) => key !== 'id' && key !== 'productSnapshot' && value[key] !== undefined)
                    .map((key) => [key, canonical(value[key])]),
            );
        }
        return value;
    }

    function same(a, b) {
        return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
    }

    function request(button, collection) {
        // Keep the same document ID if a response is lost and the form is retried.
        // Changed form contents cannot silently create a second operation.
        let value = requests.get(button);
        if (!value || value.collection !== collection) {
            const api = window.firebaseFunctions;
            value = {
                collection,
                ref: api.doc(api.collection(window.firebaseDb, collection)),
            };
            requests.set(button, value);
        }
        return value.ref;
    }

    function quantity(value) {
        if (!Number.isSafeInteger(value) || value < 1)
            fail('Количество должно быть целым числом больше нуля');
        return value;
    }

    function entries(collection, data) {
        if (!data) return [];
        const items = collection === 'income' ? [data] : data.items;
        if (!Array.isArray(items) || items.length === 0)
            fail('Добавьте хотя бы один товар');
        return items.map((item) => {
            if (
                typeof item.productId !== 'string' ||
                !item.productId ||
                item.productId.includes('/')
            ) {
                fail('Не удалось определить товар. Обновите журнал');
            }
            return [item.productId, quantity(item.quantity)];
        });
    }

    function validate(collection, data) {
        if (!data) return;
        entries(collection, data);
        if (!Number.isFinite(Date.parse(data.date)))
            fail('Укажите корректную дату');
        if (!Number.isFinite(data.totalAmount) || data.totalAmount < 0)
            fail('Некорректная сумма документа');
        if (collection === 'sales') {
            if (!data.seller?.trim()) fail('Укажите продавца');
            if (
                data.items.some(
                    (item) => !Number.isFinite(item.price) || item.price < 0,
                )
            )
                fail('Некорректная цена продажи');
            const total = data.items.reduce(
                (sum, item) => sum + item.price * item.quantity,
                0,
            );
            if (Math.abs(total - data.totalAmount) > 0.000001)
                fail('Сумма продажи не совпадает с корзиной');
        } else if (!Number.isFinite(data.cost) || data.cost < 0) {
            fail('Некорректная закупочная цена');
        }
    }

    async function save(collection, next, previous, button) {
        validate(collection, next);
        const api = window.firebaseFunctions;
        const ref = previous
            ? api.doc(window.firebaseDb, collection, previous.id)
            : request(button, collection);
        // Detach inputs from mutable form state before Firestore retries callbacks.
        next = next && JSON.parse(JSON.stringify(next));
        if (next) delete next.id; // getDocs() adds this only to the local view model.
        previous = previous && JSON.parse(JSON.stringify(previous));
        const lifecycle = window.archiveOperations;
        return lifecycle.transact(async (transaction, revision) => {
            const snapshot = await transaction.get(ref);
            const actual = snapshot.exists() ? snapshot.data() : null;
            if (!actual && previous) {
                if (!next) return ref.id; // A repeated deletion must not restore stock twice.
                fail('Документ уже удалён. Обновите журнал');
            }
            if (actual && !previous) {
                if (same(actual, next)) return ref.id;
                fail(
                    'Предыдущая попытка уже сохранена. Обновите журнал перед новой операцией',
                );
            }
            if (actual && previous) {
                if (next && same(actual, { ...actual, ...next })) return ref.id;
                if (!same(actual, previous))
                    fail(
                        'Документ изменён в другой вкладке. Откройте его заново',
                    );
            }

            const sign = collection === 'income' ? 1 : -1;
            const deltas = new Map();
            for (const [id, count] of entries(collection, actual))
                deltas.set(id, (deltas.get(id) || 0) - sign * count);
            for (const [id, count] of entries(collection, next))
                deltas.set(id, (deltas.get(id) || 0) + sign * count);

            const changes = [];
            // All reads and validation precede all writes, including multi-item sales.
            for (const [id, delta] of deltas) {
                const productRef = api.doc(window.firebaseDb, 'products', id);
                const productSnapshot = await transaction.get(productRef);
                if (!productSnapshot.exists()) {
                    if (delta === 0 && actual) {
                        if (next && collection === 'sales') next.items = next.items.map(item => {
                            const previousItem = actual.items.find(old => old.productId === item.productId);
                            return item.productId === id && previousItem?.productSnapshot
                                ? { ...item, productSnapshot: previousItem.productSnapshot } : item;
                        });
                        if (next && collection === 'income' && actual.productSnapshot)
                            next.productSnapshot = actual.productSnapshot;
                        continue;
                    }
                    fail(
                        'Карточка товара окончательно удалена. Изменение её количества недоступно',
                    );
                }
                const product = productSnapshot.data();
                const stock = product.stock;
                if (
                    !Number.isSafeInteger(stock) ||
                    !Number.isSafeInteger(stock + delta)
                ) {
                    fail('У товара некорректный остаток. Нужна проверка учёта');
                }
                if (delta < 0 && stock + delta < 0) {
                    fail(
                        `Недостаточно остатка: ${product.name}. Доступно ${Math.max(0, stock)} шт. Обновите данные`,
                    );
                }
                if (!actual && collection === 'sales' && product.isDeleted)
                    fail('Товар удалён. Сначала восстановите его поступлением');
                const historical = window.productLifecycle.snapshot({ id, ...product }, 'operation');
                if (next) {
                    if (collection === 'income' && next.productId === id) next.productSnapshot = historical;
                    else if (collection === 'sales') next.items = next.items.map(item =>
                        item.productId === id ? { ...item, productSnapshot: historical } : item);
                }
                // Any history edit invalidates an unfinished purge, even at zero delta.
                if (delta !== 0 || product.purgeVersion) changes.push({ ref: productRef, patch: {
                    ...(delta === 0 ? {} : lifecycle.stockPatch(product, stock + delta)),
                    purgeVersion: null,
                } });
            }
            for (const change of changes)
                transaction.update(change.ref, change.patch);
            if (!next) transaction.delete(ref);
            else if (actual) transaction.update(ref, next);
            else transaction.set(ref, next);
            lifecycle.bump(transaction, revision);
            return ref.id;
        });
    }

    async function createProduct(data, initialIncome, button) {
        const api = window.firebaseFunctions;
        const ref = request(button, 'products');
        data = JSON.parse(JSON.stringify(data));
        if (!Number.isSafeInteger(data.stock) || data.stock < 0)
            fail('Некорректный начальный остаток');
        const receipt = initialIncome && {
            ...initialIncome,
            productId: ref.id,
        };
        if (receipt) validate('income', receipt);
        if (data.stock !== (receipt?.quantity || 0))
            fail('Начальный остаток должен совпадать с поступлением');
        const receiptRef = api.doc(
            window.firebaseDb,
            'income',
            'initial-' + ref.id,
        );
        const lifecycle = window.archiveOperations;
        return lifecycle.transact(async (transaction, revision) => {
            const existing = await transaction.get(ref);
            const existingReceipt = await transaction.get(receiptRef);
            if (existing.exists()) {
                // These two values are generated on submission, not entered by the user.
                const stored = existing.data();
                const sameProduct = same(Object.fromEntries(Object.keys(data).map(key =>
                    [key, key === 'createdAt' || key === 'article' ? data[key] : stored[key]])), data);
                const sameReceipt = receipt
                    ? existingReceipt.exists() &&
                      same(existingReceipt.data(), receipt)
                    : !existingReceipt.exists();
                if (sameProduct && sameReceipt) return ref.id;
                fail('Товар уже создан предыдущей попыткой. Обновите каталог');
            }
            if (existingReceipt.exists())
                fail('Начальное поступление уже существует. Обновите журнал');
            transaction.set(ref, { ...data, lifecycleCreatedAt: api.serverTimestamp(),
                ...lifecycle.stockPatch({ stock: -1 }, data.stock), isDeleted: false });
            if (receipt) transaction.set(receiptRef, { ...receipt,
                productSnapshot: window.productLifecycle.snapshot({ id: ref.id, ...data }, 'operation') });
            lifecycle.bump(transaction, revision);
            return ref.id;
        });
    }

    return { save, createProduct };
})();
