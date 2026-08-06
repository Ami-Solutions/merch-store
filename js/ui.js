let salesChart = null;
let topProductsChart = null;
let distributionChart = null;

let currentSalesPeriod = 7;
let currentAvgPeriod = 7;
let salesCustomStart = '';
let salesCustomEnd = '';
let avgCustomStart = '';
let avgCustomEnd = '';

let currentSalesChartPeriod = 7;
let salesChartCustomStart = '';
let salesChartCustomEnd = '';

let currentDistributionType = 'category';

// Состояние раскрытых групп в ABC-анализе
let expandedABCGroups = { a: false, b: false, c: false };

// Состояние раскрытия полного списка залежавшихся товаров
let staleProductsExpanded = false;

function getGenderLabel(gender) {
    const labels = { male: 'Мужское', female: 'Женское', unisex: 'Унисекс' };
    return labels[gender] || '–';
}

function calcProfitFromSales(salesArray) {
    return salesArray.reduce((totalProfit, s) => {
        if (s.excludeFromStats) return totalProfit;
        if (!s.items) return totalProfit;
        const saleProfit = s.items.reduce((profit, item) => {
            const product = products.find(p => p.id === item.productId);
            const cost = product ? (product.cost || 0) : 0;
            return profit + ((item.price - cost) * item.quantity);
        }, 0);
        return totalProfit + saleProfit;
    }, 0);
}

function getFactForPlan(plan) {
    const start = new Date(plan.startDate);
    const end = new Date(plan.endDate);
    end.setHours(23, 59, 59, 999);
    
    return sales
        .filter(s => {
            const saleDate = new Date(s.date);
            if (saleDate < start || saleDate > end) return false;
            if (plan.assignedSeller && s.seller !== plan.assignedSeller) return false;
            return true;
        })
        .reduce((sum, s) => sum + s.totalAmount, 0);
}

function getProfitForPlan(plan) {
    const start = new Date(plan.startDate);
    const end = new Date(plan.endDate);
    end.setHours(23, 59, 59, 999);
    
    const relevantSales = sales.filter(s => {
        const saleDate = new Date(s.date);
        if (saleDate < start || saleDate > end) return false;
        if (s.excludeFromStats) return false;
        if (plan.assignedSeller && s.seller !== plan.assignedSeller) return false;
        return true;
    });
    
    return calcProfitFromSales(relevantSales);
}

function renderProducts() {
    const tbody = document.getElementById('products-tbody');
    const filtered = getFilteredProducts();
    tbody.innerHTML = filtered.map(product => `
        <tr>
            <td>${product.article}</td>
            <td>${product.name}</td>
            <td>${product.category || '–'}</td>
            <td>${product.brand || '–'}</td>
            <td>${getGenderLabel(product.gender)}</td>
            <td>${product.size || '–'}</td>
            <td>${product.cost ? formatCurrency(product.cost) : '–'}</td>
            <td>${product.price ? formatCurrency(product.price) : '–'}</td>
            <td>${product.discount > 0 ? formatCurrency(product.discount) : '–'}</td>
            <td>${product.stock}</td>
            <td>
                <button class="action-btn income-btn" onclick="showQuickIncome('${product.id}')">+ Приход</button>
                <button class="action-btn edit" onclick="editProduct('${product.id}')">Изменить</button>
                <button class="action-btn delete" onclick="deleteProduct('${product.id}', this)">Удалить</button>
            </td>
        </tr>
    `).join('');
    document.getElementById('total-products').textContent = products.length;
}

function renderSales() {
    const tbody = document.getElementById('sales-tbody');
    const filtered = getFilteredSales();
    
    tbody.innerHTML = filtered.map(sale => {
        const itemsHtml = sale.items ? sale.items.map(item => 
            `<div>• ${item.productName} × ${item.quantity} = ${formatCurrency(item.total)}</div>`
        ).join('') : '<div>–</div>';
        
        const excludeIcon = sale.excludeFromStats ? ' <span style="color: var(--text-secondary); font-size: 11px;" title="Исключена из статистики">📊✕</span>' : '';

        return `
            <tr>
                <td>${formatDate(sale.date)}</td>
                <td class="sale-items-cell">${itemsHtml}</td>
                <td><strong>${formatCurrency(sale.totalAmount)}</strong>${excludeIcon}</td>
                <td>${sale.seller}</td>
                <td>
                    <button class="action-btn edit" onclick="editSale('${sale.id}')">Изменить</button>
                    <button class="action-btn delete" onclick="deleteSale('${sale.id}', this)">Удалить</button>
                </td>
            </tr>
        `;
    }).join('');
}

function renderIncome() {
    const tbody = document.getElementById('income-tbody');
    const filtered = getFilteredIncome();
    tbody.innerHTML = filtered.map(item => {
        // Находим товар чтобы взять актуальные цены
        const product = products.find(p => p.id === item.productId);
        const costPerUnit = product ? (product.cost || 0) : (item.cost || 0);
        const pricePerUnit = product ? (product.price || 0) : 0;
        
        const totalCost = costPerUnit * item.quantity;
        const totalSale = pricePerUnit * item.quantity;
        
        return `
            <tr>
                <td>${formatDate(item.date)}</td>
                <td>${item.productName}</td>
                <td>${item.quantity}</td>
                <td>${costPerUnit > 0 ? formatCurrency(totalCost) : '–'}</td>
                <td>${pricePerUnit > 0 ? formatCurrency(totalSale) : '–'}</td>
                <td>
                    <button class="action-btn edit" onclick="editIncome('${item.id}')">Изменить</button>
                    <button class="action-btn delete" onclick="deleteIncome('${item.id}', this)">Удалить</button>
                </td>
            </tr>
        `;
    }).join('');
}

function renderPlans() {
    const tbody = document.getElementById('plans-tbody');
    const filtered = getFilteredPlans();
    
    tbody.innerHTML = filtered.map(plan => {
        const fact = getFactForPlan(plan);
        const profit = getProfitForPlan(plan);
        const percent = plan.targetAmount > 0 ? (fact / plan.targetAmount * 100).toFixed(1) : 0;
        const sellerLabel = plan.assignedSeller || 'Общий';
        const profitColor = profit >= 0 ? 'var(--success)' : 'var(--danger)';
        
        return `
            <tr>
                <td>
                    ${plan.name}<br>
                    <small style="color: var(--text-secondary)">${formatDateShort(plan.startDate)} – ${formatDateShort(plan.endDate)}</small>
                </td>
                <td>${sellerLabel}</td>
                <td>${formatCurrency(plan.targetAmount)}</td>
                <td>${formatCurrency(fact)}</td>
                <td style="color: ${profitColor}; font-weight: 600;">${formatCurrency(profit)}</td>
                <td>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <div style="flex: 1; height: 8px; background: var(--bg-tertiary); border-radius: 4px; overflow: hidden; min-width: 80px;">
                            <div style="width: ${Math.min(percent, 100)}%; height: 100%; background: ${percent >= 100 ? 'var(--success)' : 'var(--accent)'};"></div>
                        </div>
                        <span>${percent}%</span>
                    </div>
                </td>
                <td>
                    <button class="action-btn edit" onclick="editPlan('${plan.id}')">Изменить</button>
                    <button class="action-btn delete" onclick="deletePlan('${plan.id}', this)">Удалить</button>
                </td>
            </tr>
        `;
    }).join('');

    renderPlansOverview();
}

