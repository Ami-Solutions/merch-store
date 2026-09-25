import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { startServer } from './serve.mjs';
import { startEmulator, project, seed } from './archive-emulator.mjs';
import { archiveFixture } from '../tests/archive-fixture.mjs';

export async function demoServer(port = 0, { automatic = true } = {}) {
    let html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
    html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<link\b[^>]*href="https:[^"]*"[^>]*>/gi, '');
    const scripts = ['release', 'auth', 'product-lifecycle', 'archive-operations', 'stock-operations', 'database', 'ui', 'app'];
    const bootstrap = `<script type="module">
        import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js';
        import * as sdk from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js';
        const db = sdk.getFirestore(initializeApp({ projectId: '${project}', apiKey: 'demo-emulator' }));
        sdk.connectFirestoreEmulator(db, '127.0.0.1', 18081, { mockUserToken: { sub: 'demo-owner' } });
        let authListener;
        window.firebaseDb = db;
        window.firebaseAuth = { currentUser: { uid: 'demo-owner' } };
        window.firebaseFunctions = { ...sdk,
            onAuthStateChanged(auth, callback) { authListener = callback; ${automatic ? 'callback(auth.currentUser);' : ''} },
            async signOut(auth) { auth.currentUser = null; authListener(null); },
            async signInWithEmailAndPassword() { throw new Error('Демонстрационный режим: обновите страницу для входа'); }
        };
        window.demoReady = true;
    </script>`;
    html = html.replace('</body>', `<script src="/js/demo-chart.js"></script>${scripts.map(name => `<script src="/js/${name}.js"></script>`).join('')}${bootstrap}</body>`);
    html = html.replace('<body>', '<body><div class="local-demo-banner">Локальная проверка · Тестовые данные Firebase Emulator · Рабочая база магазина не используется</div>');
    const chart = await readFile(new URL('../node_modules/chart.js/dist/chart.umd.js', import.meta.url));
    return startServer({ port, html, assets: { '/js/demo-chart.js': chart } });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const stop = await startEmulator();
    try {
        await seed(archiveFixture());
        const server = await demoServer(8080);
        console.log('Старая админка, тестовая база: http://127.0.0.1:8080');
        const finish = async () => { server.close(); await stop(); process.exit(0); };
        process.on('SIGINT', finish); process.on('SIGTERM', finish);
    } catch (error) { await stop(); throw error; }
}
