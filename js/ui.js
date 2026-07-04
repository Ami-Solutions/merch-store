let salesChart = null;
let topProductsChart = null;
let distributionChart = null;

// Периоды для статистики
let currentSalesPeriod = 7;
let currentAvgPeriod = 7;
let salesCustomStart = '';
let salesCustomEnd = '';
let avgCustomStart = '';
let avgCustomEnd = '';

// Период для графика продаж
let currentSalesChartPeriod = 7;
let salesChartCustomStart = '';
let salesChartCustomEnd = '';

// Тип распределения
let currentDistributionType = 'category';

function getGenderLabel(gender) {
    const labels = { male: 'Мужское', female: 'Женское', unisex: 'Унисекс' };
    return labels[gender] || '—';
}

function renderProducts() {
    const tbody = document.getElementById('products-tbody');
    const filtered = getFilteredProducts();
    
    tbody.innerHTML = filtered.map(product => `
        <tr>
            <td>${product.article}</td>
            <td>${product.name}</td>
            <td>${product.category || '—'}</td>
            <td>${product.brand || '—'}</td>
            <td>${getGenderLabel(product.gender)}</td>
            <td>${product.size || '—'}</td>
            <td>${product.cost ? formatCurrency(product.cost) : '—'}</td>
            <td>${product.price ? formatCurrency(product.price) : '—'}</td>
            <td>${product.discount > 0 ? formatCurrency(product.discount) : '—'}</td>
            <td>${product.stock}</td>
            <td>
                <button class="action-btn edit" onclick="editProduct('${product.id}')">Изменить</button>
                ${window.currentUser && window.currentUser.role === 'owner' ? 
                    `<button class="action-btn delete" onclick="deleteProduct('${product.id}', this)">Удалить</button>` : ''}
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
        ).join('') : '<div>—</div>';

        return `
            <tr>
                <td>${formatDate(sale.date)}</td>
                <td class="sale-items-cell">${itemsHtml}</td>
                <td><strong>${formatCurrency(sale.totalAmount)}</strong></td>
                <td>${sale.seller}</td>
                <td>
                    <button class="action-btn edit" onclick="editSale('${sale.id}')">Изменить</button>
                    ${window.currentUser && window.currentUser.role === 'owner' ? 
                        `<button class="action-btn delete" onclick="deleteSale('${sale.id}', this)">Удалить</button>` : ''}
                </td>
            </tr>
        `;
    }).join('');
}

function renderIncome() {
    const tbody = document.getElementById('income-tbody');
    const filtered = getFilteredIncome();
    
    tbody.innerHTML = filtered.map(item => `
        <tr>
            <td>${formatDate(item.date)}</td>
            <td>${item.productName}</td>
            <td>${item.quantity}</td>
            <td>${formatCurrency(item.totalAmount)}</td>
            <td>
                <button class="action-btn edit" onclick="editIncome('${item.id}')">Изменить</button>
                ${window.currentUser && window.currentUser.role === 'owner' ? 
                    `<button class="action-btn delete" onclick="deleteIncome('${item.id}', this)">Удалить</button>` : ''}
            </td>
        </tr>
    `).join('');
}

function renderPlans() {
    const tbody = document.getElementById('plans-tbody');
    const filtered = getFilteredPlans();
    
    tbody.innerHTML = filtered.map(plan => {
        const start = new Date(plan.startDate);
        const end = new Date(plan.endDate);
        end.setHours(23, 59, 59, 999);
        
        const fact = sales
            .filter(s => {
                const saleDate = new Date(s.date);
                return saleDate >= start && saleDate <= end;
            })
            .reduce((sum, s) => sum + s.totalAmount, 0);
            
        const percent = plan.targetAmount > 0 ? (fact / plan.targetAmount * 100).toFixed(1) : 0;
        
        return `
            <tr>
                <td>
                    ${plan.name}<br>
                    <small style="color: var(--text-secondary)">${formatDateShort(plan.startDate)} — ${formatDateShort(plan.endDate)}</small>
                </td>
                <td>${formatCurrency(plan.targetAmount)}</td>
                <td>${formatCurrency(fact)}</td>
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
                    ${window.currentUser.role === 'owner' ? 
                        `<button class="action-btn delete" onclick="deletePlan('${plan.id}', this)">Удалить</button>` : ''}
                </td>
            </tr>
        `;
    }).join('');

    renderPlansOverview();
}

function renderPlansOverview() {
    const container = document.getElementById('plans-overview');
    if (!container) return;

    if (plans.length === 0) {
        container.innerHTML = '<div class="plan-card-empty">Нет активных планов. Установите план в разделе "Планы".</div>';
        return;
    }

    const now = new Date();
    const currentPlan = plans.find(p => {
        const start = new Date(p.startDate);
        const end = new Date(p.endDate);
        end.setHours(23, 59, 59, 999);
        return now >= start && now <= end;
    });

    const pastPlans = plans
        .filter(p => new Date(p.endDate) < now)
        .sort((a, b) => new Date(b.endDate) - new Date(a.endDate))
        .slice(0, 1);

    let html = '';

    if (currentPlan) {
        const fact = getSalesForPeriod(currentPlan.startDate, currentPlan.endDate);
        const percent = currentPlan.targetAmount > 0 ? (fact / currentPlan.targetAmount * 100).toFixed(1) : 0;
        html += renderPlanCard(currentPlan, fact, percent, true);
    }

    if (pastPlans.length > 0) {
        const pastPlan = pastPlans[0];
        const fact = getSalesForPeriod(pastPlan.startDate, pastPlan.endDate);
        const percent = pastPlan.targetAmount > 0 ? (fact / pastPlan.targetAmount * 100).toFixed(1) : 0;
        html += renderPlanCard(pastPlan, fact, percent, false);
    }

    if (!html) {
        html = '<div class="plan-card-empty">Нет текущего или завершённых планов</div>';
    }

    container.innerHTML = html;
}

function renderPlanCard(plan, fact, percent, isCurrent) {
    return `
        <div class="plan-card">
            <div class="plan-card-header">
                <div class="plan-card-title">${plan.name}</div>
                <span class="plan-card-status ${isCurrent ? 'current' : 'past'}">
                    ${isCurrent ? 'Текущий' : 'Прошлый'}
                </span>
            </div>
            <div class="plan-card-period">
                ${formatDateShort(plan.startDate)} — ${formatDateShort(plan.endDate)}
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
        </div>
    `;
}

function getSalesForPeriod(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    
    return sales
        .filter(s => {
            const saleDate = new Date(s.date);
            return saleDate >= start && saleDate <= end;
        })
        .reduce((sum, s) => sum + s.totalAmount, 0);
}

function getSalesArrayForPeriod(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    
    return sales.filter(s => {
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
    // Продажи за выбранный период
    const salesRange = getDateRange(currentSalesPeriod, salesCustomStart, salesCustomEnd);
    const periodSalesData = getSalesArrayForPeriod(salesRange.start, salesRange.end);
    const periodSalesTotal = periodSalesData.reduce((sum, s) => sum + s.totalAmount, 0);
    const periodSalesCount = periodSalesData.length;
    const maxSale = periodSalesData.length > 0 ? Math.max(...periodSalesData.map(s => s.totalAmount)) : 0;

    document.getElementById('period-sales').textContent = formatCurrency(periodSalesTotal);
    document.getElementById('period-sales-count').textContent = periodSalesCount;
    document.getElementById('period-max-sale').textContent = formatCurrency(maxSale);

    // Средний чек за выбранный период
    const avgRange = getDateRange(currentAvgPeriod, avgCustomStart, avgCustomEnd);
    const avgSalesData = getSalesArrayForPeriod(avgRange.start, avgRange.end);
    const avgTotal = avgSalesData.reduce((sum, s) => sum + s.totalAmount, 0);
    const avgCount = avgSalesData.length;
    const avgCheck = avgCount > 0 ? avgTotal / avgCount : 0;
    
    // Медиана
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

    // Склад
    const totalStock = products.reduce((sum, p) => sum + (p.stock || 0), 0);
    document.getElementById('total-stock').textContent = totalStock;

    if (income.length > 0) {
        const lastIncome = income.reduce((latest, current) => 
            new Date(current.date) > new Date(latest.date) ? current : latest
        );
        document.getElementById('last-income').textContent = 
            formatDate(lastIncome.date) + ' — ' + lastIncome.productName;
    } else {
        document.getElementById('last-income').textContent = 'Нет поступлений';
    }

    renderPlansOverview();
    
    // Используем setTimeout, чтобы Chart.js успел увидеть видимые canvas
    setTimeout(() => {
        renderSalesChart();
        renderTopProductsChart();
        renderDistributionChart();
    }, 100);
}

function renderSalesChart() {
    const ctx = document.getElementById('sales-chart');
    if (!ctx) return;
    
    if (salesChart) salesChart.destroy();

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
            
            const daySales = sales
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
    
    const topCount = parseInt(document.getElementById('top-products-filter')?.value || 5);
    
    const productSales = {};
    sales.forEach(sale => {
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
            { label: 'Более 10 000 ₽', min: 10000, max: Infinity }
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