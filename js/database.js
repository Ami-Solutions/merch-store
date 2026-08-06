let products = [];
let sales = [];
let income = [];
let plans = [];
let allUsers = [];
let currentSaleItems = [];
let editingSaleId = null;
let editingIncomeId = null;

// Фильтры
let productFilters = {
    search: '',
    category: '',
    gender: '',
    brand: '',
    size: '',
    priceMin: 0,
    priceMax: 1000000
};

let incomeFilters = {
    search: '',
    dateFrom: '',
    dateTo: '',
    costMin: 0,
    costMax: 1000000,
    saleMin: 0,
    saleMax: 1000000
};

let salesFilters = {
    search: '',
    dateFrom: '',
    dateTo: '',
    seller: '',
    amountMin: 0,
    amountMax: 1000000
};

let planFilters = {
    search: '',
    seller: '',
    dateFrom: '',
    dateTo: ''
};

// === УТИЛИТЫ ДЛЯ ДАТ ===
function getCurrentDateTimeLocal() {
    const now = new Date();
    const offset = now.getTimezoneOffset();
    const local = new Date(now.getTime() - offset * 60000);
    return local.toISOString().slice(0, 16);
}

// === УМНЫЙ ПОИСК ===
function smartSearch(text, query) {
    if (!query || !text) return false;
    
    const searchWords = query.toLowerCase().trim().split(/\s+/);
    const textLower = text.toLowerCase();
    
    // Все слова из запроса должны быть в тексте
    return searchWords.every(word => textLower.includes(word));
}

// === УТИЛИТЫ ДЛЯ ПОЛУЧЕНИЯ СУЩЕСТВУЮЩИХ ЗНАЧЕНИЙ ===
function getUniqueValues(field) {
    const values = [...new Set(products.map(p => p[field]).filter(v => v && v.trim()))];
    return values.sort();
}

function generateDatalistHTML() {
    const categories = getUniqueValues('category');
    const brands = getUniqueValues('brand');
    const sizes = getUniqueValues('size');
    
    return `
        <datalist id="category-list">
            ${categories.map(c => `<option value="${c}">`).join('')}
        </datalist>
        <datalist id="brand-list">
            ${brands.map(b => `<option value="${b}">`).join('')}
        </datalist>
        <datalist id="size-list">
            ${sizes.map(s => `<option value="${s}">`).join('')}
        </datalist>
    `;
}

// === МАППИНГ БРЕНДОВ (постоянные поставщики) ===
function getBrandMapping() {
    const stored = localStorage.getItem('brandMapping');
    return stored ? JSON.parse(stored) : {};
}

function saveBrandMapping(mapping) {
    localStorage.setItem('brandMapping', JSON.stringify(mapping));
}

function updateBrandMapping(brand, isPermanent) {
    if (!brand || !brand.trim()) return;
    const mapping = getBrandMapping();
    mapping[brand.trim()] = isPermanent;
    saveBrandMapping(mapping);
}

function isBrandPermanent(brand) {
    if (!brand || !brand.trim()) return false;
    const mapping = getBrandMapping();
    return mapping[brand.trim()] || false;
}

// === ЗАГРУЗКА ПОЛЬЗОВАТЕЛЕЙ (для планов) ===
async function loadAllUsers() {
    try {
        const usersRef = window.firebaseFunctions.collection(window.firebaseDb, 'users');
        const querySnapshot = await window.firebaseFunctions.getDocs(usersRef);
        allUsers = [];
        querySnapshot.forEach((doc) => {
            allUsers.push({ id: doc.id, ...doc.data() });
        });
    } catch (error) {
        console.error('Ошибка загрузки пользователей:', error);
        allUsers = [];
    }
}

function getSellerOptionsHTML(selectedSeller) {
    const selected = selectedSeller || '';
    let html = `<option value="" ${selected === '' ? 'selected' : ''}>Общий (все продавцы)</option>`;
    allUsers.forEach(user => {
        const isSelected = selected === user.name ? 'selected' : '';
        html += `<option value="${user.name}" ${isSelected}>${user.name}</option>`;
    });
    return html;
}

// === КНОПКА ДЛЯ РАЗРАБОТЧИКА: TRIM ВСЕХ ЗАПИСЕЙ ===
window.trimAllProducts = async function(btn) {
    if (!confirm('Обрезать лишние пробелы во всех записях товаров?')) return;
    
    btn.disabled = true;
    btn.textContent = 'Обработка...';
    
    let updated = 0;
    
    try {
        for (const product of products) {
            const updates = {};
            let needsUpdate = false;
            
            // Проверяем все строковые поля
            const stringFields = ['name', 'category', 'brand', 'size'];
            
            for (const field of stringFields) {
                if (product[field] && typeof product[field] === 'string') {
                    const trimmed = product[field].trim();
                    if (trimmed !== product[field]) {
                        updates[field] = trimmed;
                        needsUpdate = true;
                    }
                }
            }
            
            if (needsUpdate) {
                await window.firebaseFunctions.updateDoc(
                    window.firebaseFunctions.doc(window.firebaseDb, 'products', product.id),
                    updates
                );
                updated++;
            }
        }
        
        await loadProducts();
        alert(`Готово! Обновлено записей: ${updated}`);
        
    } catch (error) {
        showError('Ошибка при обработке');
        console.error(error);
    }
    
    btn.disabled = false;
    btn.textContent = 'Обрезать лишние пробелы по всем записям';
};

// === ТОВАРЫ ===
async function loadProducts() {
    const productsRef = window.firebaseFunctions.collection(window.firebaseDb, 'products');
    const querySnapshot = await window.firebaseFunctions.getDocs(productsRef);
    
    products = [];
    querySnapshot.forEach((doc) => {
        products.push({ id: doc.id, ...doc.data() });
    });
    
    renderProducts();
    updateProductFilters();
}

document.getElementById('add-product-btn').addEventListener('click', () => {
    const datalists = generateDatalistHTML();
    
    const content = `
        ${datalists}
        
        <label>Название (обязательно)</label>
        <input type="text" id="product-name" required>
        
        <label>Категория</label>
        <input type="text" id="product-category" list="category-list" placeholder="Выберите или введите новое">
        
        <label>Бренд</label>
        <input type="text" id="product-brand" list="brand-list" placeholder="Выберите или введите новое">
        
        <div id="permanent-supplier-wrapper" style="margin-top: 8px; margin-bottom: 16px; opacity: 0.5;">
            <label style="display: flex; align-items: center; gap: 8px; cursor: not-allowed;">
                <input type="checkbox" id="product-permanent-supplier" disabled style="width: auto; margin: 0; cursor: not-allowed;">
                <span>Этот бренд – постоянный поставщик <span class="tooltip-trigger" data-tooltip="permanent-supplier">?</span></span>
            </label>
        </div>
        
        <label>Пол</label>
        <select id="product-gender">
            <option value="">Не указан</option>
            <option value="male">Мужское</option>
            <option value="female">Женское</option>
            <option value="unisex">Унисекс</option>
        </select>
        
        <label>Размер</label>
        <input type="text" id="product-size" list="size-list" placeholder="Выберите или введите новое">
        
        <label>Цена закупки</label>
        <input type="number" id="product-cost">
        
        <label>Цена продажи</label>
        <input type="number" id="product-price">
        
        <label>Цена по скидке</label>
        <input type="number" id="product-discount" value="0">
        
        <div style="margin-top: 16px; padding: 14px 16px; background: var(--bg-tertiary); border-radius: 8px;">
            <label style="color: var(--text-secondary); font-size: 12px; margin-bottom: 6px; display: block;">Остаток (заполняется через "+ Приход")</label>
            <input type="number" id="product-stock" value="0" readonly style="background: var(--bg-quaternary); cursor: not-allowed; opacity: 0.7;">
            
            <button type="button" class="btn-small" onclick="toggleInitialIncomeForm()" style="width: 100%; margin-top: 8px;">+ Приход</button>
            
            <div id="initial-income-form" style="display: none; margin-top: 12px; padding: 12px; background: var(--bg-quaternary); border-radius: 6px;">
                <label style="font-size: 12px; color: var(--text-secondary); margin-bottom: 8px; display: block;">Начальный приход</label>
                <label style="font-size: 12px;">Дата и время поступления</label>
                <input type="datetime-local" id="initial-income-date" value="${getCurrentDateTimeLocal()}">
                <label style="font-size: 12px;">Количество</label>
                <input type="number" id="initial-income-quantity" min="1" value="1" oninput="updateInitialStock()">
                <p style="font-size: 11px; color: var(--text-secondary); margin-top: 8px; margin-bottom: 0;">Приход будет сохранён вместе с товаром</p>
            </div>
        </div>
        
        <button class="btn-primary" onclick="saveProduct(this)">Сохранить</button>
    `;
    openModal('Добавить товар', content);
    
    initTooltips();
    
    const brandInput = document.getElementById('product-brand');
    const checkboxWrapper = document.getElementById('permanent-supplier-wrapper');
    const checkbox = document.getElementById('product-permanent-supplier');
    const checkboxLabel = checkboxWrapper.querySelector('label');
    
    brandInput.addEventListener('input', () => {
        const brandValue = brandInput.value.trim();
        if (brandValue) {
            checkbox.disabled = false;
            checkbox.style.cursor = 'pointer';
            checkboxLabel.style.cursor = 'pointer';
            checkboxWrapper.style.opacity = '1';
            checkbox.checked = isBrandPermanent(brandValue);
        } else {
            checkbox.disabled = true;
            checkbox.checked = false;
            checkbox.style.cursor = 'not-allowed';
            checkboxLabel.style.cursor = 'not-allowed';
            checkboxWrapper.style.opacity = '0.5';
        }
    });
});

window.toggleInitialIncomeForm = function() {
    const form = document.getElementById('initial-income-form');
    if (form.style.display === 'none') {
        form.style.display = 'block';
    } else {
        form.style.display = 'none';
        document.getElementById('product-stock').value = '0';
    }
};

window.updateInitialStock = function() {
    const quantity = parseInt(document.getElementById('initial-income-quantity').value) || 0;
    document.getElementById('product-stock').value = quantity;
};

