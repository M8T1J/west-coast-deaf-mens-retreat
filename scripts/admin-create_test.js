// Uses the real frontend code with mocked DOM/storage/API. No network or browser data.
import assert from 'node:assert/strict';
import { harness } from './admin-loading_test.js';
const ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const fields = {
    first_name: 'Synthetic', last_name: 'Registrant', email: 'test@example.com',
    phone: '555-0100', address_line: 'Synthetic street', city: 'Test city', zip_code: '00000',
    church_name: 'Test church', emergency_name: 'Test contact', emergency_phone: '555-0101',
    amount_due: '245.00', payment_method: 'zelle', admin_reviewed: 'on', bunk_selection: ['Bottom', 'CPAP'],
};
const liveRow = { id: ID, submitted_at: '2026-09-22T00:00:00Z', full_name: 'Synthetic Registrant', email: fields.email, registration_status: 'pending', payment_status: 'not_started', amount_due: 245 };
function open(h) {
    h.run('openAddRegistration()');
    h.element('add-registration-form').values = { ...fields };
}

Deno.test('create form waits for live load and double clicks send only one pending create', async () => {
    let resolve;
    let saved = false;
    const h = harness((_path, options) => options.method === 'GET'
        ? Promise.resolve(saved ? [liveRow] : [])
        : new Promise(r => { resolve = () => { saved = true; r({ id: ID, status: 'created' }); }; }));
    await h.context.startup;
    open(h);
    const first = h.run('submitAddRegistration()');
    await h.run('submitAddRegistration()');
    const posts = h.calls.filter(c => c.method === 'POST');
    assert.equal(posts.length, 1);
    assert.equal(posts[0].body.admin_reviewed, true);
    assert.equal(posts[0].body.registration.amount_due, 245);
    assert.equal(posts[0].body.registration.bunk_selection, 'Bottom, CPAP');
    for (const key of ['payment_status', 'registration_status', 'amount_received', 'turnstileToken']) assert.ok(!(key in posts[0].body.registration));
    assert.equal(h.element('add-registration-submit').disabled, true);
    resolve(); await first;
    assert.equal(h.element('total-count').textContent, 1);
    assert.equal(h.element('add-registration-dialog').open, false);
    assert.equal(h.writes(), 0);
});

Deno.test('lost response retry keeps exact UUID and payload even if form values change', async () => {
    const submissions = [];
    const h = harness(async (_path, options) => {
        if (options.method === 'GET') return [];
        submissions.push(JSON.stringify(options.body));
        if (submissions.length === 1) throw new Error('lost response');
        return { id: ID, status: 'replayed' };
    });
    await h.context.startup; open(h);
    await h.run('submitAddRegistration()');
    assert.match(h.element('add-registration-message').textContent, /Save not confirmed/);
    assert.equal(h.element('add-registration-fields').disabled, true);
    h.element('add-registration-form').values.email = 'changed@example.com';
    h.run('newAdminRegistrationDraft(); closeAddRegistration(); openAddRegistration()');
    await h.run('submitAddRegistration()');
    assert.equal(submissions.length, 2);
    assert.equal(submissions[0], submissions[1]);
    assert.match(h.element('admin-status').textContent, /already saved/);
    assert.equal(h.writes(), 0);
});

Deno.test('confirmed creation plus failed refresh stays unavailable and cannot resubmit saved request', async () => {
    let created = false;
    const h = harness(async (_path, options) => {
        if (options.method === 'POST') { created = true; return { id: ID, status: 'created' }; }
        if (created) throw new Error('offline');
        return [];
    });
    await h.context.startup; open(h);
    await h.run('submitAddRegistration()');
    assert.equal(h.element('total-count').textContent, '—');
    assert.match(h.element('admin-status').textContent, /created.*Registrations unavailable/);
    await h.run('submitAddRegistration()');
    assert.equal(h.calls.filter(c => c.method === 'POST').length, 1);
    assert.equal(h.writes(), 0);
});

Deno.test('known duplicate blocks resubmission and offers existing record, invalid input allows correction', async () => {
    for (const code of ['duplicate_registration', 'request_conflict', 'registration_deleted', 'invalid_details']) {
        const h = harness(async (_path, options) => {
            if (options.method === 'GET') return [];
            throw Object.assign(new Error('conflict'), { code, existingId: ID });
        });
        await h.context.startup; open(h); await h.run('submitAddRegistration()');
        assert.equal(h.element('add-registration-submit').disabled, code !== 'invalid_details');
        if (code === 'duplicate_registration') assert.equal(h.element('add-registration-existing').hidden, false);
        if (code !== 'invalid_details') {
            await h.run('submitAddRegistration()');
            assert.equal(h.calls.filter(c => c.method === 'POST').length, 1);
        }
        assert.equal(h.writes(), 0);
    }
});

Deno.test('late create response after logout cannot restore list or success notice', async () => {
    let resolve;
    const h = harness((_path, options) => options.method === 'GET' ? Promise.resolve([]) : new Promise(r => { resolve = r; }));
    await h.context.startup; open(h);
    const request = h.run('submitAddRegistration()');
    h.run('lockAdminAccess()');
    resolve({ id: ID, status: 'created' }); await request;
    assert.equal(h.element('admin-app-shell').style.display, 'none');
    assert.equal(h.run('adminCreateAttempt'), null);
    assert.equal(h.calls.filter(c => c.method === 'GET').length, 1);
});

Deno.test('live registration fields render as text rather than injected HTML', async () => {
    const h = harness(async () => [{ ...liveRow, full_name: '<img src=x onerror=alert(1)>' }]);
    await h.context.startup;
    assert.doesNotMatch(h.element('registrations-tbody').innerHTML, /<img/);
    assert.match(h.element('registrations-tbody').innerHTML, /&lt;img/);
});
