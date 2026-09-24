export function archiveFixture() {
    const now = Date.now(), day = 86400000;
    const ago = days => new Date(now - days * day).toISOString();
    const product = (name, extra = {}) => ({ name, article: name.slice(0, 3), category: 'Одежда', brand: 'Mixed', size: 'L',
        gender: 'unisex', cost: 100, price: 300, discount: 0, stock: 0,
        isPermanentSupplier: true, isSecondhand: true, createdAt: ago(100), ...extra });
    const rows = {
        '_maintenance/productLifecycle': { revision: 0, enabled: true },
        'users/demo-owner': { uid: 'demo-owner', name: 'Тестовый владелец', role: 'owner' },
        'products/old': product('Секонд без остатка 45 дней'),
        'products/recent': product('Товар продан вчера'),
        'products/active': product('Товар в наличии', { stock: 3, isSecondhand: false }),
        'products/manual': product('Карточка для ручного удаления', { createdAt: ago(3) }),
        'products/deleted': product('Ранее удалённый товар', { isDeleted: true, deletedAt: new Date(now - 40 * day), deletionReason: 'manual' }),
        'products/purge': product('Историческая футболка', { isDeleted: true, deletedAt: new Date(now - 740 * day), deletionReason: 'manual', createdAt: ago(900) }),
        'plans/plan': { name: 'План магазина', startDate: ago(100).slice(0,10), endDate: ago(-10).slice(0,10), targetAmount: 1000, assignedSeller: '', createdAt: ago(100) }
    };
    for (const [id, days] of [['old',45],['recent',1],['purge',800]]) {
        const p = rows['products/' + id];
        rows['income/' + id] = { productId: id, productName: p.name, cost: 100, quantity: 1, totalAmount: 100, date: ago(days + 10) };
        rows['sales/' + id] = { seller: 'Тестовый продавец', date: ago(days), totalAmount: 300, excludeFromStats: false,
            items: [{ productId: id, productName: p.name, quantity: 1, price: 300, total: 300, priceType: 'original' }] };
    }
    return rows;
}