window.editProduct = function(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    
    const datalists = generateDatalistHTML();
    
    const brandValue = product.brand || '';
    const isPermanent = brandValue ? (product.isPermanentSupplier || isBrandPermanent(brandValue)) : false;
    const checkboxDisabled = !brandValue;
    const checkboxChecked = isPermanent ? 'checked' : '';
    const wrapperOpacity = brandValue ? '1' : '0.5';
    const cursorStyle = brandValue ? 'pointer' : 'not-allowed';
    
    const content = `
        ${datalists}
        
        <label>Название (обязательно)</label>
        <input type="text" id="product-name" value="${product.name || ''}" required>
        
        <label>Категория</label>
        <input type="text" id="product-category" list="category-list" value="${product.category || ''}" placeholder="Выберите или введите новое">
        
        <label>Бренд</label>
        <input type="text" id="product-brand" list="brand-list" value="${brandValue}" placeholder="Выберите или введите новое">
        
        <div id="permanent-supplier-wrapper" style="margin-top: 8px; margin-bottom: 16px; opacity: ${wrapperOpacity};">
            <label style="display: flex; align-items: center; gap: 8px; cursor: ${cursorStyle};">
                <input type="checkbox" id="product-permanent-supplier" ${checkboxChecked} ${checkboxDisabled ? 'disabled' : ''} style="width: auto; margin: 0; cursor: ${cursorStyle};">
                <span>Этот бренд – постоянный поставщик <span class="tooltip-trigger" data-tooltip="permanent-supplier">?</span></span>
            </label>
        </div>
        
        <label>Пол</label>
        <select id="product-gender">
            <option value="" ${!product.gender ? 'selected' : ''}>Не указан</option>
            <option value="male" ${product.gender === 'male' ? 'selected' : ''}>Мужское</option>
            <option value="female" ${product.gender === 'female' ? 'selected' : ''}>Женское</option>
            <option value="unisex" ${product.gender === 'unisex' ? 'selected' : ''}>Унисекс</option>
        </select>
        
        <label>Размер</label>
        <input type="text" id="product-size" list="size-list" value="${product.size || ''}" placeholder="Выберите или введите новое">
        
        <label>Цена закупки</label>
        <input type="number" id="product-cost" value="${product.cost || ''}">
        
        <label>Цена продажи</label>
        <input type="number" id="product-price" value="${product.price || ''}">
        
        <label>Цена по скидке</label>
        <input type="number" id="product-discount" value="${product.discount || 0}">
        
        <div style="margin-top: 16px; padding: 14px 16px; background: var(--bg-tertiary); border-radius: 8px;">
            <label style="color: var(--text-secondary); font-size: 12px; margin-bottom: 6px; display: block;">Остаток (заполняется через "+ Приход")</label>
            <input type="number" id="product-stock" value="${product.stock || 0}" readonly style="background: var(--bg-quaternary); cursor: not-allowed; opacity: 0.7;">
            <div style="display: flex; gap: 8px; margin-top: 12px;">
                <button class="btn-small" onclick="showQuickIncome('${productId}')" style="flex: 1;">+ Приход</button>
                <button class="btn-secondary" onclick="showIncomeHistory('${productId}')" style="flex: 1; padding: 6px 12px; font-size: 13px;">📋 История</button>
            </div>
        </div>
        
        <button class="btn-primary" onclick="updateProduct('${productId}', this)">Сохранить изменения</button>
    `;
    openModal('Редактировать товар', content);
    
    initTooltips();
    
    const brandInput = document.getElementById('product-brand');
    const checkboxWrapper = document.getElementById('permanent-supplier-wrapper');
    const checkbox = document.getElementById('product-permanent-supplier');
    const checkboxLabel = checkboxWrapper.querySelector('label');
    
    brandInput.addEventListener('input', () => {
        const brandValue = brandInput.value.trim();
        if (brandValue) {
            checkbox.disabled = false;
            checkbox.style.cursor = 'pointer';
            checkboxLabel.style.cursor = 'pointer';
            checkboxWrapper.style.opacity = '1';
            checkbox.checked = isBrandPermanent(brandValue);
        } else {
            checkbox.disabled = true;
            checkbox.checked = false;
            checkbox.style.cursor = 'not-allowed';
            checkboxLabel.style.cursor = 'not-allowed';
            checkboxWrapper.style.opacity = '0.5';
        }
    });
};

window.saveProduct = async function(btn) {
    const name = document.getElementById('product-name').value.trim();
    if (!name) {
        showError('Название обязательно');
        return;
    }
    const category = document.getElementById('product-category').value.trim();
    const brand = document.getElementById('product-brand').value.trim();
    const isPermanentSupplier = document.getElementById('product-permanent-supplier').checked;
    const gender = document.getElementById('product-gender').value || '';
    const size = document.getElementById('product-size').value.trim();
    const cost = parseFloat(document.getElementById('product-cost').value) || 0;
    const price = parseFloat(document.getElementById('product-price').value) || 0;
    const discount = parseFloat(document.getElementById('product-discount').value) || 0;
    
    // Проверяем, есть ли начальный приход
    const initialIncomeForm = document.getElementById('initial-income-form');
    const hasInitialIncome = initialIncomeForm && initialIncomeForm.style.display !== 'none';
    
    let initialQuantity = 0;
    let initialDate = null;
    
    if (hasInitialIncome) {
        const dateInput = document.getElementById('initial-income-date').value;
        initialQuantity = parseInt(document.getElementById('initial-income-quantity').value) || 0;
        
        if (initialQuantity > 0 && dateInput) {
            initialDate = new Date(dateInput).toISOString();
        } else {
            initialQuantity = 0;
            initialDate = null;
        }
    }
    
    const article = generateArticle();
    
    // Обновляем маппинг брендов
    if (brand) {
        updateBrandMapping(brand, isPermanentSupplier);
    }
    
    btn.disabled = true;
    btn.textContent = 'Сохранение...';
    try {
        // Создаём товар с начальным остатком
        const docRef = await window.firebaseFunctions.addDoc(
            window.firebaseFunctions.collection(window.firebaseDb, 'products'),
            {
                article, name, category, brand, isPermanentSupplier, gender, size, cost, price, discount,
                stock: initialQuantity,
                createdAt: new Date().toISOString()
            }
        );
        
        // Если был начальный приход, создаём запись в income
        if (hasInitialIncome && initialQuantity > 0 && initialDate) {
            await window.firebaseFunctions.addDoc(
                window.firebaseFunctions.collection(window.firebaseDb, 'income'),
                {
                    productId: docRef.id,
                    productName: `${name} (${size || '–'})`,
                    quantity: initialQuantity,
                    cost: cost,
                    totalAmount: cost * initialQuantity,
                    date: initialDate
                }
            );
        }
        
        closeModal();
        await loadProducts();
        await loadIncome();
        updateDashboard();
    } catch (error) {
        showError('Ошибка при сохранении товара');
        console.error(error);
        btn.disabled = false;
        btn.textContent = 'Сохранить';
    }
};

window.updateProduct = async function(productId, btn) {
    const name = document.getElementById('product-name').value.trim();
    if (!name) {
        showError('Название обязательно');
        return;
    }
    const category = document.getElementById('product-category').value.trim();
    const brand = document.getElementById('product-brand').value.trim();
    const isPermanentSupplier = document.getElementById('product-permanent-supplier').checked;
    const gender = document.getElementById('product-gender').value || '';
    const size = document.getElementById('product-size').value.trim();
    const cost = parseFloat(document.getElementById('product-cost').value) || 0;
    const price = parseFloat(document.getElementById('product-price').value) || 0;
    const discount = parseFloat(document.getElementById('product-discount').value) || 0;
    // Остаток НЕ обновляем при редактировании – он управляется через приходы
    
    // Обновляем маппинг брендов
    if (brand) {
        updateBrandMapping(brand, isPermanentSupplier);
    }
    
    btn.disabled = true;
    btn.textContent = 'Сохранение...';
    try {
        await window.firebaseFunctions.updateDoc(
            window.firebaseFunctions.doc(window.firebaseDb, 'products', productId),
            { name, category, brand, isPermanentSupplier, gender, size, cost, price, discount }
        );
        closeModal();
        await loadProducts();
        updateDashboard();
    } catch (error) {
        showError('Ошибка при обновлении товара');
        console.error(error);
        btn.disabled = false;
        btn.textContent = 'Сохранить изменения';
    }
};

function generateArticle() {
    return Date.now().toString().slice(-6);
}

window.deleteProduct = async function(productId, btn) {
    if (!confirm('Удалить этот товар?')) return;

    btn.disabled = true;
    btn.textContent = 'Удаление...';

    try {
        await window.firebaseFunctions.deleteDoc(
            window.firebaseFunctions.doc(window.firebaseDb, 'products', productId)
        );
        await loadProducts();
    } catch (error) {
        showError('Ошибка при удалении');
        btn.disabled = false;
        btn.textContent = 'Удалить';
    }
};

// === ПРОДАЖИ ===
async function loadSales() {
    const salesRef = window.firebaseFunctions.collection(window.firebaseDb, 'sales');
    const q = window.firebaseFunctions.query(salesRef, window.firebaseFunctions.orderBy('date', 'desc'));
    const querySnapshot = await window.firebaseFunctions.getDocs(q);
    
    sales = [];
    querySnapshot.forEach((doc) => {
        sales.push({ id: doc.id, ...doc.data() });
    });
    
    renderSales();
    updateSalesFilters();
}

document.getElementById('add-sale-btn').addEventListener('click', () => {
    editingSaleId = null;
    
    if (products.length === 0) {
        showError('Сначала добавьте товары');
        return;
    }
    
    currentSaleItems = [];
    
    // Datalist для продавцов
    const sellers = [...new Set(sales.map(s => s.seller).filter(s => s))];
    const sellerDatalist = `
        <datalist id="sale-seller-list">
            ${sellers.map(s => `<option value="${s}">`).join('')}
        </datalist>
    `;
    
    const content = `
        ${sellerDatalist}
        <label>Дата и время продажи</label>
        <input type="datetime-local" id="sale-date" value="${getCurrentDateTimeLocal()}">
        
        <label>Продавец</label>
        <input type="text" id="sale-seller" list="sale-seller-list" value="${window.currentUser.name || ''}" placeholder="Выберите или введите">
        
        <div class="divider">Товары</div>
        
        <label>Найти и добавить товар</label>
        <div class="ac-wrapper">
            <input type="text" id="sale-product-search" class="ac-input" placeholder="Начните вводить название..." autocomplete="off">
            <input type="hidden" id="sale-product-id">
            <div id="sale-product-dropdown" class="product-dropdown"></div>
        </div>
        <button class="btn-small" style="width: 100%; margin-bottom: 16px;" onclick="addSaleItem()">+ Добавить в корзину</button>
        
        <label>Корзина</label>
        <div class="sale-cart" id="sale-cart">
            <div class="sale-cart-empty">Добавьте товары в продажу</div>
        </div>
        
        <div class="sale-total">
            Итого: <span id="sale-total-amount">0 ₽</span>
        </div>
        
        <div style="margin-top: 16px; padding: 12px; background: var(--bg-tertiary); border-radius: 6px;">
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; margin: 0;">
                <input type="checkbox" id="sale-exclude-stats" style="width: auto; margin: 0;">
                <span style="font-size: 12px; color: var(--text-secondary);">Убрать продажу из статистики</span>
            </label>
        </div>
        
        <button class="btn-primary" onclick="saveSale(this)">Оформить продажу</button>
    `;
    openModal('Добавить продажу', content);
    
    // Инициализируем поиск товаров
    initProductSearch('sale-product-search', 'sale-product-id', 'sale-product-dropdown');
});

