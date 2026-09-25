/**
 * WCDMR registration admin with shared cross-device sync.
 */
let allRegistrations = [];
let registrationLoadState = 'unavailable';
let registrationLoadGeneration = 0;
let adminCreateAttempt = null;
let adminStatusTimer = null;
let wcdmrDeleteDialogState = null;
const WCDMR_ADMIN_SESSION_KEY = 'wcdmr_admin_session';

function setAdminAuthError(message = '') {
    const errorEl = document.getElementById('admin-auth-error');
    if (!errorEl) return;
    errorEl.textContent = message;
    errorEl.style.display = message ? 'block' : 'none';
}

function setAdminShellVisibility(isUnlocked) {
    const authShell = document.getElementById('admin-auth-shell');
    const appShell = document.getElementById('admin-app-shell');
    if (authShell) authShell.style.display = isUnlocked ? 'none' : 'flex';
    if (appShell) appShell.style.display = isUnlocked ? 'block' : 'none';
    if (!isUnlocked) {
        const passcodeInput = document.getElementById('admin-passcode');
        if (passcodeInput) {
            passcodeInput.value = '';
            try { passcodeInput.focus(); } catch { /* ignore */ }
        }
    }
}

function readAdminSession() {
    try {
        const raw = sessionStorage.getItem(WCDMR_ADMIN_SESSION_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
        return null;
    }
}

function writeAdminSession(session) {
    if (!session?.access_token) return;
    try {
        sessionStorage.setItem(WCDMR_ADMIN_SESSION_KEY, JSON.stringify(session));
    } catch {
        /* ignore */
    }
}

function clearAdminSession() {
    try {
        sessionStorage.removeItem(WCDMR_ADMIN_SESSION_KEY);
    } catch {
        /* ignore */
    }
}

function hasValidAdminSession() {
    const session = readAdminSession();
    return Boolean(session?.access_token && Number(session.expires_at) * 1000 > Date.now());
}

function encodeUtf8Bytes(value) {
    const bytes = [];
    const text = String(value || '');
    for (let index = 0; index < text.length; index += 1) {
        let codePoint = text.codePointAt(index);
        if (codePoint > 0xffff) {
            index += 1;
        }
        if (codePoint <= 0x7f) {
            bytes.push(codePoint);
        } else if (codePoint <= 0x7ff) {
            bytes.push(0xc0 | (codePoint >> 6));
            bytes.push(0x80 | (codePoint & 0x3f));
        } else if (codePoint <= 0xffff) {
            bytes.push(0xe0 | (codePoint >> 12));
            bytes.push(0x80 | ((codePoint >> 6) & 0x3f));
            bytes.push(0x80 | (codePoint & 0x3f));
        } else {
            bytes.push(0xf0 | (codePoint >> 18));
            bytes.push(0x80 | ((codePoint >> 12) & 0x3f));
            bytes.push(0x80 | ((codePoint >> 6) & 0x3f));
            bytes.push(0x80 | (codePoint & 0x3f));
        }
    }
    return bytes;
}

function rightRotate(value, amount) {
    return (value >>> amount) | (value << (32 - amount));
}

function sha256HexFallback(value) {
    const bytes = encodeUtf8Bytes(value);
    const bitLength = bytes.length * 8;
    bytes.push(0x80);
    while ((bytes.length % 64) !== 56) {
        bytes.push(0);
    }

    const highLength = Math.floor(bitLength / 0x100000000);
    const lowLength = bitLength >>> 0;
    for (let shift = 24; shift >= 0; shift -= 8) {
        bytes.push((highLength >>> shift) & 0xff);
    }
    for (let shift = 24; shift >= 0; shift -= 8) {
        bytes.push((lowLength >>> shift) & 0xff);
    }

    const hash = [
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
        0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
    ];
    const roundConstants = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ];

    for (let offset = 0; offset < bytes.length; offset += 64) {
        const words = new Array(64);
        for (let index = 0; index < 16; index += 1) {
            const start = offset + (index * 4);
            words[index] = ((bytes[start] << 24) | (bytes[start + 1] << 16) | (bytes[start + 2] << 8) | bytes[start + 3]) >>> 0;
        }
        for (let index = 16; index < 64; index += 1) {
            const s0 = rightRotate(words[index - 15], 7) ^ rightRotate(words[index - 15], 18) ^ (words[index - 15] >>> 3);
            const s1 = rightRotate(words[index - 2], 17) ^ rightRotate(words[index - 2], 19) ^ (words[index - 2] >>> 10);
            words[index] = (words[index - 16] + s0 + words[index - 7] + s1) >>> 0;
        }

        let [a, b, c, d, e, f, g, h] = hash;
        for (let index = 0; index < 64; index += 1) {
            const s1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
            const choice = (e & f) ^ (~e & g);
            const temp1 = (h + s1 + choice + roundConstants[index] + words[index]) >>> 0;
            const s0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
            const majority = (a & b) ^ (a & c) ^ (b & c);
            const temp2 = (s0 + majority) >>> 0;

            h = g;
            g = f;
            f = e;
            e = (d + temp1) >>> 0;
            d = c;
            c = b;
            b = a;
            a = (temp1 + temp2) >>> 0;
        }

        hash[0] = (hash[0] + a) >>> 0;
        hash[1] = (hash[1] + b) >>> 0;
        hash[2] = (hash[2] + c) >>> 0;
        hash[3] = (hash[3] + d) >>> 0;
        hash[4] = (hash[4] + e) >>> 0;
        hash[5] = (hash[5] + f) >>> 0;
        hash[6] = (hash[6] + g) >>> 0;
        hash[7] = (hash[7] + h) >>> 0;
    }

    return hash.map((part) => part.toString(16).padStart(8, '0')).join('');
}

async function sha256Hex(value) {
    const cryptoApi = typeof globalThis !== 'undefined' ? globalThis.crypto : null;
    if (cryptoApi && cryptoApi.subtle) {
        try {
            const bytes = typeof TextEncoder !== 'undefined'
                ? new TextEncoder().encode(String(value || ''))
                : Uint8Array.from(encodeUtf8Bytes(value));
            const digest = await cryptoApi.subtle.digest('SHA-256', bytes);
            return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
        } catch (error) {
            console.warn('Web Crypto hashing failed, using compatibility fallback instead.', error);
        }
    }
    return sha256HexFallback(value);
}

