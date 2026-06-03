/**
 * WCDMR registration admin with shared cross-device sync.
 */
let allRegistrations = [];
let selectedRegistrationKeys = new Set();
let adminStatusTimer = null;
let wcdmrDeleteDialogState = null;

function getRegistrationFullName(registration) {
    if (!registration || typeof registration !== 'object') return '';
    return String(registration.fullName || `${registration.firstName || ''} ${registration.lastName || ''}`).trim();
}

function registrationKey(reg) {
    if (!reg || typeof reg !== 'object') return '';

    const registrationId = String(reg.registrationId || '').trim();
    if (registrationId) return `registrationId:${registrationId}`;

    const paymentId = String(reg.paymentId || '').trim();
    if (paymentId && paymentId !== 'PENDING') return `payment:${paymentId}`;

    const timestamp = String(reg.timestamp || '').trim();
    if (timestamp) return `timestamp:${timestamp}`;

    const email = String(reg.email || '').trim().toLowerCase();
    const fullName = getRegistrationFullName(reg).toLowerCase();
    if (email || fullName) return `identity:${email}|${fullName}|${reg.status || ''}`;

    return '';
}

function setDeleteSelectedEnabled() {
    const btn = document.getElementById('delete-selected-btn');
    if (!btn) return;
    btn.disabled = selectedRegistrationKeys.size === 0;
    btn.textContent = selectedRegistrationKeys.size === 0
        ? 'Delete Selected'
        : `Delete Selected (${selectedRegistrationKeys.size})`;
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

function getVisibleRegistrationKeys() {
    return Array.from(document.querySelectorAll('#registrations-tbody input[type="checkbox"][data-registration-key]'))
        .map((cb) => {
            return String(cb.getAttribute('data-registration-key') || '');
        })
        .filter(Boolean);
}

function setSelectAllCheckboxStateFromKeys(keys) {
    const selectAll = document.getElementById('select-all-registrations');
    if (!selectAll) return;
    const visibleKeys = Array.isArray(keys) ? keys.filter(Boolean) : [];
    const selectedCount = visibleKeys.filter((key) => selectedRegistrationKeys.has(key)).length;
    const allCount = visibleKeys.length;
    selectAll.checked = allCount > 0 && selectedCount === allCount;
    selectAll.indeterminate = selectedCount > 0 && selectedCount < allCount;
}

function setSelectAllCheckboxState(registrations) {
    const rows = Array.isArray(registrations) ? registrations : [];
    const keys = rows.map(registrationKey).filter(Boolean);
    setSelectAllCheckboxStateFromKeys(keys);
}

const WCDMR_DEFAULT_FEE_ANCHOR = 245;
const WCDMR_REGISTRATION_STORAGE_KEY = 'wcdmr_registrations';
const WCDMR_REGISTRATION_SYNC_URL = 'https://mantledb.sh/v2/wcdmr-reg-2026/registrations';
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
    return registrationKey(registration) || `fallback:${fallbackIndex}`;
}

function shouldReplaceRegistration(existing, incoming) {
    if (!existing) return true;

    if (existing.status === 'pending' && incoming.status === 'completed') {
        return true;
    }

    const existingUpdatedAt = toTimestampValue(existing.updatedAt);
    const incomingUpdatedAt = toTimestampValue(incoming.updatedAt);
    if (existingUpdatedAt || incomingUpdatedAt) {
        return incomingUpdatedAt >= existingUpdatedAt;
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

function getAuthoritativeRegistrations(sharedRegistrations, localRegistrations) {
    if (Array.isArray(sharedRegistrations)) {
        return limitRegistrations(sharedRegistrations);
    }
    return limitRegistrations(Array.isArray(localRegistrations) ? localRegistrations : []);
}

function normalizeRemotePayload(payload) {
    if (Array.isArray(payload)) return payload;
    if (payload && Array.isArray(payload.registrations)) return payload.registrations;
    return [];
}

async function fetchSharedRegistrations() {
    try {
        const response = await fetch(WCDMR_REGISTRATION_SYNC_URL, {
            method: 'GET',
            headers: { Accept: 'application/json' },
            cache: 'no-store'
        });

        if (response.status === 404) {
            return [];
        }

        if (!response.ok) {
            throw new Error(`Request failed with status ${response.status}`);
        }

        const payload = await response.json();
        return limitRegistrations(normalizeRemotePayload(payload));
    } catch (error) {
        console.warn('Unable to fetch shared registrations. Falling back to local data only.', error);
        return null;
    }
}

async function pushSharedRegistrations(registrations) {
    try {
        const response = await fetch(WCDMR_REGISTRATION_SYNC_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                registrations: limitRegistrations(registrations),
                updatedAt: new Date().toISOString()
            })
        });

        if (!response.ok) {
            throw new Error(`Request failed with status ${response.status}`);
        }
        return true;
    } catch (error) {
        console.warn('Unable to update shared registrations right now.', error);
        return false;
    }
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