window.editSale = function(saleId) {
    const sale = sales.find(s => s.id === saleId);
    if (!sale || !sale.items) return;

    editingSaleId = saleId;
    currentSaleItems = sale.items.map(item => {
        const product = products.find(p => p.id === item.productId);
        const currentStock = product ? product.stock : 0;
        const maxStock = currentStock + item.quantity;
        
        return {
            productId: item.productId,
            name: item.productName,
            maxStock: maxStock,
            quantity: item.quantity,
            priceType: item.priceType || 'original',
            originalPrice: product?.price || item.price,
            discountPrice: product?.discount || 0,
            customPrice: item.price,
            finalPrice: item.price
        };
    });

    // Datalist для продавцов
    const sellers = [...new Set(sales.map(s => s.seller).filter(s => s))];
    const sellerDatalist = `
        <datalist id="sale-seller-list">
            ${sellers.map(s => `<option value="${s}">`).join('')}
        </datalist>
    `;

    const saleDate = new Date(sale.date);
    const offset = saleDate.getTimezoneOffset();
    const localDate = new Date(saleDate.getTime() - offset * 60000);
    const dateValue = localDate.toISOString().slice(0, 16);
    
    const excludeChecked = sale.excludeFromStats ? 'checked' : '';

    const content = `
        ${sellerDatalist}
        <label>Дата и время продажи</label>
        <input type="datetime-local" id="sale-date" value="${dateValue}">
        
        <label>Продавец</label>
        <input type="text" id="sale-seller" list="sale-seller-list" value="${sale.seller || ''}" placeholder="Выберите или введите">
        
        <div class="divider">Товары</div>
        
        <label>Найти и добавить товар</label>
        <div class="ac-wrapper">
            <input type="text" id="sale-product-search" class="ac-input" placeholder="Начните вводить название..." autocomplete="off">
            <input type="hidden" id="sale-product-id">
            <div id="sale-product-dropdown" class="product-dropdown"></div>
        </div>
        <button class="btn-small" style="width: 100%; margin-bottom: 16px;" onclick="addSaleItem()">+ Добавить в корзину</button>
        
        <label>Корзина</label>
        <div class="sale-cart" id="sale-cart"></div>
        
        <div class="sale-total">
            Итого: <span id="sale-total-amount">0 ₽</span>
        </div>
        
        <div style="margin-top: 16px; padding: 12px; background: var(--bg-tertiary); border-radius: 6px;">
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; margin: 0;">
                <input type="checkbox" id="sale-exclude-stats" ${excludeChecked} style="width: auto; margin: 0;">
                <span style="font-size: 12px; color: var(--text-secondary);">Убрать продажу из статистики</span>
            </label>
        </div>
        
        <button class="btn-primary" onclick="updateSale('${saleId}', this)">Сохранить изменения</button>
    `;
    openModal('Редактировать продажу', content);
    renderSaleCart();
    
    // Инициализируем поиск товаров
    initProductSearch('sale-product-search', 'sale-product-id', 'sale-product-dropdown');
};

window.addSaleItem = function() {
    const hiddenInput = document.getElementById('sale-product-id');
    const searchInput = document.getElementById('sale-product-search');
    const productId = hiddenInput ? hiddenInput.value : '';
    
    if (!productId) {
        showError('Выберите товар из списка');
        return;
    }

    const product = products.find(p => p.id === productId);
    if (!product) {
        showError('Товар не найден');
        return;
    }

    const existing = currentSaleItems.find(i => i.productId === productId);
    if (existing) {
        showError('Этот товар уже в корзине. Измените количество в корзине.');
        return;
    }

    let availableStock = product.stock;
    if (editingSaleId) {
        const oldSale = sales.find(s => s.id === editingSaleId);
        if (oldSale) {
            const oldItem = oldSale.items.find(i => i.productId === productId);
            if (oldItem) {
                availableStock += oldItem.quantity;
            }
        }
    }

    currentSaleItems.push({
        productId: productId,
        name: `${product.name} (${product.size || '–'})`,
        maxStock: availableStock,
        quantity: 1,
        priceType: 'original',
        originalPrice: product.price || 0,
        discountPrice: product.discount || 0,
        customPrice: product.price || 0,
        finalPrice: product.price || 0
    });

    // Очищаем поле поиска после добавления
    if (searchInput) searchInput.value = '';
    if (hiddenInput) hiddenInput.value = '';

    renderSaleCart();
};

window.removeSaleItem = function(index) {
    currentSaleItems.splice(index, 1);
    renderSaleCart();
};

window.updateSaleItem = function(index, field, value) {
    const item = currentSaleItems[index];
    
    if (field === 'quantity') {
        item.quantity = Math.max(1, Math.min(parseInt(value) || 1, item.maxStock));
    } else if (field === 'priceType') {
        item.priceType = value;
        if (value === 'original') {
            item.finalPrice = item.originalPrice;
        } else if (value === 'discount') {
            item.finalPrice = item.discountPrice > 0 ? item.discountPrice : item.originalPrice;
        } else if (value === 'custom') {
            item.finalPrice = item.customPrice;
        }
    } else if (field === 'customPrice') {
        item.customPrice = parseFloat(value) || 0;
        if (item.priceType === 'custom') {
            item.finalPrice = item.customPrice;
        }
    }

    renderSaleCart();
};

function renderSaleCart() {
    const cart = document.getElementById('sale-cart');
    if (!cart) return;

    if (currentSaleItems.length === 0) {
        cart.innerHTML = '<div class="sale-cart-empty">Добавьте товары в продажу</div>';
        document.getElementById('sale-total-amount').textContent = formatCurrency(0);
        return;
    }

    let total = 0;
    cart.innerHTML = currentSaleItems.map((item, index) => {
        const itemTotal = item.finalPrice * item.quantity;
        total += itemTotal;

        const discountOption = item.discountPrice > 0 ? 
            `<label>
                <input type="radio" name="price-${index}" value="discount" ${item.priceType === 'discount' ? 'checked' : ''} onchange="updateSaleItem(${index}, 'priceType', 'discount')">
                По скидке (${formatCurrency(item.discountPrice)})
            </label>` : '';

        const customPriceInput = item.priceType === 'custom' ? 
            `<input type="number" class="custom-price-input" value="${item.customPrice}" 
                onchange="updateSaleItem(${index}, 'customPrice', this.value)" 
                placeholder="Введите цену">` : '';

        return `
            <div class="sale-cart-item">
                <div class="cart-item-header">
                    <div class="cart-item-name">${item.name}</div>
                    <button class="cart-item-remove" onclick="removeSaleItem(${index})">✕</button>
                </div>
                
                <div class="cart-item-controls">
                    <div>
                        <label style="font-size: 11px; color: var(--text-secondary);">Кол-во</label>
                        <input type="number" min="1" max="${item.maxStock}" value="${item.quantity}" 
                            onchange="updateSaleItem(${index}, 'quantity', this.value)">
                    </div>
                    <div>
                        <label style="font-size: 11px; color: var(--text-secondary);">Остаток</label>
                        <div style="padding: 8px; color: var(--text-secondary); font-size: 13px;">${item.maxStock} шт.</div>
                    </div>
                </div>

                <div class="price-type-options">
                    <label>
                        <input type="radio" name="price-${index}" value="original" ${item.priceType === 'original' ? 'checked' : ''} onchange="updateSaleItem(${index}, 'priceType', 'original')">
                        Оригинал (${formatCurrency(item.originalPrice)})
                    </label>
                    ${discountOption}
                    <label>
                        <input type="radio" name="price-${index}" value="custom" ${item.priceType === 'custom' ? 'checked' : ''} onchange="updateSaleItem(${index}, 'priceType', 'custom')">
                        Другая цена
                    </label>
                </div>

                ${customPriceInput}

                <div class="cart-item-total">${formatCurrency(itemTotal)}</div>
            </div>
        `;
    }).join('');

    document.getElementById('sale-total-amount').textContent = formatCurrency(total);
}

window.saveSale = async function(btn) {
    if (currentSaleItems.length === 0) {
        showError('Добавьте хотя бы один товар в корзину');
        return;
    }

    const dateInput = document.getElementById('sale-date').value;
    const sellerInput = document.getElementById('sale-seller').value.trim();
    const excludeFromStats = document.getElementById('sale-exclude-stats')?.checked || false;
    
    if (!dateInput) {
        showError('Укажите дату продажи');
        return;
    }
    if (!sellerInput) {
        showError('Укажите продавца');
        return;
    }

    const totalAmount = currentSaleItems.reduce((sum, item) => sum + item.finalPrice * item.quantity, 0);

    btn.disabled = true;
    btn.textContent = 'Сохранение...';

    try {
        await window.firebaseFunctions.addDoc(
            window.firebaseFunctions.collection(window.firebaseDb, 'sales'),
            {
                items: currentSaleItems.map(item => ({
                    productId: item.productId,
                    productName: item.name,
                    quantity: item.quantity,
                    price: item.finalPrice,
                    priceType: item.priceType,
                    total: item.finalPrice * item.quantity
                })),
                totalAmount: totalAmount,
                seller: sellerInput,
                date: new Date(dateInput).toISOString(),
                excludeFromStats: excludeFromStats
            }
        );

        for (const item of currentSaleItems) {
            const product = products.find(p => p.id === item.productId);
            if (product) {
                const newStock = product.stock - item.quantity;
                await window.firebaseFunctions.updateDoc(
                    window.firebaseFunctions.doc(window.firebaseDb, 'products', item.productId),
                    { stock: newStock }
                );
            }
        }

        closeModal();
        currentSaleItems = [];
        editingSaleId = null;
        await loadSales();
        await loadProducts();
        updateDashboard();
    } catch (error) {
        showError('Ошибка при сохранении продажи');
        console.error(error);
        btn.disabled = false;
        btn.textContent = 'Оформить продажу';
    }
};

