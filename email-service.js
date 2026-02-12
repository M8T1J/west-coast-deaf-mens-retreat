// Email Service Configuration
// Sends attendee confirmation plus organizer notification emails.

// EmailJS Configuration
const EMAILJS_CONFIG = {
    serviceId: 'service_ai2qmh6',
    templateId: 'template_k5knn6d',
    publicKey: 'U4HrVI_T_57CG3MQF',
    enabled: true
};

// Organizer notification recipient
const ADMIN_NOTIFICATION_EMAIL = 'wcdeafmr@gmail.com';

// Optional backend API endpoint (recommended for production).
// Keep placeholder to skip backend call when not configured.
const BACKEND_API_URL = 'https://your-backend-url.com/api/send-email';

let emailjsInitialized = false;

function initEmailJS() {
    if (
        typeof emailjs !== 'undefined' &&
        EMAILJS_CONFIG.publicKey &&
        EMAILJS_CONFIG.publicKey !== 'YOUR_PUBLIC_KEY' &&
        !emailjsInitialized
    ) {
        try {
            emailjs.init(EMAILJS_CONFIG.publicKey);
            emailjsInitialized = true;
            console.log('EmailJS initialized successfully');
        } catch (error) {
            console.error('Error initializing EmailJS:', error);
        }
    }
}

if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', () => {
        if (typeof emailjs !== 'undefined') {
            initEmailJS();
        }
    });
}

function normalizeRegistrationData(formData, paymentId) {
    const fullName = formData.fullName || `${formData.firstName || ''} ${formData.lastName || ''}`.trim();
    const rawAmount = typeof formData.amount === 'number' ? formData.amount : parseFloat(formData.amount || '0');
    const amount = rawAmount > 1000 ? (rawAmount / 100).toFixed(2) : rawAmount.toFixed(2);
    const websiteUrl = typeof window !== 'undefined' ? window.location.origin : 'https://www.wcdmr.com';
    const logoUrl = `${websiteUrl}/images/logo.JPG`;

    return {
        fullName,
        firstName: formData.firstName || '',
        lastName: formData.lastName || '',
        email: formData.email || '',
        phone: formData.phone || '',
        videophone: formData.videophone || '',
        fullAddress: formData.fullAddress || '',
        churchName: formData.churchName || '',
        emergencyName: formData.emergencyName || '',
        emergencyPhone: formData.emergencyPhone || '',
        bunkSelection: formData.bunkSelection || '',
        youthInfo: formData.youthInfo || '',
        amount,
        paymentId,
        logoUrl,
        eventName: 'West Coast Deaf Men\'s Retreat 2026',
        eventDates: 'November 6-8, 2026',
        venue: 'Pine Crest Camp, Twin Peaks, CA',
        venueAddress: '1140 PINECREST ROAD, TWIN PEAKS, CA 92361',
        rsvpLink: 'https://forms.gle/qaW22U9mB2C1hGx86',
        facebookLink: 'https://www.facebook.com/wcdmr',
        instagramLink: 'https://www.instagram.com/wcdmr97/'
    };
}

async function sendViaBackend(emailData) {
    if (!BACKEND_API_URL || BACKEND_API_URL === 'https://your-backend-url.com/api/send-email') {
        return false;
    }

    try {
        const response = await fetch(BACKEND_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(emailData)
        });
        return response.ok;
    } catch (error) {
        console.error('Backend email API failed:', error);
        return false;
    }
}

async function sendViaEmailJS(params) {
    if (!EMAILJS_CONFIG.enabled || typeof emailjs === 'undefined') {
        return false;
    }

    try {
        initEmailJS();
        await emailjs.send(EMAILJS_CONFIG.serviceId, EMAILJS_CONFIG.templateId, params);
        return true;
    } catch (error) {
        console.error('EmailJS send failed:', error);
        return false;
    }
}