function lockAdminAccess(message = '') {
    clearAdminSession();
    adminCreateAttempt = null;
    const createDialog = document.getElementById('add-registration-dialog');
    if (createDialog?.open) createDialog.close();
    document.getElementById('add-registration-form')?.reset();
    registrationLoadGeneration++;
    registrationLoadState = 'unavailable';
    updateRegistrationControls();
    allRegistrations = [];
    displayRegistrations([]);
    updateStats();
    setAdminStatus('');
    setAdminAuthError(message);
    setAdminShellVisibility(false);
}

function requireAdminAccess() {
    if (hasValidAdminSession()) return true;
    lockAdminAccess('Session expired. Sign in again.');
    return false;
}

async function handleAdminAuthSubmit(event) {
    if (event && typeof event.preventDefault === 'function') {
        event.preventDefault();
    }

    const email = String(document.getElementById('admin-email')?.value || '').trim();
    const password = String(document.getElementById('admin-passcode')?.value || '');

    if (!email || !password) {
        setAdminAuthError('Enter your admin email and password.');
        return;
    }
    if (!window.wcdmrSupabase) {
        setAdminAuthError('Admin sign-in is not configured on this page.');
        return;
    }

    try {
        const session = await window.wcdmrSupabase.signIn(email, password);
        writeAdminSession(session);
    } catch (error) {
        console.error('Unable to sign in as admin:', error);
        setAdminAuthError('Unable to sign in with those credentials.');
        return;
    }

    setAdminAuthError('');
    setAdminShellVisibility(true);
    await loadRegistrations();
}

async function initializeAdminAccess() {
    const authForm = document.getElementById('admin-auth-form');
    if (authForm) {
        authForm.addEventListener('submit', handleAdminAuthSubmit);
    }

    const logoutBtn = document.getElementById('admin-logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            lockAdminAccess('Admin locked. Sign in to reopen registrations.');
        });
    }

    if (hasValidAdminSession()) {
        setAdminShellVisibility(true);
        await loadRegistrations();
        return;
    }

    lockAdminAccess('');
}

function requireLiveRegistrations() {
    if (!requireAdminAccess()) return false;
    if (registrationLoadState === 'ready') return true;
    setAdminStatus('Registrations unavailable. Refresh to load live data before continuing.', 'error');
    return false;
}

function updateRegistrationControls() {
    const disabled = registrationLoadState !== 'ready';
    document.querySelectorAll('[data-requires-live-registrations], #search-box, #edit-save-btn, #edit-verify-payment-btn, #delete-confirm-submit').forEach((control) => {
        control.disabled = disabled;
    });
    if (disabled) {
        const edit = document.getElementById('edit-registration-overlay');
        if (edit && edit.style.display === 'block') {
            edit.style.display = 'none';
            document.body.style.overflow = wcdmrBodyOverflowBeforeEdit;
        }
        closeDeleteConfirmDialog();
    }
    updateAdminCreateControls();
}

function registrationKey(reg) {
    return String(reg?.id || reg?.timestamp || '');
}

function setAdminStatus(message, tone = 'info') {
    const status = document.getElementById('admin-status');
    if (!status) return;

    if (adminStatusTimer) {
        clearTimeout(adminStatusTimer);
        adminStatusTimer = null;
    }

    if (!message) {
        status.textContent = '';
        status.className = 'admin-status';
        return;
    }

    status.textContent = message;
    status.className = `admin-status is-visible is-${tone}`;

    if (tone !== 'error') {
        adminStatusTimer = setTimeout(() => {
            status.textContent = '';
            status.className = 'admin-status';
            adminStatusTimer = null;
        }, 5000);
    }
}

const WCDMR_DEFAULT_FEE_ANCHOR = 245;
const WCDMR_REGISTRATION_STORAGE_KEY = 'wcdmr_registrations';
const WCDMR_REGISTRATION_LIMIT = 500;

function safeParseRegistrations(rawValue) {
    if (!rawValue) return [];

    try {
        const parsed = JSON.parse(rawValue);
        return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item === 'object') : [];
    } catch {
        return [];
    }
}

function toTimestampValue(value) {
    const parsed = Date.parse(value || '');
    return Number.isFinite(parsed) ? parsed : 0;
}

function sortRegistrationsNewestFirst(registrations) {
    return [...registrations].sort((a, b) => toTimestampValue(b.timestamp) - toTimestampValue(a.timestamp));
}

function limitRegistrations(registrations) {
    const sorted = sortRegistrationsNewestFirst(registrations);
    return sorted.slice(0, WCDMR_REGISTRATION_LIMIT);
}

function buildRegistrationKey(registration, fallbackIndex) {
    if (registration.timestamp) return `timestamp:${registration.timestamp}`;

    const email = String(registration.email || '').trim().toLowerCase();
    const paymentId = String(registration.paymentId || '').trim();
    if (email || paymentId) return `identity:${email}|${paymentId}|${registration.status || ''}`;

    return `fallback:${fallbackIndex}`;
}

function shouldReplaceRegistration(existing, incoming) {
    if (!existing) return true;

    if (existing.status === 'pending' && incoming.status === 'completed') {
        return true;
    }

    return toTimestampValue(incoming.timestamp) >= toTimestampValue(existing.timestamp);
}

function mergeRegistrations(...sources) {
    const merged = new Map();
    let fallbackIndex = 0;

    for (const source of sources) {
        if (!Array.isArray(source)) continue;

        for (const item of source) {
            if (!item || typeof item !== 'object') continue;

            const key = buildRegistrationKey(item, fallbackIndex++);
            const existing = merged.get(key);
            if (shouldReplaceRegistration(existing, item)) {
                merged.set(key, item);
            }
        }
    }

    return limitRegistrations(Array.from(merged.values()));
}

function readLocalRegistrations() {
    try {
        return safeParseRegistrations(localStorage.getItem(WCDMR_REGISTRATION_STORAGE_KEY));
    } catch {
        return [];
    }
}

function persistLocalRegistrations(registrations) {
    const limited = limitRegistrations(registrations);
    try {
        localStorage.setItem(WCDMR_REGISTRATION_STORAGE_KEY, JSON.stringify(limited));
    } catch (error) {
        console.warn('Unable to persist registration backup in this browser:', error);
    }
    return limited;
}