window.updateSale = async function(saleId, btn) {
    if (currentSaleItems.length === 0) {
        showError('Добавьте хотя бы один товар в корзину');
        return;
    }

    const dateInput = document.getElementById('sale-date').value;
    const sellerInput = document.getElementById('sale-seller').value.trim();
    const excludeFromStats = document.getElementById('sale-exclude-stats')?.checked || false;
    
    if (!dateInput) {
        showError('Укажите дату продажи');
        return;
    }
    if (!sellerInput) {
        showError('Укажите продавца');
        return;
    }

    const oldSale = sales.find(s => s.id === saleId);
    if (!oldSale) return;

    const totalAmount = currentSaleItems.reduce((sum, item) => sum + item.finalPrice * item.quantity, 0);

    btn.disabled = true;
    btn.textContent = 'Сохранение...';

    try {
        // Откатываем старые остатки (ОБНОВЛЯЕМ И В ПАМЯТИ!)
        for (const oldItem of oldSale.items) {
            const product = products.find(p => p.id === oldItem.productId);
            if (product) {
                product.stock += oldItem.quantity;
                await window.firebaseFunctions.updateDoc(
                    window.firebaseFunctions.doc(window.firebaseDb, 'products', oldItem.productId),
                    { stock: product.stock }
                );
            }
        }

        // Обновляем продажу
        await window.firebaseFunctions.updateDoc(
            window.firebaseFunctions.doc(window.firebaseDb, 'sales', saleId),
            {
                items: currentSaleItems.map(item => ({
                    productId: item.productId,
                    productName: item.name,
                    quantity: item.quantity,
                    price: item.finalPrice,
                    priceType: item.priceType,
                    total: item.finalPrice * item.quantity
                })),
                totalAmount: totalAmount,
                seller: sellerInput,
                date: new Date(dateInput).toISOString(),
                excludeFromStats: excludeFromStats
            }
        );

        // Применяем новые остатки
        for (const item of currentSaleItems) {
            const product = products.find(p => p.id === item.productId);
            if (product) {
                product.stock -= item.quantity;
                await window.firebaseFunctions.updateDoc(
                    window.firebaseFunctions.doc(window.firebaseDb, 'products', item.productId),
                    { stock: product.stock }
                );
            }
        }

        closeModal();
        currentSaleItems = [];
        editingSaleId = null;
        await loadSales();
        await loadProducts();
        updateDashboard();
    } catch (error) {
        showError('Ошибка при обновлении продажи');
        console.error(error);
        btn.disabled = false;
        btn.textContent = 'Сохранить изменения';
    }
};

window.deleteSale = async function(saleId, btn) {
    if (!confirm('Удалить эту продажу? Остатки товаров будут восстановлены.')) return;

    const sale = sales.find(s => s.id === saleId);
    if (!sale || !sale.items) return;

    btn.disabled = true;
    btn.textContent = 'Удаление...';

    try {
        for (const item of sale.items) {
            const product = products.find(p => p.id === item.productId);
            if (product) {
                const newStock = product.stock + item.quantity;
                await window.firebaseFunctions.updateDoc(
                    window.firebaseFunctions.doc(window.firebaseDb, 'products', item.productId),
                    { stock: newStock }
                );
            }
        }

        await window.firebaseFunctions.deleteDoc(
            window.firebaseFunctions.doc(window.firebaseDb, 'sales', saleId)
        );

        await loadSales();
        await loadProducts();
        updateDashboard();
    } catch (error) {
        showError('Ошибка при удалении продажи');
        console.error(error);
        btn.disabled = false;
        btn.textContent = 'Удалить';
    }
};

// === ПОСТУПЛЕНИЯ ===
async function loadIncome() {
    const incomeRef = window.firebaseFunctions.collection(window.firebaseDb, 'income');
    const q = window.firebaseFunctions.query(incomeRef, window.firebaseFunctions.orderBy('date', 'desc'));
    const querySnapshot = await window.firebaseFunctions.getDocs(q);
    
    income = [];
    querySnapshot.forEach((doc) => {
        income.push({ id: doc.id, ...doc.data() });
    });
    
    renderIncome();
    updateIncomeFilters();
}

document.getElementById('add-income-btn').addEventListener('click', () => {
    editingIncomeId = null;
    
    // Создаём datalist для продавцов
    const sellers = [...new Set(sales.map(s => s.seller).filter(s => s))];
    const sellerDatalist = `
        <datalist id="seller-list">
            ${sellers.map(s => `<option value="${s}">`).join('')}
        </datalist>
    `;
    
    const datalists = generateDatalistHTML();

    const content = `
        ${sellerDatalist}
        <label>Дата и время поступления</label>
        <input type="datetime-local" id="income-date" value="${getCurrentDateTimeLocal()}">
        
        <label>Товар</label>
        <input type="text" id="income-product-search" placeholder="Начните вводить название..." autocomplete="off">
        <input type="hidden" id="income-product-id">
        <div id="income-product-dropdown" class="product-dropdown"></div>
        
        <div id="income-quantity-wrapper" style="display: none;">
            <label>Количество</label>
            <input type="number" id="income-quantity" min="1" value="1" required>
        </div>
        
        <div id="new-product-form" style="display: none;">
            ${datalists}
            <div class="divider">Новый товар</div>
            <label>Название (обязательно)</label>
            <input type="text" id="new-product-name">
            <label>Категория</label>
            <input type="text" id="new-product-category" list="category-list" placeholder="Выберите или введите новое">
            <label>Бренд</label>
            <input type="text" id="new-product-brand" list="brand-list" placeholder="Выберите или введите новое">
            <div id="new-permanent-supplier-wrapper" style="margin-top: 8px; margin-bottom: 16px; opacity: 0.5;">
                <label style="display: flex; align-items: center; gap: 8px; cursor: not-allowed;">
                    <input type="checkbox" id="new-product-permanent-supplier" disabled style="width: auto; margin: 0; cursor: not-allowed;">
                    <span>Этот бренд – постоянный поставщик <span class="tooltip-trigger" data-tooltip="permanent-supplier">?</span></span>
                </label>
            </div>
            <label>Пол</label>
            <select id="new-product-gender">
                <option value="">Не указан</option>
                <option value="male">Мужское</option>
                <option value="female">Женское</option>
                <option value="unisex">Унисекс</option>
            </select>
            <label>Размер</label>
            <input type="text" id="new-product-size" list="size-list" placeholder="Выберите или введите новое">
            <label>Цена закупки</label>
            <input type="number" id="new-product-cost">
            <label>Цена продажи</label>
            <input type="number" id="new-product-price">
            <label>Цена по скидке</label>
            <input type="number" id="new-product-discount" value="0">
        </div>
        
        <button class="btn-primary" onclick="saveIncome(this)">Сохранить поступление</button>
    `;
    openModal('Добавить поступление', content);

    // Инициализируем tooltip
    initTooltips();
    
    // Обработчик для галочки постоянного поставщика в форме нового товара
    setTimeout(() => {
        const newBrandInput = document.getElementById('new-product-brand');
        const newCheckboxWrapper = document.getElementById('new-permanent-supplier-wrapper');
        const newCheckbox = document.getElementById('new-product-permanent-supplier');
        const newCheckboxLabel = newCheckboxWrapper?.querySelector('label');
        
        if (newBrandInput && newCheckboxWrapper && newCheckbox && newCheckboxLabel) {
            newBrandInput.addEventListener('input', () => {
                const brandValue = newBrandInput.value.trim();
                if (brandValue) {
                    newCheckbox.disabled = false;
                    newCheckbox.style.cursor = 'pointer';
                    newCheckboxLabel.style.cursor = 'pointer';
                    newCheckboxWrapper.style.opacity = '1';
                    newCheckbox.checked = isBrandPermanent(brandValue);
                } else {
                    newCheckbox.disabled = true;
                    newCheckbox.checked = false;
                    newCheckbox.style.cursor = 'not-allowed';
                    newCheckboxLabel.style.cursor = 'not-allowed';
                    newCheckboxWrapper.style.opacity = '0.5';
                }
            });
        }
    }, 100);
    
    // Инициализируем поиск товаров
    initProductSearch('income-product-search', 'income-product-id', 'income-product-dropdown', (productId) => {
        const quantityWrapper = document.getElementById('income-quantity-wrapper');
        const newProductForm = document.getElementById('new-product-form');
        
        if (productId === 'new') {
            quantityWrapper.style.display = 'block';
            newProductForm.style.display = 'block';
        } else if (productId) {
            quantityWrapper.style.display = 'block';
            newProductForm.style.display = 'none';
        } else {
            quantityWrapper.style.display = 'none';
            newProductForm.style.display = 'none';
        }
    });
});

window.editIncome = async function(incomeId) {
    const incomeRecord = income.find(i => i.id === incomeId);
    if (!incomeRecord) return;
    
    editingIncomeId = incomeId;
    
    const product = products.find(p => p.id === incomeRecord.productId);
    const productName = product ? `${product.name} (${product.size || '–'})` : incomeRecord.productName;
    
    // Создаём datalist для продавцов
    const sellers = [...new Set(sales.map(s => s.seller).filter(s => s))];
    const sellerDatalist = `
        <datalist id="seller-list">
            ${sellers.map(s => `<option value="${s}">`).join('')}
        </datalist>
    `;

    const incomeDate = new Date(incomeRecord.date);
    const offset = incomeDate.getTimezoneOffset();
    const localDate = new Date(incomeDate.getTime() - offset * 60000);
    const dateValue = localDate.toISOString().slice(0, 16);

    const content = `
        ${sellerDatalist}
        <label>Дата и время поступления</label>
        <input type="datetime-local" id="income-date" value="${dateValue}">
        
        <label>Товар</label>
        <input type="text" id="income-product-search" value="${productName}" autocomplete="off">
        <input type="hidden" id="income-product-id" value="${incomeRecord.productId}">
        <div id="income-product-dropdown" class="product-dropdown"></div>
        
        <div id="income-quantity-wrapper">
            <label>Количество</label>
            <input type="number" id="income-quantity" min="1" value="${incomeRecord.quantity}" required>
        </div>
        
        <button class="btn-primary" onclick="updateIncome('${incomeId}', this)">Сохранить изменения</button>
    `;
    openModal('Редактировать поступление', content);
    
    // Инициализируем поиск товаров
    initProductSearch('income-product-search', 'income-product-id', 'income-product-dropdown');
};

