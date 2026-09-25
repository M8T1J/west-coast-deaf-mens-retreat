// Offline only: the Admin API is mocked; no registrations or emails are created.
import assert from 'node:assert/strict';
import { harness } from './admin-loading_test.js';

const html = await Deno.readTextFile('admin/index.html');
const rows = ['first', 'second'].map((id) => ({
    id, submitted_at: '2026-09-24T00:00:00Z', full_name: `Synthetic ${id}`,
    email: `${id}@example.com`, registration_status: 'pending',
    payment_status: 'not_started', amount_due: 245,
}));

Deno.test('bulk deletion controls and callable functions are absent; retained controls remain', async () => {
    const h = harness(async () => rows);
    await h.context.startup;
    assert.doesNotMatch(html, /Clear All Data|Delete Selected|select-all-registrations|registration-select-cell/);
    assert.doesNotMatch(h.element('registrations-tbody').innerHTML, /type="checkbox"|registration-select-cell/);
    for (const name of ['clearAllData', 'deleteSelectedRegistrations', 'toggleSelectAllRegistrations', 'toggleRegistrationSelected']) {
        assert.equal(h.run(`typeof ${name}`), 'undefined');
        assert.equal(h.context.window[name], undefined);
    }
    for (const name of ['openAddRegistration', 'refreshData', 'exportToCSV', 'exportToJSON', 'importRegistrationsJSON']) {
        assert.match(html, new RegExp(`onclick="${name}\\(\\)"`));
        assert.equal(h.run(`typeof ${name}`), 'function');
    }
    assert.match(h.element('registrations-tbody').innerHTML, /data-registration-action="edit"/);
    assert.match(h.element('registrations-tbody').innerHTML, /data-registration-action="delete"/);
    assert.equal((html.match(/<th[ >]/g) || []).length, 9);
    assert.equal((h.element('registrations-tbody').innerHTML.match(/<td[ >]/g) || []).length, 18);
    assert.equal(h.writes(), 0);
});

Deno.test('individual Delete requires confirmation, supports cancel, and deletes only its row', async () => {
    let current = rows;
    const h = harness(async (_endpoint, options) => {
        if (options.method === 'DELETE') {
            assert.equal(options.body.id, 'first');
            current = current.filter((row) => row.id !== options.body.id);
            return { id: options.body.id, deleted: true };
        }
        assert.equal(options.method, 'GET');
        return current;
    });
    await h.context.startup;
    const clickDelete = () => h.element('registrations-tbody').listeners.click({
        stopPropagation() {},
        target: { closest: (selector) => selector.startsWith('button') ? {
            getAttribute: (name) => name === 'data-registration-action' ? 'delete' : 'first',
        } : null },
    });
    clickDelete();
    assert.equal(h.element('delete-confirm-overlay').style.display, 'block');
    assert.match(h.element('delete-confirm-message').textContent, /Synthetic first/);
    assert.equal(h.calls.filter((call) => call.method === 'DELETE').length, 0);
    h.element('delete-confirm-cancel').listeners.click();
    assert.equal(h.element('delete-confirm-overlay').style.display, 'none');
    assert.equal(h.calls.filter((call) => call.method === 'DELETE').length, 0);
    clickDelete();
    await h.element('delete-confirm-submit').listeners.click();
    assert.equal(h.calls.filter((call) => call.method === 'DELETE').length, 1);
    assert.equal(h.element('delete-confirm-overlay').style.display, 'none');
    assert.doesNotMatch(h.element('registrations-tbody').innerHTML, /Synthetic first/);
    assert.match(h.element('registrations-tbody').innerHTML, /Synthetic second/);
    assert.equal(h.element('total-count').textContent, 1);
    assert.equal(h.stored(), h.backup);
    assert.equal(h.writes(), 0);
});