function mapSupabaseRegistration(row) {
    return {
        id: row.id,
        timestamp: row.submitted_at,
        firstName: row.first_name,
        lastName: row.last_name,
        fullName: row.full_name,
        email: row.email,
        phone: row.phone,
        videophone: row.videophone || '',
        fullAddress: row.full_address,
        churchName: row.church_name,
        emergencyName: row.emergency_name,
        emergencyPhone: row.emergency_phone,
        bunkSelection: row.bunk_selection || '',
        youthInfo: row.youth_info || '',
        paymentId: row.payment_provider_transaction_id || '',
        paymentMethod: row.payment_method || '',
        paymentStatus: row.payment_status,
        amount: row.amount_due,
        status: row.registration_status === 'completed' ? 'completed' : 'pending'
    };
}

function isValidSupabaseRegistrationCollection(rows) {
    return Array.isArray(rows) && rows.every((row) => (
        row && typeof row === 'object' &&
        typeof row.id === 'string' && row.id &&
        typeof row.submitted_at === 'string' &&
        typeof row.full_name === 'string' &&
        typeof row.email === 'string' &&
        typeof row.registration_status === 'string' &&
        typeof row.payment_status === 'string'
    ));
}

function adminAccessToken() { return readAdminSession()?.access_token || ''; }

async function callAdminRegistrations(method, body) {
    if (method !== 'GET' && !requireLiveRegistrations()) throw new Error('Live registrations unavailable.');
    if (!window.wcdmrSupabase) throw new Error('Supabase admin service is unavailable.');
    const endpoint = method === 'GET' ? 'admin-registrations?limit=500' : 'admin-registrations';
    return window.wcdmrSupabase.callFunction(endpoint, {
        method,
        body,
        accessToken: adminAccessToken()
    });
}

function amountToDollarsNumber(raw) {
    if (raw == null || raw === '') return 0;
    let n = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(/,/g, ''));
    if (Number.isNaN(n)) return 0;
    if (typeof window !== 'undefined' && typeof window.registrationAmountToDollarsNumber === 'function') {
        return window.registrationAmountToDollarsNumber(n);
    }
    const anchor = WCDMR_DEFAULT_FEE_ANCHOR;
    if (Number.isInteger(n) && n >= 1000 && anchor > 0) {
        const ratio = n / anchor;
        if (ratio >= 99 && ratio <= 101) return n / 100;
    }
    return n;
}

function formatAmountDisplay(raw) {
    return amountToDollarsNumber(raw).toFixed(2);
}

