document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    try {
        await window.firebaseFunctions.signInWithEmailAndPassword(
            window.firebaseAuth, email, password
        );
    } catch (error) {
        showError(getErrorMessage(error.code));
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
        
        <button class="btn-primary" onclick="saveUser()">Создать сотрудника</button>
    `;
    openModal('Добавить сотрудника', content);
});

window.saveUser = async function() {
    const name = document.getElementById('user-name').value;
    const email = document.getElementById('user-email').value;
    const password = document.getElementById('user-password').value;
    const role = document.getElementById('user-role-select').value;

    if (password.length < 6) {
        showError('Пароль должен быть минимум 6 символов');
        return;
    }

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
    }
};

window.deleteUser = async function(userId) {
    if (!confirm('Удалить этого сотрудника? Он больше не сможет войти в систему.')) return;
    
    try {
        await window.firebaseFunctions.deleteDoc(
            window.firebaseFunctions.doc(window.firebaseDb, 'users', userId)
        );
        await loadUsers();
    } catch (error) {
        showError('Ошибка при удалении пользователя');
        console.error(error);
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
                    `<button class="action-btn delete" onclick="deleteUser('${user.id}')">Удалить</button>` : 
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