function buildTemplateParams(toEmail, toName, subject, htmlMessage, data) {
    return {
        to_email: toEmail,
        to_name: toName,
        from_name: 'WCDMR 2026',
        from_email: 'wcdeafmr@gmail.com',
        subject,
        message: htmlMessage,
        amount: data.amount,
        payment_id: data.paymentId,
        event_dates: data.eventDates,
        venue: data.venue,
        venue_address: data.venueAddress,
        rsvp_link: data.rsvpLink,
        facebook_link: data.facebookLink,
        instagram_link: data.instagramLink
    };
}

/**
 * Send registration confirmation email to attendee and notification to organizers.
 * @param {Object} formData - Registration form data
 * @param {string} paymentId - Payment transaction ID
 * @returns {Promise<boolean>}
 */
async function sendConfirmationEmail(formData, paymentId) {
    const data = normalizeRegistrationData(formData, paymentId);

    // If backend is configured and succeeds, use it as primary path.
    const backendSent = await sendViaBackend({
        to: data.email,
        toName: data.fullName,
        subject: 'WCDMR 2026 - Registration Confirmed!',
        template: 'confirmation',
        data
    });
    if (backendSent) {
        console.log('Confirmation email sent via backend API');
        return true;
    }

    // Send attendee confirmation via EmailJS.
    const attendeeParams = buildTemplateParams(
        data.email,
        data.fullName,
        'WCDMR 2026 - Registration Confirmed!',
        generateConfirmationEmailHTML(data),
        data
    );
    const attendeeSent = await sendViaEmailJS(attendeeParams);

    // Send organizer notification via EmailJS (best effort).
    let adminSent = false;
    if (ADMIN_NOTIFICATION_EMAIL) {
        const adminParams = buildTemplateParams(
            ADMIN_NOTIFICATION_EMAIL,
            'WCDMR Team',
            `New WCDMR Registration - ${data.fullName}`,
            generateAdminNotificationEmailHTML(data),
            data
        );
        adminSent = await sendViaEmailJS(adminParams);
    }

    if (!attendeeSent && !adminSent) {
        console.warn('No confirmation emails were sent');
    } else {
        console.log('Email delivery results', {
            attendeeSent,
            adminSent
        });
    }

    return attendeeSent || adminSent;
}

function generateConfirmationEmailHTML(data) {
    return `
        <h2>Registration Confirmed!</h2>
        <p>Dear ${data.fullName},</p>
        <p>Thank you for registering for West Coast Deaf Men's Retreat 2026.</p>
        <p><strong>Amount:</strong> $${data.amount}</p>
        <p><strong>Transaction ID:</strong> ${data.paymentId}</p>
        <p><strong>Event Dates:</strong> ${data.eventDates}</p>
        <p><strong>Venue:</strong> ${data.venue}</p>
        <p><strong>Address:</strong> ${data.venueAddress}</p>
        <p>We look forward to seeing you at Pine Crest Camp!</p>
    `;
}

function generateAdminNotificationEmailHTML(data) {
    return `
        <h2>New Registration Received</h2>
        <p><strong>Name:</strong> ${data.fullName}</p>
        <p><strong>Email:</strong> ${data.email}</p>
        <p><strong>Phone:</strong> ${data.phone}</p>
        <p><strong>Videophone:</strong> ${data.videophone || 'N/A'}</p>
        <p><strong>Church:</strong> ${data.churchName || 'N/A'}</p>
        <p><strong>Address:</strong> ${data.fullAddress || 'N/A'}</p>
        <p><strong>Emergency Contact:</strong> ${data.emergencyName || 'N/A'} (${data.emergencyPhone || 'N/A'})</p>
        <p><strong>Bunk Selection:</strong> ${data.bunkSelection || 'N/A'}</p>
        <p><strong>Youth Info:</strong> ${data.youthInfo || 'N/A'}</p>
        <p><strong>Amount:</strong> $${data.amount}</p>
        <p><strong>Payment ID:</strong> ${data.paymentId}</p>
        <p><strong>Event:</strong> ${data.eventName}</p>
    `;
}

if (typeof window !== 'undefined') {
    window.sendConfirmationEmail = sendConfirmationEmail;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        sendConfirmationEmail,
        generateConfirmationEmailHTML,
        generateAdminNotificationEmailHTML
    };
}
