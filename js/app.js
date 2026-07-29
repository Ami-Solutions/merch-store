// Инициализация темы
function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    const theme = savedTheme || 'light';
    if (theme === 'light') {
        document.body.classList.add('light-theme');
    } else {
        document.body.classList.remove('light-theme');
    }
    updateThemeIcons(theme);
}

function toggleTheme() {
    const isLight = document.body.classList.toggle('light-theme');
    const theme = isLight ? 'light' : 'dark';
    localStorage.setItem('theme', theme);
    updateThemeIcons(theme);
    if (typeof renderSalesChart === 'function') {
        renderSalesChart();
        renderTopProductsChart();
        renderDistributionChart();
    }
}

function updateThemeIcons(theme) {
    const icon = theme === 'light' ? '☀️' : '🌙';
    document.querySelectorAll('.theme-icon').forEach(el => {
        el.textContent = icon;
    });
}

// === TOOLTIP SYSTEM ===
const TOOLTIPS = {
    'sales-total': {
        title: 'Продажи за период',
        description: 'Суммарная выручка за выбранный период. Учитываются только продажи без отметки "Убрать из статистики".',
        example: 'Пример: если за 7 дней было 15 продаж на общую сумму 87 500 ₽, то этот показатель будет равен 87 500 ₽.'
    },
    'avg-check': {
        title: 'Средний чек',
        description: 'Рассчитывается как общая сумма продаж, делённая на количество продаж за период. Показывает, сколько в среднем тратит один клиент.',
        example: 'Пример: 5 продаж – 2000₽, 3000₽, 5000₽, 4000₽, 6000₽. Сумма = 20 000₽. Средний чек = 20 000 / 5 = <strong>4 000 ₽</strong>.'
    },
    'median-check': {
        title: 'Медианный чек',
        description: 'Это значение, которое делит все чеки пополам: 50% чеков меньше этого значения, 50% – больше. В отличие от среднего, медиана устойчива к аномальным выбросам (например, одной очень крупной продаже).',
        example: 'Пример: чеки 1000₽, 1500₽, <strong>2000₽</strong>, 10000₽, 50000₽. Медиана = <strong>2000 ₽</strong> (средний чек был бы 12 900₽ из-за крупных чеков, что не отражает реальность).'
    },
    'margin-by-type': {
        title: 'Маржинальность по типам',
        description: 'Показывает процент прибыли от выручки отдельно для брендовой одежды и секонд-хенда. Это ключевая метрика – показывает, где больше прибыли на вложенный рубль.',
        example: 'Пример: Бренды дают маржу 25%, а секонд – 55%. Значит, на каждый вложенный рубль в секонд вы получаете больше прибыли, несмотря на меньшую выручку.'
    },
    'markup-coefficient': {
        title: 'Коэффициент наценки',
        description: 'Показывает, во сколько раз цена продажи превышает цену закупки. Рассчитывается как: цена продажи ÷ цена закупки.',
        example: 'Пример: Секонд – коэффициент 6x (закупка 500₽ → продажа 3000₽). Бренды – коэффициент 2.4x (закупка 5000₽ → продажа 12000₽).'
    },
    'abc-analysis': {
        title: 'ABC-анализ',
        description: 'Классификация товаров по принципу Парето. <strong>Группа A</strong> – 20% товаров, дающих 80% выручки/маржи (звёзды). <strong>Группа B</strong> – следующие 15% (середнячки). <strong>Группа C</strong> – оставшиеся 5% (аутсайдеры). Можно фильтровать по типам (бренды/секонд).',
        example: 'Применение: товары группы A не должны заканчиваться на складе (приоритет в закупках), товары группы C – кандидаты на распродажу или вывод из ассортимента.'
    },
    'size-analysis': {
        title: 'Анализ размерной сетки',
        description: 'Показывает, какие размеры продаются лучше/хуже. Анализ только для брендовой одежды, которую можно дозаказать у поставщика.',
        example: 'Пример: размер M продаётся в 4 раза чаще, чем S. Если закупать их поровну – S будет копиться, а M постоянно заканчиваться.'
    },
    'avg-sale-time': {
        title: 'Средний срок продажи',
        description: 'За сколько дней в среднем продаётся вещь из каждой категории. Рассчитывается от даты поступления до даты продажи.',
        example: 'Пример: Футболки продаются за 25 дней, куртки – за 45 дней, аксессуары – за 15 дней. Это помогает понять, какие категории "живые".'
    },
    'brand-turnover': {
        title: 'Оборачиваемость по брендам',
        description: 'Показывает, за сколько дней в среднем продаётся весь запас каждого бренда. Помогает понять, какие бренды "крутятся" быстро, а какие замораживают деньги. Можно фильтровать по типам.',
        example: 'Пример: Scotch&Soda оборачивается за 18 дней, а ноунейм бренд – за 67 дней. Значит, Scotch&Soda надо закупать больше, а ноунейм – меньше или вообще убрать.'
    },
    'sold-percentage': {
        title: 'Процент проданных вещей',
        description: 'Из всех поступивших вещей за последние 6 месяцев – сколько процентов продалось. Показывает эффективность закупок отдельно для брендов и секонда.',
        example: 'Пример: Из 100 поступивших вещей за 6 месяцев продалось 75 – это 75%. Норма для брендов: 60-70%, для секонда: 70-80%.'
    },
    'stale-products': {
        title: 'Залежавшиеся товары',
        description: 'Товары с остатком, но без продаж сверх порога. Для брендовой одежды порог – 90 дней, для секонд-хенда – 120 дней (т.к. уникальные вещи ищут своего клиента дольше). Показывает замороженные деньги.',
        example: 'Пример: "У вас 15 товаров с остатком, но без продаж сверх порога. Заморожено: 87 000 ₽" – сигнал к распродаже или возврату поставщику.'
    },
    'permanent-supplier': {
        title: 'Постоянный поставщик',
        description: 'Отметьте эту галочку, если бренд является постоянным поставщиком новой брендовой одежды. Если галочка не отмечена – товар считается секонд-хендом.',
        example: 'Пример: Бренд "Aelinea" – постоянный поставщик (новая одежда). Бренд "Vintage Collection" – секонд-хенд (галочка не отмечена).'
    }
};

