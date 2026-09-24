import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
export const project = 'demo-merch-archive';
export const emulator = 'http://127.0.0.1:18081';
export function run(cmd, args) {
    return new Promise((resolve, reject) => {
        const p = spawn(cmd, args, { stdio: 'inherit', windowsHide: true });
        p.on('error', reject); p.on('exit', code => code === 0 ? resolve() : reject(new Error(`${cmd}: ${code}`)));
    });
}
export async function startEmulator() {
    const container = 'merch-archive-local-' + process.pid;
    const jar = new URL('../output/firestore.jar', import.meta.url);
    const bytes = await readFile(jar);
    if (createHash('sha256').update(bytes).digest('hex') !== '9b6498b7f62714d67f48f59b3818883cd682dbcd46b9f59511de81c97bb5166c')
        throw new Error('Run npm test first to download the verified Firestore emulator');
    await run('docker', ['run', '--detach', '--rm', '--name', container,
        '--publish', '127.0.0.1:18081:8080', '--mount', `type=bind,source=${fileURLToPath(jar)},target=/work/firestore.jar,readonly`,
        '--mount', `type=bind,source=${fileURLToPath(new URL('../tests/lifecycle.rules', import.meta.url))},target=/work/firestore.rules,readonly`,
        'eclipse-temurin:21-jre', 'java', '-jar', '/work/firestore.jar', '--host', '0.0.0.0', '--port', '8080',
        '--project_id', project, '--single_project_mode', '--single_project_mode_error', '--rules', '/work/firestore.rules']);
    const stop = () => run('docker', ['stop', container]);
    try {
        for (let n = 0; n < 45; n++) {
            try { const r = await fetch(emulator, { signal: AbortSignal.timeout(1000) }); if (r) return stop; } catch {}
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        throw new Error('Archive emulator did not start');
    } catch (e) { await stop(); throw e; }
}
function field(value) {
    if (value === null) return { nullValue: null };
    if (value instanceof Date) return { timestampValue: value.toISOString() };
    if (typeof value === 'boolean') return { booleanValue: value };
    if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
    if (typeof value === 'string') return { stringValue: value };
    if (Array.isArray(value)) return { arrayValue: { values: value.map(field) } };
    return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([k,v]) => [k, field(v)])) } };
}
export async function seed(rows, clear = true) {
    // Admin test identity exists only on a loopback demo emulator.
    if (!project.startsWith('demo-') || new URL(emulator).hostname !== '127.0.0.1') throw new Error('Local emulator required');
    if (clear) {
        const r = await fetch(`${emulator}/emulator/v1/projects/${project}/databases/(default)/documents`, { method: 'DELETE' });
        if (!r.ok) throw new Error('Emulator reset failed');
    }
    const result = await fetch(`${emulator}/v1/projects/${project}/databases/(default)/documents:commit`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
        body: JSON.stringify({ writes: Object.entries(rows).map(([path, data]) => ({ update: {
            name: `projects/${project}/databases/(default)/documents/${path}`, fields: field(data).mapValue.fields
        } })) })
    });
    if (!result.ok) throw new Error('Emulator seed failed: ' + await result.text());
}