function renderPlansOverview() {
    const container = document.getElementById('plans-overview');
    if (!container) return;

    const now = new Date();
    
    const currentPlans = plans.filter(p => {
        const start = new Date(p.startDate);
        const end = new Date(p.endDate);
        end.setHours(23, 59, 59, 999);
        return now >= start && now <= end;
    });

    if (currentPlans.length === 0) {
        container.innerHTML = '<div class="plan-card-empty">Нет активных планов. Установите план в разделе "Планы".</div>';
        return;
    }

    let html = '';
    currentPlans.forEach(plan => {
        const fact = getFactForPlan(plan);
        const profit = getProfitForPlan(plan);
        const percent = plan.targetAmount > 0 ? (fact / plan.targetAmount * 100).toFixed(1) : 0;
        html += renderPlanCard(plan, fact, profit, percent);
    });

    container.innerHTML = html;
}

function renderPlanCard(plan, fact, profit, percent) {
    const sellerLabel = plan.assignedSeller ? `Продавец: ${plan.assignedSeller}` : 'Общий план';
    const profitColor = profit >= 0 ? 'var(--success)' : 'var(--danger)';
    
    return `
        <div class="plan-card">
            <div class="plan-card-header">
                <div class="plan-card-title">${plan.name}</div>
                <span class="plan-card-status current">Текущий</span>
            </div>
            <div class="plan-card-period">
                ${formatDateShort(plan.startDate)} – ${formatDateShort(plan.endDate)}<br>
                <small style="color: var(--text-secondary)">${sellerLabel}</small>
            </div>
            <div class="plan-card-progress">
                <div class="plan-card-progress-bar">
                    <div class="plan-card-progress-fill ${percent >= 100 ? 'success' : ''}" 
                         style="width: ${Math.min(percent, 100)}%;"></div>
                </div>
            </div>
            <div class="plan-card-stats">
                <div>План: <strong>${formatCurrency(plan.targetAmount)}</strong></div>
                <div>Факт: <strong>${formatCurrency(fact)}</strong></div>
                <div><strong>${percent}%</strong></div>
            </div>
            <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--border); font-size: 13px; color: var(--text-secondary); display: flex; justify-content: space-between;">
                <span>Чистая прибыль:</span>
                <strong style="color: ${profitColor}; font-size: 15px;">${formatCurrency(profit)}</strong>
            </div>
        </div>
    `;
}

function getSalesForPeriod(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    return sales
        .filter(s => {
            if (s.excludeFromStats) return false;
            const saleDate = new Date(s.date);
            return saleDate >= start && saleDate <= end;
        })
        .reduce((sum, s) => sum + s.totalAmount, 0);
}

function getSalesArrayForPeriod(startDate, endDate, salesArray = null) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    
    const sourceSales = salesArray || sales;
    
    return sourceSales.filter(s => {
        if (s.excludeFromStats) return false;
        const saleDate = new Date(s.date);
        return saleDate >= start && saleDate <= end;
    });
}

function getDateRange(periodType, customStart, customEnd) {
    const now = new Date();
    let start, end;

    if (periodType === 'custom' && customStart && customEnd) {
        start = new Date(customStart);
        end = new Date(customEnd);
    } else {
        const days = parseInt(periodType);
        start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
        end = now;
    }
    return { start: start.toISOString(), end: end.toISOString() };
}

function updateDashboard() {
    const statsSales = sales.filter(s => !s.excludeFromStats);
    
    const salesRange = getDateRange(currentSalesPeriod, salesCustomStart, salesCustomEnd);
    const periodSalesData = getSalesArrayForPeriod(salesRange.start, salesRange.end, statsSales);
    const periodSalesTotal = periodSalesData.reduce((sum, s) => sum + s.totalAmount, 0);
    const periodSalesCount = periodSalesData.length;
    const maxSale = periodSalesData.length > 0 ? Math.max(...periodSalesData.map(s => s.totalAmount)) : 0;
    
    const periodProfit = calcProfitFromSales(periodSalesData);
    const profitEl = document.getElementById('period-profit');
    if (profitEl) {
        profitEl.textContent = formatCurrency(periodProfit);
        profitEl.style.color = periodProfit >= 0 ? 'var(--success)' : 'var(--danger)';
    }

    document.getElementById('period-sales').textContent = formatCurrency(periodSalesTotal);
    document.getElementById('period-sales-count').textContent = periodSalesCount;
    document.getElementById('period-max-sale').textContent = formatCurrency(maxSale);

    const avgRange = getDateRange(currentAvgPeriod, avgCustomStart, avgCustomEnd);
    const avgSalesData = getSalesArrayForPeriod(avgRange.start, avgRange.end, statsSales);
    const avgTotal = avgSalesData.reduce((sum, s) => sum + s.totalAmount, 0);
    const avgCount = avgSalesData.length;
    const avgCheck = avgCount > 0 ? avgTotal / avgCount : 0;
    
    let medianCheck = 0;
    if (avgCount > 0) {
        const sorted = avgSalesData.map(s => s.totalAmount).sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        medianCheck = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    }
    const minCheck = avgCount > 0 ? Math.min(...avgSalesData.map(s => s.totalAmount)) : 0;

    document.getElementById('period-avg').textContent = formatCurrency(avgCheck);
    document.getElementById('period-median').textContent = formatCurrency(medianCheck);
    document.getElementById('period-min-check').textContent = formatCurrency(minCheck);

    const totalStock = products.reduce((sum, p) => sum + (p.stock || 0), 0);
    document.getElementById('total-stock').textContent = totalStock;

    if (income.length > 0) {
        const lastIncome = income.reduce((latest, current) => 
            new Date(current.date) > new Date(latest.date) ? current : latest
        );
        document.getElementById('last-income').textContent = 
            formatDate(lastIncome.date) + ' – ' + lastIncome.productName;
    } else {
        document.getElementById('last-income').textContent = 'Нет поступлений';
    }

    renderPlansOverview();
    
    setTimeout(() => {
        renderSalesChart();
        renderTopProductsChart();
        renderDistributionChart();
        renderABCAnalysis();
        renderSizeAnalysis();
        renderAvgSaleTime();
        renderBrandTurnover();
        renderStaleProducts();
        renderMarginByType();
        renderMarkupCoefficient();
        renderSoldPercentage();
    }, 100);
}