function formatPaymentStatus(status) {
    return String(status || 'not started')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

async function persistRegistrations(next) {
    const changed = next.find((item) => {
        const previous = allRegistrations.find((existing) => existing.id === item.id);
        return previous && JSON.stringify(previous) !== JSON.stringify(item);
    });
    if (!changed?.id) return false;
    const changes = {
        first_name: changed.firstName,
        last_name: changed.lastName,
        email: changed.email,
        phone: changed.phone,
        videophone: changed.videophone,
        full_address: changed.fullAddress,
        church_name: changed.churchName,
        bunk_selection: changed.bunkSelection,
        youth_info: changed.youthInfo,
        emergency_name: changed.emergencyName,
        emergency_phone: changed.emergencyPhone,
        payment_provider_transaction_id: changed.paymentId || null,
        amount_due: changed.amount
    };
    if (changed.paymentMethod) changes.payment_method = changed.paymentMethod;
    await callAdminRegistrations('PATCH', {
        id: changed.id,
        changes
    });
    return true;
}

async function verifyManualPayment(registration, amountReceived) {
    await callAdminRegistrations('PATCH', {
        id: registration.id,
        changes: {
            payment_status: 'verified',
            amount_received: amountReceived
        }
    });
}

async function loadRegistrations() {
    if (!requireAdminAccess()) return false;
    const generation = ++registrationLoadGeneration;
    registrationLoadState = 'loading';
    allRegistrations = [];
    updateRegistrationControls();
    displayRegistrations();
    updateStats();
    setAdminStatus('Loading live registrations...', 'info');
    try {
        const rows = await callAdminRegistrations('GET');
        if (generation !== registrationLoadGeneration) return false;
        if (!requireAdminAccess()) return false;
        if (!isValidSupabaseRegistrationCollection(rows)) {
            throw new Error('Supabase returned an invalid registration collection.');
        }
        allRegistrations = rows.map(mapSupabaseRegistration);
        registrationLoadState = 'ready';
        // Keep browser safety backups intact; live Admin data stays in memory.
        updateRegistrationControls();
        renderCurrentRegistrationsView();
        setAdminStatus('');
        return true;
    } catch (error) {
        if (generation !== registrationLoadGeneration) return false;
        registrationLoadState = 'unavailable';
        allRegistrations = [];
        updateRegistrationControls();
        displayRegistrations();
        updateStats();
        console.warn('Unable to load Supabase registrations.', error);
        setAdminStatus('Registrations unavailable. Unable to load live data. Please try Refresh. Local safety backups are preserved.', 'error');
        return false;
    }
}

function getSearchTerm() {
    const searchBox = document.getElementById('search-box');
    return searchBox ? String(searchBox.value || '').toLowerCase() : '';
}

function getFilteredRegistrations(searchTerm = getSearchTerm()) {
    if (!searchTerm) return allRegistrations;
    return allRegistrations.filter((reg) => {
        const fullName = (reg.fullName || `${reg.firstName || ''} ${reg.lastName || ''}`).toLowerCase();
        const email = (reg.email || '').toLowerCase();
        const church = (reg.churchName || '').toLowerCase();
        return fullName.includes(searchTerm) || email.includes(searchTerm) || church.includes(searchTerm);
    });
}

function renderCurrentRegistrationsView() {
    const searchTerm = getSearchTerm();
    if (searchTerm) {
        displayRegistrations(getFilteredRegistrations(searchTerm));
    } else {
        displayRegistrations();
    }
    updateStats();
}

function displayRegistrations(filtered = null) {
    const tbody = document.getElementById('registrations-tbody');
    if (registrationLoadState !== 'ready') {
        tbody.innerHTML = `<tr><td colspan="9" class="empty-state"><p>${registrationLoadState === 'loading' ? 'Loading live registrations...' : 'Registrations unavailable'}</p></td></tr>`;
        return;
    }
    const registrations = filtered || allRegistrations;

    if (registrations.length === 0) {
        tbody.innerHTML = `
                    <tr>
                        <td colspan="9" class="empty-state">
                            <div class="empty-state-icon">📋</div>
                            <p>No synced registrations found yet.</p>
                        </td>
                    </tr>
                `;
        return;
    }

    tbody.innerHTML = registrations.map(reg => {
        const date = new Date(reg.timestamp).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        const amount = formatAmountDisplay(reg.amount);
        const statusClass = reg.status === 'completed' ? 'status-completed' : 'status-pending';
        const statusText = reg.status === 'completed' ? 'Completed' : 'Pending';
        const key = registrationKey(reg);

        return `
                    <tr style="cursor: pointer;" data-registration-key="${key}">
                        <td>${date}</td>
                        <td><strong>${escapeHtml(reg.fullName || `${reg.firstName || ''} ${reg.lastName || ''}`.trim())}</strong></td>
                        <td>${escapeHtml(reg.email)}</td>
                        <td>${escapeHtml(reg.phone || '-')}</td>
                        <td>${escapeHtml(reg.churchName || '-')}</td>
                        <td>$${amount}</td>
                        <td><code style="font-size: 0.75rem;">${escapeHtml(reg.paymentId || '-')}</code></td>
                        <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                        <td class="registration-action-cell">
                            <div class="registration-action-buttons">
                                <button class="btn btn-outline" style="padding: 0.35rem 0.6rem; font-size: 0.9rem;" data-registration-action="edit" data-registration-key="${key}" type="button">Edit</button>
                                <button class="btn btn-danger" style="padding: 0.35rem 0.6rem; font-size: 0.9rem;" data-registration-action="delete" data-registration-key="${key}" type="button">Delete</button>
                            </div>
                        </td>
                    </tr>
                `;
    }).join('');
}

async function deleteRegistration(timestamp) {
    if (!requireLiveRegistrations()) return;
    const key = String(timestamp || '');
    if (!key) return;
    const reg = allRegistrations.find((item) => registrationKey(item) === key);
    if (!reg) return;
    const label = reg.fullName || `${reg.firstName || ''} ${reg.lastName || ''}`.trim() || 'this registration';
    openDeleteConfirmDialog({
        title: 'Delete registration?',
        message: `Delete ${label}? This cannot be undone.`,
        confirmLabel: 'Delete registration',
        onConfirm: async () => {
            await callAdminRegistrations('DELETE', { id: reg.id });
            const loaded = await loadRegistrations();
            if (loaded) setAdminStatus(`Deleted ${label}.`, 'success');
        }
    });
}

function showDetails(key) {
    if (!requireLiveRegistrations()) return;
    const reg = allRegistrations.find((registration) => registrationKey(registration) === key);
    if (!reg) return;

    const details = `
Registration Details
===================
Date: ${new Date(reg.timestamp).toLocaleString()}
Status: ${reg.status}

Personal Information:
- Name: ${reg.fullName || `${reg.firstName || ''} ${reg.lastName || ''}`.trim()}
- Email: ${reg.email}
- Phone: ${reg.phone || '-'}
- Videophone: ${reg.videophone || '-'}
- Address: ${reg.fullAddress || '-'}
- Church: ${reg.churchName || '-'}

Emergency Contact:
- Name: ${reg.emergencyName || '-'}
- Phone: ${reg.emergencyPhone || '-'}

Accommodation:
- Bunk Selection: ${reg.bunkSelection || '-'}
- Youth Info: ${reg.youthInfo || 'N/A'}

Payment:
- Amount: $${formatAmountDisplay(reg.amount)}
- Payment ID: ${reg.paymentId || '-'}
            `;

    alert(details);
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function ensureDeleteConfirmDialog() {
    let root = document.getElementById('delete-confirm-overlay');
    if (root) return root;

    root = document.createElement('div');
    root.id = 'delete-confirm-overlay';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'delete-confirm-title');
    root.style.cssText =
        'display:none;position:fixed;inset:0;z-index:2147483647;overflow-y:auto;-webkit-overflow-scrolling:touch;' +
        'padding:16px;box-sizing:border-box;background:rgba(17,24,39,0.55);';
    root.innerHTML = `
        <div style="background:#fff;max-width:520px;width:100%;margin:24px auto;border-radius:12px;box-shadow:0 25px 50px -12px rgba(0,0,0,0.25);overflow:hidden;">
            <div style="padding:1.1rem 1.25rem;border-bottom:1px solid #e5e7eb;">
                <h3 id="delete-confirm-title" style="margin:0;font-size:1.2rem;">Delete registration?</h3>
            </div>
            <div style="padding:1rem 1.25rem;">
                <p id="delete-confirm-message" style="margin:0;color:#374151;line-height:1.6;"></p>
            </div>
            <div style="padding:0.9rem 1.25rem;border-top:1px solid #e5e7eb;display:flex;justify-content:flex-end;gap:0.75rem;flex-wrap:wrap;">
                <button type="button" id="delete-confirm-cancel" class="btn btn-outline">Cancel</button>
                <button type="button" id="delete-confirm-submit" class="btn btn-danger">Delete</button>
            </div>
        </div>
    `;
    document.body.appendChild(root);

    root.addEventListener('click', (event) => {
        if (event.target === root) {
            closeDeleteConfirmDialog();
        }
    });
    root.querySelector('#delete-confirm-cancel')?.addEventListener('click', () => {
        closeDeleteConfirmDialog();
    });
    root.querySelector('#delete-confirm-submit')?.addEventListener('click', async () => {
        if (!wcdmrDeleteDialogState || typeof wcdmrDeleteDialogState.onConfirm !== 'function') {
            closeDeleteConfirmDialog();
            return;
        }
        const submitBtn = root.querySelector('#delete-confirm-submit');
        const cancelBtn = root.querySelector('#delete-confirm-cancel');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Deleting...';
        }
        if (cancelBtn) cancelBtn.disabled = true;
        try {
            await wcdmrDeleteDialogState.onConfirm();
        } finally {
            closeDeleteConfirmDialog();
        }
    });

    return root;
}

function closeDeleteConfirmDialog() {
    const root = document.getElementById('delete-confirm-overlay');
    if (!root) return;
    root.style.display = 'none';
    const submitBtn = root.querySelector('#delete-confirm-submit');
    const cancelBtn = root.querySelector('#delete-confirm-cancel');
    if (submitBtn) {
        submitBtn.disabled = registrationLoadState !== 'ready';
        submitBtn.textContent = 'Delete';
    }
    if (cancelBtn) cancelBtn.disabled = false;
    wcdmrDeleteDialogState = null;
}

function openDeleteConfirmDialog({ title, message, confirmLabel, onConfirm }) {
    const root = ensureDeleteConfirmDialog();
    const titleEl = root.querySelector('#delete-confirm-title');
    const messageEl = root.querySelector('#delete-confirm-message');
    const submitBtn = root.querySelector('#delete-confirm-submit');
    if (titleEl) titleEl.textContent = title || 'Delete registration?';
    if (messageEl) messageEl.textContent = message || 'Delete this registration?';
    if (submitBtn) submitBtn.textContent = confirmLabel || 'Delete';
    wcdmrDeleteDialogState = { onConfirm };
    root.style.display = 'block';
}

