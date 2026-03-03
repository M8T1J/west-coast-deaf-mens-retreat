// Registration Handler
// Handles form submission to Google Forms (optional) and stores registration data

const GOOGLE_FORM_URL = 'https://docs.google.com/forms/d/e/YOUR_FORM_ID/formResponse'; // Not used - standalone system
const USE_GOOGLE_FORM = false; // Standalone system - no Google Forms needed
const REGISTRATIONS_STORAGE_KEY = 'wcdmr_registrations';

function normalizeIdentityValue(value) {
    return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function buildRegistrantIdentity(record) {
    const fallbackName = `${record.firstName || ''} ${record.lastName || ''}`.trim();
    const fullName = record.fullName || fallbackName;

    return {
        name: normalizeIdentityValue(fullName),
        email: normalizeIdentityValue(record.email)
    };
}

function isSameRegistrant(existingRecord, incomingRecord) {
    const existing = buildRegistrantIdentity(existingRecord);
    const incoming = buildRegistrantIdentity(incomingRecord);

    if (!incoming.name || !incoming.email) return false;
    return existing.name === incoming.name && existing.email === incoming.email;
}

function findRegistrationIndex(registrations, record, status = null) {
    return registrations.findIndex((existingRecord) => {
        if (status && existingRecord.status !== status) return false;
        return isSameRegistrant(existingRecord, record);
    });
}

function getStoredRegistrations() {
    try {
        const stored = localStorage.getItem(REGISTRATIONS_STORAGE_KEY);
        const parsed = stored ? JSON.parse(stored) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.error('Unable to parse stored registrations:', error);
        return [];
    }
}

function hasCompletedRegistration(formData) {
    const existingRegistrations = getStoredRegistrations();
    return findRegistrationIndex(existingRegistrations, formData, 'completed') !== -1;
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
            'entry.123456789': formData.fullName, // Full Name field ID
            'entry.987654321': formData.email, // Email field ID
            'entry.111222333': formData.phone, // Phone field ID
            'entry.444555666': formData.amount.toString() // Amount field ID
        };

        // Create form data
        const googleFormData = new FormData();
        Object.keys(formFields).forEach((key) => {
            googleFormData.append(key, formFields[key]);
        });

        // Submit to Google Form
        await fetch(GOOGLE_FORM_URL, {
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
 * Store registration data locally (for your records)
 * @param {Object} formData - Registration form data
 * @param {string} paymentId - Payment transaction ID (or 'PENDING' if not paid yet)
 */
function storeRegistrationData(formData, paymentId) {
    const isPendingPayment = paymentId === 'PENDING' || formData.paymentMethod === 'money_order';

    // Store in localStorage (for demo - in production, send to your backend)
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
        amount: formData.amount,
        paymentId: paymentId,
        timestamp: new Date().toISOString(),
        status: isPendingPayment ? 'pending' : 'completed'
    };

    const existingRegistrations = getStoredRegistrations();
    const pendingMatchIndex = findRegistrationIndex(existingRegistrations, registration, 'pending');
    const completedMatchIndex = findRegistrationIndex(existingRegistrations, registration, 'completed');

    // Keep one record per normalized full name + email.
    if (!isPendingPayment) {
        if (pendingMatchIndex !== -1) {
            existingRegistrations[pendingMatchIndex] = registration;
        } else if (completedMatchIndex !== -1) {
            existingRegistrations[completedMatchIndex] = registration;
        } else {
            existingRegistrations.push(registration);
        }
    } else if (completedMatchIndex !== -1) {
        console.log('Completed registration already exists for this name and email; pending duplicate skipped.');
    } else if (pendingMatchIndex !== -1) {
        existingRegistrations[pendingMatchIndex] = registration;
    } else {
        existingRegistrations.push(registration);
    }

    // Store (limit to last 100 registrations)
    const limitedRegistrations = existingRegistrations.slice(-100);
    localStorage.setItem(REGISTRATIONS_STORAGE_KEY, JSON.stringify(limitedRegistrations));

    console.log('Registration data stored locally', registration);
}

/**
 * Complete registration process
 * @param {Object} formData - Registration form data
 * @param {string} paymentId - Payment transaction ID
 */
async function completeRegistration(formData, paymentId) {
    // Store registration data
    storeRegistrationData(formData, paymentId);

    // Optionally submit to Google Form
    if (USE_GOOGLE_FORM) {
        await submitToGoogleForm(formData);
    }
}

// Export for use in other files
if (typeof window !== 'undefined') {
    window.completeRegistration = completeRegistration;
    window.storeRegistrationData = storeRegistrationData;
    window.submitToGoogleForm = submitToGoogleForm;
    window.hasCompletedRegistration = hasCompletedRegistration;
}
