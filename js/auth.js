document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const submitBtn = e.target.querySelector('button[type="submit"]');

    submitBtn.disabled = true;
    submitBtn.textContent = 'Вход...';

    try {
        console.log('Попытка входа для:', email);
        const userCredential = await window.firebaseFunctions.signInWithEmailAndPassword(
            window.firebaseAuth, email, password
        );
        console.log('Вход успешен, UID:', userCredential.user.uid);
    } catch (error) {
        console.error('Firebase Auth Error:', error);
        console.error('Error code:', error.code);
        console.error('Error message:', error.message);
        showError(getErrorMessage(error.code) + ' (код: ' + error.code + ')');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Войти';
    }
});

async function loadUserData(user) {
    const usersRef = window.firebaseFunctions.collection(window.firebaseDb, 'users');
    const q = window.firebaseFunctions.query(
        usersRef, 
        window.firebaseFunctions.where('uid', '==', user.uid)
    );
    const querySnapshot = await window.firebaseFunctions.getDocs(q);
    
    if (!querySnapshot.empty) {
        const userData = querySnapshot.docs[0].data();
        window.currentUser = userData;
        
        document.getElementById('user-role').textContent = 
            userData.role === 'owner' ? 'Владелец' : 'Продавец';
        
        if (userData.role !== 'owner') {
            document.getElementById('plans-link').parentElement.style.display = 'none';
            document.getElementById('users-link').parentElement.style.display = 'none';
            document.getElementById('mobile-plans-link').style.display = 'none';
            document.getElementById('mobile-users-link').style.display = 'none';
        }
        
        if (userData.role === 'owner') {
            loadUsers();
        }
    }
}

async function loadUsers() {
    const usersRef = window.firebaseFunctions.collection(window.firebaseDb, 'users');
    const querySnapshot = await window.firebaseFunctions.getDocs(usersRef);
    
    const users = [];
    querySnapshot.forEach((doc) => {
        users.push({ id: doc.id, ...doc.data() });
    });
    
    renderUsers(users);
}

document.getElementById('add-user-btn').addEventListener('click', () => {
    if (window.currentUser.role !== 'owner') {
        showError('Только владелец может добавлять пользователей');
        return;
    }

    const content = `
        <label>Имя</label>
        <input type="text" id="user-name" required>
        
        <label>Email</label>
        <input type="email" id="user-email" required>
        
        <label>Пароль (минимум 6 символов)</label>
        <input type="password" id="user-password" required>
        
        <label>Роль</label>
        <select id="user-role-select" required>
            <option value="seller">Продавец</option>
            <option value="owner">Владелец</option>
        </select>
        
        <button class="btn-primary" onclick="saveUser(this)">Создать сотрудника</button>
    `;
    openModal('Добавить сотрудника', content);
});

window.saveUser = async function(btn) {
    const name = document.getElementById('user-name').value.trim();
    const email = document.getElementById('user-email').value.trim();
    const password = document.getElementById('user-password').value;
    const role = document.getElementById('user-role-select').value;

    if (password.length < 6) {
        showError('Пароль должен быть минимум 6 символов');
        return;
    }

    btn.disabled = true;
    btn.textContent = 'Создание...';

    try {
        const secondaryApp = window.firebaseFunctions.initializeApp(
            window.firebaseConfig, 
            "Secondary_" + Date.now()
        );
        const secondaryAuth = window.firebaseFunctions.getAuth(secondaryApp);
        
        const userCredential = await window.firebaseFunctions.createUserWithEmailAndPassword(
            secondaryAuth, email, password
        );

        await window.firebaseFunctions.signOut(secondaryAuth);

        await window.firebaseFunctions.addDoc(
            window.firebaseFunctions.collection(window.firebaseDb, 'users'),
            {
                uid: userCredential.user.uid,
                name: name,
                email: email,
                role: role,
                createdAt: new Date().toISOString()
            }
        );

        closeModal();
        await loadUsers();
        alert('Сотрудник успешно создан! Сообщите ему логин и пароль.');
        
    } catch (error) {
        showError(getErrorMessage(error.code));
        console.error(error);
        btn.disabled = false;
        btn.textContent = 'Создать сотрудника';
    }
};

window.deleteUser = async function(userId, btn) {
    if (!confirm('Удалить этого сотрудника? Он больше не сможет войти в систему.')) return;
    
    btn.disabled = true;
    btn.textContent = 'Удаление...';
    
    try {
        await window.firebaseFunctions.deleteDoc(
            window.firebaseFunctions.doc(window.firebaseDb, 'users', userId)
        );
        await loadUsers();
    } catch (error) {
        showError('Ошибка при удалении пользователя');
        console.error(error);
        btn.disabled = false;
        btn.textContent = 'Удалить';
    }
};

function renderUsers(users) {
    const tbody = document.getElementById('users-tbody');
    tbody.innerHTML = users.map(user => `
        <tr>
            <td>${user.name}</td>
            <td>${user.email}</td>
            <td>${user.role === 'owner' ? 'Владелец' : 'Продавец'}</td>
            <td>${formatDate(user.createdAt)}</td>
            <td>
                ${user.uid !== window.currentUser.uid ? 
                    `<button class="action-btn delete" onclick="deleteUser('${user.id}', this)">Удалить</button>` : 
                    '<span style="color: var(--text-secondary)">Это вы</span>'}
            </td>
        </tr>
    `).join('');
}

function getErrorMessage(code) {
    const messages = {
        'auth/email-already-in-use': 'Этот email уже зарегистрирован',
        'auth/invalid-email': 'Некорректный email',
        'auth/weak-password': 'Пароль должен быть минимум 6 символов',
        'auth/user-not-found': 'Пользователь не найден',
        'auth/wrong-password': 'Неверный пароль',
        'auth/invalid-credential': 'Неверный email или пароль'
    };
    return messages[code] || 'Произошла ошибка. Попробуйте ещё раз.';
}