const WCDMR_EDIT_INPUT_STYLE =
    'width:100%;box-sizing:border-box;padding:0.65rem 0.75rem;border:1px solid #cbd5e1;border-radius:8px;font-size:1rem;background:#fff;';
const WCDMR_EDIT_LABEL_STYLE = 'display:block;font-weight:600;margin:0 0 0.25rem 0;color:#111827;';

let wcdmrBodyOverflowBeforeEdit = '';

function ensureEditDialog() {
    let root = document.getElementById('edit-registration-overlay');
    if (root) return root;

    // Block layout + scrollable backdrop (more reliable than flex centering on iOS / some WebViews).
    root = document.createElement('div');
    root.id = 'edit-registration-overlay';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.style.cssText =
        'display:none;position:fixed;inset:0;z-index:2147483647;overflow-y:auto;-webkit-overflow-scrolling:touch;' +
        'padding:16px;box-sizing:border-box;background:rgba(17,24,39,0.55);';
    root.innerHTML = `
        <div id="edit-registration-panel" style="background:#fff;max-width:820px;width:100%;margin:24px auto 32px auto;border-radius:12px;box-shadow:0 25px 50px -12px rgba(0,0,0,0.25);overflow:hidden;">
            <div style="padding: 1.25rem 1.25rem 0.75rem 1.25rem; border-bottom: 1px solid #e5e7eb;">
                <div style="display:flex; justify-content: space-between; gap: 1rem; align-items: baseline;">
                    <div>
                        <div style="font-size: 1.25rem; font-weight: 700;">Edit registration (all fields)</div>
                        <div style="color:#6b7280; font-size: 0.9rem;" id="edit-reg-subtitle"></div>
                    </div>
                    <button type="button" id="edit-close-btn" class="btn btn-outline" style="padding: 0.4rem 0.7rem; font-size: 0.9rem;">Close</button>
                </div>
            </div>
            <div style="padding: 1rem 1.25rem; max-height: min(75vh, 900px); overflow-y: auto;">
                <div style="display:grid; grid-template-columns: 1fr; gap: 0.9rem;">
                    <label><span style="${WCDMR_EDIT_LABEL_STYLE}">First name</span><input id="edit-firstName" style="${WCDMR_EDIT_INPUT_STYLE}" maxlength="100" autocomplete="given-name" /></label>
                    <label><span style="${WCDMR_EDIT_LABEL_STYLE}">Last name</span><input id="edit-lastName" style="${WCDMR_EDIT_INPUT_STYLE}" maxlength="100" autocomplete="family-name" /></label>
                    <label><span style="${WCDMR_EDIT_LABEL_STYLE}">Email</span><input id="edit-email" style="${WCDMR_EDIT_INPUT_STYLE}" autocomplete="email" /></label>
                    <label><span style="${WCDMR_EDIT_LABEL_STYLE}">Phone</span><input id="edit-phone" style="${WCDMR_EDIT_INPUT_STYLE}" autocomplete="tel" /></label>
                    <label><span style="${WCDMR_EDIT_LABEL_STYLE}">Videophone</span><input id="edit-videophone" style="${WCDMR_EDIT_INPUT_STYLE}" /></label>
                    <label><span style="${WCDMR_EDIT_LABEL_STYLE}">Full address</span><input id="edit-fullAddress" style="${WCDMR_EDIT_INPUT_STYLE}" autocomplete="street-address" /></label>
                    <label><span style="${WCDMR_EDIT_LABEL_STYLE}">Church name</span><input id="edit-churchName" style="${WCDMR_EDIT_INPUT_STYLE}" /></label>
                    <label><span style="${WCDMR_EDIT_LABEL_STYLE}">Bunk selection</span><input id="edit-bunkSelection" style="${WCDMR_EDIT_INPUT_STYLE}" /></label>
                    <label><span style="${WCDMR_EDIT_LABEL_STYLE}">Youth info</span><input id="edit-youthInfo" style="${WCDMR_EDIT_INPUT_STYLE}" /></label>
                    <label><span style="${WCDMR_EDIT_LABEL_STYLE}">Emergency name</span><input id="edit-emergencyName" style="${WCDMR_EDIT_INPUT_STYLE}" /></label>
                    <label><span style="${WCDMR_EDIT_LABEL_STYLE}">Emergency phone</span><input id="edit-emergencyPhone" style="${WCDMR_EDIT_INPUT_STYLE}" /></label>
                    <label><span style="${WCDMR_EDIT_LABEL_STYLE}">Payment ID</span><input id="edit-paymentId" style="${WCDMR_EDIT_INPUT_STYLE}" /></label>
                    <label><span style="${WCDMR_EDIT_LABEL_STYLE}">Registration status</span><input id="edit-registrationStatus" style="${WCDMR_EDIT_INPUT_STYLE};background:#f9fafb;" readonly /></label>
                    <label><span style="${WCDMR_EDIT_LABEL_STYLE}">Payment status</span><input id="edit-paymentStatus" style="${WCDMR_EDIT_INPUT_STYLE};background:#f9fafb;" readonly /></label>
                    <label><span style="${WCDMR_EDIT_LABEL_STYLE}">Amount (dollars)</span><input id="edit-amount" style="${WCDMR_EDIT_INPUT_STYLE}" inputmode="decimal" /></label>
                    <label><span style="${WCDMR_EDIT_LABEL_STYLE}">Payment method</span><input id="edit-paymentMethod" style="${WCDMR_EDIT_INPUT_STYLE}" placeholder="paypal / zelle / money_order" /></label>
                </div>
                <div id="edit-manual-payment-verification" style="display:none; margin-top:1.25rem; padding:1rem; border:1px solid #86efac; border-radius:8px; background:#f0fdf4;">
                    <div style="font-weight:700; color:#166534;">Verify payment and complete registration</div>
                    <p style="margin:0.45rem 0 0.85rem; color:#166534; font-size:0.92rem;">Use this only after the organizer has actually received this Zelle or money-order payment. It records payment verification and completes the registration.</p>
                    <label><span style="${WCDMR_EDIT_LABEL_STYLE}">Amount received (dollars)</span><input id="edit-amountReceived" style="${WCDMR_EDIT_INPUT_STYLE}" inputmode="decimal" /></label>
                    <label style="display:flex; gap:0.55rem; align-items:flex-start; margin-top:0.85rem; color:#166534; font-size:0.92rem;"><input id="edit-payment-received-confirmation" type="checkbox" style="margin-top:0.2rem;" /> <span>I confirm the organizer actually received this payment.</span></label>
                </div>
                <div id="edit-reg-error" style="margin-top: 0.85rem; color: #b91c1c; display:none;"></div>
            </div>
            <div style="padding: 0.9rem 1.25rem; border-top: 1px solid #e5e7eb; display:flex; justify-content:flex-end; gap: 0.75rem;">
                <button type="button" id="edit-cancel-btn" class="btn btn-outline">Cancel</button>
                <button id="edit-save-btn" class="btn btn-primary" type="button">Save</button>
                <button id="edit-verify-payment-btn" class="btn btn-primary" type="button" style="display:none;">Verify payment &amp; complete registration</button>
            </div>
        </div>
    `;
    document.body.appendChild(root);

    const close = () => {
        root.style.display = 'none';
        document.body.style.overflow = wcdmrBodyOverflowBeforeEdit;
    };
    root.addEventListener('click', (e) => {
        if (e.target === root) close();
    });
    const closeBtn = root.querySelector('#edit-close-btn');
    const cancelBtn = root.querySelector('#edit-cancel-btn');
    if (closeBtn) closeBtn.addEventListener('click', close);
    if (cancelBtn) cancelBtn.addEventListener('click', close);

    return root;
}