let tooltipEl = null;

function initTooltips() {
    if (!tooltipEl) {
        tooltipEl = document.createElement('div');
        tooltipEl.className = 'custom-tooltip';
        document.body.appendChild(tooltipEl);
    }
    
    document.addEventListener('mouseenter', (e) => {
        const trigger = e.target.closest('.tooltip-trigger');
        if (!trigger) return;
        
        const key = trigger.dataset.tooltip;
        const data = TOOLTIPS[key];
        if (!data) return;
        
        tooltipEl.innerHTML = `
            <h4>${data.title}</h4>
            <p>${data.description}</p>
            ${data.example ? `<div class="tooltip-example">${data.example}</div>` : ''}
        `;
        
        // Показываем tooltip временно для расчёта размеров
        tooltipEl.style.visibility = 'hidden';
        tooltipEl.style.display = 'block';
        tooltipEl.classList.add('show');
        
        const triggerRect = trigger.getBoundingClientRect();
        const tooltipRect = tooltipEl.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        
        // Позиционируем по центру под триггером
        let left = triggerRect.left + (triggerRect.width / 2) - (tooltipRect.width / 2);
        let top = triggerRect.bottom + 8;
        
        // Корректировка по горизонтали
        if (left < 10) {
            left = 10;
        } else if (left + tooltipRect.width > viewportWidth - 10) {
            left = viewportWidth - tooltipRect.width - 10;
        }
        
        // Корректировка по вертикали (если не помещается снизу)
        if (top + tooltipRect.height > viewportHeight - 10) {
            top = triggerRect.top - tooltipRect.height - 8;
        }
        
        // Применяем позицию
        tooltipEl.style.left = `${left}px`;
        tooltipEl.style.top = `${top}px`;
        tooltipEl.style.transform = 'none';
        tooltipEl.style.visibility = 'visible';
    }, true);
    
    document.addEventListener('mouseleave', (e) => {
        const trigger = e.target.closest('.tooltip-trigger');
        if (!trigger) return;
        tooltipEl.classList.remove('show');
    }, true);
}

