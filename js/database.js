let products = [];
let sales = [];
let income = [];
let plans = [];
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
    priceMax: 250000
};

let incomeFilters = {
    search: '',
    dateFrom: '',
    dateTo: '',
    amountMin: 0,
    amountMax: 250000
};

let salesFilters = {
    search: '',
    dateFrom: '',
    dateTo: '',
    seller: '',
    amountMin: 0,
    amountMax: 250000
};

let planFilters = {
    search: '',
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
    const content = `
        <label>Название (обязательно)</label>
        <input type="text" id="product-name" required>
        
        <label>Категория</label>
        <input type="text" id="product-category">
        
        <label>Бренд</label>
        <input type="text" id="product-brand">
        
        <label>Пол</label>
        <select id="product-gender">
            <option value="">Не указан</option>
            <option value="male">Мужское</option>
            <option value="female">Женское</option>
            <option value="unisex">Унисекс</option>
        </select>
        
        <label>Размер</label>
        <input type="text" id="product-size">
        
        <label>Цена закупки</label>
        <input type="number" id="product-cost">
        
        <label>Цена продажи</label>
        <input type="number" id="product-price">
        
        <label>Цена по скидке</label>
        <input type="number" id="product-discount" value="0">
        
        <label>Остаток</label>
        <input type="number" id="product-stock" value="0">
        
        <button class="btn-primary" onclick="saveProduct(this)">Сохранить</button>
    `;
    openModal('Добавить товар', content);
});

window.editProduct = function(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    const content = `
        <label>Название (обязательно)</label>
        <input type="text" id="product-name" value="${product.name || ''}" required>
        
        <label>Категория</label>
        <input type="text" id="product-category" value="${product.category || ''}">
        
        <label>Бренд</label>
        <input type="text" id="product-brand" value="${product.brand || ''}">
        
        <label>Пол</label>
        <select id="product-gender">
            <option value="" ${!product.gender ? 'selected' : ''}>Не указан</option>
            <option value="male" ${product.gender === 'male' ? 'selected' : ''}>Мужское</option>
            <option value="female" ${product.gender === 'female' ? 'selected' : ''}>Женское</option>
            <option value="unisex" ${product.gender === 'unisex' ? 'selected' : ''}>Унисекс</option>
        </select>
        
        <label>Размер</label>
        <input type="text" id="product-size" value="${product.size || ''}">
        
        <label>Цена закупки</label>
        <input type="number" id="product-cost" value="${product.cost || ''}">
        
        <label>Цена продажи</label>
        <input type="number" id="product-price" value="${product.price || ''}">
        
        <label>Цена по скидке</label>
        <input type="number" id="product-discount" value="${product.discount || 0}">
        
        <label>Остаток</label>
        <input type="number" id="product-stock" value="${product.stock || 0}">
        
        <button class="btn-primary" onclick="updateProduct('${productId}', this)">Сохранить изменения</button>
    `;
    openModal('Редактировать товар', content);
};

window.saveProduct = async function(btn) {
    const name = document.getElementById('product-name').value;
    
    if (!name) {
        showError('Название обязательно');
        return;
    }

    const category = document.getElementById('product-category').value || '';
    const brand = document.getElementById('product-brand').value || '';
    const gender = document.getElementById('product-gender').value || '';
    const size = document.getElementById('product-size').value || '';
    const cost = parseFloat(document.getElementById('product-cost').value) || 0;
    const price = parseFloat(document.getElementById('product-price').value) || 0;
    const discount = parseFloat(document.getElementById('product-discount').value) || 0;
    const stock = parseInt(document.getElementById('product-stock').value) || 0;

    const article = generateArticle();

    btn.disabled = true;
    btn.textContent = 'Сохранение...';

    try {
        await window.firebaseFunctions.addDoc(
            window.firebaseFunctions.collection(window.firebaseDb, 'products'),
            {
                article, name, category, brand, gender, size, cost, price, discount, stock,
                createdAt: new Date().toISOString()
            }
        );
        
        closeModal();
        await loadProducts();
    } catch (error) {
        showError('Ошибка при сохранении товара');
        console.error(error);
        btn.disabled = false;
        btn.textContent = 'Сохранить';
    }
};

