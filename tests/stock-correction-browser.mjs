import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { startEmulator, seed } from '../tools/archive-emulator.mjs';
import { demoServer } from '../tools/archive-demo.mjs';
import { archiveFixture } from './archive-fixture.mjs';

const stop = await startEmulator();
let browser, server;
const output = new URL('../output/stock-correction-tests/', import.meta.url);
await mkdir(output, { recursive: true });
const results = [], errors = [], blocked = [];
try {
    server = await demoServer(0, { automatic: false });
    const base = 'http://127.0.0.1:' + server.address().port;
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.route('**/*', route => {
        const u = new URL(route.request().url());
        if ([base, 'http://127.0.0.1:18081'].includes(u.origin) || u.hostname === 'www.gstatic.com') return route.continue();
        blocked.push(u.origin); return route.abort();
    });
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(base);
    await page.waitForFunction(() => window.demoReady);
    await page.evaluate(() => {
        window.currentUser = { uid: 'demo-owner', name: 'Тест', role: 'owner' };
        document.getElementById('auth-screen').classList.remove('active');
        document.getElementById('app-screen').classList.add('active'); hideLoader();
        window.read = async path => { const r = await firebaseFunctions.getDocFromServer(firebaseFunctions.doc(firebaseDb, path)); return r.exists() ? r.data() : null; };
        window.reloadRows = async () => { await Promise.all([loadProducts(), loadSales(), loadIncome(), loadPlans()]); };
        window.testSale = count => ({ seller: 'Тест', date: new Date().toISOString(), totalAmount: count * 300,
            items: Array.from({ length: count }, (_, i) => ({ productId: 'P'+i, quantity: 1, price: 300, total: 300 })) });
    });
    const p = archiveFixture()['products/active'];
    for (const count of [2, 10, 20, 40]) {
        await seed({ '_maintenance/productLifecycle': { revision: 1, enabled: true, steps: 60, runId: 'test', lastStartedAt: new Date() },
            ...Object.fromEntries(Array.from({ length: count }, (_, i) => ['products/P'+i, { ...p, stock: i % 2 ? 7 : 1 }])) });
        await page.evaluate(async count => {
            const button = {}; const sale = testSale(count);
            const id = await stockOperations.save('sales', sale, null, button);
            if (await stockOperations.save('sales', sale, null, button) !== id) throw new Error('Duplicate retry');
            for (let i = 0; i < count; i++) if ((await read('products/P'+i)).stock !== (i % 2 ? 6 : 0)) throw new Error('Wrong stock');
        }, count);
    }
    results.push('2/10/20/40-item transactions and repeated submissions with production rules');
    await seed({ '_maintenance/productLifecycle': { revision: 0, enabled: true }, 'products/P0': { ...p, stock: 0 }, 'products/P1': { ...p, stock: 7 } });
    await assert.rejects(page.evaluate(() => stockOperations.save('sales', testSale(2), null, {})), /Недостаточно остатка/);
    assert.equal((await page.evaluate(() => read('products/P1'))).stock, 7);
    assert.equal((await page.evaluate(() => read('_maintenance/productLifecycle'))).revision, 0);
    const bypass = await page.evaluate(async () => {
        const api = firebaseFunctions;
        try { await api.updateDoc(api.doc(firebaseDb, 'products', 'P1'), { stock: 6 }); return 'allowed'; }
        catch (e) { return e.code; }
    });
    assert.equal(bypass, 'permission-denied');
    const negative = await page.evaluate(async () => {
        try { await archiveOperations.transact(async (tx, state) => {
            tx.update(firebaseFunctions.doc(firebaseDb, 'products', 'P1'), { stock: -1 }); archiveOperations.bump(tx, state);
        }); return 'allowed'; } catch(e) { return e.code; }
    });
    assert.equal(negative, 'permission-denied');
    results.push('outdated client rejected; no partial multi-item sale; rules block negative stock even with revision');

    const now = new Date(), ago = days => new Date(now.getTime() - days * 86400000).toISOString();
    const fixture = {
        '_maintenance/productLifecycle': { revision: 0, enabled: true },
        'products/P0': { ...p, name: 'Брюки тестового бренда', brand: 'Проверка', stock: -2 },
        'products/P1': { ...p, name: 'Другой товар бренда', brand: 'Проверка', stock: 5 },
        'products/P2': { ...p, name: 'Без продаж', brand: 'Без продаж', stock: -1 },
        'income/I': { productId: 'P0', quantity: 2, cost: 100, totalAmount: 200, date: ago(60) },
        'sales/S': { seller: 'Тест', date: ago(5), totalAmount: 8800, items: [{ productId: 'P0', quantity: 2, price: 4400, total: 8800 }] }
    };
    await seed(fixture); await page.evaluate(() => { return reloadRows(); });
    await page.evaluate(() => { switchSection('dashboard'); renderBrandTurnover(); switchTurnoverType('brand'); });
    const brand = page.locator('.brand-card').filter({ has: page.locator('.brand-name', { hasText: /^Проверка$/ }) });
    await expect(brand).toHaveClass('brand-card invalid');
    assert.deepEqual(await brand.locator('.brand-stat-value').allTextContents(), ['–', '0.1', '–', '8 800 ₽']);
    await expect(page.locator('.brand-card').filter({ hasText: 'Без продаж' })).toContainText('Проверьте остатки');
    const finance = await page.evaluate(() => ({ profit: calcProfitFromSales(sales), sales: JSON.stringify(sales), income: JSON.stringify(income) }));
    fixture['products/P0'] = { ...fixture['products/P0'], stock: 0, lifecycleVersion: 1, zeroStockSince: now, zeroStockSinceSource: 'stock_correction',
        legacyCreatedAt: new Date(p.createdAt), stockCorrection: { before: -2, after: 0, delta: 2, recordedAt: now, physicalCountConfirmed: false } };
    fixture['products/P2'].stock = 0;
    await seed(fixture); await page.evaluate(() => reloadRows());
    assert.deepEqual(await page.evaluate(() => ({ profit: calcProfitFromSales(sales), sales: JSON.stringify(sales), income: JSON.stringify(income) })), finance);
    const maintenance = await page.evaluate(async () => { const s = await archiveOperations.readState(); return archiveOperations.run({ products, income, sales, expectedRevision: s.revision, generation: window.authGeneration || 0 }); });
    assert.notEqual((await page.evaluate(() => read('products/P0'))).isDeleted, true, JSON.stringify(maintenance));
    await page.evaluate(() => stockOperations.save('income', { productId: 'P0', quantity: 1, cost: 100, totalAmount: 100, date: new Date().toISOString() }, null, {}));
    assert.equal((await page.evaluate(() => read('products/P0'))).stock, 1);
    assert.equal((await page.evaluate(() => read('products/P0'))).stockCorrection.before, -2);
    results.push('negative hidden by a positive brand total still warns; zero-sales warning; correction preserves finance/history, starts a fresh zero interval, next receipt gives 1');
    await page.evaluate(() => reloadRows());
    for (const width of [1440, 390]) for (const theme of ['light','dark']) {
        await page.setViewportSize({ width, height: 1000 });
        await page.evaluate(theme => { document.body.classList.toggle('light-theme', theme === 'light'); showIncomeHistory('P0'); }, theme);
        await expect(page.locator('.stock-correction-note')).toContainText('−2'.replace('−','-') + ' → 0');
        await expect(page.locator('.stock-correction-note')).toContainText('Фактическое наличие не подтверждено');
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        await page.locator('.modal').screenshot({ path: new URL(`history-${width}-${theme}.png`, output).pathname.replace(/^\/(\w:)/,'$1') });
        await page.evaluate(() => closeModal());
    }
    results.push('correction history: Chrome desktop/mobile, light/dark, no overflow');

    await seed({ '_maintenance/productLifecycle': { revision: 0, enabled: true }, 'products/P0': { ...p, stock: 4 }, 'products/P1': { ...p, stock: 7 } });
    await page.evaluate(async () => { await reloadRows(); switchSection('sales'); });
    await page.locator('#add-sale-btn').click();
    await page.evaluate(() => { for(const id of ['P0','P1']) {document.getElementById('sale-product-id').value = id; addSaleItem();} });
    const dialogs = []; page.on('dialog', async d => { dialogs.push(d.message()); await d.accept(); });
    await page.evaluate(() => { window.originalLoadSales = loadSales; loadSales = async () => {throw Object.assign(new Error('Test network failure'),{code:'unavailable'});}; });
    await page.getByRole('button', { name: 'Оформить продажу', exact: true }).click();
    await expect(page.locator('.modal-overlay')).not.toHaveClass(/active/);
    await page.waitForFunction(() => currentSaleItems.length === 0);
    assert.ok(dialogs.some(t => t.startsWith('Продажа сохранена.')));
    assert.equal((await page.evaluate(() => read('products/P0'))).stock, 3);
    assert.equal((await page.evaluate(() => read('products/P1'))).stock, 6);
    await page.evaluate(() => { loadSales = originalLoadSales; });
    results.push('real sale form: read failure after commit reports success and does not encourage duplicate sale');

    await page.route('**/index.html?release-check=*', async route => {
        await route.fulfill({contentType:'text/html', body:'<meta name="admin-release" content="future-test-version">'});
    });
    await page.evaluate(() => { const real = Date.now; Date.now = () => real() + 6 * 60000; });
    const stateBefore = await page.evaluate(() => read('_maintenance/productLifecycle'));
    await assert.rejects(page.evaluate(() => stockOperations.save('sales', testSale(1), null, {})), /новая версия/);
    await expect(page.locator('#admin-update-notice')).toContainText('Доступна новая версия');
    assert.deepEqual(await page.evaluate(() => read('_maintenance/productLifecycle')), stateBefore);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({path:new URL('update-mobile.png',output).pathname.replace(/^\/(\w:)/,'$1')});
    results.push('version mismatch warns before transaction; no reload or writes, mobile banner fits');
    assert.deepEqual(errors, []); assert.deepEqual(blocked, []);
    await writeFile(new URL('result.json',output), JSON.stringify({ results, errors, blocked },null,2));
    console.log(JSON.stringify({passed:results.length,results}));
} finally { await browser?.close(); await new Promise(r=>server?server.close(r):r()); await stop(); }