// Мобильное меню
function initMobileMenu() {
    const burgerBtn = document.getElementById('burger-btn');
    const mobileMenu = document.getElementById('mobile-menu');
    const mobileOverlay = document.getElementById('mobile-menu-overlay');
    const mobileClose = document.getElementById('mobile-menu-close');
    function openMenu() {
        mobileMenu.classList.add('active');
        mobileOverlay.classList.add('active');
        burgerBtn.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
    function closeMenu() {
        mobileMenu.classList.remove('active');
        mobileOverlay.classList.remove('active');
        burgerBtn.classList.remove('active');
        document.body.style.overflow = '';
    }
    burgerBtn?.addEventListener('click', () => {
        if (mobileMenu.classList.contains('active')) closeMenu();
        else openMenu();
    });
    mobileOverlay?.addEventListener('click', closeMenu);
    mobileClose?.addEventListener('click', closeMenu);
    document.querySelectorAll('.mobile-nav-link').forEach(link => {
        link.addEventListener('click', closeMenu);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initMobileMenu();
    initTooltips();
    
    window.firebaseFunctions.onAuthStateChanged(window.firebaseAuth, (user) => {
        if (user) showApp(user);
        else showAuth();
    });
    
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            switchSection(e.target.dataset.section);
        });
    });
    document.querySelectorAll('.mobile-nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            switchSection(e.target.dataset.section);
        });
    });
    
    document.getElementById('logout-btn')?.addEventListener('click', async () => {
        try { await window.firebaseFunctions.signOut(window.firebaseAuth); }
        catch (error) { console.error('Ошибка выхода:', error); }
    });
    document.getElementById('logout-btn-mobile')?.addEventListener('click', async () => {
        try { await window.firebaseFunctions.signOut(window.firebaseAuth); }
        catch (error) { console.error('Ошибка выхода:', error); }
    });
    
    document.getElementById('theme-toggle')?.addEventListener('click', toggleTheme);
    document.getElementById('theme-toggle-mobile')?.addEventListener('click', toggleTheme);
    document.querySelector('.modal-close').addEventListener('click', closeModal);
});

function showAuth() {
    document.getElementById('auth-screen').classList.add('active');
    document.getElementById('app-screen').classList.remove('active');
}

async function showApp(user) {
    document.getElementById('auth-screen').classList.remove('active');
    document.getElementById('app-screen').classList.add('active');
    await loadUserData(user);
    document.getElementById('welcome-username').textContent = window.currentUser.name || 'пользователь';
    await Promise.all([loadProducts(), loadSales(), loadIncome(), loadPlans()]);
}

function switchSection(sectionName) {
    document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
    const desktopLink = document.querySelector(`.nav-link[data-section="${sectionName}"]`);
    if (desktopLink) desktopLink.classList.add('active');
    document.querySelectorAll('.mobile-nav-link').forEach(link => link.classList.remove('active'));
    const mobileLink = document.querySelector(`.mobile-nav-link[data-section="${sectionName}"]`);
    if (mobileLink) mobileLink.classList.add('active');
    document.querySelectorAll('.content-section').forEach(section => section.classList.remove('active'));
    document.getElementById(`${sectionName}-section`).classList.add('active');
    if (sectionName === 'dashboard') updateDashboard();
}

function openModal(title, content) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = content;
    document.getElementById('modal-overlay').classList.add('active');
}

function closeModal() {
    document.getElementById('modal-overlay').classList.remove('active');
    editingSaleId = null;
    editingIncomeId = null;
}

function showError(message) {
    const errorDiv = document.getElementById('auth-error');
    if (errorDiv && errorDiv.offsetParent !== null) {
        errorDiv.textContent = message;
        setTimeout(() => { errorDiv.textContent = ''; }, 5000);
    } else {
        alert(message);
    }
}

function formatCurrency(amount) {
    return new Intl.NumberFormat('ru-RU', {
        style: 'currency', currency: 'RUB', minimumFractionDigits: 0
    }).format(amount);
}

function formatDate(timestamp) {
    return new Date(timestamp).toLocaleDateString('ru-RU', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
}

function formatDateShort(dateStr) {
    return new Date(dateStr).toLocaleDateString('ru-RU', {
        day: '2-digit', month: '2-digit', year: 'numeric'
    });
}