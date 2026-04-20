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
                        <td colspan="8" class="empty-state">
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

function editRegistration(timestamp) {
    const idx = allRegistrations.findIndex(r => r.timestamp === timestamp);
    if (idx === -1) return;

    const reg = allRegistrations[idx];

    const nextAmountRaw = prompt(
        'Edit amount (dollars). Example: 245 or 245.00',
        reg.amount != null ? String(reg.amount) : ''
    );
    if (nextAmountRaw === null) return;

    const amountNum = parseFloat(String(nextAmountRaw).trim());
    if (!Number.isFinite(amountNum) || amountNum < 0) {
        alert('Amount must be a valid number in dollars (example: 245.00).');
        return;
    }

    const nextStatusRaw = prompt('Edit status: completed or pending', reg.status || 'completed');
    if (nextStatusRaw === null) return;
    const status = String(nextStatusRaw).trim().toLowerCase();
    if (!['completed', 'pending'].includes(status)) {
        alert('Status must be "completed" or "pending".');
        return;
    }

    const nextPaymentId = prompt('Edit Payment ID (optional)', reg.paymentId || '');
    if (nextPaymentId === null) return;

    const nextEmail = prompt('Edit email (optional)', reg.email || '');
    if (nextEmail === null) return;

    const nextName = prompt('Edit full name (optional)', reg.fullName || `${reg.firstName || ''} ${reg.lastName || ''}`.trim());
    if (nextName === null) return;

    const updated = {
        ...reg,
        fullName: String(nextName || '').trim(),
        email: String(nextEmail || '').trim(),
        paymentId: String(nextPaymentId || '').trim(),
        amount: Number(amountNum.toFixed(2)),
        status
    };

    const next = [...allRegistrations];
    next[idx] = updated;
    persistRegistrations(next);
    loadRegistrations();
    alert('Registration updated.');
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

loadRegistrations();
setInterval(loadRegistrations, 30000);
