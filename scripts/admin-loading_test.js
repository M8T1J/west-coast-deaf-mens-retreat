// Offline regression tests: DOM, storage, authentication, and API are synthetic.
// Run: deno test --node-modules-dir=none --no-lock --cached-only --allow-read=admin-app.js scripts/admin-loading_test.js
import assert from 'node:assert/strict';
import vm from 'node:vm';

const source = await Deno.readTextFile('admin-app.js');
const row = {
    id: 'synthetic-id', submitted_at: '2026-09-22T00:00:00Z',
    full_name: 'Synthetic Registrant', email: 'test@example.com',
    registration_status: 'pending', payment_status: 'not_started', amount_due: 245,
};

function harness(api) {
    const elements = new Map();
    const element = (id) => {
        if (!elements.has(id)) elements.set(id, {
            style: {}, value: '', textContent: '', innerHTML: '', disabled: false,
            addEventListener() {}, focus() {},
        });
        return elements.get(id);
    };
    const controls = ['search-box', 'select-all-registrations', 'export-csv', 'export-json', 'edit-save-btn', 'edit-verify-payment-btn', 'delete-confirm-submit'];
    const backup = JSON.stringify([{ fullName: 'Local Only', email: 'local@example.com' }]);
    let storedBackup = backup;
    let writes = 0;
    let session = JSON.stringify({ access_token: 'synthetic-token', expires_at: Date.now() / 1000 + 3600 });
    const calls = [];
    const context = vm.createContext({
        console: { warn() {}, error() {} },
        setTimeout: () => 1, clearTimeout() {},
        document: {
            body: { style: {} },
            getElementById(id) { return id.endsWith('-overlay') ? null : element(id); },
            querySelectorAll(selector) { return selector.startsWith('[data-requires') ? controls.map(element) : []; },
        },
        sessionStorage: { getItem: () => session, setItem: (_key, value) => { session = value; }, removeItem: () => { session = null; } },
        localStorage: { getItem: () => storedBackup, setItem: (_key, value) => { storedBackup = value; writes++; } },
        window: { wcdmrSupabase: {
            callFunction: (endpoint, options) => { calls.push({ endpoint, ...options }); return api(endpoint, options); },
            signIn: async () => ({ access_token: 'synthetic-token', expires_at: Date.now() / 1000 + 3600 }),
        } },
        alert() { throw new Error('Unexpected alert/export'); },
    });
    vm.runInContext(source.replace('initializeAdminAccess();', 'globalThis.startup = initializeAdminAccess();'), context);
    return {
        context, element, calls, controls, backup,
        run: (code) => vm.runInContext(code, context),
        stored: () => storedBackup, writes: () => writes,
    };
}
function assertUnavailable(h) {
    assert.equal(h.element('total-count').textContent, '—');
    assert.match(h.element('registrations-tbody').innerHTML, /Registrations unavailable/);
    assert.doesNotMatch(h.element('registrations-tbody').innerHTML, /Local Only|Synthetic Registrant/);
    assert.match(h.element('admin-status').textContent, /Registrations unavailable/);
    for (const id of h.controls) assert.equal(h.element(id).disabled, true, id);
}

Deno.test('failed initial load never exposes backup; actions are blocked; login also stays unavailable', async () => {
    const h = harness(async () => { throw new Error('offline'); });
    await h.context.startup;
    assertUnavailable(h);
    await h.run("exportToCSV(); exportToJSON(); editRegistration('synthetic-id'); deleteRegistration('synthetic-id'); deleteSelectedRegistrations();");
    await assert.rejects(h.run("verifyManualPayment({id:'synthetic-id'}, 245)"), /unavailable/);
    h.run('renderCurrentRegistrationsView()');
    assertUnavailable(h);
    h.element('admin-email').value = 'admin@example.com';
    h.element('admin-passcode').value = 'synthetic-password';
    await h.run('handleAdminAuthSubmit()');
    assertUnavailable(h);
    assert.equal(h.stored(), h.backup);
    assert.equal(h.writes(), 0);
    assert.ok(h.calls.every(call => call.method === 'GET'));
});

Deno.test('live success, failed refresh, and empty live recovery are distinct', async () => {
    let result = [row];
    const h = harness(async () => { if (result instanceof Error) throw result; return result; });
    await h.context.startup;
    assert.equal(h.element('total-count').textContent, 1);
    assert.match(h.element('registrations-tbody').innerHTML, /Synthetic Registrant/);
    const liveBackup = h.stored();
    result = new Error('401');
    await h.run('refreshData()');
    assertUnavailable(h);
    assert.equal(h.stored(), liveBackup);
    result = [];
    assert.equal(await h.run('loadRegistrations()'), true);
    assert.equal(h.element('total-count').textContent, 0);
    assert.match(h.element('registrations-tbody').innerHTML, /No synced registrations/);
    assert.equal(h.element('export-json').disabled, false);
    assert.equal(h.stored(), h.backup);
    assert.equal(h.writes(), 0);
});

Deno.test('malformed live responses leave backups untouched', async () => {
    for (const value of [null, {}, [{ id: 'incomplete' }]]) {
        const h = harness(async () => value);
        await h.context.startup;
        assertUnavailable(h);
        assert.equal(h.stored(), h.backup);
        assert.equal(h.writes(), 0);
    }
});

Deno.test('late responses cannot overwrite newer failure or restore data after logout', async () => {
    const pending = [];
    const h = harness(() => new Promise((resolve, reject) => pending.push({ resolve, reject })));
    assert.equal(h.element('total-count').textContent, '—');
    assert.equal(h.element('export-json').disabled, true);
    const newer = h.run('loadRegistrations()');
    pending[1].reject(new Error('offline'));
    await newer;
    pending[0].resolve([row]);
    await h.context.startup;
    assertUnavailable(h);
    const last = h.run('loadRegistrations()');
    h.run('lockAdminAccess()');
    pending[2].resolve([row]);
    assert.equal(await last, false);
    assert.equal(h.run('allRegistrations.length'), 0);
    assert.equal(h.element('admin-app-shell').style.display, 'none');
    assert.equal(h.writes(), 0);
});