window.saveIncome = async function(btn) {
    const dateInput = document.getElementById('income-date').value;
    
    if (!dateInput) {
        showError('Укажите дату поступления');
        return;
    }

    const hiddenInput = document.getElementById('income-product-id');
    let productId = hiddenInput ? hiddenInput.value : '';
    const quantity = parseInt(document.getElementById('income-quantity').value);
    
    if (productId === 'new') {
        const newName = document.getElementById('new-product-name').value.trim();
        if (!newName) {
            showError('Название нового товара обязательно');
            return;
        }
        const newCategory = document.getElementById('new-product-category').value.trim();
        const newBrand = document.getElementById('new-product-brand').value.trim();
        const newIsPermanentSupplier = document.getElementById('new-product-permanent-supplier')?.checked || false;
        const newGender = document.getElementById('new-product-gender').value || '';
        const newSize = document.getElementById('new-product-size').value.trim();
        const newCost = parseFloat(document.getElementById('new-product-cost').value) || 0;
        const newPrice = parseFloat(document.getElementById('new-product-price').value) || 0;
        const newDiscount = parseFloat(document.getElementById('new-product-discount').value) || 0;
        
        // Обновляем маппинг брендов
        if (newBrand) {
            updateBrandMapping(newBrand, newIsPermanentSupplier);
        }
        
        btn.disabled = true;
        btn.textContent = 'Сохранение...';
        try {
            const newArticle = generateArticle();
            const docRef = await window.firebaseFunctions.addDoc(
                window.firebaseFunctions.collection(window.firebaseDb, 'products'),
                {
                    article: newArticle,
                    name: newName,
                    category: newCategory,
                    brand: newBrand,
                    isPermanentSupplier: newIsPermanentSupplier,
                    gender: newGender,
                    size: newSize,
                    cost: newCost,
                    price: newPrice,
                    discount: newDiscount,
                    stock: 0,
                    createdAt: new Date().toISOString()
                }
            );
            productId = docRef.id;
            await loadProducts();
        } catch (error) {
            showError('Ошибка при создании нового товара');
            console.error(error);
            btn.disabled = false;
            btn.textContent = 'Сохранить поступление';
            return;
        }
    }
    
    if (!productId) {
        showError('Выберите товар');
        return;
    }
    
    const product = products.find(p => p.id === productId);
    if (!product) {
        await loadProducts();
        const updatedProduct = products.find(p => p.id === productId);
        if (!updatedProduct) {
            showError('Товар не найден');
            return;
        }
    }

    const totalAmount = (product ? product.cost : 0) * quantity;

    btn.disabled = true;
    btn.textContent = 'Сохранение...';

    try {
        await window.firebaseFunctions.addDoc(
            window.firebaseFunctions.collection(window.firebaseDb, 'income'),
            {
                productId: productId,
                productName: product ? `${product.name} (${product.size || '–'})` : 'Новый товар',
                quantity: quantity,
                cost: product ? product.cost : 0,
                totalAmount: totalAmount,
                date: new Date(dateInput).toISOString()
            }
        );

        const currentProduct = products.find(p => p.id === productId);
        if (currentProduct) {
            const newStock = currentProduct.stock + quantity;
            await window.firebaseFunctions.updateDoc(
                window.firebaseFunctions.doc(window.firebaseDb, 'products', productId),
                { stock: newStock }
            );
        }

        closeModal();
        editingIncomeId = null;
        await loadIncome();
        await loadProducts();
        updateDashboard();
    } catch (error) {
        showError('Ошибка при сохранении поступления');
        console.error(error);
        btn.disabled = false;
        btn.textContent = 'Сохранить поступление';
    }
};

window.updateIncome = async function(incomeId, btn) {
    const dateInput = document.getElementById('income-date').value;
    
    if (!dateInput) {
        showError('Укажите дату поступления');
        return;
    }

    const hiddenInput = document.getElementById('income-product-id');
    const productId = hiddenInput ? hiddenInput.value : '';
    const quantity = parseInt(document.getElementById('income-quantity').value);
    
    const oldIncome = income.find(i => i.id === incomeId);
    if (!oldIncome) return;

    const product = products.find(p => p.id === productId);
    if (!product) {
        showError('Товар не найден');
        return;
    }

    const totalAmount = product.cost * quantity;

    btn.disabled = true;
    btn.textContent = 'Сохранение...';

    try {
        // Откатываем старое поступление
        const oldProduct = products.find(p => p.id === oldIncome.productId);
        if (oldProduct) {
            const newStock = Math.max(0, oldProduct.stock - oldIncome.quantity);
            await window.firebaseFunctions.updateDoc(
                window.firebaseFunctions.doc(window.firebaseDb, 'products', oldIncome.productId),
                { stock: newStock }
            );
        }

        // Обновляем запись
        await window.firebaseFunctions.updateDoc(
            window.firebaseFunctions.doc(window.firebaseDb, 'income', incomeId),
            {
                productId: productId,
                productName: `${product.name} (${product.size || '–'})`,
                quantity: quantity,
                cost: product.cost,
                totalAmount: totalAmount,
                date: new Date(dateInput).toISOString()
            }
        );

        // Применяем новое поступление
        const updatedProduct = products.find(p => p.id === productId);
        if (updatedProduct) {
            const newStock = updatedProduct.stock + quantity;
            await window.firebaseFunctions.updateDoc(
                window.firebaseFunctions.doc(window.firebaseDb, 'products', productId),
                { stock: newStock }
            );
        }

        closeModal();
        editingIncomeId = null;
        await loadIncome();
        await loadProducts();
        updateDashboard();
    } catch (error) {
        showError('Ошибка при обновлении поступления');
        console.error(error);
        btn.disabled = false;
        btn.textContent = 'Сохранить изменения';
    }
};

window.deleteIncome = async function(incomeId, btn) {
    if (!confirm('Удалить это поступление? Остаток товара будет уменьшен.')) return;
    
    const incomeRecord = income.find(i => i.id === incomeId);
    if (!incomeRecord) return;

    btn.disabled = true;
    btn.textContent = 'Удаление...';

    try {
        await window.firebaseFunctions.deleteDoc(
            window.firebaseFunctions.doc(window.firebaseDb, 'income', incomeId)
        );

        const product = products.find(p => p.id === incomeRecord.productId);
        if (product) {
            const newStock = Math.max(0, product.stock - incomeRecord.quantity);
            await window.firebaseFunctions.updateDoc(
                window.firebaseFunctions.doc(window.firebaseDb, 'products', incomeRecord.productId),
                { stock: newStock }
            );
        }

        await loadIncome();
        await loadProducts();
        updateDashboard();
    } catch (error) {
        showError('Ошибка при удалении поступления');
        console.error(error);
        btn.disabled = false;
        btn.textContent = 'Удалить';
    }
};

// === ПЛАНЫ ===
async function loadPlans() {
    await loadAllUsers(); // Загружаем пользователей для выпадающего списка
    
    const plansRef = window.firebaseFunctions.collection(window.firebaseDb, 'plans');
    const q = window.firebaseFunctions.query(plansRef, window.firebaseFunctions.orderBy('createdAt', 'desc'));
    const querySnapshot = await window.firebaseFunctions.getDocs(q);
    
    plans = [];
    querySnapshot.forEach((doc) => {
        plans.push({ id: doc.id, ...doc.data() });
    });
    
    renderPlans();
    updatePlanFilters();
}

document.getElementById('add-plan-btn').addEventListener('click', () => {
    const sellerOptions = getSellerOptionsHTML('');
    
    const content = `
        <label>Название периода</label>
        <input type="text" id="plan-name" placeholder="Например: Июль 2026" required>
        
        <label>Для кого</label>
        <select id="plan-seller">${sellerOptions}</select>
        
        <label>Дата начала</label>
        <input type="date" id="plan-start" required>
        
        <label>Дата окончания</label>
        <input type="date" id="plan-end" required>
        
        <label>План продаж (₽)</label>
        <input type="number" id="plan-target" min="1" required>
        
        <button class="btn-primary" onclick="savePlan(this)">Сохранить план</button>
    `;
    openModal('Установить план продаж', content);
});

window.editPlan = function(planId) {
    const plan = plans.find(p => p.id === planId);
    if (!plan) return;

    const sellerOptions = getSellerOptionsHTML(plan.assignedSeller || '');

    const content = `
        <label>Название периода</label>
        <input type="text" id="plan-name" value="${plan.name}" required>
        
        <label>Для кого</label>
        <select id="plan-seller">${sellerOptions}</select>
        
        <label>Дата начала</label>
        <input type="date" id="plan-start" value="${plan.startDate}" required>
        
        <label>Дата окончания</label>
        <input type="date" id="plan-end" value="${plan.endDate}" required>
        
        <label>План продаж (₽)</label>
        <input type="number" id="plan-target" min="1" value="${plan.targetAmount}" required>
        
        <button class="btn-primary" onclick="updatePlan('${planId}', this)">Сохранить изменения</button>
    `;
    openModal('Редактировать план', content);
};

window.savePlan = async function(btn) {
    const name = document.getElementById('plan-name').value.trim();
    const assignedSeller = document.getElementById('plan-seller').value.trim();
    const startDate = document.getElementById('plan-start').value;
    const endDate = document.getElementById('plan-end').value;
    const target = parseFloat(document.getElementById('plan-target').value);

    if (!name || !startDate || !endDate || isNaN(target)) {
        showError('Заполните все поля корректно');
        return;
    }

    btn.disabled = true;
    btn.textContent = 'Сохранение...';

    try {
        await window.firebaseFunctions.addDoc(
            window.firebaseFunctions.collection(window.firebaseDb, 'plans'),
            {
                name, assignedSeller, startDate, endDate,
                targetAmount: target,
                createdAt: new Date().toISOString()
            }
        );
        
        closeModal();
        await loadPlans();
        updateDashboard();
    } catch (error) {
        showError('Ошибка при сохранении плана');
        console.error(error);
        btn.disabled = false;
        btn.textContent = 'Сохранить план';
    }
};

