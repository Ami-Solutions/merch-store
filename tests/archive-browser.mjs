import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { startEmulator, seed } from '../tools/archive-emulator.mjs';
import { demoServer } from '../tools/archive-demo.mjs';
import { archiveFixture } from './archive-fixture.mjs';

const stop = await startEmulator();
let server, browser;
const output = new URL('../output/archive/', import.meta.url);
await mkdir(output, { recursive: true });
const errors = [], blocked = [], results = [];
try {
    server = await demoServer(0, { automatic: false });
    const base = 'http://127.0.0.1:' + server.address().port;
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    async function pageFor(width = 1440, theme = 'dark') {
        const context = await browser.newContext({ viewport: { width, height: 1050 } });
        await context.addInitScript(t => localStorage.setItem('theme', t), theme);
        await context.route('**/*', route => {
            const url = new URL(route.request().url());
            if (url.origin === base || url.origin === 'http://127.0.0.1:18081' || url.hostname === 'www.gstatic.com') return route.continue();
            blocked.push(url.origin); return route.abort();
        });
        const page = await context.newPage();
        page.on('pageerror', error => errors.push(error.message));
        page.on('dialog', d => d.accept());
        await page.goto(base);
        await page.waitForFunction(() => window.demoReady);
        await page.evaluate(async () => {
            window.currentUser = { uid: 'demo-owner', name: 'Тест', role: 'owner' };
            document.getElementById('auth-screen').classList.remove('active');
            document.getElementById('app-screen').classList.add('active');
            await Promise.all([loadProducts(), loadSales(), loadIncome(), loadPlans()]);
            hideLoader(); switchSection('products');
            window.testRead = async (path) => {
                const s = await firebaseFunctions.getDocFromServer(firebaseFunctions.doc(firebaseDb, path));
                return s.exists() ? s.data() : null;
            };
            window.testRun = async () => {
                const state = await archiveOperations.readState();
                await Promise.all([loadProducts(), loadSales(), loadIncome()]);
                return archiveOperations.run({ products, income, sales, expectedRevision: state.revision, generation: window.authGeneration || 0 });
            };
            window.testSave = async (collection, next, previous = null) => stockOperations.save(collection, next, previous, {});
        });
        return page;
    }
    await seed(archiveFixture());
    const page = await pageFor();
    const baseline = await page.evaluate(async () => {
        updateDashboard();
        await new Promise(resolve => setTimeout(resolve, 150));
        return { profit: calcProfitFromSales(sales), plan: getProfitForPlan(plans[0]),
            abc: document.getElementById('abc-content').textContent,
            sizes: document.getElementById('size-analysis-container').textContent,
            margin: document.getElementById('margin-by-type-container').textContent,
            sold: document.getElementById('sold-percentage-container').textContent,
            time: document.getElementById('avg-sale-time-container').textContent };
    });
    const report = await page.evaluate(() => testRun());
    assert.equal(report.paused, undefined, JSON.stringify(report));
    assert.equal(report.archived, 1); assert.equal(report.purged, 1); assert.equal(report.snapshots, 2);
    assert.equal(await page.evaluate(() => testRead('products/purge')), null);
    assert.equal((await page.evaluate(() => testRead('products/old'))).isDeleted, true);
    assert.equal((await page.evaluate(() => testRun())).skipped, true, 'Once per global day');
    const after = await page.evaluate(async () => {
        await Promise.all([loadProducts(), loadIncome(), loadSales()]); updateDashboard();
        await new Promise(resolve => setTimeout(resolve, 150));
        return { profit: calcProfitFromSales(sales), plan: getProfitForPlan(plans[0]),
            abc: document.getElementById('abc-content').textContent,
            sizes: document.getElementById('size-analysis-container').textContent,
            margin: document.getElementById('margin-by-type-container').textContent,
            sold: document.getElementById('sold-percentage-container').textContent,
            time: document.getElementById('avg-sale-time-container').textContent };
    });
    assert.deepEqual(after, baseline, 'All historical dashboard statistics survive purge');
    results.push('legacy audit, automatic deletion, two-year purge, unchanged historical dashboard, daily coordination');
    await page.evaluate(() => archiveOperations.changeStatus('manual'));
    const deletedAt = (await page.evaluate(() => testRead('products/manual'))).deletedAt;
    await page.evaluate(() => archiveOperations.changeStatus('manual'));
    assert.deepEqual((await page.evaluate(() => testRead('products/manual'))).deletedAt, deletedAt);
    await page.evaluate(() => archiveOperations.changeStatus('active'));
    const positiveDeleted = await page.evaluate(() => testRead('products/active'));
    assert.equal(positiveDeleted.stock, 3); assert.equal(positiveDeleted.isDeleted, true);
    await page.evaluate(async () => { await loadProducts(); updateDashboard(); });
    assert.equal(await page.locator('#total-stock').textContent(), '0');
    assert.equal(await page.evaluate(() => calcProfitFromSales(sales)), baseline.profit);
    await assert.rejects(page.evaluate(() => testSave('sales', {
        date: new Date().toISOString(), seller: 'Тест', totalAmount: 300,
        items: [{ productId: 'active', quantity: 1, price: 300, total: 300 }]
    })), /удалён/i);
    await page.evaluate(() => archiveOperations.changeStatus('active', true));
    const positiveRestored = await page.evaluate(() => testRead('products/active'));
    assert.equal(positiveRestored.stock, 3); assert.equal(positiveRestored.isDeleted, false);
    await page.evaluate(async () => {
        const id = await testSave('income', { productId: 'manual', productName: 'Карточка', quantity: 2, cost: 100, totalAmount: 200, date: new Date().toISOString() });
        window.testIncomeId = id;
    });
    const restored = await page.evaluate(() => testRead('products/manual'));
    assert.equal(restored.stock, 2); assert.equal(restored.isDeleted, false); assert.equal(restored.deletedAt, null);
    await assert.rejects(page.evaluate(async () => testSave('sales', null, { id: 'purge', ...await testRead('sales/purge') })), /окончательно/);
    await page.evaluate(async () => {
        const previous = { id: 'purge', ...await testRead('sales/purge') };
        await testSave('sales', { ...previous, seller: 'Другой продавец', items: previous.items.map(({ productSnapshot, ...item }) => item) }, previous);
    });
    assert.ok((await page.evaluate(() => testRead('sales/purge'))).items[0].productSnapshot);
    results.push('manual delete preserves positive stock, hidden cards cannot be sold, restoration preserves quantity, purged history cannot resurrect stock');
    // Rules reject direct old-client writes and premature physical deletes.
    await assert.rejects(page.evaluate(() => firebaseFunctions.deleteDoc(firebaseFunctions.doc(firebaseDb, 'products/deleted'))), /permission/i);
    await assert.rejects(page.evaluate(() => firebaseFunctions.updateDoc(firebaseFunctions.doc(firebaseDb, 'products/active'), { stock: 55 })), /permission/i);
    await seed({ 'products/deleted': { ...archiveFixture()['products/deleted'], purgeVersion: 'prepared' } }, false);
    const prematureDeleteCode = await page.evaluate(async () => {
        try {
            await firebaseFunctions.runTransaction(firebaseDb, async tx => {
                const state = await archiveOperations.revision(tx);
                tx.delete(firebaseFunctions.doc(firebaseDb, 'products/deleted'));
                archiveOperations.bump(tx, state);
            });
            return 'allowed';
        } catch (error) { return error.code; }
    });
    assert.equal(prematureDeleteCode, 'permission-denied', 'Retention is enforced even with a valid revision');
    results.push('server rules reject bypassed revisions and premature purge');

    await seed(archiveFixture());
    await page.evaluate(async () => {
        const date = new Date().toISOString();
        const outcomes = await Promise.allSettled([
            archiveOperations.changeStatus('manual'),
            testSave('income', { productId: 'manual', productName: 'Возврат в каталог', quantity: 1, cost: 100, totalAmount: 100, date })
        ]);
        if (outcomes[1].status !== 'fulfilled') throw new Error(JSON.stringify({
            outcomes: outcomes.map(r => ({ status: r.status, code: r.reason?.code, message: r.reason?.message })),
            state: await testRead('_maintenance/productLifecycle'), product: await testRead('products/manual')
        }));
    });
    const race = await page.evaluate(() => testRead('products/manual'));
    assert.equal(race.stock, 1);
    // Both action orders are valid now: a later explicit manual deletion wins.
    if (race.isDeleted) await page.evaluate(() => archiveOperations.changeStatus('manual', true));
    await page.evaluate(async () => {
        const entry = { productId: 'manual', productName: 'Товар', quantity: 1, price: 300, total: 300 };
        const id = await testSave('sales', { items: [entry], seller: 'Тест', totalAmount: 300, date: '2020-01-01T12:00:00Z' });
        window.zeroSaleId = id;
    });
    const zero = await page.evaluate(() => testRead('products/manual'));
    assert.equal(zero.stock, 0); assert.ok(zero.zeroStockSince.seconds * 1000 > Date.now() - 60000, 'Real server time, not a backdated sale');
    await page.evaluate(async () => {
        const before = { id: zeroSaleId, ...await testRead('sales/' + zeroSaleId) };
        await testSave('sales', { ...before, seller: 'Новый продавец' }, before);
    });
    assert.deepEqual((await page.evaluate(() => testRead('products/manual'))).zeroStockSince, zero.zeroStockSince);
    results.push('receipt/delete race preserves quantity, server zero time ignores backdating, non-stock edits preserve zero interval');

    await seed(archiveFixture());
    const secondPage = await pageFor();
    const concurrent = await Promise.all([page.evaluate(() => testRun()), secondPage.evaluate(() => testRun())]);
    assert.equal(concurrent.reduce((sum, r) => sum + (r.archived || 0), 0), 1);
    assert.equal(concurrent.reduce((sum, r) => sum + (r.purged || 0), 0), 1);
    await secondPage.context().close();
    results.push('two browser contexts share a single maintenance cycle');

    const backlog = archiveFixture();
    for (const key of Object.keys(backlog)) if (!key.startsWith('_maintenance/') && !key.startsWith('users/') && key !== 'products/purge') delete backlog[key];
    for (let i = 0; i < 65; i++) backlog['income/row-' + String(i).padStart(3, '0')] = {
        productId: 'purge', productName: 'Исторический товар', cost: 100, quantity: 1,
        totalAmount: 100, date: '2023-01-01T12:00:00Z'
    };
    backlog['sales/all'] = { date: '2023-02-01T12:00:00Z', seller: 'Тест', totalAmount: 19500,
        items: [{ productId: 'purge', productName: 'Исторический товар', quantity: 65, price: 300, total: 19500 }] };
    await seed(backlog);
    const firstBatch = await page.evaluate(() => testRun());
    assert.equal(firstBatch.steps, 60); assert.equal(firstBatch.purged, 0);
    assert.ok(await page.evaluate(() => testRead('products/purge')));
    const checkpoint = await page.evaluate(() => archiveOperations.readState());
    await seed({ '_maintenance/productLifecycle': { ...checkpoint, lastStartedAt: new Date(Date.now() - 2 * 86400000) } }, false);
    const nextBatch = await page.evaluate(() => testRun());
    assert.equal(nextBatch.purged, 1); assert.ok(nextBatch.steps < 10);
    assert.equal(await page.evaluate(() => testRead('products/purge')), null);
    results.push('60-step limit leaves history intact and resumes remaining snapshots next day');

    const preparing = archiveFixture();
    preparing['products/purge'].deletedAt = new Date(Date.now() - 710 * 86400000);
    await seed(preparing);
    const prepared = await page.evaluate(() => testRun());
    assert.equal(prepared.purged, 0); assert.equal(prepared.snapshots, 2);
    assert.ok(await page.evaluate(() => testRead('products/purge')));
    await page.evaluate(() => archiveOperations.changeStatus('purge', true));
    assert.equal((await page.evaluate(() => testRead('products/purge'))).purgeVersion, null);
    results.push('history preparation begins before expiration; restoration cancels pending purge');

    const incomplete = archiveFixture();
    delete incomplete['sales/old'].date;
    await seed(incomplete);
    const incompleteReport = await page.evaluate(() => testRun());
    assert.ok(incompleteReport.exceptions.some(p => p.id === 'old'));
    assert.notEqual((await page.evaluate(() => testRead('products/old'))).isDeleted, true);
    assert.equal(await page.evaluate(() => sales.some(s => s.id === 'old')), true);
    results.push('missing history dates remain loaded and block automatic deletion');

    const positiveArchive = archiveFixture();
    Object.assign(positiveArchive['products/deleted'], { stock: 5 });
    Object.assign(positiveArchive['products/purge'], { stock: 2 });
    await seed(positiveArchive);
    const positiveReport = await page.evaluate(() => testRun());
    assert.equal(positiveReport.paused, undefined, JSON.stringify(positiveReport));
    assert.equal(positiveReport.purged, 1);
    assert.equal(await page.evaluate(() => testRead('products/purge')), null);
    const retained = await page.evaluate(() => testRead('products/deleted'));
    assert.equal(retained.stock, 5); assert.equal(retained.isDeleted, true);
    await page.evaluate(async () => {
        await testSave('income', { productId: 'deleted', productName: 'Скрытый остаток', quantity: 1, cost: 100, totalAmount: 100, date: new Date().toISOString() });
    });
    const received = await page.evaluate(() => testRead('products/deleted'));
    assert.equal(received.stock, 6); assert.equal(received.isDeleted, false);
    results.push('maintenance retains manually deleted stock, two-year purge supports positive quantity, receiving restores retained quantity');

    const negativeFixture = archiveFixture();
    negativeFixture['products/negative'] = { ...negativeFixture['products/active'], stock: -2 };
    await seed(negativeFixture);
    await page.evaluate(async () => {
        await archiveOperations.updateProduct('negative', { price: 400 });
        await testSave('income', { productId: 'negative', productName: 'Старое расхождение', quantity: 1, cost: 100, totalAmount: 100, date: new Date().toISOString() });
    });
    const improved = await page.evaluate(() => testRead('products/negative'));
    assert.equal(improved.stock, -1); assert.equal(improved.zeroStockSince, null);
    await assert.rejects(page.evaluate(() => archiveOperations.changeStatus('negative')), /некорректный остаток/);
    results.push('production rules preserve metadata edits and receipts that improve an existing negative balance');

    await seed(archiveFixture());
    await page.evaluate(() => testRun());
    const beforeRestore = await page.evaluate(() => testRead('products/old'));
    await page.evaluate(() => archiveOperations.changeStatus('old', true));
    const afterRestore = await page.evaluate(() => testRead('products/old'));
    assert.deepEqual(afterRestore.zeroStockSince, beforeRestore.zeroStockSince);
    assert.equal(await page.evaluate(() => testRead('products/old').then(p => productLifecycle.eligible(p, Date.now()))), false);
    results.push('manual restoration preserves the actual zero date and grants a separate 30-day pause');

    await page.evaluate(async () => {
        const original = firebaseFunctions.getDocsFromServer;
        let release;
        const gate = new Promise(resolve => { release = resolve; });
        window.firebaseFunctions = { ...firebaseFunctions, getDocsFromServer: async ref => {
            const rows = await original(ref); await gate; return rows;
        } };
        const oldAccountLoad = loadProducts();
        showAuth(); release(); await oldAccountLoad;
        window.firebaseFunctions.getDocsFromServer = original;
        if (products.length) throw new Error('Previous account response repopulated the catalog');
    });
    results.push('late data response cannot repopulate the catalog after logout');
    await page.context().close();

    for (const width of [1440, 390, 320]) for (const theme of ['dark', 'light']) {
        await seed(archiveFixture());
        const p = await pageFor(width, theme);
        await p.locator('#product-search').fill('Ранее удалённый');
        await expect(p.locator('#products-tbody tr')).toHaveCount(0);
        await p.getByLabel('Показать удалённые', { exact: false }).check();
        await expect(p.locator('#products-tbody tr')).toHaveCount(1);
        await expect(p.locator('#products-tbody .archive-badge')).toHaveText('Удалён');
        await p.locator('#products-section').screenshot({ path: new URL(`products-${width}-${theme}.png`, output).pathname.replace(/^\/(\w:)/, '$1') });
        await p.evaluate(() => document.getElementById('add-income-btn').click());
        await p.locator('#income-product-search').fill('Ранее удалённый');
        await expect(p.locator('#income-product-dropdown')).toContainText('Ничего не найдено');
        await p.locator('#income-show-deleted').check();
        await p.locator('#income-product-dropdown [data-product-id="deleted"]').click();
        await expect(p.locator('#income-product-id')).toHaveValue('deleted');
        await p.locator('#modal-body').screenshot({ path: new URL(`income-${width}-${theme}.png`, output).pathname.replace(/^\/(\w:)/, '$1') });
        await p.locator('#income-show-deleted').uncheck();
        await expect(p.locator('#income-product-id')).toHaveValue('');
        await p.locator('.modal-close').click();
        await p.locator('#product-search').fill('Товар в наличии');
        await expect(p.locator('#products-tbody .delete')).toBeEnabled();
        await p.locator('#products-tbody .delete').click();
        await expect(p.locator('#products-tbody .archive-badge')).toHaveText('Удалён');
        assert.equal((await p.evaluate(() => testRead('products/active'))).stock, 3);
        await p.locator('#product-show-deleted').uncheck();
        await expect(p.locator('#products-tbody tr')).toHaveCount(0);
        await p.locator('#product-show-deleted').check();
        await p.locator('#products-tbody').getByRole('button', { name: 'Восстановить' }).click();
        await expect(p.locator('#products-tbody .archive-badge')).toHaveCount(0);
        assert.equal((await p.evaluate(() => testRead('products/active'))).stock, 3);
        assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        await p.evaluate(() => showAuth());
        await expect(p.locator('#product-show-deleted')).not.toBeChecked();
        assert.equal(await p.evaluate(() => products.length), 0);
        results.push(`catalog, receipt selection, selection reset, account reset, layout ${width} ${theme}`);
        await p.context().close();
    }
    assert.deepEqual(errors, []); assert.deepEqual(blocked, []);
    await writeFile(new URL('results.json', output), JSON.stringify({ results, errors, blocked }, null, 2));
    console.log(JSON.stringify({ passed: results.length, results }));
} finally { await browser?.close(); if (server) await new Promise(r => server.close(r)); await stop(); }
