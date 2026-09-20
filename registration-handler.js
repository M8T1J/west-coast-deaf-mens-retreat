// Registration storage: Supabase is authoritative; browser storage is only a draft/safety copy.
const GOOGLE_FORM_URL = 'https://docs.google.com/forms/d/e/YOUR_FORM_ID/formResponse';
const USE_GOOGLE_FORM = false;
const WCDMR_REGISTRATION_STORAGE_KEY = 'wcdmr_registrations';
const WCDMR_REGISTRATION_BACKUP_STORAGE_KEY = 'wcdmr_registrations_backup';

function safeParseRegistrations(rawValue) {
    try {
        const value = rawValue ? JSON.parse(rawValue) : [];
        return Array.isArray(value) ? value.filter((item) => item && typeof item === 'object') : [];
    } catch { return []; }
}

function readStoredRegistrations(key) {
    try { return safeParseRegistrations(localStorage.getItem(key)); } catch { return []; }
}

function mergeLocalRegistrations(...sources) {
    const rows = new Map();
    sources.flat().filter((item) => item && typeof item === 'object').forEach((item, index) => {
        const key = item.registrationId || item.clientRegistrationId || item.timestamp || `${item.email || ''}:${index}`;
        rows.set(String(key), item);
    });
    return Array.from(rows.values()).slice(-500);
}

function persistLocalSafetyCopy(registration) {
    const primary = readStoredRegistrations(WCDMR_REGISTRATION_STORAGE_KEY);
    const backup = readStoredRegistrations(WCDMR_REGISTRATION_BACKUP_STORAGE_KEY);
    const merged = mergeLocalRegistrations(backup, primary, registration);
    try { localStorage.setItem(WCDMR_REGISTRATION_STORAGE_KEY, JSON.stringify(merged)); } catch (error) { console.warn('Unable to save local registration draft.', error); }
    try { localStorage.setItem(WCDMR_REGISTRATION_BACKUP_STORAGE_KEY, JSON.stringify(merged)); } catch (error) { console.warn('Unable to preserve local registration backup.', error); }
    return merged;
}

function normalizeIdentityPart(value) { return String(value || '').trim().toLowerCase(); }

function hasCompletedRegistration(formData) {
    const email = normalizeIdentityPart(formData?.email);
    const name = normalizeIdentityPart(formData?.fullName || `${formData?.firstName || ''} ${formData?.lastName || ''}`);
    return mergeLocalRegistrations(
        readStoredRegistrations(WCDMR_REGISTRATION_STORAGE_KEY),
        readStoredRegistrations(WCDMR_REGISTRATION_BACKUP_STORAGE_KEY)
    ).some((item) => item.status === 'completed' && normalizeIdentityPart(item.email) === email && normalizeIdentityPart(item.fullName) === name);
}

async function hasCompletedRegistrationAsync(formData) { return hasCompletedRegistration(formData); }

function currentTurnstileToken() {
    try { return window.wcdmrTurnstileWidgetId == null ? '' : window.turnstile.getResponse(window.wcdmrTurnstileWidgetId); } catch { return ''; }
}

function renderRegistrationTurnstile() {
    const target = document.getElementById('registration-turnstile');
    const siteKey = window.WCDMR_SUPABASE?.turnstileSiteKey;
    if (!target || !siteKey || !window.turnstile || window.wcdmrTurnstileWidgetId != null) return;
    window.wcdmrTurnstileWidgetId = window.turnstile.render(target, { sitekey: siteKey });
}

async function storeRegistrationData(formData, paymentId = '') {
    persistLocalSafetyCopy({ ...formData, status: 'pending', timestamp: new Date().toISOString(), paymentId });
    const turnstileToken = currentTurnstileToken();
    if (!turnstileToken) throw new Error('Please complete the registration verification before continuing.');
    if (!window.wcdmrSupabase) throw new Error('Registration service is unavailable. Your draft was saved in this browser.');

    try {
        return await window.wcdmrSupabase.callFunction('public-register', {
            method: 'POST',
            body: {
                clientRegistrationId: formData.registrationId,
                firstName: formData.firstName,
                lastName: formData.lastName,
                email: formData.email,
                phone: formData.phone,
                videophone: formData.videophone,
                addressLine: formData.addressLine,
                city: formData.city,
                zipCode: formData.zipCode,
                churchName: formData.churchName,
                emergencyName: formData.emergencyName,
                emergencyPhone: formData.emergencyPhone,
                bunkSelection: formData.bunkSelection,
                youthInfo: formData.youthInfo,
                paymentUnderstanding: formData.paymentUnderstanding === true,
                amount: formData.amount,
                paymentMethod: formData.paymentMethod,
                turnstileToken
            }
        });
    } catch (error) {
        // A token may be one-time use even when the database request failed.
        // Reset it so the visitor can retry without losing the saved draft.
        try { window.turnstile.reset(window.wcdmrTurnstileWidgetId); } catch { /* ignore */ }
        throw error;
    }
}

// Browser redirects cannot prove payment. The backend keeps registrations pending
// until payment is verified by an administrator or a future PayPal webhook.
async function completeRegistration(formData, paymentId = '') {
    // A PayPal return arrives after the original Turnstile token has expired.
    // The pending registration was already created before redirect; never retry
    // it as a new public submission or treat the return as payment verification.
    if (formData?.paymentMethod === 'paypal') {
        persistLocalSafetyCopy({ ...formData, status: 'pending', timestamp: new Date().toISOString(), paymentId });
        return { status: 'pending' };
    }
    return storeRegistrationData(formData, paymentId);
}
async function submitToGoogleForm() { return false; }

if (typeof window !== 'undefined') {
    window.completeRegistration = completeRegistration;
    window.storeRegistrationData = storeRegistrationData;
    window.submitToGoogleForm = submitToGoogleForm;
    window.hasCompletedRegistration = hasCompletedRegistration;
    window.hasCompletedRegistrationAsync = hasCompletedRegistrationAsync;
    window.wcdmrTurnstileOnload = renderRegistrationTurnstile;
    window.addEventListener('DOMContentLoaded', renderRegistrationTurnstile);
}
