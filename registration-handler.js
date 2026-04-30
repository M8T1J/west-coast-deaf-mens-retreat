// Registration Handler
// Handles form submission to Google Forms (optional) and stores registration data

const GOOGLE_FORM_URL = 'https://docs.google.com/forms/d/e/YOUR_FORM_ID/formResponse'; // Not used - standalone system
const USE_GOOGLE_FORM = false; // Standalone system - no Google Forms needed
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

function readLocalRegistrations() {
    try {
        return safeParseRegistrations(localStorage.getItem(WCDMR_REGISTRATION_STORAGE_KEY));
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
        const authoritative = limitRegistrations(sharedRegistrations);
        persistLocalRegistrations(authoritative);
        return authoritative;
    }
    return mergeRegistrations(localRegistrations);
}

let registrationSyncPromise = null;

async function syncAuthoritativeRegistrations(force = false) {
    if (!force && registrationSyncPromise) {
        return registrationSyncPromise;
    }

    registrationSyncPromise = (async () => {
        const localRegistrations = readLocalRegistrations();
        const sharedRegistrations = await fetchSharedRegistrations();
        return getAuthoritativeRegistrations(sharedRegistrations, localRegistrations);
    })();

    try {
        return await registrationSyncPromise;
    } finally {
        registrationSyncPromise = null;
    }
}

function normalizeIdentityPart(value) {
    return String(value || '').trim().toLowerCase();
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

function hasCompletedRegistration(formData) {
    const email = normalizeIdentityPart(formData && formData.email);
    const fullName = normalizeIdentityPart(
        (formData && formData.fullName) ||
        `${formData && formData.firstName ? formData.firstName : ''} ${formData && formData.lastName ? formData.lastName : ''}`
    );
    if (!email && !fullName) return false;

    const registrations = readLocalRegistrations();
    return registrations.some((registration) => {
        if (!registration || registration.status !== 'completed') return false;
        const registrationEmail = normalizeIdentityPart(registration.email);
        const registrationName = normalizeIdentityPart(
            registration.fullName ||
            `${registration.firstName || ''} ${registration.lastName || ''}`
        );
        return registrationEmail === email && registrationName === fullName;
    });
}

async function hasCompletedRegistrationAsync(formData) {
    await syncAuthoritativeRegistrations();
    return hasCompletedRegistration(formData);
}

/**
 * Submit registration to Google Forms (optional)
 * @param {Object} formData - Registration form data
 * @returns {Promise<boolean>} - Success status
 */
async function submitToGoogleForm(formData) {
    if (!USE_GOOGLE_FORM || !GOOGLE_FORM_URL.includes('YOUR_FORM_ID')) {
        return false;
    }

    try {
        // Get Google Form field IDs (you'll need to inspect your form to get these)
        // Example field IDs (replace with your actual field IDs):
        const formFields = {
            'entry.123456789': formData.fullName,      // Full Name field ID
            'entry.987654321': formData.email,          // Email field ID
            'entry.111222333': formData.phone,          // Phone field ID
            'entry.444555666': formData.amount.toString() // Amount field ID
        };

        // Create form data
        const googleFormData = new FormData();
        Object.keys(formFields).forEach(key => {
            googleFormData.append(key, formFields[key]);
        });

        // Submit to Google Form
        const response = await fetch(GOOGLE_FORM_URL, {
            method: 'POST',
            mode: 'no-cors', // Google Forms doesn't allow CORS
            body: googleFormData
        });

        console.log('Registration submitted to Google Form');
        return true;
    } catch (error) {
        console.error('Error submitting to Google Form:', error);
        return false;
    }
}

/**
 * Store registration data (shared + local backup)
 * @param {Object} formData - Registration form data
 * @param {string} paymentId - Payment transaction ID (or 'PENDING' if not paid yet)
 */
async function storeRegistrationData(formData, paymentId) {
    const registration = {
        firstName: formData.firstName || formData.fullName?.split(' ')[0] || '',
        lastName: formData.lastName || formData.fullName?.split(' ').slice(1).join(' ') || '',
        fullName: formData.fullName || `${formData.firstName || ''} ${formData.lastName || ''}`.trim(),
        email: formData.email,
        phone: formData.phone,
        videophone: formData.videophone || '',
        fullAddress: formData.fullAddress || '',
        churchName: formData.churchName || '',
        emergencyName: formData.emergencyName || '',
        emergencyPhone: formData.emergencyPhone || '',
        bunkSelection: formData.bunkSelection || '',
        youthInfo: formData.youthInfo || '',
        paymentUnderstanding: formData.paymentUnderstanding || false,
        amount:
            typeof window !== 'undefined' && typeof window.registrationAmountToDollarsNumber === 'function'
                ? window.registrationAmountToDollarsNumber(formData.amount)
                : formData.amount,
        paymentId: paymentId,
        timestamp: new Date().toISOString(),
        status: paymentId === 'PENDING' ? 'pending' : 'completed'
    };

    const localRegistrations = readLocalRegistrations();
    const remoteRegistrations = await fetchSharedRegistrations();
    const existingRegistrations = getAuthoritativeRegistrations(remoteRegistrations, localRegistrations);

    // If updating a pending registration, find and update it.
    if (paymentId !== 'PENDING') {
        const normalizedEmail = normalizeIdentityPart(formData.email);
        const pendingIndex = existingRegistrations.findIndex((r) =>
            normalizeIdentityPart(r.email) === normalizedEmail && r.status === 'pending'
        );
        if (pendingIndex !== -1) {
            existingRegistrations[pendingIndex] = registration;
        } else {
            existingRegistrations.push(registration);
        }
    } else {
        existingRegistrations.push(registration);
    }
    
    const mergedRegistrations = mergeRegistrations(existingRegistrations);
    persistLocalRegistrations(mergedRegistrations);

    const synced = await pushSharedRegistrations(mergedRegistrations);
    if (!synced) {
        // Local backup already saved above, so this preserves registrations even during outages.
        console.warn('Saved registration locally; shared sync will retry on the next update.');
    }

    console.log('Registration data saved', registration);
    return registration;
}

/**
 * Complete registration process
 * @param {Object} formData - Registration form data
 * @param {string} paymentId - Payment transaction ID
 */
async function completeRegistration(formData, paymentId) {
    // Store registration data
    await storeRegistrationData(formData, paymentId);
    
    // Optionally submit to Google Form
    if (USE_GOOGLE_FORM) {
        await submitToGoogleForm(formData);
    }
    
    // Send confirmation email (already handled in email-service.js)
    // This is called from the payment success handler
}

// Export for use in other files
if (typeof window !== 'undefined') {
    window.completeRegistration = completeRegistration;
    window.storeRegistrationData = storeRegistrationData;
    window.submitToGoogleForm = submitToGoogleForm;
    window.hasCompletedRegistration = hasCompletedRegistration;
    window.hasCompletedRegistrationAsync = hasCompletedRegistrationAsync;
    window.syncAuthoritativeRegistrations = syncAuthoritativeRegistrations;

    window.addEventListener('DOMContentLoaded', () => {
        syncAuthoritativeRegistrations().catch((error) => {
            console.warn('Unable to warm shared registration data on page load.', error);
        });
    });
}
