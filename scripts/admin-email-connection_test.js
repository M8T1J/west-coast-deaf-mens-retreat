// Offline only: synthetic sessions, DOM, storage, and mocked network requests.
import assert from 'node:assert/strict';
import { harness } from './admin-loading_test.js';
const html = await Deno.readTextFile('admin/index.html');
const client = await Deno.readTextFile('supabase-client.js');
const ENDPOINT = 'admin-registrations/email-worker-auth-check';
const PRIVATE = 'synthetic-token private-worker-secret person@example.com';

async function setup(api = async () => ({ result: 'PASS' })) {
    const h = harness((endpoint, options) => endpoint === ENDPOINT ? api(options) : Promise.resolve([]));
    await h.context.startup;
    h.context.AbortController = AbortController;
    const logs = [];
    h.context.console = { error: (...args) => logs.push(args), warn: (...args) => logs.push(args), log: (...args) => logs.push(args) };
    const count = h.calls.length, writes = h.writes(), stored = h.stored();
    const registrations = h.run('JSON.stringify(allRegistrations)');
    return { ...h, logs,
        diagnostics: () => h.calls.slice(count),
        unchanged() {
            assert.equal(h.writes(), writes);
            assert.equal(h.stored(), stored);
            assert.equal(h.run('JSON.stringify(allRegistrations)'), registrations);
            assert.deepEqual(logs, []);
        },
    };
}

Deno.test('temporary button runs only on click using current JWT and bodyless diagnostic GET', async () => {
    assert.match(html, /<button[^>]*id="test-email-connection-btn"[^>]*type="button"[^>]*disabled[^>]*>Test Email Connection<\/button>/);
    assert.match(html, /id="email-connection-result"[^>]*role="status"[^>]*aria-live="polite"/);
    const h = await setup();
    assert.equal(h.diagnostics().length, 0);
    assert.equal(h.element('test-email-connection-btn').disabled, false);
    await h.element('test-email-connection-btn').listeners.click();
    assert.equal(h.element('email-connection-result').textContent, 'PASS');
    const [call] = h.diagnostics();
    assert.equal(h.diagnostics().length, 1);
    assert.equal(call.endpoint, ENDPOINT);
    assert.equal(call.method, 'GET');
    assert.equal(call.accessToken, 'synthetic-token');
    assert.equal(call.body, undefined);
    assert.equal(call.redirect, 'error');
    assert.equal(call.cache, 'no-store');
    assert.ok(call.signal instanceof AbortSignal);
    assert.equal(h.element('test-email-connection-btn').disabled, false);
    h.unchanged();
});

Deno.test('diagnostic displays only FAIL on errors or malformed responses without logging data', async () => {
    for (const value of [{ result: 'FAIL' }, null, {}, [], { result: PRIVATE }, { result: 'PASS', private: PRIVATE }, new Error(PRIVATE)]) {
        const h = await setup(async () => { if (value instanceof Error) throw value; return value; });
        await h.run('testAdminEmailConnection()');
        assert.equal(h.element('email-connection-result').textContent, 'FAIL');
        assert.equal(h.diagnostics().length, 1);
        assert.equal(h.element('test-email-connection-btn').disabled, false);
        h.unchanged();
    }
});

Deno.test('missing or expired sessions never invoke diagnostic; failed load does not trigger it', async () => {
    for (const session of ['null', "{access_token:'synthetic-token', expires_at:1}"]) {
        const h = await setup();
        h.run(`sessionStorage.setItem(WCDMR_ADMIN_SESSION_KEY, JSON.stringify(${session}))`);
        await h.run('testAdminEmailConnection()');
        assert.equal(h.diagnostics().length, 0);
        assert.equal(h.element('email-connection-result').textContent, 'FAIL');
        h.unchanged();
    }
    const h = harness(async () => { throw new Error('unavailable'); });
    await h.context.startup;
    assert.ok(h.calls.every(call => call.endpoint !== ENDPOINT));
});

Deno.test('duplicate clicks make one request; logout or new login discards late PASS', async () => {
    for (const reset of ["lockAdminAccess()", "writeAdminSession({access_token:'replacement-token',expires_at:Date.now()/1000+3600})"]) {
        let resolve, signal;
        const h = await setup(options => { signal = options.signal; return new Promise(r => { resolve = r; }); });
        const first = h.run('testAdminEmailConnection()');
        assert.equal(h.element('test-email-connection-btn').disabled, true);
        await h.run('testAdminEmailConnection()');
        assert.equal(h.diagnostics().length, 1);
        h.run(reset);
        assert.equal(signal.aborted, true);
        assert.equal(h.element('email-connection-result').textContent, '');
        resolve({ result: 'PASS' });
        await first;
        assert.equal(h.element('email-connection-result').textContent, '');
        assert.deepEqual(h.logs, []);
        assert.equal(h.writes(), 0);
    }
});

Deno.test('client timeout aborts once without retries or raw error logs', async () => {
    const h = await setup(options => new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(new Error(PRIVATE)), { once: true });
    }));
    let deadline, cleared = false;
    h.context.setTimeout = (callback, ms) => { assert.equal(ms, 30000); deadline = callback; return 9; };
    h.context.clearTimeout = id => { assert.equal(id, 9); cleared = true; };
    const pending = h.run('testAdminEmailConnection()');
    deadline();
    await pending;
    assert.equal(h.element('email-connection-result').textContent, 'FAIL');
    assert.equal(h.diagnostics().length, 1);
    assert.equal(cleared, true);
    h.unchanged();
});

Deno.test('real client forwards only diagnostic GET, current JWT, signal and redirect/cache protections', async () => {
    const h = await setup();
    h.context.Headers = Headers;
    h.context.window.WCDMR_SUPABASE = { url: 'https://database.invalid', publishableKey: 'synthetic-public-key' };
    const requests = [];
    h.context.fetch = async (url, options) => { requests.push({ url, options }); return new Response('{"result":"PASS"}'); };
    h.run(client);
    await h.run('testAdminEmailConnection()');
    assert.equal(h.element('email-connection-result').textContent, 'PASS');
    assert.equal(requests.length, 1);
    const { url, options } = requests[0];
    assert.equal(url, 'https://database.invalid/functions/v1/admin-registrations/email-worker-auth-check');
    assert.equal(options.method, 'GET');
    assert.equal(options.body, undefined);
    assert.equal(options.headers.get('Authorization'), 'Bearer synthetic-token');
    assert.equal(options.headers.get('apikey'), 'synthetic-public-key');
    assert.equal(options.redirect, 'error');
    assert.equal(options.cache, 'no-store');
    assert.ok(options.signal instanceof AbortSignal);
    h.unchanged();
});
