document.addEventListener('DOMContentLoaded', () => {
    window.firebaseFunctions.onAuthStateChanged(window.firebaseAuth, (user) => {
        if (user) {
            showApp(user);
        } else {
            showAuth();
        }
    });

    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const section = e.target.dataset.section;
            switchSection(section);
        });
    });

    document.getElementById('logout-btn').addEventListener('click', async () => {
        try {
            await window.firebaseFunctions.signOut(window.firebaseAuth);
        } catch (error) {
            console.error('Ошибка выхода:', error);
        }
    });

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
    
    await loadProducts();
    await loadSales();
    await loadIncome();
    await loadPlans();
    updateDashboard();
}

function switchSection(sectionName) {
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
    });
    document.querySelector(`[data-section="${sectionName}"]`).classList.add('active');

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