function renderSalesChart() {
    const ctx = document.getElementById('sales-chart');
    if (!ctx) return;
    
    if (salesChart) salesChart.destroy();

    const statsSales = sales.filter(s => !s.excludeFromStats);

    const period = currentSalesChartPeriod;
    const days = [];
    const salesData = [];

    let startInput, endInput;
    if (period === 'custom') {
        startInput = salesChartCustomStart;
        endInput = salesChartCustomEnd;
    }

    if (period === 'custom' && (!startInput || !endInput)) {
        days.push('Выберите период');
        salesData.push(0);
    } else {
        const now = new Date();
        let startDate, endDate;
        
        if (period === 'custom') {
            startDate = new Date(startInput);
            endDate = new Date(endInput);
        } else {
            const numDays = parseInt(period);
            endDate = now;
            startDate = new Date(now.getTime() - (numDays - 1) * 24 * 60 * 60 * 1000);
        }

        const diffDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
        const maxPoints = 60;
        const step = diffDays > maxPoints ? Math.ceil(diffDays / maxPoints) : 1;

        for (let i = 0; i < diffDays; i += step) {
            const date = new Date(startDate);
            date.setDate(date.getDate() + i);
            const dateStr = date.toISOString().split('T')[0];
            
            days.push(date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }));
            
            const daySales = statsSales
                .filter(s => s.date.split('T')[0] === dateStr)
                .reduce((sum, s) => sum + s.totalAmount, 0);
            
            salesData.push(daySales);
        }
    }

    salesChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: days,
            datasets: [{
                label: 'Продажи (₽)',
                data: salesData,
                borderColor: '#8b5cf6',
                backgroundColor: 'rgba(139, 92, 246, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { color: '#a0a0a0' },
                    grid: { color: '#333333' }
                },
                x: {
                    ticks: { color: '#a0a0a0', maxRotation: 45, minRotation: 45 },
                    grid: { color: '#333333' }
                }
            }
        }
    });
}

function renderTopProductsChart() {
    const ctx = document.getElementById('top-products-chart');
    if (!ctx) return;
    
    if (topProductsChart) topProductsChart.destroy();
    
    const statsSales = sales.filter(s => !s.excludeFromStats);
    
    const topCount = parseInt(document.getElementById('top-products-filter')?.value || 5);
    
    const productSales = {};
    statsSales.forEach(sale => {
        if (sale.items) {
            sale.items.forEach(item => {
                if (!productSales[item.productName]) {
                    productSales[item.productName] = 0;
                }
                productSales[item.productName] += item.total;
            });
        }
    });

    const topProducts = Object.entries(productSales)
        .sort((a, b) => b[1] - a[1])
        .slice(0, topCount);

    topProductsChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: topProducts.map(p => p[0]),
            datasets: [{
                label: 'Продажи (₽)',
                data: topProducts.map(p => p[1]),
                backgroundColor: '#8b5cf6'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            plugins: { legend: { display: false } },
            scales: {
                x: {
                    beginAtZero: true,
                    ticks: { color: '#a0a0a0' },
                    grid: { color: '#333333' }
                },
                y: {
                    ticks: { color: '#a0a0a0' },
                    grid: { color: '#333333' }
                }
            }
        }
    });
}

function renderDistributionChart() {
    const ctx = document.getElementById('distribution-chart');
    if (!ctx) return;
    
    if (distributionChart) distributionChart.destroy();

    const inStockProducts = products.filter(p => p.stock > 0);
    
    if (inStockProducts.length === 0) {
        distributionChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Нет товаров на складе'],
                datasets: [{ data: [1], backgroundColor: ['#333333'] }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } }
            }
        });
        return;
    }

    let labels = [];
    let data = [];
    const palette = ['#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#ec4899', '#6366f1', '#14b8a6'];

    if (currentDistributionType === 'category') {
        const groups = {};
        inStockProducts.forEach(p => {
            const cat = p.category || 'Без категории';
            groups[cat] = (groups[cat] || 0) + p.stock;
        });
        labels = Object.keys(groups);
        data = Object.values(groups);
    } else if (currentDistributionType === 'gender') {
        const groups = { 'Мужское': 0, 'Женское': 0, 'Унисекс': 0, 'Не указан': 0 };
        inStockProducts.forEach(p => {
            const key = p.gender === 'male' ? 'Мужское' : 
                        p.gender === 'female' ? 'Женское' : 
                        p.gender === 'unisex' ? 'Унисекс' : 'Не указан';
            groups[key] += p.stock;
        });
        Object.keys(groups).forEach(k => {
            if (groups[k] > 0) {
                labels.push(k);
                data.push(groups[k]);
            }
        });
    } else if (currentDistributionType === 'price') {
        const ranges = [
            { label: 'До 1 000 ₽', min: 0, max: 1000 },
            { label: '1 000 - 3 000 ₽', min: 1000, max: 3000 },
            { label: '3 000 - 5 000 ₽', min: 3000, max: 5000 },
            { label: '5 000 - 10 000 ₽', min: 5000, max: 10000 },
            { label: '10 000 - 20 000 ₽', min: 10000, max: 20000 },
            { label: '20 000 - 50 000 ₽', min: 20000, max: 50000 },
            { label: 'Более 50 000 ₽', min: 50000, max: Infinity }
        ];
        ranges.forEach(r => {
            const count = inStockProducts.filter(p => p.price >= r.min && p.price < r.max).reduce((sum, p) => sum + p.stock, 0);
            if (count > 0) {
                labels.push(r.label);
                data.push(count);
            }
        });
    }

    const backgroundColors = labels.map((_, i) => palette[i % palette.length]);

    distributionChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: backgroundColors,
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#a0a0a0', padding: 16, font: { size: 12 } }
                }
            }
        }
    });
}

// === ABC-АНАЛИЗ ===
let currentABCType = 'all';

function renderABCAnalysis() {
    const container = document.getElementById('abc-analysis-container');
    if (!container) return;
    
    container.innerHTML = `
        <div class="abc-tabs">
            <div class="abc-tab ${currentABCType === 'all' ? 'active' : ''}" data-type="all" onclick="switchABCType('all')">Все товары</div>
            <div class="abc-tab ${currentABCType === 'brand' ? 'active' : ''}" data-type="brand" onclick="switchABCType('brand')">Бренды</div>
            <div class="abc-tab ${currentABCType === 'secondhand' ? 'active' : ''}" data-type="secondhand" onclick="switchABCType('secondhand')">Секонд-хенд</div>
        </div>
        <div class="abc-metric-tabs">
            <div class="abc-metric-tab active" data-metric="revenue" onclick="switchABCMetric('revenue')">По выручке</div>
            <div class="abc-metric-tab" data-metric="profit" onclick="switchABCMetric('profit')">По марже</div>
        </div>
        <div id="abc-content"></div>
    `;
    renderABCContent('revenue');
}