function editRegistration(key) {
    if (!requireLiveRegistrations()) return;
    const idx = allRegistrations.findIndex((registration) => registrationKey(registration) === key);
    if (idx === -1) return;

    const reg = allRegistrations[idx];

    const dialog = ensureEditDialog();
    wcdmrBodyOverflowBeforeEdit = document.body.style.overflow || '';
    document.body.style.overflow = 'hidden';
    dialog.style.display = 'block';

    const subtitle = dialog.querySelector('#edit-reg-subtitle');
    if (subtitle) {
        subtitle.textContent = `Saved on ${new Date(reg.timestamp).toLocaleString()}`;
    }

    const setVal = (id, value) => {
        const el = dialog.querySelector(id);
        if (!el) return;
        el.value = value ?? '';
    };

    setVal('#edit-firstName', reg.firstName || '');
    setVal('#edit-lastName', reg.lastName || '');
    setVal('#edit-email', reg.email || '');
    setVal('#edit-phone', reg.phone || '');
    setVal('#edit-videophone', reg.videophone || '');
    setVal('#edit-fullAddress', reg.fullAddress || '');
    setVal('#edit-churchName', reg.churchName || '');
    setVal('#edit-bunkSelection', reg.bunkSelection || '');
    setVal('#edit-youthInfo', reg.youthInfo || '');
    setVal('#edit-emergencyName', reg.emergencyName || '');
    setVal('#edit-emergencyPhone', reg.emergencyPhone || '');
    setVal('#edit-paymentId', reg.paymentId || '');
    setVal('#edit-registrationStatus', (reg.status || 'pending').toLowerCase());
    setVal('#edit-paymentStatus', formatPaymentStatus(reg.paymentStatus));
    setVal('#edit-amount', reg.amount != null ? String(reg.amount) : '');
    setVal('#edit-paymentMethod', reg.paymentMethod || '');
    setVal('#edit-amountReceived', reg.amount != null ? String(reg.amount) : '');

    const errorEl = dialog.querySelector('#edit-reg-error');
    const setError = (msg) => {
        if (!errorEl) return;
        if (!msg) {
            errorEl.textContent = '';
            errorEl.style.display = 'none';
            return;
        }
        errorEl.innerHTML = escapeHtml(msg);
        errorEl.style.display = 'block';
    };
    setError('');

    const saveBtn = dialog.querySelector('#edit-save-btn');
    const verifyPaymentBtn = dialog.querySelector('#edit-verify-payment-btn');
    const manualPaymentVerification = dialog.querySelector('#edit-manual-payment-verification');
    const isManualPayment = ['zelle', 'money_order'].includes(String(reg.paymentMethod || '').toLowerCase());
    const canVerifyManualPayment = isManualPayment && reg.paymentStatus !== 'verified';
    if (manualPaymentVerification) manualPaymentVerification.style.display = canVerifyManualPayment ? 'block' : 'none';
    if (verifyPaymentBtn) verifyPaymentBtn.style.display = canVerifyManualPayment ? '' : 'none';

    if (saveBtn) {
        saveBtn.onclick = async () => {
            if (!requireLiveRegistrations()) return;
            const firstName = String(dialog.querySelector('#edit-firstName')?.value || '').trim();
            const lastName = String(dialog.querySelector('#edit-lastName')?.value || '').trim();
            if (!firstName || !lastName) { setError('First and last name are required.'); return; }
            const fullName = `${firstName} ${lastName}`;
            const email = String(dialog.querySelector('#edit-email')?.value || '').trim();
            const phone = String(dialog.querySelector('#edit-phone')?.value || '').trim();
            const videophone = String(dialog.querySelector('#edit-videophone')?.value || '').trim();
            const fullAddress = String(dialog.querySelector('#edit-fullAddress')?.value || '').trim();
            const churchName = String(dialog.querySelector('#edit-churchName')?.value || '').trim();
            const bunkSelection = String(dialog.querySelector('#edit-bunkSelection')?.value || '').trim();
            const youthInfo = String(dialog.querySelector('#edit-youthInfo')?.value || '').trim();
            const emergencyName = String(dialog.querySelector('#edit-emergencyName')?.value || '').trim();
            const emergencyPhone = String(dialog.querySelector('#edit-emergencyPhone')?.value || '').trim();
            const paymentId = String(dialog.querySelector('#edit-paymentId')?.value || '').trim();
            const amountRaw = String(dialog.querySelector('#edit-amount')?.value || '').trim();
            const paymentMethod = String(dialog.querySelector('#edit-paymentMethod')?.value || '').trim();

            if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                setError('Email looks invalid.');
                return;
            }
            if (!['paypal', 'zelle', 'money_order'].includes(paymentMethod)) {
                setError('Payment method must be paypal, zelle, or money_order.');
                return;
            }
            const amountNum = parseFloat(amountRaw);
            if (!Number.isFinite(amountNum) || amountNum < 0) {
                setError('Amount must be a valid dollar amount (example: 245.00).');
                return;
            }

            const updated = {
                ...reg,
                firstName,
                lastName,
                fullName,
                email,
                phone,
                videophone,
                fullAddress,
                churchName,
                bunkSelection,
                youthInfo,
                emergencyName,
                emergencyPhone,
                paymentId,
                amount: Number(amountNum.toFixed(2)),
                paymentMethod
            };

            const next = [...allRegistrations];
            next[idx] = updated;
            saveBtn.disabled = true;
            try {
                await persistRegistrations(next);
                const loaded = await loadRegistrations();
                dialog.style.display = 'none';
                document.body.style.overflow = wcdmrBodyOverflowBeforeEdit;
                if (loaded) setAdminStatus('Registration updated.', 'success');
            } catch (error) {
                console.error('Unable to update registration.', error);
                setError(error.code === 'duplicate_registration' ? 'An existing registration conflicts with this change. No changes were saved.' : 'Unable to save this registration. No local data was changed.');
            } finally {
                saveBtn.disabled = registrationLoadState !== 'ready';
            }
        };
    }

    if (verifyPaymentBtn) {
        verifyPaymentBtn.onclick = async () => {
            if (!requireLiveRegistrations()) return;
            const amountReceivedRaw = String(dialog.querySelector('#edit-amountReceived')?.value || '').trim();
            const paymentReceivedConfirmation = dialog.querySelector('#edit-payment-received-confirmation')?.checked;
            const amountReceived = parseFloat(amountReceivedRaw);

            if (!canVerifyManualPayment) return;
            if (!Number.isFinite(amountReceived) || amountReceived <= 0) {
                setError('Amount received must be a valid dollar amount greater than zero.');
                return;
            }
            if (!paymentReceivedConfirmation) {
                setError('Confirm that the organizer actually received this payment before completing the registration.');
                return;
            }

            verifyPaymentBtn.disabled = true;
            if (saveBtn) saveBtn.disabled = true;
            try {
                await verifyManualPayment(reg, Number(amountReceived.toFixed(2)));
                const loaded = await loadRegistrations();
                dialog.style.display = 'none';
                document.body.style.overflow = wcdmrBodyOverflowBeforeEdit;
                if (loaded) setAdminStatus('Payment verified and registration completed.', 'success');
            } catch (error) {
                console.error('Unable to verify payment.', error);
                setError('Unable to verify this payment. The registration was not changed locally.');
            } finally {
                verifyPaymentBtn.disabled = registrationLoadState !== 'ready';
                if (saveBtn) saveBtn.disabled = registrationLoadState !== 'ready';
            }
        };
    }

    try {
        const fn = dialog.querySelector('#edit-firstName');
        if (fn) fn.focus();
    } catch {
        /* ignore */
    }
}