window.updateProduct = async function(productId, btn) {
    const name = document.getElementById('product-name').value;
    
    if (!name) {
        showError('Название обязательно');
        return;
    }

    const category = document.getElementById('product-category').value || '';
    const brand = document.getElementById('product-brand').value || '';
    const gender = document.getElementById('product-gender').value || '';
    const size = document.getElementById('product-size').value || '';
    const cost = parseFloat(document.getElementById('product-cost').value) || 0;
    const price = parseFloat(document.getElementById('product-price').value) || 0;
    const discount = parseFloat(document.getElementById('product-discount').value) || 0;
    const stock = parseInt(document.getElementById('product-stock').value) || 0;

    btn.disabled = true;
    btn.textContent = 'Сохранение...';

    try {
        await window.firebaseFunctions.updateDoc(
            window.firebaseFunctions.doc(window.firebaseDb, 'products', productId),
            { name, category, brand, gender, size, cost, price, discount, stock }
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

    const options = products
        .filter(p => p.stock > 0)
        .map(p => `<option value="${p.id}">${p.name} (${p.size || '—'}) — Остаток: ${p.stock}</option>`)
        .join('');

    const content = `
        <label>Дата и время продажи</label>
        <input type="datetime-local" id="sale-date" value="${getCurrentDateTimeLocal()}">
        
        <label>Продавец</label>
        <input type="text" id="sale-seller" value="${window.currentUser.name || ''}">
        
        <div class="divider">Товары</div>
        
        <label>Добавить товар в продажу</label>
        <select id="sale-product-select">
            <option value="">-- Выберите товар --</option>
            ${options}
        </select>
        <button class="btn-small" style="width: 100%; margin-bottom: 16px;" onclick="addSaleItem()">+ Добавить в корзину</button>

        <label>Корзина</label>
        <div class="sale-cart" id="sale-cart">
            <div class="sale-cart-empty">Добавьте товары в продажу</div>
        </div>

        <div class="sale-total">
            Итого: <span id="sale-total-amount">0 ₽</span>
        </div>

        <button class="btn-primary" onclick="saveSale(this)">Оформить продажу</button>
    `;
    openModal('Добавить продажу', content);
});

window.editSale = function(saleId) {
    const sale = sales.find(s => s.id === saleId);
    if (!sale || !sale.items) return;

    editingSaleId = saleId;
    currentSaleItems = sale.items.map(item => {
        const product = products.find(p => p.id === item.productId);
        const currentStock = product ? product.stock : 0;
        // К текущему остатку на складе добавляем количество из этой продажи
        // (как будто мы "возвращаем" товар на склад для возможности редактирования)
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

    const allProducts = products.map(p => {
        // Для товаров, которые уже в корзине этой продажи, увеличиваем доступный остаток
        const itemInSale = sale.items.find(i => i.productId === p.id);
        const availableStock = p.stock + (itemInSale ? itemInSale.quantity : 0);
        return `<option value="${p.id}">${p.name} (${p.size || '—'}) — Остаток: ${availableStock}</option>`;
    }).join('');

    // Конвертируем ISO дату в datetime-local формат
    const saleDate = new Date(sale.date);
    const offset = saleDate.getTimezoneOffset();
    const localDate = new Date(saleDate.getTime() - offset * 60000);
    const dateValue = localDate.toISOString().slice(0, 16);

    const content = `
        <label>Дата и время продажи</label>
        <input type="datetime-local" id="sale-date" value="${dateValue}">
        
        <label>Продавец</label>
        <input type="text" id="sale-seller" value="${sale.seller || ''}">
        
        <div class="divider">Товары</div>
        
        <label>Добавить товар в продажу</label>
        <select id="sale-product-select">
            <option value="">-- Выберите товар --</option>
            ${allProducts}
        </select>
        <button class="btn-small" style="width: 100%; margin-bottom: 16px;" onclick="addSaleItem()">+ Добавить в корзину</button>

        <label>Корзина</label>
        <div class="sale-cart" id="sale-cart"></div>

        <div class="sale-total">
            Итого: <span id="sale-total-amount">0 ₽</span>
        </div>

        <button class="btn-primary" onclick="updateSale('${saleId}', this)">Сохранить изменения</button>
    `;
    openModal('Редактировать продажу', content);
    renderSaleCart();
};

window.addSaleItem = function() {
    const select = document.getElementById('sale-product-select');
    const productId = select.value;
    if (!productId) {
        showError('Выберите товар');
        return;
    }

    const product = products.find(p => p.id === productId);
    if (!product) return;

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
        name: `${product.name} (${product.size || '—'})`,
        maxStock: availableStock,
        quantity: 1,
        priceType: 'original',
        originalPrice: product.price || 0,
        discountPrice: product.discount || 0,
        customPrice: product.price || 0,
        finalPrice: product.price || 0
    });

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
                date: new Date(dateInput).toISOString()
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
        // Откатываем старые остатки
        for (const oldItem of oldSale.items) {
            const product = products.find(p => p.id === oldItem.productId);
            if (product) {
                const newStock = product.stock + oldItem.quantity;
                await window.firebaseFunctions.updateDoc(
                    window.firebaseFunctions.doc(window.firebaseDb, 'products', oldItem.productId),
                    { stock: newStock }
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
                date: new Date(dateInput).toISOString()
            }
        );

        // Применяем новые остатки
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
    
    let options = '';
    if (products.length > 0) {
        options = products.map(p => `<option value="${p.id}">${p.name} (${p.size || '—'})</option>`).join('');
    }

    const content = `
        <label>Дата и время поступления</label>
        <input type="datetime-local" id="income-date" value="${getCurrentDateTimeLocal()}">
        
        <label>Товар</label>
        <select id="income-product" required>
            <option value="">-- Выберите товар --</option>
            ${options}
            <option value="new">➕ Добавить новый товар</option>
        </select>
        
        <div id="income-quantity-wrapper">
            <label>Количество</label>
            <input type="number" id="income-quantity" min="1" value="1" required>
        </div>
        
        <div id="new-product-form" style="display: none;">
            <div class="divider">Новый товар</div>
            <label>Название (обязательно)</label>
            <input type="text" id="new-product-name">
            <label>Категория</label>
            <input type="text" id="new-product-category">
            <label>Бренд</label>
            <input type="text" id="new-product-brand">
            <label>Пол</label>
            <select id="new-product-gender">
                <option value="">Не указан</option>
                <option value="male">Мужское</option>
                <option value="female">Женское</option>
                <option value="unisex">Унисекс</option>
            </select>
            <label>Размер</label>
            <input type="text" id="new-product-size">
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
    
    setTimeout(() => {
        const select = document.getElementById('income-product');
        select.addEventListener('change', function() {
            const newProductForm = document.getElementById('new-product-form');
            const quantityWrapper = document.getElementById('income-quantity-wrapper');
            
            if (this.value === 'new') {
                newProductForm.style.display = 'block';
                quantityWrapper.style.display = 'block';
            } else if (this.value === '') {
                newProductForm.style.display = 'none';
                quantityWrapper.style.display = 'none';
            } else {
                newProductForm.style.display = 'none';
                quantityWrapper.style.display = 'block';
            }
        });
    }, 100);
});

window.editIncome = async function(incomeId) {
    const incomeRecord = income.find(i => i.id === incomeId);
    if (!incomeRecord) return;

    editingIncomeId = incomeId;

    const options = products.map(p => 
        `<option value="${p.id}" ${p.id === incomeRecord.productId ? 'selected' : ''}>${p.name} (${p.size || '—'})</option>`
    ).join('');

    // Конвертируем ISO дату в datetime-local формат
    const incomeDate = new Date(incomeRecord.date);
    const offset = incomeDate.getTimezoneOffset();
    const localDate = new Date(incomeDate.getTime() - offset * 60000);
    const dateValue = localDate.toISOString().slice(0, 16);

    const content = `
        <label>Дата и время поступления</label>
        <input type="datetime-local" id="income-date" value="${dateValue}">
        
        <label>Товар</label>
        <select id="income-product" required>
            ${options}
        </select>
        
        <div id="income-quantity-wrapper">
            <label>Количество</label>
            <input type="number" id="income-quantity" min="1" value="${incomeRecord.quantity}" required>
        </div>
        
        <button class="btn-primary" onclick="updateIncome('${incomeId}', this)">Сохранить изменения</button>
    `;
    openModal('Редактировать поступление', content);
};

window.saveIncome = async function(btn) {
    const dateInput = document.getElementById('income-date').value;
    
    if (!dateInput) {
        showError('Укажите дату поступления');
        return;
    }

    const productSelect = document.getElementById('income-product');
    let productId = productSelect.value;
    const quantity = parseInt(document.getElementById('income-quantity').value);
    
    if (productId === 'new') {
        const newName = document.getElementById('new-product-name').value;
        
        if (!newName) {
            showError('Название нового товара обязательно');
            return;
        }

        const newCategory = document.getElementById('new-product-category').value || '';
        const newBrand = document.getElementById('new-product-brand').value || '';
        const newGender = document.getElementById('new-product-gender').value || '';
        const newSize = document.getElementById('new-product-size').value || '';
        const newCost = parseFloat(document.getElementById('new-product-cost').value) || 0;
        const newPrice = parseFloat(document.getElementById('new-product-price').value) || 0;
        const newDiscount = parseFloat(document.getElementById('new-product-discount').value) || 0;

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
                productName: product ? `${product.name} (${product.size || '—'})` : 'Новый товар',
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

    const productId = document.getElementById('income-product').value;
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
                productName: `${product.name} (${product.size || '—'})`,
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
    const content = `
        <label>Название периода</label>
        <input type="text" id="plan-name" placeholder="Например: Июль 2026" required>
        
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

    const content = `
        <label>Название периода</label>
        <input type="text" id="plan-name" value="${plan.name}" required>
        
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
    const name = document.getElementById('plan-name').value;
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
                name, startDate, endDate,
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
    const name = document.getElementById('plan-name').value;
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
            { name, startDate, endDate, targetAmount: target }
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

    const categorySelect = document.getElementById('product-category-filter');
    const brandSelect = document.getElementById('product-brand-filter');
    const sizeSelect = document.getElementById('product-size-filter');

    if (categorySelect) {
        const currentVal = categorySelect.value;
        categorySelect.innerHTML = '<option value="">Все категории</option>' + 
            categories.map(c => `<option value="${c}">${c}</option>`).join('');
        categorySelect.value = currentVal;
    }

    if (brandSelect) {
        const currentVal = brandSelect.value;
        brandSelect.innerHTML = '<option value="">Все бренды</option>' + 
            brands.map(b => `<option value="${b}">${b}</option>`).join('');
        brandSelect.value = currentVal;
    }

    if (sizeSelect) {
        const currentVal = sizeSelect.value;
        sizeSelect.innerHTML = '<option value="">Все размеры</option>' + 
            sizes.map(s => `<option value="${s}">${s}</option>`).join('');
        sizeSelect.value = currentVal;
    }

    const maxPrice = Math.max(...products.map(p => p.price || 0), 250000);
    const priceMaxInput = document.getElementById('product-price-max');
    if (priceMaxInput) {
        priceMaxInput.max = maxPrice;
        document.getElementById('product-price-min').max = maxPrice;
    }
}

function updateIncomeFilters() {
    const maxAmount = Math.max(...income.map(i => i.totalAmount || 0), 250000);
    const amountMaxInput = document.getElementById('income-amount-max');
    if (amountMaxInput) {
        amountMaxInput.max = maxAmount;
        document.getElementById('income-amount-min').max = maxAmount;
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

    const maxAmount = Math.max(...sales.map(s => s.totalAmount || 0), 250000);
    const amountMaxInput = document.getElementById('sales-amount-max');
    if (amountMaxInput) {
        amountMaxInput.max = maxAmount;
        document.getElementById('sales-amount-min').max = maxAmount;
    }
}

function getFilteredProducts() {
    return products.filter(p => {
        if (productFilters.search && !p.name.toLowerCase().includes(productFilters.search.toLowerCase())) return false;
        if (productFilters.category && p.category !== productFilters.category) return false;
        if (productFilters.gender && p.gender !== productFilters.gender) return false;
        if (productFilters.brand && p.brand !== productFilters.brand) return false;
        if (productFilters.size && p.size !== productFilters.size) return false;
        if ((p.price || 0) < productFilters.priceMin || (p.price || 0) > productFilters.priceMax) return false;
        return true;
    });
}

function getFilteredIncome() {
    return income.filter(i => {
        if (incomeFilters.search && !i.productName.toLowerCase().includes(incomeFilters.search.toLowerCase())) return false;
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
        if ((i.totalAmount || 0) < incomeFilters.amountMin || (i.totalAmount || 0) > incomeFilters.amountMax) return false;
        return true;
    });
}

function getFilteredSales() {
    return sales.filter(s => {
        if (salesFilters.search) {
            const search = salesFilters.search.toLowerCase();
            const hasMatch = s.items ? s.items.some(item => 
                item.productName.toLowerCase().includes(search)
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
        if (planFilters.search && !p.name.toLowerCase().includes(planFilters.search.toLowerCase())) return false;
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

document.getElementById('product-category-filter')?.addEventListener('change', (e) => {
    productFilters.category = e.target.value;
    renderProducts();
});

document.getElementById('product-gender-filter')?.addEventListener('change', (e) => {
    productFilters.gender = e.target.value;
    renderProducts();
});

document.getElementById('product-brand-filter')?.addEventListener('change', (e) => {
    productFilters.brand = e.target.value;
    renderProducts();
});

document.getElementById('product-size-filter')?.addEventListener('change', (e) => {
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
    productFilters = { search: '', category: '', gender: '', brand: '', size: '', priceMin: 0, priceMax: 250000 };
    document.getElementById('product-search').value = '';
    document.getElementById('product-category-filter').value = '';
    document.getElementById('product-gender-filter').value = '';
    document.getElementById('product-brand-filter').value = '';
    document.getElementById('product-size-filter').value = '';
    document.getElementById('product-price-min').value = 0;
    document.getElementById('product-price-max').value = 250000;
    document.getElementById('product-price-range-label').textContent = '0 - 250000 ₽';
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

document.getElementById('income-amount-min')?.addEventListener('input', (e) => {
    incomeFilters.amountMin = parseInt(e.target.value);
    const max = parseInt(document.getElementById('income-amount-max').value);
    if (incomeFilters.amountMin > max) {
        document.getElementById('income-amount-max').value = incomeFilters.amountMin;
        incomeFilters.amountMax = incomeFilters.amountMin;
    }
    document.getElementById('income-amount-range-label').textContent = 
        `${incomeFilters.amountMin} - ${incomeFilters.amountMax} ₽`;
    renderIncome();
});

document.getElementById('income-amount-max')?.addEventListener('input', (e) => {
    incomeFilters.amountMax = parseInt(e.target.value);
    const min = parseInt(document.getElementById('income-amount-min').value);
    if (incomeFilters.amountMax < min) {
        document.getElementById('income-amount-min').value = incomeFilters.amountMax;
        incomeFilters.amountMin = incomeFilters.amountMax;
    }
    document.getElementById('income-amount-range-label').textContent = 
        `${incomeFilters.amountMin} - ${incomeFilters.amountMax} ₽`;
    renderIncome();
});

window.resetIncomeFilters = function() {
    incomeFilters = { search: '', dateFrom: '', dateTo: '', amountMin: 0, amountMax: 250000 };
    document.getElementById('income-search').value = '';
    document.getElementById('income-date-from').value = '';
    document.getElementById('income-date-to').value = '';
    document.getElementById('income-amount-min').value = 0;
    document.getElementById('income-amount-max').value = 250000;
    document.getElementById('income-amount-range-label').textContent = '0 - 250000 ₽';
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
    salesFilters = { search: '', dateFrom: '', dateTo: '', seller: '', amountMin: 0, amountMax: 250000 };
    document.getElementById('sales-search').value = '';
    document.getElementById('sales-date-from').value = '';
    document.getElementById('sales-date-to').value = '';
    document.getElementById('sales-seller-filter').value = '';
    document.getElementById('sales-amount-min').value = 0;
    document.getElementById('sales-amount-max').value = 250000;
    document.getElementById('sales-amount-range-label').textContent = '0 - 250000 ₽';
    renderSales();
};

// Обработчики фильтров планов
document.getElementById('plan-search')?.addEventListener('input', (e) => {
    planFilters.search = e.target.value;
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
    planFilters = { search: '', dateFrom: '', dateTo: '' };
    document.getElementById('plan-search').value = '';
    document.getElementById('plan-date-from').value = '';
    document.getElementById('plan-date-to').value = '';
    renderPlans();
};