window.switchABCType = function(type) {
    currentABCType = type;
    document.querySelectorAll('.abc-tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`.abc-tab[data-type="${type}"]`).classList.add('active');
    const activeMetric = document.querySelector('.abc-metric-tab.active')?.dataset.metric || 'revenue';
    renderABCContent(activeMetric);
};

window.switchABCMetric = function(metric) {
    document.querySelectorAll('.abc-metric-tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`.abc-metric-tab[data-metric="${metric}"]`).classList.add('active');
    renderABCContent(metric);
};

window.toggleABCGroup = function(group) {
    expandedABCGroups[group] = !expandedABCGroups[group];
    const activeMetric = document.querySelector('.abc-metric-tab.active')?.dataset.metric || 'revenue';
    renderABCContent(activeMetric);
};

function renderABCContent(metric) {
    const content = document.getElementById('abc-content');
    if (!content) return;
    
    let filteredProducts = products;
    if (currentABCType === 'brand') {
        filteredProducts = products.filter(p => p.isPermanentSupplier);
    } else if (currentABCType === 'secondhand') {
        filteredProducts = products.filter(p => !p.isPermanentSupplier);
    }
    
    const productData = {};
    filteredProducts.forEach(p => {
        productData[p.id] = {
            id: p.id,
            name: p.name + (p.size ? ` (${p.size})` : ''),
            revenue: 0,
            profit: 0,
            quantity: 0
        };
    });
    
    sales.forEach(s => {
        if (s.excludeFromStats) return;
        if (s.items) {
            s.items.forEach(item => {
                const pd = productData[item.productId];
                if (pd) {
                    const product = products.find(p => p.id === item.productId);
                    const cost = product ? (product.cost || 0) : 0;
                    pd.revenue += item.total;
                    pd.profit += (item.price - cost) * item.quantity;
                    pd.quantity += item.quantity;
                }
            });
        }
    });
    
    const items = Object.values(productData).filter(i => i.quantity > 0);
    if (items.length === 0) {
        content.innerHTML = '<div class="analytics-empty">Нет данных о продажах</div>';
        return;
    }
    
    const sorted = [...items].sort((a, b) => b[metric] - a[metric]);
    const totalValue = sorted.reduce((sum, i) => sum + i[metric], 0);
    
    if (totalValue === 0) {
        content.innerHTML = '<div class="analytics-empty">Нет данных</div>';
        return;
    }
    
    let cumulative = 0;
    const groups = { a: [], b: [], c: [] };
    sorted.forEach(item => {
        cumulative += item[metric];
        const percent = (cumulative / totalValue) * 100;
        if (percent <= 80) groups.a.push(item);
        else if (percent <= 95) groups.b.push(item);
        else groups.c.push(item);
    });
    
    const metricLabel = metric === 'revenue' ? 'Выручка' : 'Маржа';
    const groupAValue = groups.a.reduce((s, i) => s + i[metric], 0);
    const groupBValue = groups.b.reduce((s, i) => s + i[metric], 0);
    const groupCValue = groups.c.reduce((s, i) => s + i[metric], 0);
    
    const renderGroupItems = (groupItems, groupKey) => {
        const isExpanded = expandedABCGroups[groupKey];
        const visibleItems = isExpanded ? groupItems : groupItems.slice(0, 10);
        const hiddenCount = groupItems.length - 10;
        
        let html = visibleItems.map(i => `<div>${i.name}: ${formatCurrency(i[metric])}</div>`).join('');
        
        if (hiddenCount > 0) {
            html += `
                <div class="abc-show-more" onclick="toggleABCGroup('${groupKey}')" style="color: var(--accent); cursor: pointer; font-weight: 600; padding: 6px 0; margin-top: 4px;">
                    ${isExpanded ? '▲ Свернуть' : `...ещё ${hiddenCount} ▼`}
                </div>
            `;
        }
        
        return html;
    };
    
    content.innerHTML = `
        <div class="abc-grid">
            <div class="abc-card group-a">
                <h4>Группа A <span class="group-label">A</span></h4>
                <div class="abc-stats">
                    <div class="abc-stat">
                        <div class="abc-stat-value">${groups.a.length}</div>
                        <div class="abc-stat-label">Товаров</div>
                    </div>
                    <div class="abc-stat">
                        <div class="abc-stat-value">${totalValue > 0 ? Math.round((groupAValue / totalValue) * 100) : 0}%</div>
                        <div class="abc-stat-label">${metricLabel}</div>
                    </div>
                </div>
                <div class="abc-items">
                    ${renderGroupItems(groups.a, 'a')}
                </div>
            </div>
            <div class="abc-card group-b">
                <h4>Группа B <span class="group-label">B</span></h4>
                <div class="abc-stats">
                    <div class="abc-stat">
                        <div class="abc-stat-value">${groups.b.length}</div>
                        <div class="abc-stat-label">Товаров</div>
                    </div>
                    <div class="abc-stat">
                        <div class="abc-stat-value">${totalValue > 0 ? Math.round((groupBValue / totalValue) * 100) : 0}%</div>
                        <div class="abc-stat-label">${metricLabel}</div>
                    </div>
                </div>
                <div class="abc-items">
                    ${renderGroupItems(groups.b, 'b')}
                </div>
            </div>
            <div class="abc-card group-c">
                <h4>Группа C <span class="group-label">C</span></h4>
                <div class="abc-stats">
                    <div class="abc-stat">
                        <div class="abc-stat-value">${groups.c.length}</div>
                        <div class="abc-stat-label">Товаров</div>
                    </div>
                    <div class="abc-stat">
                        <div class="abc-stat-value">${totalValue > 0 ? Math.round((groupCValue / totalValue) * 100) : 0}%</div>
                        <div class="abc-stat-label">${metricLabel}</div>
                    </div>
                </div>
                <div class="abc-items">
                    ${renderGroupItems(groups.c, 'c')}
                </div>
            </div>
        </div>
    `;
}

// === АНАЛИЗ РАЗМЕРНОЙ СЕТКИ ===
function renderSizeAnalysis() {
    const container = document.getElementById('size-analysis-container');
    if (!container) return;
    
    const brandProducts = products.filter(p => p.isPermanentSupplier);
    
    if (brandProducts.length === 0) {
        container.innerHTML = '<div class="analytics-empty">Нет брендовой одежды для анализа размерной сетки</div>';
        return;
    }
    
    const sizeData = {};
    brandProducts.forEach(p => {
        const size = p.size || 'Без размера';
        if (!sizeData[size]) {
            sizeData[size] = { size, stock: 0, sold: 0, revenue: 0 };
        }
        sizeData[size].stock += (p.stock || 0);
    });
    
    sales.forEach(s => {
        if (s.excludeFromStats) return;
        if (s.items) {
            s.items.forEach(item => {
                const product = products.find(p => p.id === item.productId);
                if (product && product.isPermanentSupplier) {
                    const size = product.size || 'Без размера';
                    if (!sizeData[size]) sizeData[size] = { size, stock: 0, sold: 0, revenue: 0 };
                    sizeData[size].sold += item.quantity;
                    sizeData[size].revenue += item.total;
                }
            });
        }
    });
    
    const sizes = Object.values(sizeData).filter(s => s.stock > 0 || s.sold > 0);
    if (sizes.length === 0) {
        container.innerHTML = '<div class="analytics-empty">Нет данных по размерам брендовой одежды</div>';
        return;
    }
    
    const avgSold = sizes.reduce((sum, s) => sum + s.sold, 0) / sizes.length;
    
    container.innerHTML = `
        <div class="analytics-subtitle">Только брендовая одежда (можно дозаказать у поставщика)</div>
        <div class="size-analysis-grid">
            ${sizes.map(s => {
                let cls = '';
                if (s.sold > avgSold * 1.5) cls = 'hot';
                else if (s.sold < avgSold * 0.5 && s.stock > 0) cls = 'cold';
                return `
                    <div class="size-card ${cls}">
                        <div class="size-name">${s.size}</div>
                        <div class="size-stats">
                            <div class="size-stat-item">
                                <div class="size-stat-num">${s.sold}</div>
                                <div class="size-stat-label">Продано</div>
                            </div>
                            <div class="size-stat-item">
                                <div class="size-stat-num">${s.stock}</div>
                                <div class="size-stat-label">Остаток</div>
                            </div>
                            <div class="size-stat-item" style="grid-column: span 2;">
                                <div class="size-stat-num">${formatCurrency(s.revenue)}</div>
                                <div class="size-stat-label">Выручка</div>
                            </div>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

// === СРЕДНИЙ СРОК ПРОДАЖИ ===
function renderAvgSaleTime() {
    const container = document.getElementById('avg-sale-time-container');
    if (!container) return;
    
    const categoryData = {};
    
    sales.forEach(sale => {
        if (sale.excludeFromStats) return;
        if (!sale.items) return;
        const saleDate = new Date(sale.date);
        
        sale.items.forEach(item => {
            const product = products.find(p => p.id === item.productId);
            if (!product) return;
            
            const category = product.category || 'Без категории';
            if (!categoryData[category]) {
                categoryData[category] = { category, totalDays: 0, count: 0, revenue: 0 };
            }
            
            const relevantIncomes = income
                .filter(i => i.productId === product.id && new Date(i.date) <= saleDate)
                .sort((a, b) => new Date(b.date) - new Date(a.date));
            
            if (relevantIncomes.length > 0) {
                const incomeDate = new Date(relevantIncomes[0].date);
                const daysToSale = Math.round((saleDate - incomeDate) / 86400000);
                if (daysToSale >= 0 && daysToSale < 365) {
                    categoryData[category].totalDays += daysToSale * item.quantity;
                    categoryData[category].count += item.quantity;
                    categoryData[category].revenue += item.total;
                }
            }
        });
    });
    
    const categories = Object.values(categoryData)
        .filter(c => c.count > 0)
        .map(c => ({
            ...c,
            avgDays: Math.round(c.totalDays / c.count)
        }))
        .sort((a, b) => a.avgDays - b.avgDays);
    
    if (categories.length === 0) {
        container.innerHTML = '<div class="analytics-empty">Недостаточно данных для расчёта</div>';
        return;
    }
    
    const minDays = Math.min(...categories.map(c => c.avgDays));
    const maxDays = Math.max(...categories.map(c => c.avgDays));
    const avgAll = Math.round(categories.reduce((s, c) => s + c.avgDays, 0) / categories.length);
    
    container.innerHTML = `
        <div class="analytics-subtitle">За сколько дней в среднем продаётся вещь из каждой категории</div>
        <div class="avg-time-grid">
            ${categories.map(c => {
                let cls = '';
                if (c.avgDays <= minDays * 1.3) cls = 'fast';
                else if (c.avgDays >= maxDays * 0.7) cls = 'slow';
                return `
                    <div class="avg-time-card ${cls}">
                        <div class="avg-time-category">${c.category}</div>
                        <div class="avg-time-days">${c.avgDays} дн.</div>
                        <div class="avg-time-stats">
                            <div class="avg-time-stat">
                                <div class="avg-time-stat-value">${c.count}</div>
                                <div class="avg-time-stat-label">Продано шт.</div>
                            </div>
                            <div class="avg-time-stat">
                                <div class="avg-time-stat-value">${formatCurrency(c.revenue)}</div>
                                <div class="avg-time-stat-label">Выручка</div>
                            </div>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
        <div class="analytics-summary" style="margin-top: 16px; padding: 12px 16px; background: var(--bg-tertiary); border-radius: 8px; font-size: 13px;">
            Средний срок продажи по всем категориям: <strong>${avgAll} дней</strong>
        </div>
        <div style="margin-top: 12px; padding: 12px 16px; background: var(--bg-tertiary); border-radius: 8px; font-size: 12px; color: var(--text-secondary); border-left: 3px solid var(--accent);">
            💡 <strong>Примечание:</strong> Эта метрика станет более показательной через 3-6 месяцев работы системы, когда накопится достаточная статистика по продажам.
        </div>
    `;
}

// === ОБОРАЧИВАЕМОСТЬ ПО БРЕНДАМ ===
let currentTurnoverType = 'all';

function renderBrandTurnover() {
    const container = document.getElementById('brand-turnover-container');
    if (!container) return;
    
    container.innerHTML = `
        <div class="turnover-tabs">
            <div class="turnover-tab ${currentTurnoverType === 'all' ? 'active' : ''}" data-type="all" onclick="switchTurnoverType('all')">Все</div>
            <div class="turnover-tab ${currentTurnoverType === 'brand' ? 'active' : ''}" data-type="brand" onclick="switchTurnoverType('brand')">Бренды</div>
            <div class="turnover-tab ${currentTurnoverType === 'secondhand' ? 'active' : ''}" data-type="secondhand" onclick="switchTurnoverType('secondhand')">Секонд-хенд</div>
        </div>
        <div id="turnover-content"></div>
        <div style="margin-top: 12px; padding: 12px 16px; background: var(--bg-tertiary); border-radius: 8px; font-size: 12px; color: var(--text-secondary); border-left: 3px solid var(--accent);">
            💡 <strong>Примечание:</strong> Эта метрика станет более показательной через 3-6 месяцев работы системы, когда накопится достаточная статистика по продажам.
        </div>
    `;
    renderTurnoverContent();
}

window.switchTurnoverType = function(type) {
    currentTurnoverType = type;
    document.querySelectorAll('.turnover-tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`.turnover-tab[data-type="${type}"]`).classList.add('active');
    renderTurnoverContent();
};

function renderTurnoverContent() {
    const content = document.getElementById('turnover-content');
    if (!content) return;
    
    const now = new Date();
    const period = 30;
    const periodAgo = new Date(now.getTime() - period * 86400000);
    
    let filteredProducts = products;
    if (currentTurnoverType === 'brand') {
        filteredProducts = products.filter(p => p.isPermanentSupplier);
    } else if (currentTurnoverType === 'secondhand') {
        filteredProducts = products.filter(p => !p.isPermanentSupplier);
    }
    
    const brandData = {};
    filteredProducts.forEach(p => {
        const brand = p.brand || 'Без бренда';
        if (!brandData[brand]) {
            brandData[brand] = { brand, stock: 0, sold30: 0, revenue: 0, isPermanent: p.isPermanentSupplier };
        }
        brandData[brand].stock += (p.stock || 0);
    });
    
    sales.forEach(s => {
        if (s.excludeFromStats) return;
        if (new Date(s.date) < periodAgo) return;
        if (s.items) {
            s.items.forEach(item => {
                const product = products.find(p => p.id === item.productId);
                if (product) {
                    const matchesFilter = currentTurnoverType === 'all' || 
                        (currentTurnoverType === 'brand' && product.isPermanentSupplier) ||
                        (currentTurnoverType === 'secondhand' && !product.isPermanentSupplier);
                    
                    if (matchesFilter) {
                        const brand = product.brand || 'Без бренда';
                        if (!brandData[brand]) brandData[brand] = { brand, stock: 0, sold30: 0, revenue: 0, isPermanent: product.isPermanentSupplier };
                        brandData[brand].sold30 += item.quantity;
                        brandData[brand].revenue += item.total;
                    }
                }
            });
        }
    });
    
    const brands = Object.values(brandData).filter(b => b.stock > 0 || b.sold30 > 0);
    if (brands.length === 0) {
        content.innerHTML = '<div class="analytics-empty">Нет данных</div>';
        return;
    }
    
    brands.forEach(b => {
        b.velocity = b.sold30 / period;
        b.turnoverDays = b.velocity > 0 ? Math.round(b.stock / b.velocity) : Infinity;
        if (b.turnoverDays < 30) b.class = 'fast';
        else if (b.turnoverDays < 90) b.class = 'medium';
        else b.class = 'slow';
    });
    
    brands.sort((a, b) => {
        if (a.turnoverDays === Infinity && b.turnoverDays === Infinity) return b.sold30 - a.sold30;
        if (a.turnoverDays === Infinity) return 1;
        if (b.turnoverDays === Infinity) return -1;
        return a.turnoverDays - b.turnoverDays;
    });
    
    content.innerHTML = `
        <div class="brand-grid">
            ${brands.map(b => `
                <div class="brand-card ${b.class}">
                    <div class="brand-name">${b.brand}</div>
                    <div class="brand-stats">
                        <div class="brand-stat">
                            <div class="brand-stat-value">${b.turnoverDays === Infinity ? '–' : b.turnoverDays + ' дн.'}</div>
                            <div class="brand-stat-label">Оборачив.</div>
                        </div>
                        <div class="brand-stat">
                            <div class="brand-stat-value">${b.velocity.toFixed(1)}</div>
                            <div class="brand-stat-label">В день</div>
                        </div>
                        <div class="brand-stat">
                            <div class="brand-stat-value">${b.stock}</div>
                            <div class="brand-stat-label">Остаток</div>
                        </div>
                        <div class="brand-stat">
                            <div class="brand-stat-value">${formatCurrency(b.revenue)}</div>
                            <div class="brand-stat-label">За 30 дн.</div>
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

// === ЗАЛЕЖАВШИЕСЯ ТОВАРЫ (ИСПРАВЛЕННАЯ ЛОГИКА) ===
window.toggleStaleProductsList = function() {
    staleProductsExpanded = !staleProductsExpanded;
    renderStaleProducts();
};

function renderStaleProducts() {
    const container = document.getElementById('stale-products-container');
    if (!container) return;
    
    const now = new Date();
    
    const staleItems = [];
    products.forEach(p => {
        if ((p.stock || 0) <= 0) return;
        
        const thresholdDays = p.isPermanentSupplier ? 90 : 120;
        const threshold = new Date(now.getTime() - thresholdDays * 86400000);
        
        // Находим дату первого поступления этого товара
        const productIncomes = income
            .filter(i => i.productId === p.id)
            .sort((a, b) => new Date(a.date) - new Date(b.date));
        
        const firstIncomeDate = productIncomes.length > 0 ? new Date(productIncomes[0].date) : null;
        
        // Если товар поступил меньше threshold дней назад - не считаем его залежавшимся
        if (firstIncomeDate && firstIncomeDate > threshold) {
            return; // Товар ещё "молодой", не считаем залежавшимся
        }
        
        let lastSaleDate = null;
        sales.forEach(s => {
            if (s.excludeFromStats) return;
            if (s.items) {
                s.items.forEach(item => {
                    if (item.productId === p.id) {
                        const d = new Date(s.date);
                        if (!lastSaleDate || d > lastSaleDate) lastSaleDate = d;
                    }
                });
            }
        });
        
        if (!lastSaleDate || lastSaleDate < threshold) {
            const daysWithoutSales = lastSaleDate 
                ? Math.round((now - lastSaleDate) / 86400000)
                : (firstIncomeDate ? Math.round((now - firstIncomeDate) / 86400000) : null);
            const frozenMoney = (p.cost || 0) * p.stock;
            staleItems.push({
                product: p,
                lastSaleDate,
                daysWithoutSales,
                frozenMoney,
                isBrand: p.isPermanentSupplier,
                thresholdDays
            });
        }
    });
    
    staleItems.sort((a, b) => b.frozenMoney - a.frozenMoney);
    
    const brandStale = staleItems.filter(i => i.isBrand);
    const secondhandStale = staleItems.filter(i => !i.isBrand);
    const totalFrozen = staleItems.reduce((sum, i) => sum + i.frozenMoney, 0);
    
    if (staleItems.length === 0) {
        container.innerHTML = `
            <div class="analytics-empty">
                🎉 Отлично! Нет товаров без продаж сверх порога
                <div style="margin-top: 12px; font-size: 12px; color: var(--text-secondary);">
                    Пороги: Бренды – 90 дней, Секонд-хенд – 120 дней
                </div>
            </div>
        `;
        return;
    }
    
    const visibleItems = staleProductsExpanded ? staleItems : staleItems.slice(0, 12);
    const hiddenCount = staleItems.length - 12;
    
    container.innerHTML = `
        <div class="stale-summary">
            У вас <strong>${staleItems.length}</strong> ${staleItems.length === 1 ? 'товар с остатком' : 'товаров с остатком'}, 
            но без продаж сверх порога. Общая стоимость замороженных денег: 
            <strong>${formatCurrency(totalFrozen)}</strong>
            <div style="margin-top: 8px; font-size: 12px; color: var(--text-secondary);">
                Пороги: Бренды – 90 дней, Секонд-хенд – 120 дней
            </div>
        </div>
        <div class="stale-summary" style="display: flex; gap: 16px; flex-wrap: wrap;">
            <div style="flex: 1; min-width: 200px;">
                <strong>Бренды (90+ дн.):</strong> ${brandStale.length} шт., 
                заморожено <strong>${formatCurrency(brandStale.reduce((s, i) => s + i.frozenMoney, 0))}</strong>
            </div>
            <div style="flex: 1; min-width: 200px;">
                <strong>Секонд-хенд (120+ дн.):</strong> ${secondhandStale.length} шт., 
                заморожено <strong>${formatCurrency(secondhandStale.reduce((s, i) => s + i.frozenMoney, 0))}</strong>
            </div>
        </div>
        <div class="stale-list">
            ${visibleItems.map(i => `
                <div class="stale-item">
                    <div class="stale-name" title="${i.product.name} ${i.product.size ? '(' + i.product.size + ')' : ''}">
                        ${i.product.name} ${i.product.size ? '(' + i.product.size + ')' : ''}
                        <span style="font-size: 10px; padding: 2px 6px; border-radius: 4px; margin-left: 6px; background: ${i.isBrand ? 'var(--success)' : 'var(--warning)'}; color: white;">
                            ${i.isBrand ? 'Бренд' : 'Секонд'}
                        </span>
                    </div>
                    <div class="stale-info">
                        <div>Остаток: <strong>${i.product.stock} шт.</strong></div>
                        <div>${i.daysWithoutSales === null ? 'Ни одной продажи' : `Посл. продажа: ${i.daysWithoutSales} дн. назад`}</div>
                        <div class="stale-money">${formatCurrency(i.frozenMoney)}</div>
                    </div>
                </div>
            `).join('')}
        </div>
        ${hiddenCount > 0 || staleProductsExpanded ? `
            <div style="text-align: center; margin-top: 16px;">
                <button class="btn-secondary" onclick="toggleStaleProductsList()" style="padding: 10px 24px;">
                    ${staleProductsExpanded ? '▲ Свернуть список' : `Показать все ${staleItems.length} товаров ▼`}
                </button>
            </div>
        ` : ''}
    `;
}

// === МАРЖИНАЛЬНОСТЬ ПО ТИПАМ ===
function renderMarginByType() {
    const container = document.getElementById('margin-by-type-container');
    if (!container) return;
    
    const brandStats = { revenue: 0, profit: 0, count: 0 };
    const secondhandStats = { revenue: 0, profit: 0, count: 0 };
    
    sales.forEach(sale => {
        if (sale.excludeFromStats) return;
        if (!sale.items) return;
        
        sale.items.forEach(item => {
            const product = products.find(p => p.id === item.productId);
            if (!product) return;
            
            const cost = product.cost || 0;
            const profit = (item.price - cost) * item.quantity;
            
            if (product.isPermanentSupplier) {
                brandStats.revenue += item.total;
                brandStats.profit += profit;
                brandStats.count += item.quantity;
            } else {
                secondhandStats.revenue += item.total;
                secondhandStats.profit += profit;
                secondhandStats.count += item.quantity;
            }
        });
    });
    
    const brandMargin = brandStats.revenue > 0 ? (brandStats.profit / brandStats.revenue * 100) : 0;
    const secondhandMargin = secondhandStats.revenue > 0 ? (secondhandStats.profit / secondhandStats.revenue * 100) : 0;
    const brandAvgProfit = brandStats.count > 0 ? brandStats.profit / brandStats.count : 0;
    const secondhandAvgProfit = secondhandStats.count > 0 ? secondhandStats.profit / secondhandStats.count : 0;
    
    container.innerHTML = `
        <div class="margin-grid">
            <div class="margin-card brand">
                <div class="margin-type-badge">Брендовая одежда</div>
                <div class="margin-stats">
                    <div class="margin-stat">
                        <div class="margin-stat-value ${brandMargin >= 30 ? 'success' : 'warning'}">${brandMargin.toFixed(1)}%</div>
                        <div class="margin-stat-label">Маржа %</div>
                    </div>
                    <div class="margin-stat">
                        <div class="margin-stat-value">${formatCurrency(brandAvgProfit)}</div>
                        <div class="margin-stat-label">Ср. прибыль/шт.</div>
                    </div>
                    <div class="margin-stat">
                        <div class="margin-stat-value">${formatCurrency(brandStats.profit)}</div>
                        <div class="margin-stat-label">Всего прибыль</div>
                    </div>
                    <div class="margin-stat">
                        <div class="margin-stat-value">${brandStats.count}</div>
                        <div class="margin-stat-label">Продано шт.</div>
                    </div>
                </div>
            </div>
            <div class="margin-card secondhand">
                <div class="margin-type-badge">Секонд-хенд</div>
                <div class="margin-stats">
                    <div class="margin-stat">
                        <div class="margin-stat-value ${secondhandMargin >= 50 ? 'success' : 'warning'}">${secondhandMargin.toFixed(1)}%</div>
                        <div class="margin-stat-label">Маржа %</div>
                    </div>
                    <div class="margin-stat">
                        <div class="margin-stat-value">${formatCurrency(secondhandAvgProfit)}</div>
                        <div class="margin-stat-label">Ср. прибыль/шт.</div>
                    </div>
                    <div class="margin-stat">
                        <div class="margin-stat-value">${formatCurrency(secondhandStats.profit)}</div>
                        <div class="margin-stat-label">Всего прибыль</div>
                    </div>
                    <div class="margin-stat">
                        <div class="margin-stat-value">${secondhandStats.count}</div>
                        <div class="margin-stat-label">Продано шт.</div>
                    </div>
                </div>
            </div>
        </div>
        <div class="analytics-summary" style="margin-top: 16px; padding: 12px 16px; background: var(--bg-tertiary); border-radius: 8px; font-size: 13px;">
            ${brandMargin > secondhandMargin 
                ? `<strong>Бренды</strong> эффективнее по марже (${brandMargin.toFixed(1)}% vs ${secondhandMargin.toFixed(1)}%)`
                : `<strong>Секонд-хенд</strong> эффективнее по марже (${secondhandMargin.toFixed(1)}% vs ${brandMargin.toFixed(1)}%)`}
        </div>
    `;
}

// === КОЭФФИЦИЕНТ НАЦЕНКИ ===
function renderMarkupCoefficient() {
    const container = document.getElementById('markup-coefficient-container');
    if (!container) return;
    
    const brandMarkups = [];
    const secondhandMarkups = [];
    
    products.forEach(p => {
        if (!p.cost || p.cost <= 0 || !p.price || p.price <= 0) return;
        const markup = p.price / p.cost;
        
        if (p.isPermanentSupplier) {
            brandMarkups.push(markup);
        } else {
            secondhandMarkups.push(markup);
        }
    });
    
    const avgBrandMarkup = brandMarkups.length > 0 
        ? brandMarkups.reduce((s, m) => s + m, 0) / brandMarkups.length 
        : 0;
    const avgSecondhandMarkup = secondhandMarkups.length > 0 
        ? secondhandMarkups.reduce((s, m) => s + m, 0) / secondhandMarkups.length 
        : 0;
    
    container.innerHTML = `
        <div class="markup-grid">
            <div class="markup-card brand">
                <div class="markup-type-badge">Брендовая одежда</div>
                <div class="markup-value">${avgBrandMarkup.toFixed(2)}x</div>
                <div class="markup-description">Средний коэффициент наценки</div>
                <div class="markup-example">
                    Закупка 5000₽ → Продажа ${formatCurrency(Math.round(5000 * avgBrandMarkup))}
                </div>
                <div class="markup-count">Товаров в расчёте: ${brandMarkups.length}</div>
            </div>
            <div class="markup-card secondhand">
                <div class="markup-type-badge">Секонд-хенд</div>
                <div class="markup-value">${avgSecondhandMarkup.toFixed(2)}x</div>
                <div class="markup-description">Средний коэффициент наценки</div>
                <div class="markup-example">
                    Закупка 500₽ → Продажа ${formatCurrency(Math.round(500 * avgSecondhandMarkup))}
                </div>
                <div class="markup-count">Товаров в расчёте: ${secondhandMarkups.length}</div>
            </div>
        </div>
        <div class="analytics-summary" style="margin-top: 16px; padding: 12px 16px; background: var(--bg-tertiary); border-radius: 8px; font-size: 13px;">
            ${avgSecondhandMarkup > avgBrandMarkup 
                ? `Секонд-хенд имеет наценку в <strong>${(avgSecondhandMarkup / avgBrandMarkup).toFixed(1)}x</strong> выше, чем бренды`
                : `Бренды имеют наценку в <strong>${(avgBrandMarkup / avgSecondhandMarkup).toFixed(1)}x</strong> выше, чем секонд-хенд`}
        </div>
    `;
}

// === ПРОЦЕНТ ПРОДАННЫХ ВЕЩЕЙ ===
function renderSoldPercentage() {
    const container = document.getElementById('sold-percentage-container');
    if (!container) return;
    
    const now = new Date();
    const sixMonthsAgo = new Date(now.getTime() - 180 * 86400000);
    
    const recentIncomes = income.filter(i => new Date(i.date) >= sixMonthsAgo);
    
    const brandStats = { received: 0, sold: 0 };
    const secondhandStats = { received: 0, sold: 0 };
    
    recentIncomes.forEach(inc => {
        const product = products.find(p => p.id === inc.productId);
        if (!product) return;
        
        if (product.isPermanentSupplier) {
            brandStats.received += inc.quantity;
        } else {
            secondhandStats.received += inc.quantity;
        }
    });
    
    sales.forEach(sale => {
        if (sale.excludeFromStats) return;
        if (new Date(sale.date) < sixMonthsAgo) return;
        if (!sale.items) return;
        
        sale.items.forEach(item => {
            const product = products.find(p => p.id === item.productId);
            if (!product) return;
            
            if (product.isPermanentSupplier) {
                brandStats.sold += item.quantity;
            } else {
                secondhandStats.sold += item.quantity;
            }
        });
    });
    
    const brandPercent = brandStats.received > 0 ? (brandStats.sold / brandStats.received * 100) : 0;
    const secondhandPercent = secondhandStats.received > 0 ? (secondhandStats.sold / secondhandStats.received * 100) : 0;
    
    container.innerHTML = `
        <div class="analytics-subtitle">За последние 6 месяцев: сколько из поступивших вещей продалось</div>
        <div class="sold-percent-grid">
            <div class="sold-percent-card brand">
                <div class="sold-percent-type">Брендовая одежда</div>
                <div class="sold-percent-value">${brandPercent.toFixed(1)}%</div>
                <div class="sold-percent-bar">
                    <div class="sold-percent-fill" style="width: ${Math.min(brandPercent, 100)}%;"></div>
                </div>
                <div class="sold-percent-stats">
                    <span>Поступило: <strong>${brandStats.received}</strong></span>
                    <span>Продано: <strong>${brandStats.sold}</strong></span>
                </div>
            </div>
            <div class="sold-percent-card secondhand">
                <div class="sold-percent-type">Секонд-хенд</div>
                <div class="sold-percent-value">${secondhandPercent.toFixed(1)}%</div>
                <div class="sold-percent-bar">
                    <div class="sold-percent-fill" style="width: ${Math.min(secondhandPercent, 100)}%;"></div>
                </div>
                <div class="sold-percent-stats">
                    <span>Поступило: <strong>${secondhandStats.received}</strong></span>
                    <span>Продано: <strong>${secondhandStats.sold}</strong></span>
                </div>
            </div>
        </div>
        <div class="analytics-summary" style="margin-top: 16px; padding: 12px 16px; background: var(--bg-tertiary); border-radius: 8px; font-size: 13px;">
            Норма для брендов: 60-70%, для секонда: 70-80%. 
            ${brandPercent < 60 ? '<br><strong style="color: var(--warning);">⚠️ Бренды ниже нормы – проверьте цены или ассортимент</strong>' : ''}
            ${secondhandPercent < 70 ? '<br><strong style="color: var(--warning);">⚠️ Секонд ниже нормы – проверьте качество или цены</strong>' : ''}
        </div>
        <div style="margin-top: 12px; padding: 12px 16px; background: var(--bg-tertiary); border-radius: 8px; font-size: 12px; color: var(--text-secondary); border-left: 3px solid var(--accent);">
            💡 <strong>Примечание:</strong> Эта метрика станет более показательной через 3-6 месяцев работы системы, когда накопится достаточная статистика по продажам.
        </div>
    `;
}

// === ОБРАБОТЧИКИ СОБЫТИЙ ===

document.getElementById('top-products-filter')?.addEventListener('change', () => {
    renderTopProductsChart();
});

document.getElementById('sales-chart-period-filter')?.addEventListener('change', (e) => {
    const value = e.target.value;
    const customPeriod = document.getElementById('sales-chart-custom-period');
    
    if (value === 'custom') {
        customPeriod.style.display = 'flex';
        currentSalesChartPeriod = 'custom';
    } else {
        customPeriod.style.display = 'none';
        currentSalesChartPeriod = parseInt(value);
        renderSalesChart();
    }
});

window.applySalesChartCustomPeriod = function() {
    salesChartCustomStart = document.getElementById('sales-chart-period-start').value;
    salesChartCustomEnd = document.getElementById('sales-chart-period-end').value;
    renderSalesChart();
};

document.getElementById('distribution-type-selector')?.addEventListener('change', (e) => {
    currentDistributionType = e.target.value;
    renderDistributionChart();
});

document.getElementById('sales-period-selector')?.addEventListener('change', (e) => {
    const value = e.target.value;
    const customDiv = document.getElementById('sales-custom-period');
    if (value === 'custom') {
        customDiv.style.display = 'flex';
        currentSalesPeriod = 'custom';
    } else {
        customDiv.style.display = 'none';
        currentSalesPeriod = parseInt(value);
        updateDashboard();
    }
});

window.applySalesCustomPeriod = function() {
    salesCustomStart = document.getElementById('sales-period-start').value;
    salesCustomEnd = document.getElementById('sales-period-end').value;
    updateDashboard();
};

document.getElementById('avg-period-selector')?.addEventListener('change', (e) => {
    const value = e.target.value;
    const customDiv = document.getElementById('avg-custom-period');
    if (value === 'custom') {
        customDiv.style.display = 'flex';
        currentAvgPeriod = 'custom';
    } else {
        customDiv.style.display = 'none';
        currentAvgPeriod = parseInt(value);
        updateDashboard();
    }
});

window.applyAvgCustomPeriod = function() {
    avgCustomStart = document.getElementById('avg-period-start').value;
    avgCustomEnd = document.getElementById('avg-period-end').value;
    updateDashboard();
};