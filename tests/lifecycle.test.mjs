import assert from 'node:assert/strict';
import { test } from 'node:test';
import '../js/product-lifecycle.js';
const c = globalThis.productLifecycle;
const now = Date.parse('2026-09-24T12:00:00Z');
const ago = days => new Date(now - days * c.DAY).toISOString();
const product = extra => ({ id: 'p', stock: 0, createdAt: ago(100), ...extra });
const sale = (date, quantity = 1, extra = {}) => ({ date, items: [{ productId: 'p', quantity }], ...extra });
const receipt = (date, quantity = 1) => ({ productId: 'p', date, quantity });

test('30 complete days, independent product age and timestamp encodings', () => {
    assert.equal(c.eligible(product({ zeroStockSince: ago(30) }), now), true);
    assert.equal(c.eligible(product({ zeroStockSince: ago(30) }), now - 1), false);
    assert.equal(c.eligible(product({ createdAt: ago(29), zeroStockSince: ago(50) }), now), false);
    assert.equal(c.eligible(product({ zeroStockSince: { seconds: now / 1000 - 30 * 86400 } }), now), true);
    assert.equal(c.eligible(product({ zeroStockSince: ago(40), isDeleted: true }), now), false);
    assert.equal(c.eligible(product({ zeroStockSince: ago(80), restoredAt: ago(29) }), now), false);
    assert.equal(c.eligible(product({ zeroStockSince: ago(80), restoredAt: ago(30) }), now), true);
    for (const stock of [-1, '0', null, 0.5]) assert.equal(c.eligible(product({ stock, zeroStockSince: ago(40) }), now), false);
});
test('Existing history: most recent zero interval, opening stock, excluded sales', () => {
    const a = c.audit(product(), [receipt(ago(80))], [sale(ago(50), 1, { excludeFromStats: true })], now);
    assert.equal(a.eligible, true); assert.equal(a.since, now - 50 * c.DAY);
    const b = c.audit(product(), [receipt(ago(80)), receipt(ago(10))], [sale(ago(50)), sale(ago(10))], now);
    assert.equal(b.eligible, false); assert.equal(b.since, now - 10 * c.DAY);
    assert.equal(c.audit(product(), [], [sale(ago(40), 2)], now).openingBalance, 2);
    assert.equal(c.audit(product(), [], [], now).eligible, true);
    assert.equal(c.audit(product({ createdAt: undefined }), [], [], now).since, undefined);
    assert.equal(c.audit(product({ createdAt: undefined }), [receipt(ago(80))], [sale(ago(40))], now).eligible, true);
});
test('Contradictions and corrupt dates do not hide products', () => {
    for (const [receipts, sales] of [
        [[receipt(ago(1))], []], [[receipt(ago(20))], [sale(ago(40))]],
        [[], [sale(ago(-1))]], [[], [sale('invalid')]], [[], [sale(ago(40), 0)]]
    ]) assert.equal(c.audit(product(), receipts, sales, now).since, undefined);
});
test('Two calendar years, February 29 and millisecond boundary', () => {
    assert.equal(new Date(c.purgeDate('2024-02-29T12:34:56.789Z')).toISOString(), '2026-02-28T12:34:56.789Z');
    assert.equal(new Date(c.purgeDate('2026-09-24T12:00:00Z')).toISOString(), '2028-09-24T12:00:00.000Z');
    assert.equal(Number.isNaN(c.purgeDate(null)), true);
});
test('Manual deletion hides cards with either zero or positive stock', () => {
    assert.equal(c.visible(product({ isDeleted: true })), false);
    assert.equal(c.visible(product({ isDeleted: true }), true), true);
    assert.equal(c.visible(product({ isDeleted: true, stock: 1 })), false);
    assert.equal(c.visible(product({ isDeleted: true, stock: 1 }), true), true);
});
