// Pure lifecycle rules, shared by the browser and Node regression tests.
(function (root) {
    const DAY = 86400000;
    function millis(value) {
        if (value == null) return NaN;
        if (typeof value.toMillis === 'function') return value.toMillis();
        if (typeof value === 'object' && Number.isFinite(value.seconds))
            return value.seconds * 1000 + (value.nanoseconds || 0) / 1000000;
        return typeof value === 'number' ? value : Date.parse(value);
    }
    function validStock(product) {
        return Number.isSafeInteger(product.stock) && product.stock >= 0;
    }
    function deleted(product) {
        return product.isDeleted === true;
    }
    function visible(product, includeDeleted = false) {
        return includeDeleted || !deleted(product);
    }
    function purgeDate(value) {
        const time = millis(value);
        if (!Number.isFinite(time)) return NaN;
        const date = new Date(time);
        const month = date.getUTCMonth();
        date.setUTCFullYear(date.getUTCFullYear() + 2);
        if (date.getUTCMonth() !== month) date.setUTCDate(0); // February 29 → 28
        return date.getTime();
    }
    function eligible(product, now) {
        const since = millis(product.zeroStockSince);
        const restored = millis(product.restoredAt);
        const created = [product.lifecycleCreatedAt, product.createdAt, product.legacyCreatedAt]
            .map(millis).find(Number.isFinite);
        return product.stock === 0 && !product.isDeleted &&
            Number.isFinite(since) && Number.isFinite(created) &&
            now - since >= 30 * DAY && now - created >= 30 * DAY &&
            (!Number.isFinite(restored) || now - restored >= 30 * DAY);
    }
    function audit(product, receipts, sales, now) {
        const invalid = (reason) => ({ id: product.id, eligible: false, reason });
        if (!validStock(product)) return invalid('Некорректный остаток');
        if (product.stock !== 0 || product.isDeleted) return invalid('Не требуется');
        const events = [];
        for (const item of receipts) if (item.productId === product.id)
            events.push({ date: millis(item.date), quantity: item.quantity, sign: 1 });
        for (const sale of sales) for (const item of sale.items || [])
            if (item.productId === product.id)
                events.push({ date: millis(sale.date), quantity: item.quantity, sign: -1 });
        if (events.some(e => !Number.isFinite(e.date) || e.date > now ||
            !Number.isSafeInteger(e.quantity) || e.quantity < 1))
            return invalid('Некорректная дата или количество в истории');
        events.sort((a, b) => a.date - b.date || b.sign - a.sign);
        let created = millis(product.createdAt);
        if (!Number.isFinite(created)) created = events[0]?.date;
        if (!Number.isFinite(created) || created > now)
            return invalid('Неизвестная или будущая дата создания');
        let balance = -events.reduce((sum, e) => sum + e.sign * e.quantity, 0);
        if (!Number.isSafeInteger(balance) || balance < 0)
            return invalid('История даёт отрицательный начальный остаток');
        const openingBalance = balance;
        let since = created;
        for (const event of events) {
            balance += event.sign * event.quantity;
            if (!Number.isSafeInteger(balance) || balance < 0)
                return invalid('История даёт отрицательный промежуточный остаток');
            if (balance === 0) since = Math.max(created, event.date);
        }
        return { id: product.id, created, since, openingBalance,
            eligible: now - created >= 30 * DAY && now - since >= 30 * DAY,
            reason: 'Проверено по датам поступлений и продаж' };
    }
    function snapshot(product, version) {
        const fields = ['name', 'article', 'category', 'brand', 'gender', 'size',
            'cost', 'price', 'discount', 'createdAt'];
        const data = Object.fromEntries(fields.filter(k => product[k] !== undefined).map(k => [k, product[k]]));
        return { ...data, id: product.id, stock: 0,
            isPermanentSupplier: Boolean(product.isPermanentSupplier),
            isSecondhand: typeof product.isSecondhand === 'boolean' ? product.isSecondhand : !product.isPermanentSupplier,
            source: 'catalog_estimate', version };
    }
    root.productLifecycle = { DAY, millis, validStock, deleted, visible, purgeDate, eligible, audit, snapshot };
})(typeof window === 'undefined' ? globalThis : window);
