// Checks only the static site, never Firebase. No automatic reload of an open form.
window.adminRelease = (() => {
    const version = document.querySelector('meta[name="admin-release"]')?.content;
    let checkedAt = Date.now(), pending = null, outdated = false;
    function notify() {
        if (document.getElementById('admin-update-notice')) return;
        const notice = document.createElement('div');
        notice.id = 'admin-update-notice';
        notice.className = 'admin-update-notice';
        notice.setAttribute('role', 'status');
        const text = document.createElement('span');
        text.textContent = 'Доступна новая версия админки. Сохраните данные открытой формы и обновите страницу';
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn-secondary';
        button.textContent = 'Обновить';
        button.onclick = () => {
            if (document.querySelector('.modal-overlay.active') &&
                !confirm('Обновить страницу? Несохранённые данные открытой формы будут потеряны')) return;
            location.reload();
        };
        notice.append(text, button);
        document.body.prepend(notice);
    }
    async function check() {
        if (outdated) return true;
        if (pending) return pending;
        if (!version || Date.now() - checkedAt < 5 * 60000) return false;
        checkedAt = Date.now();
        pending = (async () => {
            try {
                const url = new URL('./index.html', location.href);
                url.searchParams.set('release-check', String(checkedAt));
                const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(2000) });
                if (!response.ok) return false;
                const html = new DOMParser().parseFromString(await response.text(), 'text/html');
                const latest = html.querySelector('meta[name="admin-release"]')?.content;
                if (latest && latest !== version) { outdated = true; notify(); }
            } catch { /* A static-site outage must not block otherwise valid Firebase operations. */ }
            finally { pending = null; }
            return outdated;
        })();
        return pending;
    }
    window.addEventListener('focus', () => { void check(); });
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) void check();
    });
    return { check, version };
})();
