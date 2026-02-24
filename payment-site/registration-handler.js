// Registration Handler
// Handles form submission to Google Forms (optional) and stores registration data

const GOOGLE_FORM_URL = 'https://docs.google.com/forms/d/e/YOUR_FORM_ID/formResponse'; // Not used - standalone system
const USE_GOOGLE_FORM = false; // Standalone system - no Google Forms needed

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
 * Store registration data locally (for your records)
 * @param {Object} formData - Registration form data
 * @param {string} paymentId - Payment transaction ID (or 'PENDING' if not paid yet)
 */
function storeRegistrationData(formData, paymentId) {
    const addressLine = formData.addressLine || '';
    const city = formData.city || '';
    const zipCode = formData.zipCode || formData.zip || '';
    const fullAddress = formData.fullAddress || [addressLine, city, zipCode].filter(Boolean).join(', ');
    const isPendingPayment = paymentId === 'PENDING' || formData.paymentMethod === 'money_order';

    // Store in localStorage (for demo - in production, send to your backend)
    const registration = {
        firstName: formData.firstName || formData.fullName?.split(' ')[0] || '',
        lastName: formData.lastName || formData.fullName?.split(' ').slice(1).join(' ') || '',
        fullName: formData.fullName || `${formData.firstName || ''} ${formData.lastName || ''}`.trim(),
        email: formData.email,
        phone: formData.phone,
        videophone: formData.videophone || '',
        addressLine,
        city,
        zipCode,
        fullAddress,
        churchName: formData.churchName || '',
        emergencyName: formData.emergencyName || '',
        emergencyPhone: formData.emergencyPhone || '',
        bunkSelection: formData.bunkSelection || '',
        youthInfo: formData.youthInfo || '',
        paymentUnderstanding: formData.paymentUnderstanding || false,
        paymentMethod: formData.paymentMethod || '',
        amount: formData.amount,
        paymentId: paymentId,
        timestamp: new Date().toISOString(),
        status: isPendingPayment ? 'pending' : 'completed'
    };

    // Get existing registrations
    const existingRegistrations = JSON.parse(localStorage.getItem('wcdmr_registrations') || '[]');
    
    // If updating a pending registration, find and update it
    if (!isPendingPayment) {
        const pendingIndex = existingRegistrations.findIndex(r => 
            r.email === formData.email && r.status === 'pending'
        );
        if (pendingIndex !== -1) {
            existingRegistrations[pendingIndex] = registration;
        } else {
            existingRegistrations.push(registration);
        }
    } else {
        existingRegistrations.push(registration);
    }
    
    // Store (limit to last 100 registrations)
    const limitedRegistrations = existingRegistrations.slice(-100);
    localStorage.setItem('wcdmr_registrations', JSON.stringify(limitedRegistrations));

    console.log('Registration data stored locally', registration);
    
    // In production, you would send this to your backend:
    // fetch('/api/registrations', {
    //     method: 'POST',
    //     headers: { 'Content-Type': 'application/json' },
    //     body: JSON.stringify(registration)
    // });
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
    
    // Send confirmation email (already handled in email-service.js)
    // This is called from the payment success handler
}

// Export for use in other files
if (typeof window !== 'undefined') {
    window.completeRegistration = completeRegistration;
    window.storeRegistrationData = storeRegistrationData;
    window.submitToGoogleForm = submitToGoogleForm;
}