window.updatePlan = async function(planId, btn) {
    const name = document.getElementById('plan-name').value.trim();
    const assignedSeller = document.getElementById('plan-seller').value.trim();
    const startDate = document.getElementById('plan-start').value;
    const endDate = document.getElementById('plan-end').value;
    const target = parseFloat(document.getElementById('plan-target').value);

    if (!name || !startDate || !endDate || isNaN(target)) {
        showError('Заполните все поля корректно');
        return;
    }

    btn.disabled = true;
    btn.textContent = 'Сохранение...';

    try {
        await window.firebaseFunctions.updateDoc(
            window.firebaseFunctions.doc(window.firebaseDb, 'plans', planId),
            { name, assignedSeller, startDate, endDate, targetAmount: target }
        );
        
        closeModal();
        await loadPlans();
        updateDashboard();
    } catch (error) {
        showError('Ошибка при обновлении плана');
        console.error(error);
        btn.disabled = false;
        btn.textContent = 'Сохранить изменения';
    }
};

window.deletePlan = async function(planId, btn) {
    if (!confirm('Удалить этот план?')) return;
    
    btn.disabled = true;
    btn.textContent = 'Удаление...';
    
    try {
        await window.firebaseFunctions.deleteDoc(
            window.firebaseFunctions.doc(window.firebaseDb, 'plans', planId)
        );
        await loadPlans();
        updateDashboard();
    } catch (error) {
        showError('Ошибка при удалении плана');
        console.error(error);
        btn.disabled = false;
        btn.textContent = 'Удалить';
    }
};

// === ФИЛЬТРЫ ===
function updateProductFilters() {
    const categories = [...new Set(products.map(p => p.category).filter(c => c))];
    const brands = [...new Set(products.map(p => p.brand).filter(b => b))];
    const sizes = [...new Set(products.map(p => p.size).filter(s => s))];

    const categoryList = document.getElementById('category-filter-list');
    const brandList = document.getElementById('brand-filter-list');
    const sizeList = document.getElementById('size-filter-list');
    
    if (categoryList) {
        categoryList.innerHTML = categories.map(c => `<option value="${c}">`).join('');
    }
    
    if (brandList) {
        brandList.innerHTML = brands.map(b => `<option value="${b}">`).join('');
    }
    
    if (sizeList) {
        sizeList.innerHTML = sizes.map(s => `<option value="${s}">`).join('');
    }

    const maxPrice = Math.max(...products.map(p => p.price || 0), 1000000);
    const priceMaxInput = document.getElementById('product-price-max');
    if (priceMaxInput) {
        priceMaxInput.max = maxPrice;
        document.getElementById('product-price-min').max = maxPrice;
    }
}

function updateIncomeFilters() {
    // Вычисляем максимальные значения для фильтров
    let maxCost = 0;
    let maxSale = 0;
    
    income.forEach(i => {
        const product = products.find(p => p.id === i.productId);
        const costPerUnit = product ? (product.cost || 0) : (i.cost || 0);
        const pricePerUnit = product ? (product.price || 0) : 0;
        
        const totalCost = costPerUnit * i.quantity;
        const totalSale = pricePerUnit * i.quantity;
        
        if (totalCost > maxCost) maxCost = totalCost;
        if (totalSale > maxSale) maxSale = totalSale;
    });
    
    // Округляем вверх до ближайшей тысячи
    maxCost = Math.ceil(maxCost / 1000) * 1000;
    maxSale = Math.ceil(maxSale / 1000) * 1000;
    
    if (maxCost < 1000000) maxCost = 1000000;
    if (maxSale < 1000000) maxSale = 1000000;
    
    const costMinInput = document.getElementById('income-cost-min');
    const costMaxInput = document.getElementById('income-cost-max');
    const saleMinInput = document.getElementById('income-sale-min');
    const saleMaxInput = document.getElementById('income-sale-max');
    
    if (costMinInput && costMaxInput) {
        costMinInput.max = maxCost;
        costMaxInput.max = maxCost;
    }
    
    if (saleMinInput && saleMaxInput) {
        saleMinInput.max = maxSale;
        saleMaxInput.max = maxSale;
    }
}

function updateSalesFilters() {
    const sellers = [...new Set(sales.map(s => s.seller).filter(s => s))];
    const sellerSelect = document.getElementById('sales-seller-filter');
    
    if (sellerSelect) {
        const currentVal = sellerSelect.value;
        sellerSelect.innerHTML = '<option value="">Все продавцы</option>' + 
            sellers.map(s => `<option value="${s}">${s}</option>`).join('');
        sellerSelect.value = currentVal;
    }

    const maxAmount = Math.max(...sales.map(s => s.totalAmount || 0), 1000000);
    const amountMaxInput = document.getElementById('sales-amount-max');
    if (amountMaxInput) {
        amountMaxInput.max = maxAmount;
        document.getElementById('sales-amount-min').max = maxAmount;
    }
}

function updatePlanFilters() {
    const ps = document.getElementById('plan-seller-filter');
    if (ps) {
        const v = ps.value;
        let html = '<option value="">Все</option><option value="__all__">Общие</option>';
        allUsers.forEach(u => { html += `<option value="${u.name}">${u.name}</option>`; });
        ps.innerHTML = html;
        ps.value = v;
    }
}

function getFilteredProducts() {
    return products.filter(p => {
        // УМНЫЙ ПОИСК по всем полям товара
        if (productFilters.search) {
            const searchText = `${p.name || ''} ${p.category || ''} ${p.brand || ''} ${p.size || ''}`;
            if (!smartSearch(searchText, productFilters.search)) return false;
        }
        if (productFilters.category && !p.category.toLowerCase().includes(productFilters.category.toLowerCase())) return false;
        if (productFilters.gender && p.gender !== productFilters.gender) return false;
        if (productFilters.brand && !p.brand.toLowerCase().includes(productFilters.brand.toLowerCase())) return false;
        if (productFilters.size && !p.size.toLowerCase().includes(productFilters.size.toLowerCase())) return false;
        if ((p.price || 0) < productFilters.priceMin || (p.price || 0) > productFilters.priceMax) return false;
        return true;
    });
}

function getFilteredIncome() {
    return income.filter(i => {
        // УМНЫЙ ПОИСК по названию товара
        if (incomeFilters.search) {
            if (!smartSearch(i.productName || '', incomeFilters.search)) {
                return false;
            }
        }
        
        // Фильтр по дате
        if (incomeFilters.dateFrom) {
            const fromDate = new Date(incomeFilters.dateFrom);
            const itemDate = new Date(i.date);
            if (itemDate < fromDate) return false;
        }
        if (incomeFilters.dateTo) {
            const toDate = new Date(incomeFilters.dateTo);
            toDate.setHours(23, 59, 59, 999);
            const itemDate = new Date(i.date);
            if (itemDate > toDate) return false;
        }
        
        // Фильтр по сумме закупки
        const product = products.find(p => p.id === i.productId);
        const costPerUnit = product ? (product.cost || 0) : (i.cost || 0);
        const totalCost = costPerUnit * i.quantity;
        
        if (totalCost < incomeFilters.costMin || totalCost > incomeFilters.costMax) {
            return false;
        }
        
        // Фильтр по сумме продажи
        const pricePerUnit = product ? (product.price || 0) : 0;
        const totalSale = pricePerUnit * i.quantity;
        
        if (totalSale < incomeFilters.saleMin || totalSale > incomeFilters.saleMax) {
            return false;
        }
        
        return true;
    });
}

function getFilteredSales() {
    return sales.filter(s => {
        // УМНЫЙ ПОИСК по товарам в продаже
        if (salesFilters.search) {
            const hasMatch = s.items ? s.items.some(item => 
                smartSearch(item.productName || '', salesFilters.search)
            ) : false;
            if (!hasMatch) return false;
        }
        if (salesFilters.dateFrom) {
            const fromDate = new Date(salesFilters.dateFrom);
            const saleDate = new Date(s.date);
            if (saleDate < fromDate) return false;
        }
        if (salesFilters.dateTo) {
            const toDate = new Date(salesFilters.dateTo);
            toDate.setHours(23, 59, 59, 999);
            const saleDate = new Date(s.date);
            if (saleDate > toDate) return false;
        }
        if (salesFilters.seller && s.seller !== salesFilters.seller) return false;
        if ((s.totalAmount || 0) < salesFilters.amountMin || (s.totalAmount || 0) > salesFilters.amountMax) return false;
        return true;
    });
}

function getFilteredPlans() {
    return plans.filter(p => {
        // УМНЫЙ ПОИСК по названию плана
        if (planFilters.search) {
            if (!smartSearch(p.name || '', planFilters.search)) return false;
        }
        if (planFilters.seller) {
            if (planFilters.seller === '__all__') { 
                if (p.assignedSeller) return false; 
            } else { 
                if (p.assignedSeller !== planFilters.seller) return false; 
            }
        }
        if (planFilters.dateFrom) {
            const fromDate = new Date(planFilters.dateFrom);
            const planStart = new Date(p.startDate);
            if (planStart < fromDate) return false;
        }
        if (planFilters.dateTo) {
            const toDate = new Date(planFilters.dateTo);
            toDate.setHours(23, 59, 59, 999);
            const planEnd = new Date(p.endDate);
            if (planEnd > toDate) return false;
        }
        return true;
    });
}

// Обработчики фильтров товаров
document.getElementById('product-search')?.addEventListener('input', (e) => {
    productFilters.search = e.target.value;
    renderProducts();
});

document.getElementById('product-category-filter')?.addEventListener('input', (e) => {
    productFilters.category = e.target.value;
    renderProducts();
});

document.getElementById('product-gender-filter')?.addEventListener('change', (e) => {
    productFilters.gender = e.target.value;
    renderProducts();
});

document.getElementById('product-brand-filter')?.addEventListener('input', (e) => {
    productFilters.brand = e.target.value;
    renderProducts();
});

document.getElementById('product-size-filter')?.addEventListener('input', (e) => {
    productFilters.size = e.target.value;
    renderProducts();
});