async function persistRegistrations(next) {
    allRegistrations = persistLocalRegistrations(Array.isArray(next) ? next : []);
    return allRegistrations;
}

async function loadRegistrations() {
    const sharedRegistrations = await fetchSharedRegistrations();
    if (Array.isArray(sharedRegistrations)) {
        allRegistrations = getAuthoritativeRegistrations(sharedRegistrations, []);
        persistLocalRegistrations(allRegistrations);
        selectedRegistrationKeys = new Set(
            Array.from(selectedRegistrationKeys).filter((key) => allRegistrations.some((registration) => registrationKey(registration) === key))
        );
        displayRegistrations();
        updateStats();
        return;
    }

    // Admin should reflect the shared source of truth. Showing stale local cache causes
    // deleted registrations to appear to "come back" on one device but not another.
    allRegistrations = [];
    persistLocalRegistrations([]);
    selectedRegistrationKeys = new Set();
    displayRegistrations([]);
    updateStats();
    setAdminStatus('Live sync is unavailable right now. Please refresh when your connection is stable.', 'error');
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

async function syncCurrentRegistrations(successMessage, pendingMessage) {
    const result = await applySharedMutation(
        () => allRegistrations,
        {
            successMessage,
            failureMessage: pendingMessage
        }
    );
    return result.ok;
}

async function applySharedMutation(mutator, { loadingMessage, successMessage, failureMessage } = {}) {
    if (loadingMessage) {
        setAdminStatus(loadingMessage, 'info');
    }

    const sharedRegistrations = await fetchSharedRegistrations();
    if (!Array.isArray(sharedRegistrations)) {
        setAdminStatus(
            failureMessage || 'Live sync is unavailable right now. Refresh when your connection is stable and try again.',
            'error'
        );
        return { ok: false };
    }

    let nextRegistrations;
    try {
        nextRegistrations = limitRegistrations(await mutator([...sharedRegistrations]));
    } catch (error) {
        console.warn('Unable to prepare shared registration update.', error);
        setAdminStatus(failureMessage || 'Unable to prepare the shared registration update right now.', 'error');
        return { ok: false, error };
    }

    const synced = await pushSharedRegistrations(nextRegistrations);
    if (!synced) {
        setAdminStatus(failureMessage || 'Unable to sync the latest shared registrations right now.', 'error');
        return { ok: false };
    }

    allRegistrations = persistLocalRegistrations(nextRegistrations);
    selectedRegistrationKeys = new Set(
        Array.from(selectedRegistrationKeys).filter((key) => allRegistrations.some((registration) => registrationKey(registration) === key))
    );
    renderCurrentRegistrationsView();
    if (successMessage) {
        setAdminStatus(successMessage, 'success');
    }
    return { ok: true, registrations: nextRegistrations };
}

function displayRegistrations(filtered = null) {
    const tbody = document.getElementById('registrations-tbody');
    const registrations = filtered || allRegistrations;

    if (registrations.length === 0) {
        tbody.innerHTML = `
                    <tr>
                        <td colspan="10" class="empty-state">
                            <div class="empty-state-icon">📋</div>
                            <p>No synced registrations found yet.</p>
                        </td>
                    </tr>
                `;
        setSelectAllCheckboxState(registrations);
        setDeleteSelectedEnabled();
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
        const checked = key && selectedRegistrationKeys.has(key) ? 'checked' : '';

        return `
                    <tr style="cursor: pointer;" data-registration-key="${key}">
                        <td class="registration-select-cell" style="text-align:center;">
                            <input type="checkbox" ${checked} aria-label="Select registration" data-registration-key="${key}" />
                        </td>
                        <td>${date}</td>
                        <td><strong>${reg.fullName || `${reg.firstName || ''} ${reg.lastName || ''}`.trim()}</strong></td>
                        <td>${reg.email}</td>
                        <td>${reg.phone || '-'}</td>
                        <td>${reg.churchName || '-'}</td>
                        <td>$${amount}</td>
                        <td><code style="font-size: 0.75rem;">${reg.paymentId || '-'}</code></td>
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

    setSelectAllCheckboxState(registrations);
    setDeleteSelectedEnabled();
}

function toggleRegistrationSelected(event, timestamp) {
    if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
    const key = String(timestamp || '');
    if (!key) return;
    if (selectedRegistrationKeys.has(key)) {
        selectedRegistrationKeys.delete(key);
    } else {
        selectedRegistrationKeys.add(key);
    }
    // Update header checkbox state based on what's currently rendered.
    const visibleKeys = getVisibleRegistrationKeys();
    setSelectAllCheckboxStateFromKeys(visibleKeys);
    setDeleteSelectedEnabled();
}

function toggleSelectAllRegistrations(event) {
    if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
    const checkbox = event && event.target ? event.target : document.getElementById('select-all-registrations');
    const checked = Boolean(checkbox && checkbox.checked);
    const visibleTimestamps = getVisibleRegistrationKeys();

    if (checked) {
        visibleTimestamps.forEach((ts) => selectedRegistrationKeys.add(String(ts)));
    } else {
        visibleTimestamps.forEach((ts) => selectedRegistrationKeys.delete(String(ts)));
    }

    // Re-render current view to update row checkboxes.
    // If search filter is active, keep it applied by re-triggering the input handler.
    renderCurrentRegistrationsView();
}

async function deleteSelectedRegistrations() {
    const count = selectedRegistrationKeys.size;
    if (count === 0) {
        alert('Select at least one registration to delete.');
        return;
    }
    const message =
        count === 1
            ? 'Delete 1 selected registration? This cannot be undone.'
            : `Delete ${count} selected registrations? This cannot be undone.`;
    openDeleteConfirmDialog({
        title: count === 1 ? 'Delete selected registration?' : `Delete ${count} registrations?`,
        message,
        confirmLabel: count === 1 ? 'Delete registration' : `Delete ${count} registrations`,
        onConfirm: async () => {
            const next = allRegistrations.filter((r) => !selectedRegistrationKeys.has(registrationKey(r)));
            selectedRegistrationKeys = new Set();
            allRegistrations = persistLocalRegistrations(next);
            renderCurrentRegistrationsView();
            await syncCurrentRegistrations(
                count === 1 ? 'Deleted 1 registration.' : `Deleted ${count} registrations.`,
                'Deleted locally. Shared sync is still catching up, so refresh again in a moment if needed.'
            );
        }
    });
}

async function deleteRegistration(timestamp) {
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
            selectedRegistrationKeys.delete(key);
            const next = allRegistrations.filter((item) => registrationKey(item) !== key);
            allRegistrations = persistLocalRegistrations(next);
            renderCurrentRegistrationsView();
            await syncCurrentRegistrations(
                `Deleted ${label}.`,
                `Deleted ${label} locally. Shared sync is still catching up, so refresh again in a moment if needed.`
            );
        }
    });
}

function showDetails(timestamp) {
    const reg = allRegistrations.find(r => r.timestamp === timestamp);
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
        submitBtn.disabled = false;
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
                    <label><span style="${WCDMR_EDIT_LABEL_STYLE}">Full name</span><input id="edit-fullName" style="${WCDMR_EDIT_INPUT_STYLE}" autocomplete="name" /></label>
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
                    <label><span style="${WCDMR_EDIT_LABEL_STYLE}">Status</span>
                        <select id="edit-status" style="${WCDMR_EDIT_INPUT_STYLE}">
                            <option value="completed">completed</option>
                            <option value="pending">pending</option>
                        </select>
                    </label>
                    <label><span style="${WCDMR_EDIT_LABEL_STYLE}">Amount (dollars)</span><input id="edit-amount" style="${WCDMR_EDIT_INPUT_STYLE}" inputmode="decimal" /></label>
                    <label><span style="${WCDMR_EDIT_LABEL_STYLE}">Payment method</span><input id="edit-paymentMethod" style="${WCDMR_EDIT_INPUT_STYLE}" placeholder="paypal / zelle / money_order" /></label>
                </div>
                <div id="edit-reg-error" style="margin-top: 0.85rem; color: #b91c1c; display:none;"></div>
            </div>
            <div style="padding: 0.9rem 1.25rem; border-top: 1px solid #e5e7eb; display:flex; justify-content:flex-end; gap: 0.75rem;">
                <button type="button" id="edit-cancel-btn" class="btn btn-outline">Cancel</button>
                <button id="edit-save-btn" class="btn btn-primary" type="button">Save</button>
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

function editRegistration(timestamp) {
    const idx = allRegistrations.findIndex(r => r.timestamp === timestamp);
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

    setVal('#edit-fullName', reg.fullName || `${reg.firstName || ''} ${reg.lastName || ''}`.trim());
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
    setVal('#edit-status', (reg.status || 'completed').toLowerCase());
    setVal('#edit-amount', reg.amount != null ? String(reg.amount) : '');
    setVal('#edit-paymentMethod', reg.paymentMethod || '');

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
    if (saveBtn) {
        saveBtn.onclick = () => {
            const fullName = String(dialog.querySelector('#edit-fullName')?.value || '').trim();
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
            const status = String(dialog.querySelector('#edit-status')?.value || '').trim().toLowerCase();
            const amountRaw = String(dialog.querySelector('#edit-amount')?.value || '').trim();
            const paymentMethod = String(dialog.querySelector('#edit-paymentMethod')?.value || '').trim();

            if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                setError('Email looks invalid.');
                return;
            }
            if (!['completed', 'pending'].includes(status)) {
                setError('Status must be completed or pending.');
                return;
            }
            const amountNum = parseFloat(amountRaw);
            if (!Number.isFinite(amountNum) || amountNum < 0) {
                setError('Amount must be a valid dollar amount (example: 245.00).');
                return;
            }

            const updated = {
                ...reg,
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
                status,
                amount: Number(amountNum.toFixed(2)),
                paymentMethod
            };

            const next = [...allRegistrations];
            next[idx] = updated;
            persistRegistrations(next);
            loadRegistrations();
            dialog.style.display = 'none';
            document.body.style.overflow = wcdmrBodyOverflowBeforeEdit;
        };
    }

    try {
        const fn = dialog.querySelector('#edit-fullName');
        if (fn) fn.focus();
    } catch {
        /* ignore */
    }
}

function updateStats() {
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
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        let data;
        try {
            data = JSON.parse(await file.text());
        } catch {
            alert('That file is not valid JSON.');
            return;
        }
        if (!Array.isArray(data)) {
            alert('The JSON file must be an array of registration objects (same format as Export JSON).');
            return;
        }
        const byTs = new Map(allRegistrations.map((r) => [r.timestamp, r]));
        for (const row of data) {
            if (row && row.timestamp) {
                byTs.set(row.timestamp, row);
            }
        }
        const merged = sortRegistrationsNewestFirst(Array.from(byTs.values()));
        allRegistrations = persistLocalRegistrations(merged);
        renderCurrentRegistrationsView();
        await syncCurrentRegistrations(
            `Import finished. ${merged.length} synced registration(s) available now.`,
            'Import finished locally. Shared sync is still catching up, so refresh again in a moment if needed.'
        );
    };
    input.click();
}

async function clearAllData() {
    if (confirm('Are you sure you want to delete ALL registration data? This cannot be undone!')) {
        localStorage.removeItem(WCDMR_REGISTRATION_STORAGE_KEY);
        allRegistrations = [];
        selectedRegistrationKeys = new Set();
        displayRegistrations();
        updateStats();
        const synced = await pushSharedRegistrations([]);
        if (!synced) {
            setAdminStatus('All local registration data has been cleared. Shared sync is still catching up, so refresh again in a moment if needed.', 'error');
            return;
        }
        setAdminStatus('All registration data has been cleared.', 'success');
    }
}

async function refreshData() {
    setAdminStatus('Refreshing registration list...', 'info');
    await loadRegistrations();
    setAdminStatus('Data refreshed.', 'success');
}

const registrationsTbody = document.getElementById('registrations-tbody');
if (registrationsTbody) {
    registrationsTbody.addEventListener('click', (event) => {
        const checkbox = event.target.closest('input[type="checkbox"][data-registration-key]');
        if (checkbox) {
            event.stopPropagation();
            return;
        }

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

    registrationsTbody.addEventListener('change', (event) => {
        const checkbox = event.target.closest('input[type="checkbox"][data-registration-key]');
        if (!checkbox) return;
        const key = String(checkbox.getAttribute('data-registration-key') || '');
        if (!key) return;
        toggleRegistrationSelected(event, key);
    });
}

if (typeof window !== 'undefined') {
    window.importRegistrationsJSON = importRegistrationsJSON;
    window.toggleRegistrationSelected = toggleRegistrationSelected;
    window.toggleSelectAllRegistrations = toggleSelectAllRegistrations;
    window.deleteSelectedRegistrations = deleteSelectedRegistrations;
    window.deleteRegistration = deleteRegistration;
}

loadRegistrations();
