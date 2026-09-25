(function () {
    function config() {
        const value = window.WCDMR_SUPABASE || {};
        if (!value.url || !value.publishableKey) throw new Error('Supabase public configuration is missing.');
        return value;
    }

    async function request(path, options = {}) {
        const { url, publishableKey } = config();
        const headers = new Headers(options.headers || {});
        headers.set('apikey', publishableKey);
        if (options.body != null) headers.set('Content-Type', 'application/json');
        if (options.accessToken) headers.set('Authorization', `Bearer ${options.accessToken}`);
        const response = await fetch(`${url}${path}`, {
            method: options.method || 'GET',
            headers,
            body: options.body == null ? undefined : JSON.stringify(options.body)
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
            const error = new Error(payload?.error || `Request failed with status ${response.status}`);
            error.status = response.status;
            if (['invalid_details', 'duplicate_registration', 'request_conflict', 'registration_deleted'].includes(payload?.code)) error.code = payload.code;
            if (typeof payload?.existing_id === 'string' && /^[0-9a-f-]{36}$/i.test(payload.existing_id)) error.existingId = payload.existing_id;
            throw error;
        }
        return payload;
    }

    window.wcdmrSupabase = {
        callFunction(name, options = {}) {
            return request(`/functions/v1/${name}`, options);
        },
        signIn(email, password) {
            return request('/auth/v1/token?grant_type=password', {
                method: 'POST',
                body: { email, password }
            });
        }
    };
})();