document.getElementById('product-price-min')?.addEventListener('input', (e) => {
    productFilters.priceMin = parseInt(e.target.value);
    const max = parseInt(document.getElementById('product-price-max').value);
    if (productFilters.priceMin > max) {
        document.getElementById('product-price-max').value = productFilters.priceMin;
        productFilters.priceMax = productFilters.priceMin;
    }
    document.getElementById('product-price-range-label').textContent = 
        `${productFilters.priceMin} - ${productFilters.priceMax} ₽`;
    renderProducts();
});

document.getElementById('product-price-max')?.addEventListener('input', (e) => {
    productFilters.priceMax = parseInt(e.target.value);
    const min = parseInt(document.getElementById('product-price-min').value);
    if (productFilters.priceMax < min) {
        document.getElementById('product-price-min').value = productFilters.priceMax;
        productFilters.priceMin = productFilters.priceMax;
    }
    document.getElementById('product-price-range-label').textContent = 
        `${productFilters.priceMin} - ${productFilters.priceMax} ₽`;
    renderProducts();
});

window.resetProductFilters = function() {
    productFilters = { search: '', category: '', gender: '', brand: '', size: '', priceMin: 0, priceMax: 1000000 };
    document.getElementById('product-search').value = '';
    document.getElementById('product-category-filter').value = '';
    document.getElementById('product-gender-filter').value = '';
    document.getElementById('product-brand-filter').value = '';
    document.getElementById('product-size-filter').value = '';
    document.getElementById('product-price-min').value = 0;
    document.getElementById('product-price-max').value = 1000000;
    document.getElementById('product-price-range-label').textContent = '0 - 1000000 ₽';
    renderProducts();
};

// Обработчики фильтров поступлений
document.getElementById('income-search')?.addEventListener('input', (e) => {
    incomeFilters.search = e.target.value;
    renderIncome();
});

document.getElementById('income-date-from')?.addEventListener('change', (e) => {
    incomeFilters.dateFrom = e.target.value;
    renderIncome();
});

document.getElementById('income-date-to')?.addEventListener('change', (e) => {
    incomeFilters.dateTo = e.target.value;
    renderIncome();
});

document.getElementById('income-cost-min')?.addEventListener('input', (e) => {
    incomeFilters.costMin = parseInt(e.target.value);
    const max = parseInt(document.getElementById('income-cost-max').value);
    if (incomeFilters.costMin > max) {
        document.getElementById('income-cost-max').value = incomeFilters.costMin;
        incomeFilters.costMax = incomeFilters.costMin;
    }
    document.getElementById('income-cost-range-label').textContent = 
        `${incomeFilters.costMin} - ${incomeFilters.costMax} ₽`;
    renderIncome();
});

document.getElementById('income-cost-max')?.addEventListener('input', (e) => {
    incomeFilters.costMax = parseInt(e.target.value);
    const min = parseInt(document.getElementById('income-cost-min').value);
    if (incomeFilters.costMax < min) {
        document.getElementById('income-cost-min').value = incomeFilters.costMax;
        incomeFilters.costMin = incomeFilters.costMax;
    }
    document.getElementById('income-cost-range-label').textContent = 
        `${incomeFilters.costMin} - ${incomeFilters.costMax} ₽`;
    renderIncome();
});

document.getElementById('income-sale-min')?.addEventListener('input', (e) => {
    incomeFilters.saleMin = parseInt(e.target.value);
    const max = parseInt(document.getElementById('income-sale-max').value);
    if (incomeFilters.saleMin > max) {
        document.getElementById('income-sale-max').value = incomeFilters.saleMin;
        incomeFilters.saleMax = incomeFilters.saleMin;
    }
    document.getElementById('income-sale-range-label').textContent = 
        `${incomeFilters.saleMin} - ${incomeFilters.saleMax} ₽`;
    renderIncome();
});

document.getElementById('income-sale-max')?.addEventListener('input', (e) => {
    incomeFilters.saleMax = parseInt(e.target.value);
    const min = parseInt(document.getElementById('income-sale-min').value);
    if (incomeFilters.saleMax < min) {
        document.getElementById('income-sale-min').value = incomeFilters.saleMax;
        incomeFilters.saleMin = incomeFilters.saleMax;
    }
    document.getElementById('income-sale-range-label').textContent = 
        `${incomeFilters.saleMin} - ${incomeFilters.saleMax} ₽`;
    renderIncome();
});

window.resetIncomeFilters = function() {
    incomeFilters = { 
        search: '', 
        dateFrom: '', 
        dateTo: '', 
        costMin: 0, 
        costMax: 1000000,
        saleMin: 0,
        saleMax: 1000000
    };
    document.getElementById('income-search').value = '';
    document.getElementById('income-date-from').value = '';
    document.getElementById('income-date-to').value = '';
    document.getElementById('income-cost-min').value = 0;
    document.getElementById('income-cost-max').value = 1000000;
    document.getElementById('income-cost-range-label').textContent = '0 - 1000000 ₽';
    document.getElementById('income-sale-min').value = 0;
    document.getElementById('income-sale-max').value = 1000000;
    document.getElementById('income-sale-range-label').textContent = '0 - 1000000 ₽';
    renderIncome();
};

// Обработчики фильтров продаж
document.getElementById('sales-search')?.addEventListener('input', (e) => {
    salesFilters.search = e.target.value;
    renderSales();
});

document.getElementById('sales-date-from')?.addEventListener('change', (e) => {
    salesFilters.dateFrom = e.target.value;
    renderSales();
});

document.getElementById('sales-date-to')?.addEventListener('change', (e) => {
    salesFilters.dateTo = e.target.value;
    renderSales();
});

document.getElementById('sales-seller-filter')?.addEventListener('change', (e) => {
    salesFilters.seller = e.target.value;
    renderSales();
});

document.getElementById('sales-amount-min')?.addEventListener('input', (e) => {
    salesFilters.amountMin = parseInt(e.target.value);
    const max = parseInt(document.getElementById('sales-amount-max').value);
    if (salesFilters.amountMin > max) {
        document.getElementById('sales-amount-max').value = salesFilters.amountMin;
        salesFilters.amountMax = salesFilters.amountMin;
    }
    document.getElementById('sales-amount-range-label').textContent = 
        `${salesFilters.amountMin} - ${salesFilters.amountMax} ₽`;
    renderSales();
});

document.getElementById('sales-amount-max')?.addEventListener('input', (e) => {
    salesFilters.amountMax = parseInt(e.target.value);
    const min = parseInt(document.getElementById('sales-amount-min').value);
    if (salesFilters.amountMax < min) {
        document.getElementById('sales-amount-min').value = salesFilters.amountMax;
        salesFilters.amountMin = salesFilters.amountMax;
    }
    document.getElementById('sales-amount-range-label').textContent = 
        `${salesFilters.amountMin} - ${salesFilters.amountMax} ₽`;
    renderSales();
});

window.resetSalesFilters = function() {
    salesFilters = { search: '', dateFrom: '', dateTo: '', seller: '', amountMin: 0, amountMax: 1000000 };
    document.getElementById('sales-search').value = '';
    document.getElementById('sales-date-from').value = '';
    document.getElementById('sales-date-to').value = '';
    document.getElementById('sales-seller-filter').value = '';
    document.getElementById('sales-amount-min').value = 0;
    document.getElementById('sales-amount-max').value = 1000000;
    document.getElementById('sales-amount-range-label').textContent = '0 - 1000000 ₽';
    renderSales();
};

// Обработчики фильтров планов
document.getElementById('plan-search')?.addEventListener('input', (e) => {
    planFilters.search = e.target.value;
    renderPlans();
});

document.getElementById('plan-seller-filter')?.addEventListener('change', (e) => {
    planFilters.seller = e.target.value;
    renderPlans();
});

document.getElementById('plan-date-from')?.addEventListener('change', (e) => {
    planFilters.dateFrom = e.target.value;
    renderPlans();
});

document.getElementById('plan-date-to')?.addEventListener('change', (e) => {
    planFilters.dateTo = e.target.value;
    renderPlans();
});

window.resetPlanFilters = function() {
    planFilters = { search: '', seller: '', dateFrom: '', dateTo: '' };
    document.getElementById('plan-search').value = '';
    document.getElementById('plan-seller-filter').value = '';
    document.getElementById('plan-date-from').value = '';
    document.getElementById('plan-date-to').value = '';
    renderPlans();
};

// === БЫСТРЫЙ ПРИХОД ===
window.showQuickIncome = function(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    
    const content = `
        <div style="padding: 10px 14px; background: var(--bg-tertiary); border-radius: 8px; margin-bottom: 16px;">
            <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 4px;">Товар</div>
            <div style="font-weight: 600; font-size: 14px;">${product.name} ${product.size ? '(' + product.size + ')' : ''}</div>
            <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">Текущий остаток: <strong style="color: var(--accent);">${product.stock}</strong></div>
        </div>
        <label>Дата и время поступления</label>
        <input type="datetime-local" id="quick-income-date" value="${getCurrentDateTimeLocal()}">
        <label>Количество</label>
        <input type="number" id="quick-income-quantity" min="1" value="1" required>
        <button class="btn-primary" onclick="saveQuickIncome('${productId}', this)">Сохранить приход</button>
    `;
    openModal('Приход товара', content);
};

window.saveQuickIncome = async function(productId, btn) {
    const dateInput = document.getElementById('quick-income-date').value;
    const quantity = parseInt(document.getElementById('quick-income-quantity').value);
    
    if (!dateInput) { showError('Укажите дату'); return; }
    if (!quantity || quantity < 1) { showError('Укажите количество'); return; }
    
    const product = products.find(p => p.id === productId);
    if (!product) { showError('Товар не найден'); return; }
    
    const totalAmount = (product.cost || 0) * quantity;
    
    btn.disabled = true;
    btn.textContent = 'Сохранение...';
    
    try {
        await window.firebaseFunctions.addDoc(
            window.firebaseFunctions.collection(window.firebaseDb, 'income'),
            {
                productId: productId,
                productName: `${product.name} (${product.size || '–'})`,
                quantity: quantity,
                cost: product.cost || 0,
                totalAmount: totalAmount,
                date: new Date(dateInput).toISOString()
            }
        );
        
        const newStock = product.stock + quantity;
        await window.firebaseFunctions.updateDoc(
            window.firebaseFunctions.doc(window.firebaseDb, 'products', productId),
            { stock: newStock }
        );
        
        closeModal();
        await loadIncome();
        await loadProducts();
        updateDashboard();
    } catch (error) {
        showError('Ошибка при сохранении');
        console.error(error);
        btn.disabled = false;
        btn.textContent = 'Сохранить приход';
    }
};