function updateStats() {
    if (registrationLoadState !== 'ready') {
        ['total-count', 'completed-count', 'pending-count', 'total-revenue'].forEach((id) => {
            document.getElementById(id).textContent = '—';
        });
        return;
    }
    const total = allRegistrations.length;
    const completed = allRegistrations.filter(r => r.status === 'completed').length;
    const pending = allRegistrations.filter(r => r.status === 'pending').length;
    const revenue = allRegistrations
        .filter(r => r.status === 'completed')
        .reduce((sum, r) => sum + amountToDollarsNumber(r.amount), 0);

    document.getElementById('total-count').textContent = total;
    document.getElementById('completed-count').textContent = completed;
    document.getElementById('pending-count').textContent = pending;
    document.getElementById('total-revenue').textContent = `$${revenue.toFixed(2)}`;
}

document.getElementById('search-box').addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase();
    if (!searchTerm) {
        displayRegistrations();
        return;
    }

    displayRegistrations(getFilteredRegistrations(searchTerm));
});

function exportToCSV() {
    if (!requireLiveRegistrations()) return;
    if (allRegistrations.length === 0) {
        alert('No registrations to export');
        return;
    }

    const headers = ['Date', 'First Name', 'Last Name', 'Email', 'Phone', 'Videophone', 'Address', 'Church', 'Emergency Name', 'Emergency Phone', 'Bunk Selection', 'Youth Info', 'Amount', 'Payment ID', 'Status'];
    const rows = allRegistrations.map(reg => {
        const date = new Date(reg.timestamp).toLocaleString();
        const amount = formatAmountDisplay(reg.amount);
        return [
            date,
            reg.firstName || '',
            reg.lastName || '',
            reg.email || '',
            reg.phone || '',
            reg.videophone || '',
            reg.fullAddress || '',
            reg.churchName || '',
            reg.emergencyName || '',
            reg.emergencyPhone || '',
            reg.bunkSelection || '',
            reg.youthInfo || '',
            amount,
            reg.paymentId || '',
            reg.status || ''
        ];
    });

    const csv = [headers, ...rows].map(row =>
        row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
    ).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wcdmr-registrations-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
}

