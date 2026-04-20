/**
 * WCDMR registration admin (loaded from GitHub via jsDelivr when admin.html is cached on www).
 */
let allRegistrations = [];

function amountToDollarsNumber(raw) {
    if (raw == null || raw === '') return 0;
    const n = typeof raw === 'number' ? raw : parseFloat(raw);
    if (Number.isNaN(n)) return 0;
    return n;
}

function formatAmountDisplay(raw) {
    return amountToDollarsNumber(raw).toFixed(2);
}

function persistRegistrations(next) {
    allRegistrations = Array.isArray(next) ? next : [];
    localStorage.setItem('wcdmr_registrations', JSON.stringify(allRegistrations.slice(-100)));
}

function loadRegistrations() {
    const stored = localStorage.getItem('wcdmr_registrations');
    allRegistrations = stored ? JSON.parse(stored) : [];
    allRegistrations.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    displayRegistrations();
    updateStats();
}

function displayRegistrations(filtered = null) {
    const tbody = document.getElementById('registrations-tbody');
    const registrations = filtered || allRegistrations;

    if (registrations.length === 0) {
        tbody.innerHTML = `
                    <tr>
                        <td colspan="9" class="empty-state">
                            <div class="empty-state-icon">📋</div>
                            <p>No registrations found.</p>
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

        return `
                    <tr style="cursor: pointer;" onclick="showDetails('${reg.timestamp}')">
                        <td>${date}</td>
                        <td><strong>${reg.fullName || `${reg.firstName || ''} ${reg.lastName || ''}`.trim()}</strong></td>
                        <td>${reg.email}</td>
                        <td>${reg.phone || '-'}</td>
                        <td>${reg.churchName || '-'}</td>
                        <td>$${amount}</td>
                        <td><code style="font-size: 0.75rem;">${reg.paymentId || '-'}</code></td>
                        <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                        <td>
                            <button class="btn btn-outline" style="padding: 0.35rem 0.6rem; font-size: 0.9rem;" onclick="event.stopPropagation(); editRegistration('${reg.timestamp}')">Edit</button>
                        </td>
                    </tr>
                `;
    }).join('');
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

function ensureEditDialog() {
    let root = document.getElementById('edit-registration-overlay');
    if (root) return root;

    // Plain div overlay (not <dialog>) — works in all browsers; Safari can break HTMLDialogElement.showModal().
    root = document.createElement('div');
    root.id = 'edit-registration-overlay';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.style.cssText = 'display:none;position:fixed;inset:0;z-index:99999;background:rgba(17,24,39,0.55);align-items:center;justify-content:center;padding:1rem;box-sizing:border-box;';
    root.innerHTML = `
        <div id="edit-registration-panel" style="background:#fff;max-width:820px;width:100%;max-height:92vh;overflow:hidden;border-radius:12px;box-shadow:0 25px 50px -12px rgba(0,0,0,0.25);display:flex;flex-direction:column;">
            <div style="padding: 1.25rem 1.25rem 0.75rem 1.25rem; border-bottom: 1px solid #e5e7eb;">
                <div style="display:flex; justify-content: space-between; gap: 1rem; align-items: baseline;">
                    <div>
                        <div style="font-size: 1.25rem; font-weight: 700;">Edit registration</div>
                        <div style="color:#6b7280; font-size: 0.9rem;" id="edit-reg-subtitle"></div>
                    </div>
                    <button type="button" id="edit-close-btn" class="btn btn-outline" style="padding: 0.4rem 0.7rem; font-size: 0.9rem;">Close</button>
                </div>
            </div>
            <div style="padding: 1rem 1.25rem; overflow-y:auto; flex:1; min-height:0;">
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 0.85rem 1rem;">
                    <label>Full name<br><input id="edit-fullName" class="search-box" style="margin:0;" autocomplete="name" /></label>
                    <label>Email<br><input id="edit-email" class="search-box" style="margin:0;" autocomplete="email" /></label>
                    <label>Phone<br><input id="edit-phone" class="search-box" style="margin:0;" autocomplete="tel" /></label>
                    <label>Videophone<br><input id="edit-videophone" class="search-box" style="margin:0;" /></label>
                    <label style="grid-column: 1 / -1;">Full address<br><input id="edit-fullAddress" class="search-box" style="margin:0;" autocomplete="street-address" /></label>
                    <label>Church name<br><input id="edit-churchName" class="search-box" style="margin:0;" /></label>
                    <label>Bunk selection<br><input id="edit-bunkSelection" class="search-box" style="margin:0;" /></label>
                    <label style="grid-column: 1 / -1;">Youth info<br><input id="edit-youthInfo" class="search-box" style="margin:0;" /></label>
                    <label>Emergency name<br><input id="edit-emergencyName" class="search-box" style="margin:0;" /></label>
                    <label>Emergency phone<br><input id="edit-emergencyPhone" class="search-box" style="margin:0;" /></label>
                    <label>Payment ID<br><input id="edit-paymentId" class="search-box" style="margin:0;" /></label>
                    <label>Status<br>
                        <select id="edit-status" class="search-box" style="margin:0;">
                            <option value="completed">completed</option>
                            <option value="pending">pending</option>
                        </select>
                    </label>
                    <label>Amount (dollars)<br><input id="edit-amount" class="search-box" style="margin:0;" inputmode="decimal" /></label>
                    <label>Payment method<br><input id="edit-paymentMethod" class="search-box" style="margin:0;" placeholder="paypal / zelle / money_order" /></label>
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
    };
    root.addEventListener('click', (e) => {
        if (e.target === root) close();
    });
    root.querySelector('#edit-close-btn')?.addEventListener('click', close);
    root.querySelector('#edit-cancel-btn')?.addEventListener('click', close);

    return root;
}

function editRegistration(timestamp) {
    const idx = allRegistrations.findIndex(r => r.timestamp === timestamp);
    if (idx === -1) return;

    const reg = allRegistrations[idx];

    const dialog = ensureEditDialog();
    dialog.style.display = 'flex';

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
        };
    }

    try {
        dialog.querySelector('#edit-fullName')?.focus();
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

    const filtered = allRegistrations.filter(reg => {
        const fullName = (reg.fullName || `${reg.firstName || ''} ${reg.lastName || ''}`).toLowerCase();
        const email = (reg.email || '').toLowerCase();
        const church = (reg.churchName || '').toLowerCase();
        return fullName.includes(searchTerm) || email.includes(searchTerm) || church.includes(searchTerm);
    });

    displayRegistrations(filtered);
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
        const merged = Array.from(byTs.values()).sort(
            (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
        );
        persistRegistrations(merged);
        loadRegistrations();
        alert(`Import finished. ${merged.length} registration(s) in this browser.`);
    };
    input.click();
}

function clearAllData() {
    if (confirm('Are you sure you want to delete ALL registration data? This cannot be undone!')) {
        localStorage.removeItem('wcdmr_registrations');
        allRegistrations = [];
        displayRegistrations();
        updateStats();
        alert('All registration data has been cleared.');
    }
}

function refreshData() {
    loadRegistrations();
    alert('Data refreshed!');
}

if (typeof window !== 'undefined') {
    window.importRegistrationsJSON = importRegistrationsJSON;
}

loadRegistrations();
setInterval(loadRegistrations, 30000);