// === ИСТОРИЯ ПРИХОДОВ ===
window.showIncomeHistory = function(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    
    const records = income
        .filter(i => i.productId === productId)
        .sort((a, b) => new Date(b.date) - new Date(a.date));
    
    let listHtml;
    if (records.length === 0) {
        listHtml = '<div class="income-history-empty">Нет записей о приходах</div>';
    } else {
        listHtml = '<div class="income-history-list">' + records.map(r => `
            <div class="income-history-item">
                <div class="ih-info">
                    <div class="ih-date">${formatDate(r.date)}</div>
                    <div class="ih-quantity">+${r.quantity} шт.</div>
                </div>
                <div style="display: flex; gap: 6px;">
                    <button class="ih-edit" onclick="editIncomeRecord('${r.id}', '${productId}')">Изменить</button>
                    <button class="ih-delete" onclick="deleteIncomeRecord('${r.id}', '${productId}')">Удалить</button>
                </div>
            </div>
        `).join('') + '</div>';
    }
    
    const content = `
        <div style="padding: 10px 14px; background: var(--bg-tertiary); border-radius: 8px; margin-bottom: 16px;">
            <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 4px;">Товар</div>
            <div style="font-weight: 600; font-size: 14px;">${product.name} ${product.size ? '(' + product.size + ')' : ''}</div>
            <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">Текущий остаток: <strong style="color: var(--accent);">${product.stock}</strong> · Всего приходов: <strong>${records.length}</strong></div>
        </div>
        <h4 style="font-size: 14px; margin-bottom: 8px;">История приходов</h4>
        ${listHtml}
    `;
    openModal('История приходов', content);
};

window.editIncomeRecord = function(incomeId, productId) {
    const record = income.find(i => i.id === incomeId);
    if (!record) return;
    
    const product = products.find(p => p.id === productId);
    if (!product) return;
    
    const recordDate = new Date(record.date);
    const offset = recordDate.getTimezoneOffset();
    const localDate = new Date(recordDate.getTime() - offset * 60000);
    const dateValue = localDate.toISOString().slice(0, 16);
    
    const content = `
        <div style="padding: 10px 14px; background: var(--bg-tertiary); border-radius: 8px; margin-bottom: 16px;">
            <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 4px;">Товар</div>
            <div style="font-weight: 600; font-size: 14px;">${product.name} ${product.size ? '(' + product.size + ')' : ''}</div>
            <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">Текущий остаток: <strong style="color: var(--accent);">${product.stock}</strong></div>
        </div>
        <label>Дата и время поступления</label>
        <input type="datetime-local" id="edit-income-date" value="${dateValue}">
        <label>Количество</label>
        <input type="number" id="edit-income-quantity" min="1" value="${record.quantity}" required>
        <p style="font-size: 11px; color: var(--text-secondary); margin-top: 6px;">Текущее количество в этом приходе: <strong>${record.quantity}</strong> шт.</p>
        <button class="btn-primary" onclick="saveEditedIncomeRecord('${incomeId}', '${productId}', ${record.quantity}, this)">Сохранить изменения</button>
    `;
    openModal('Редактировать приход', content);
};

window.saveEditedIncomeRecord = async function(incomeId, productId, oldQuantity, btn) {
    const dateInput = document.getElementById('edit-income-date').value;
    const newQuantity = parseInt(document.getElementById('edit-income-quantity').value);
    
    if (!dateInput) {
        showError('Укажите дату');
        return;
    }
    if (!newQuantity || newQuantity < 1) {
        showError('Укажите количество');
        return;
    }
    
    const product = products.find(p => p.id === productId);
    if (!product) {
        showError('Товар не найден');
        return;
    }
    
    // Проверяем, что остаток не уйдёт в минус
    const quantityDiff = newQuantity - oldQuantity;
    const projectedStock = product.stock + quantityDiff;
    
    if (projectedStock < 0) {
        showError(`Нельзя уменьшить количество. Уже продано больше, чем можно изменить. Максимальное уменьшение: ${product.stock} шт.`);
        return;
    }
    
    const totalAmount = (product.cost || 0) * newQuantity;
    
    btn.disabled = true;
    btn.textContent = 'Сохранение...';
    
    try {
        // Обновляем запись
        await window.firebaseFunctions.updateDoc(
            window.firebaseFunctions.doc(window.firebaseDb, 'income', incomeId),
            {
                quantity: newQuantity,
                totalAmount: totalAmount,
                date: new Date(dateInput).toISOString()
            }
        );
        
        // Обновляем остаток товара
        await window.firebaseFunctions.updateDoc(
            window.firebaseFunctions.doc(window.firebaseDb, 'products', productId),
            { stock: projectedStock }
        );
        
        closeModal();
        await loadIncome();
        await loadProducts();
        updateDashboard();
        showIncomeHistory(productId);
    } catch (error) {
        showError('Ошибка при сохранении');
        console.error(error);
        btn.disabled = false;
        btn.textContent = 'Сохранить изменения';
    }
};

window.deleteIncomeRecord = async function(incomeId, productId) {
    const record = income.find(i => i.id === incomeId);
    if (!record) return;
    
    if (!confirm(`Удалить приход от ${formatDate(record.date)} (${record.quantity} шт.)? Остаток будет уменьшен.`)) return;
    
    try {
        await window.firebaseFunctions.deleteDoc(
            window.firebaseFunctions.doc(window.firebaseDb, 'income', incomeId)
        );
        
        const product = products.find(p => p.id === productId);
        if (product) {
            const newStock = Math.max(0, product.stock - record.quantity);
            await window.firebaseFunctions.updateDoc(
                window.firebaseFunctions.doc(window.firebaseDb, 'products', productId),
                { stock: newStock }
            );
        }
        
        await loadIncome();
        await loadProducts();
        updateDashboard();
        showIncomeHistory(productId);
    } catch (error) {
        showError('Ошибка при удалении');
        console.error(error);
    }
};

// === ВРЕМЕННАЯ АДМИНСКАЯ КНОПКА: генерация начальных поступлений ===
window.generateInitialIncomes = async function(btn) {
    const productsWithStock = products.filter(p => (p.stock || 0) > 0);
    
    if (productsWithStock.length === 0) {
        showError('Нет товаров с остатком');
        return;
    }
    
    if (!confirm(`Будет создано ${productsWithStock.length} записей о поступлениях (по 1 на каждую штуку остатка) на дату 01.07.2026. Продолжить?`)) return;
    
    btn.disabled = true;
    const originalText = btn.textContent;
    btn.textContent = 'Генерация...';
    
    const fixedDate = new Date('2026-07-01T00:00:00').toISOString();
    let created = 0;
    
    try {
        for (const product of productsWithStock) {
            const stock = product.stock || 0;
            
            // Создаём одну запись с общим количеством (вместо отдельных на каждую штуку)
            const totalAmount = (product.cost || 0) * stock;
            
            await window.firebaseFunctions.addDoc(
                window.firebaseFunctions.collection(window.firebaseDb, 'income'),
                {
                    productId: product.id,
                    productName: `${product.name} (${product.size || '–'})`,
                    quantity: stock,
                    cost: product.cost || 0,
                    totalAmount: totalAmount,
                    date: fixedDate
                }
            );
            
            created++;
            btn.textContent = `Генерация... ${created}/${productsWithStock.length}`;
        }
        
        await loadIncome();
        alert(`Готово! Создано записей: ${created}`);
        
    } catch (error) {
        showError('Ошибка при генерации');
        console.error(error);
    }
    
    btn.disabled = false;
    btn.textContent = originalText;
};

// === ПОИСК ТОВАРОВ С АВТОДОПОЛНЕНИЕМ (УМНЫЙ ПОИСК) ===
function initProductSearch(searchInputId, hiddenInputId, dropdownId, onSelectCallback) {
    const searchInput = document.getElementById(searchInputId);
    const hiddenInput = document.getElementById(hiddenInputId);
    const dropdown = document.getElementById(dropdownId);
    
    if (!searchInput || !hiddenInput || !dropdown) return;
    
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.trim().toLowerCase();
        hiddenInput.value = '';
        
        if (onSelectCallback) onSelectCallback('');
        
        if (query.length < 2) {
            dropdown.innerHTML = '';
            dropdown.style.display = 'none';
            return;
        }
        
        // УМНЫЙ ПОИСК: ищем по названию, бренду, категории и размеру
        const filtered = products.filter(p => {
            const searchText = `${p.name || ''} ${p.category || ''} ${p.brand || ''} ${p.size || ''}`;
            return smartSearch(searchText, query);
        }).slice(0, 10); // Показываем максимум 10 результатов
        
        if (filtered.length === 0) {
            dropdown.innerHTML = '<div class="dropdown-item no-results">Ничего не найдено</div>';
            dropdown.style.display = 'block';
            return;
        }
        
        dropdown.innerHTML = filtered.map(p => {
            const stockClass = p.stock > 0 ? 'in-stock' : 'out-of-stock';
            const stockText = p.stock > 0 ? `Остаток: ${p.stock}` : 'Нет в наличии';
            return `
                <div class="dropdown-item" data-product-id="${p.id}">
                    <div class="product-name">${p.name} ${p.size ? `(${p.size})` : ''}</div>
                    <div class="product-meta">
                        <span class="${stockClass}">${stockText}</span>
                        ${p.brand ? `<span class="product-brand">${p.brand}</span>` : ''}
                    </div>
                </div>
            `;
        }).join('');
        
        dropdown.style.display = 'block';
        
        // Добавляем обработчики клика на варианты
        dropdown.querySelectorAll('.dropdown-item[data-product-id]').forEach(item => {
            item.addEventListener('click', () => {
                const productId = item.dataset.productId;
                const product = products.find(p => p.id === productId);
                if (product) {
                    searchInput.value = `${product.name} ${product.size ? `(${product.size})` : ''}`;
                    hiddenInput.value = productId;
                    dropdown.style.display = 'none';
                    if (onSelectCallback) onSelectCallback(productId);
                }
            });
        });
    });
    
    // Скрываем dropdown при клике вне
    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.style.display = 'none';
        }
    });
    
    // Фокус на input показывает dropdown если есть значение
    searchInput.addEventListener('focus', () => {
        if (searchInput.value.trim().length >= 2) {
            searchInput.dispatchEvent(new Event('input'));
        }
    });
}