function exportToJSON() {
    if (!requireLiveRegistrations()) return;
    if (allRegistrations.length === 0) {
        alert('No registrations to export');
        return;
    }

    const json = JSON.stringify(allRegistrations, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wcdmr-registrations-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    window.URL.revokeObjectURL(url);
}

function importRegistrationsJSON() {
    if (!requireAdminAccess()) return;
    setAdminStatus('Imports are disabled until a controlled Supabase migration is available.', 'error');
}

async function refreshData() {
    if (!requireAdminAccess()) return;
    setAdminStatus('Refreshing registration list...', 'info');
    await loadRegistrations();
}

const registrationsTbody = document.getElementById('registrations-tbody');
if (registrationsTbody) {
    registrationsTbody.addEventListener('click', (event) => {
        const actionButton = event.target.closest('button[data-registration-action][data-registration-key]');
        if (actionButton) {
            event.stopPropagation();
            const key = String(actionButton.getAttribute('data-registration-key') || '');
            const action = actionButton.getAttribute('data-registration-action');
            if (!key || !action) return;
            if (action === 'edit') {
                editRegistration(key);
            } else if (action === 'delete') {
                deleteRegistration(key);
            }
            return;
        }

        const row = event.target.closest('tr[data-registration-key]');
        if (row) {
            const key = String(row.getAttribute('data-registration-key') || '');
            if (key) {
                showDetails(key);
            }
        }
    });
}

if (typeof window !== 'undefined') {
    window.importRegistrationsJSON = importRegistrationsJSON;
    window.deleteRegistration = deleteRegistration;
}

// An uncertain create keeps its exact payload and UUID in memory. Never generate
// another UUID on a network retry, and never use registration safety backups.
function updateAdminCreateControls() {
    const unavailable = registrationLoadState !== 'ready';
    const attempt = adminCreateAttempt;
    const fields = document.getElementById('add-registration-fields');
    const submit = document.getElementById('add-registration-submit');
    const newDraft = document.getElementById('add-registration-new');
    if (newDraft) newDraft.disabled = unavailable || Boolean(attempt?.busy || (attempt?.body && !attempt.blocked && !attempt.saved));
    if (fields) fields.disabled = unavailable || Boolean(attempt?.body);
    if (submit) {
        submit.disabled = unavailable || Boolean(attempt?.busy || attempt?.blocked || attempt?.saved);
        submit.textContent = attempt?.busy ? 'Saving...' : attempt?.body ? 'Retry same submission' : 'Create pending registration';
    }
}

function openAddRegistration() {
    if (!requireLiveRegistrations()) return;
    const dialog = document.getElementById('add-registration-dialog');
    if (!dialog) return;
    if (!adminCreateAttempt || adminCreateAttempt.saved) {
        adminCreateAttempt = { body: null, busy: false, saved: false, blocked: false, existingId: null };
        document.getElementById('add-registration-form').reset();
        document.getElementById('add-registration-message').textContent = '';
        document.getElementById('add-registration-existing').hidden = true;
    }
    updateAdminCreateControls();
    if (!dialog.open) dialog.showModal();
}

function closeAddRegistration() {
    // Closing/reopening preserves an uncertain submission for safe retry.
    document.getElementById('add-registration-dialog')?.close();
}

async function submitAddRegistration(event) {
    event?.preventDefault();
    if (!requireLiveRegistrations() || !adminCreateAttempt || adminCreateAttempt.busy || adminCreateAttempt.blocked || adminCreateAttempt.saved) return;
    const attempt = adminCreateAttempt;
    const form = document.getElementById('add-registration-form');
    const message = document.getElementById('add-registration-message');
    if (!attempt.body) {
        if (!form.reportValidity()) return;
        const values = new FormData(form);
        const registration = {};
        for (const key of ['first_name', 'last_name', 'email', 'phone', 'videophone', 'address_line', 'city', 'zip_code', 'church_name', 'emergency_name', 'emergency_phone', 'youth_info', 'payment_method']) {
            registration[key] = String(values.get(key) || '').trim();
        }
        registration.bunk_selection = values.getAll('bunk_selection').join(', ');
        registration.amount_due = Number(values.get('amount_due'));
        if (!values.has('admin_reviewed') || !Number.isFinite(registration.amount_due) || registration.amount_due <= 0 || registration.amount_due > 100000 || Number(registration.amount_due.toFixed(2)) !== registration.amount_due) {
            message.textContent = 'Review the details and enter a valid amount due with at most two decimal places.';
            return;
        }
        if (!globalThis.crypto?.randomUUID) {
            message.textContent = 'A secure browser connection is required. Open Admin over HTTPS.';
            return;
        }
        attempt.body = { request_id: globalThis.crypto.randomUUID(), registration, admin_reviewed: true };
    }
    attempt.busy = true;
    const token = adminAccessToken();
    message.textContent = 'Saving pending registration...';
    updateAdminCreateControls();
    try {
        const result = await callAdminRegistrations('POST', attempt.body);
        if (adminCreateAttempt !== attempt || token !== adminAccessToken()) return;
        if (!['created', 'replayed'].includes(result?.status) || !/^[0-9a-f-]{36}$/i.test(result?.id || '')) throw new Error('Unconfirmed creation');
        attempt.saved = true;
        attempt.registrationId = result.id;
        const savedMessage = result.status === 'created' ? 'Pending registration created.' : 'Registration was already saved; no duplicate was created.';
        message.textContent = `${savedMessage} Reference: ${result.id}. No payment was verified by this action.`;
        closeAddRegistration();
        const loaded = await loadRegistrations();
        if (adminCreateAttempt !== attempt || token !== adminAccessToken()) return;
        setAdminStatus(loaded ? savedMessage : `${savedMessage} Registrations unavailable: refresh the live list. Do not submit again. Reference: ${result.id}.`, loaded ? 'success' : 'error');
    } catch (error) {
        if (adminCreateAttempt !== attempt || token !== adminAccessToken()) return;
        if (error.code === 'invalid_details') {
            attempt.body = null; // Explicit validation rejection: no insert occurred.
            message.textContent = 'Check the required fields, lengths, email, payment method, and amount due. Nothing was created.';
        } else if (error.code === 'duplicate_registration') {
            attempt.blocked = true;
            attempt.existingId = error.existingId || null;
            message.textContent = 'An active registration already exists for this name and email. Review it instead of creating another.';
            document.getElementById('add-registration-existing').hidden = !attempt.existingId;
        } else if (['request_conflict', 'registration_deleted'].includes(error.code)) {
            attempt.blocked = true;
            message.textContent = error.code === 'registration_deleted' ? 'This submission was previously saved and then deleted. It was not recreated. Refresh and review before starting another registration.' : 'This request ID was already used for different details. Refresh and review existing registrations before starting another submission.';
        } else {
            message.textContent = 'Save not confirmed. Keep this form and retry the same submission; it will not create a second copy. Do not change details or start another submission until resolved.';
        }
    } finally {
        attempt.busy = false;
        if (adminCreateAttempt === attempt) updateAdminCreateControls();
    }
}

async function reviewExistingRegistration() {
    const attempt = adminCreateAttempt;
    if (!attempt?.existingId || !requireLiveRegistrations()) return;
    closeAddRegistration();
    if (!await loadRegistrations() || adminCreateAttempt !== attempt) return;
    if (allRegistrations.some((row) => row.id === attempt.existingId)) {
        editRegistration(attempt.existingId);
    } else {
        setAdminStatus(`Existing registration is not in the latest 500 rows. Reference: ${attempt.existingId}. No duplicate was created.`, 'error');
    }
}

// Only discard a known rejected submission or an unsent draft. An uncertain
// request remains available through Close / Add Registration until resolved.
function newAdminRegistrationDraft() {
    if (adminCreateAttempt?.busy || (adminCreateAttempt?.body && !adminCreateAttempt.blocked && !adminCreateAttempt.saved)) return;
    adminCreateAttempt = null;
    openAddRegistration();
}

// Browser safety copies are never a source for the live Admin dashboard.
updateRegistrationControls();
initializeAdminAccess();
