import assert from 'node:assert/strict';
import vm from 'node:vm';
const source = await Deno.readTextFile('supabase-client.js');
Deno.test('client sends session bearer and returns only allowlisted conflict metadata', async () => {
    const calls = [];
    const context = vm.createContext({
        Headers,
        window: { WCDMR_SUPABASE: { url: 'https://database.invalid', publishableKey: 'synthetic-public-key' } },
        fetch: async (url, options) => {
            calls.push({ url, options });
            return new Response(JSON.stringify({ error: 'Duplicate registration', code: 'duplicate_registration', existing_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', raw: 'private-synthetic-data' }), { status: 409 });
        },
    });
    vm.runInContext(source, context);
    await assert.rejects(context.window.wcdmrSupabase.callFunction('admin-registrations', {
        method: 'POST', accessToken: 'synthetic-session-token', body: { request_id: 'synthetic' },
    }), error => error.status === 409 && error.code === 'duplicate_registration' && error.existingId === 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' && !JSON.stringify(error).includes('private-synthetic'));
    assert.equal(calls[0].url, 'https://database.invalid/functions/v1/admin-registrations');
    assert.equal(calls[0].options.headers.get('Authorization'), 'Bearer synthetic-session-token');
    assert.equal(calls[0].options.headers.get('apikey'), 'synthetic-public-key');
});
