// Инициализация темы (по умолчанию светлая)
function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    const theme = savedTheme || 'light'; // по умолчанию светлая
    
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
    
    // Перерисовать графики для новых цветов
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
        if (mobileMenu.classList.contains('active')) {
            closeMenu();
        } else {
            openMenu();
        }
    });

    mobileOverlay?.addEventListener('click', closeMenu);
    mobileClose?.addEventListener('click', closeMenu);

    // Закрытие при клике на ссылку
    document.querySelectorAll('.mobile-nav-link').forEach(link => {
        link.addEventListener('click', closeMenu);
    });

    return { openMenu, closeMenu };
}

document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initMobileMenu();

    window.firebaseFunctions.onAuthStateChanged(window.firebaseAuth, (user) => {
        if (user) {
            showApp(user);
        } else {
            showAuth();
        }
    });

    // Навигация desktop
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const section = e.target.dataset.section;
            switchSection(section);
        });
    });

    // Навигация mobile
    document.querySelectorAll('.mobile-nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const section = e.target.dataset.section;
            switchSection(section);
        });
    });

    // Выход
    document.getElementById('logout-btn')?.addEventListener('click', async () => {
        try {
            await window.firebaseFunctions.signOut(window.firebaseAuth);
        } catch (error) {
            console.error('Ошибка выхода:', error);
        }
    });

    document.getElementById('logout-btn-mobile')?.addEventListener('click', async () => {
        try {
            await window.firebaseFunctions.signOut(window.firebaseAuth);
        } catch (error) {
            console.error('Ошибка выхода:', error);
        }
    });

    // Переключатель темы
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
    
    // Устанавливаем имя пользователя в welcome экран
    document.getElementById('welcome-username').textContent = window.currentUser.name || 'пользователь';
    
    // Загружаем все данные параллельно
    await Promise.all([
        loadProducts(),
        loadSales(),
        loadIncome(),
        loadPlans()
    ]);
    
    // Остаёмся на welcome экране
}

function switchSection(sectionName) {
    // Desktop навигация
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
    });
    const desktopLink = document.querySelector(`.nav-link[data-section="${sectionName}"]`);
    if (desktopLink) desktopLink.classList.add('active');

    // Mobile навигация
    document.querySelectorAll('.mobile-nav-link').forEach(link => {
        link.classList.remove('active');
    });
    const mobileLink = document.querySelector(`.mobile-nav-link[data-section="${sectionName}"]`);
    if (mobileLink) mobileLink.classList.add('active');

    // Контент
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.remove('active');
    });
    document.getElementById(`${sectionName}-section`).classList.add('active');

    if (sectionName === 'dashboard') {
        updateDashboard();
    }
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
        style: 'currency',
        currency: 'RUB',
        minimumFractionDigits: 0
    }).format(amount);
}

function formatDate(timestamp) {
    return new Date(timestamp).toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatDateShort(dateStr) {
    return new Date(dateStr).toLocaleDateString('ru-RU', { 
        day: '2-digit', 
        month: '2-digit', 
        year: 'numeric' 
    });
}