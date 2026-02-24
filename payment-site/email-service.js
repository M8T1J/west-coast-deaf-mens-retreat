// Email Service Configuration
// This file handles sending confirmation emails after registration and payment

// EmailJS Configuration
// Get your credentials from: https://dashboard.emailjs.com/admin

// Initialize EmailJS - will be initialized when public key is set
let emailjsInitialized = false;

// Option 1: EmailJS (Quick setup for development/testing)
const EMAILJS_CONFIG = {
    serviceId: 'service_ai2qmh6', // Your EmailJS Service ID
    templateId: 'template_jwhfmxk', // Your EmailJS Template ID
    publicKey: 'U4HrVI_T_57CG3MQF', // Your EmailJS Public Key
    enabled: true // Email automation is now enabled!
};

// Initialize EmailJS when public key is available
function initEmailJS() {
    if (typeof emailjs !== 'undefined' && EMAILJS_CONFIG.publicKey && EMAILJS_CONFIG.publicKey !== 'YOUR_PUBLIC_KEY' && !emailjsInitialized) {
        try {
            emailjs.init(EMAILJS_CONFIG.publicKey);
            emailjsInitialized = true;
            console.log('EmailJS initialized successfully');
        } catch (error) {
            console.error('Error initializing EmailJS:', error);
        }
    }
}

// Initialize EmailJS when page loads
if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', () => {
        if (typeof emailjs !== 'undefined') {
            initEmailJS();
        }
    });
}

// Option 2: Backend API endpoint (Recommended for production)
// If your frontend runs on GitHub Pages, set this to your deployed backend URL.
// Example: const BACKEND_API_URL = 'https://your-vercel-backend.vercel.app/api/send-email';
const BACKEND_API_URL = 'https://your-backend-url.com/api/send-email';

function isPlaceholderBackendUrl(url) {
    return !url || url === 'https://your-backend-url.com/api/send-email';
}

function shouldAutoDiscoverBackend(hostname) {
    return hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname.endsWith('.vercel.app') ||
        hostname.endsWith('.netlify.app');
}

function getBackendApiCandidates() {
    const candidates = [];

    const explicitUrl = typeof window !== 'undefined' && window.WCDMR_EMAIL_API_URL
        ? window.WCDMR_EMAIL_API_URL
        : BACKEND_API_URL;

    if (!isPlaceholderBackendUrl(explicitUrl)) {
        candidates.push(explicitUrl);
    }

    if (typeof window !== 'undefined' && shouldAutoDiscoverBackend(window.location.hostname)) {
        candidates.push(`${window.location.origin}/api/send-email`);
        candidates.push(`${window.location.origin}/.netlify/functions/send-email`);
    }

    return [...new Set(candidates)];
}

async function sendViaBackendApi(emailData) {
    const backendUrls = getBackendApiCandidates();
    if (backendUrls.length === 0) {
        return false;
    }

    for (const apiUrl of backendUrls) {
        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(emailData)
            });

            if (response.ok) {
                console.log(`Confirmation email sent via backend API: ${apiUrl}`);
                return true;
            }

            console.error(`Backend email API failed (${response.status}) at ${apiUrl}`);
        } catch (error) {
            console.error(`Backend email API error at ${apiUrl}:`, error);
        }
    }

    return false;
}

/**
 * Send registration confirmation email
 * @param {Object} formData - Registration form data
 * @param {string} paymentId - Payment transaction ID
 * @returns {Promise<boolean>} - Success status
 */
async function sendConfirmationEmail(formData, paymentId) {
    const recipientEmail = (formData.email || '').trim();
    if (!recipientEmail) {
        console.error('Missing recipient email in registration data');
        return false;
    }

    const fullName = formData.fullName || `${formData.firstName || ''} ${formData.lastName || ''}`.trim();
    const displayName = fullName || formData.firstName || recipientEmail.split('@')[0] || 'Registrant';
    const amount = typeof formData.amount === 'number' ? (formData.amount / 100).toFixed(2) : parseFloat(formData.amount).toFixed(2);
    
    // Use a public absolute URL so email clients can always load the logo.
    const logoUrl = 'https://www.wcdmr.com/images/logo-enhanced.JPG';
    
    const emailData = {
        to: recipientEmail,
        toName: displayName,
        subject: `Welcome to West Coast Deaf Men's Retreat, ${displayName}`,
        template: 'confirmation',
        data: {
            fullName: displayName,
            firstName: formData.firstName || '',
            lastName: formData.lastName || '',
            email: formData.email,
            phone: formData.phone,
            videophone: formData.videophone || '',
            fullAddress: formData.fullAddress || '',
            churchName: formData.churchName || '',
            emergencyName: formData.emergencyName || '',
            emergencyPhone: formData.emergencyPhone || '',
            bunkSelection: formData.bunkSelection || '',
            youthInfo: formData.youthInfo || '',
            amount: amount,
            paymentId: paymentId,
            logoUrl: logoUrl,
            eventName: 'West Coast Deaf Men\'s Retreat 2026',
            eventDates: 'November 6-8, 2026',
            venue: 'Pine Crest Camp',
            eventLocation: 'Twin Peaks, CA',
            venueAddress: '1140 PINECREST ROAD, TWIN PEAKS, CA 92361',
            rsvpLink: 'https://forms.gle/qaW22U9mB2C1hGx86',
            facebookLink: 'https://www.facebook.com/wcdmr',
            instagramLink: 'https://www.instagram.com/wcdmr97/'
        }
    };

    try {
        // Try backend API first (SMTP/SendGrid via serverless)
        const sentViaBackend = await sendViaBackendApi(emailData);
        if (sentViaBackend) {
            return true;
        }

        // Fallback to EmailJS (development/testing)
        if (EMAILJS_CONFIG.enabled && typeof emailjs !== 'undefined') {
            try {
                // Initialize EmailJS if not already done
                initEmailJS();
                
                const htmlMessage = generateEmailHTML(emailData.data);
                const summaryText = [
                    `Event Dates: ${emailData.data.eventDates}`,
                    `Venue: ${emailData.data.venue}`,
                    `Location: ${emailData.data.eventLocation || 'Twin Peaks, CA'}`,
                    `Address: ${emailData.data.venueAddress}`,
                    `Payment Amount: $${emailData.data.amount}`,
                    `Transaction ID: ${paymentId}`
                ].join('\n');

                const summaryHtml = `
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;table-layout:fixed;">
                        <tr><td style="width:145px;padding:8px 0;font-weight:700;color:#1e3a5f;text-transform:uppercase;font-size:12px;vertical-align:top;">Event Dates</td><td style="padding:8px 0;font-weight:600;color:#111827;vertical-align:top;">${emailData.data.eventDates}</td></tr>
                        <tr><td style="width:145px;padding:8px 0;font-weight:700;color:#1e3a5f;text-transform:uppercase;font-size:12px;vertical-align:top;">Venue</td><td style="padding:8px 0;font-weight:600;color:#111827;vertical-align:top;">${emailData.data.venue}</td></tr>
                        <tr><td style="width:145px;padding:8px 0;font-weight:700;color:#1e3a5f;text-transform:uppercase;font-size:12px;vertical-align:top;">Location</td><td style="padding:8px 0;font-weight:600;color:#111827;vertical-align:top;">${emailData.data.eventLocation || 'Twin Peaks, CA'}</td></tr>
                        <tr><td style="width:145px;padding:8px 0;font-weight:700;color:#1e3a5f;text-transform:uppercase;font-size:12px;vertical-align:top;">Address</td><td style="padding:8px 0;font-weight:600;color:#111827;vertical-align:top;">${emailData.data.venueAddress}</td></tr>
                        <tr><td style="width:145px;padding:8px 0;font-weight:700;color:#1e3a5f;text-transform:uppercase;font-size:12px;vertical-align:top;">Payment Amount</td><td style="padding:8px 0;font-weight:600;color:#111827;vertical-align:top;">$${emailData.data.amount}</td></tr>
                        <tr><td style="width:145px;padding:8px 0;font-weight:700;color:#1e3a5f;text-transform:uppercase;font-size:12px;vertical-align:top;">Transaction ID</td><td style="padding:8px 0;font-weight:600;color:#111827;vertical-align:top;">${paymentId}</td></tr>
                    </table>
                `.trim();

                const templateParams = {
                    // Recipient aliases for different EmailJS template field names.
                    to_email: recipientEmail,
                    toEmail: recipientEmail,
                    email: recipientEmail,
                    to: recipientEmail,
                    recipient: recipientEmail,
                    user_email: recipientEmail,
                    userEmail: recipientEmail,
                    reply_to: recipientEmail,
                    replyTo: recipientEmail,

                    // Name aliases.
                    to_name: displayName,
                    recipient_name: displayName,
                    recipientName: displayName,
                    user_name: displayName,
                    userName: displayName,
                    attendee_name: displayName,
                    attendeeName: displayName,
                    registrant_name: displayName,
                    registrantName: displayName,
                    customer_name: displayName,
                    customerName: displayName,
                    name: displayName,
                    full_name: displayName,
                    fullName: displayName,
                    first_name: emailData.data.firstName,
                    firstName: emailData.data.firstName,
                    last_name: emailData.data.lastName,
                    lastName: emailData.data.lastName,

                    // Core message fields.
                    from_name: 'WCDMR 2026',
                    from_email: 'wcdeafmr@gmail.com',
                    subject: emailData.subject,
                    subject_line: emailData.subject,
                    subjectLine: emailData.subject,
                    email_subject: emailData.subject,
                    emailSubject: emailData.subject,
                    mail_subject: emailData.subject,
                    mailSubject: emailData.subject,
                    title: emailData.subject,
                    message: htmlMessage,
                    html: htmlMessage,
                    email_html: htmlMessage,
                    logo_url: emailData.data.logoUrl,
                    logoUrl: emailData.data.logoUrl,
                    logo: emailData.data.logoUrl,
                    header_logo: emailData.data.logoUrl,
                    headerLogo: emailData.data.logoUrl,
                    summary: summaryText,
                    summary_text: summaryText,
                    summaryText: summaryText,
                    registration_summary: summaryText,
                    registrationSummary: summaryText,
                    registration_details: summaryText,
                    registrationDetails: summaryText,
                    registration_summary_html: summaryHtml,
                    registrationSummaryHtml: summaryHtml,
                    summary_html: summaryHtml,
                    summaryHtml: summaryHtml,

                    // Registration details aliases.
                    amount: emailData.data.amount,
                    payment_id: paymentId,
                    paymentId: paymentId,
                    transaction_id: paymentId,
                    transactionId: paymentId,
                    event_dates: emailData.data.eventDates,
                    event_date: emailData.data.eventDates,
                    eventDates: emailData.data.eventDates,
                    eventDate: emailData.data.eventDates,
                    event_location: emailData.data.eventLocation || '',
                    eventLocation: emailData.data.eventLocation || '',
                    location: emailData.data.eventLocation || '',
                    venue: emailData.data.venue,
                    venue_name: emailData.data.venue,
                    venueName: emailData.data.venue,
                    venue_address: emailData.data.venueAddress,
                    venueAddress: emailData.data.venueAddress,
                    event_address: emailData.data.venueAddress,
                    eventAddress: emailData.data.venueAddress,
                    street_address: emailData.data.venueAddress,
                    streetAddress: emailData.data.venueAddress,
                    full_address: emailData.data.venueAddress,
                    fullAddress: emailData.data.venueAddress,
                    address: emailData.data.venueAddress,
                    tx_id: paymentId,
                    txId: paymentId,
                    txn_id: paymentId,
                    txnId: paymentId,
                    transaction: paymentId,
                    reference_id: paymentId,
                    referenceId: paymentId,
                    rsvp_link: emailData.data.rsvpLink,
                    facebook_link: emailData.data.facebookLink,
                    instagram_link: emailData.data.instagramLink
                };

                await emailjs.send(
                    EMAILJS_CONFIG.serviceId,
                    EMAILJS_CONFIG.templateId,
                    templateParams
                );
                console.log('Confirmation email sent via EmailJS');
                return true;
            } catch (emailjsError) {
                console.error('EmailJS error:', emailjsError);
                return false;
            }
        }

        console.warn('Email service not configured. Email not sent.');
        return false;
    } catch (error) {
        console.error('Error sending confirmation email:', error);
        // Don't fail the payment if email fails
        return false;
    }
}

/**
 * Generate HTML email template
 * @param {Object} data - Email data
 * @returns {string} - HTML email content
 */
function generateEmailHTML(data) {
    const resolvedLogoUrl = data.logoUrl || 'https://www.wcdmr.com/images/logo-enhanced.JPG';
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body { 
                    font-family: Arial, sans-serif; 
                    line-height: 1.6; 
                    color: #0a0e14; 
                    margin: 0;
                    padding: 0;
                    background: #f5f5f0;
                }
                .container { 
                    max-width: 600px; 
                    margin: 0 auto; 
                    padding: 0;
                    background: white;
                }
                .header {
                    background: linear-gradient(135deg, #f8fbff 0%, #e9f1ff 58%, #dbe9ff 100%);
                    color: #12315a;
                    padding: 28px 20px 32px;
                    text-align: center;
                    border-bottom: 2px solid #b8cdf1;
                }
                .email-logo {
                    max-width: 280px;
                    width: auto;
                    height: auto;
                    max-height: none;
                    margin: 0 auto 16px;
                    display: block;
                    border-radius: 4px;
                    background: #ffffff;
                    padding: 6px 10px;
                    box-shadow: 0 1px 4px rgba(15, 31, 53, 0.14);
                }
                .success-icon { 
                    color: #2f855a;
                    font-size: 46px; 
                    margin-bottom: 10px; 
                    font-weight: 900;
                }
                .header h1 {
                    color: #12315a;
                    font-size: 27px;
                    font-weight: 800;
                    text-transform: none;
                    letter-spacing: 0.01em;
                    margin: 0 0 10px 0;
                }
                .header p {
                    color: #244b78;
                    font-size: 17px;
                    font-weight: 600;
                    margin: 0;
                    opacity: 1;
                }
                .content { 
                    background: #ffffff; 
                    padding: 30px; 
                }
                .info-box { 
                    background: #f5f5f0; 
                    padding: 20px; 
                    border-radius: 4px; 
                    margin: 20px 0; 
                    border-left: 4px solid #c9a961; 
                    border: 2px solid #2d3748;
                }
                .summary-table {
                    width: 100%;
                    border-collapse: collapse;
                    table-layout: fixed;
                }
                .summary-table tr {
                    border-bottom: 1px solid #e5e7eb;
                }
                .summary-table tr:last-child {
                    border-bottom: none;
                }
                .summary-label {
                    width: 145px;
                    padding: 10px 0;
                    font-weight: 700;
                    color: #1e3a5f;
                    text-transform: uppercase;
                    font-size: 0.78rem;
                    letter-spacing: 0.04em;
                    vertical-align: top;
                }
                .summary-value {
                    padding: 10px 0;
                    font-weight: 600;
                    color: #111827;
                    word-break: break-word;
                    vertical-align: top;
                }
                .button { 
                    display: inline-block; 
                    background: #1e3a5f; 
                    color: white; 
                    padding: 14px 28px; 
                    text-decoration: none; 
                    border-radius: 4px; 
                    margin: 20px 0; 
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    border: 2px solid #c9a961;
                }
                .button:hover {
                    background: #0f1f35;
                }
                .footer { 
                    text-align: center; 
                    margin-top: 30px; 
                    padding-top: 20px; 
                    border-top: 2px solid #2d3748; 
                    color: #4a5568; 
                    font-size: 14px; 
                }
                .social-links { 
                    margin: 20px 0; 
                }
                .social-links a { 
                    color: #1e3a5f; 
                    text-decoration: none; 
                    margin: 0 10px; 
                    font-weight: 600;
                }
                .social-links a:hover {
                    color: #c9a961;
                }
                ul {
                    margin: 15px 0;
                    padding-left: 25px;
                }
                ul li {
                    margin: 8px 0;
                }
                p {
                    margin: 15px 0;
                }
                @media (max-width: 520px) {
                    .summary-label,
                    .summary-value {
                        display: block;
                        width: 100%;
                        padding: 6px 0;
                    }
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <img src="${resolvedLogoUrl}" alt="West Coast Deaf Men's Retreat Logo" class="email-logo" style="max-width: 280px; width: auto; height: auto; margin: 0 auto 16px; display: block; border-radius: 4px; background: #ffffff; padding: 6px 10px; box-shadow: 0 1px 4px rgba(15, 31, 53, 0.14);">
                    <div class="success-icon">✓</div>
                    <h1>Welcome to West Coast Deaf Men's Retreat</h1>
                    <p>West Coast Deaf Men's Retreat 2026</p>
                </div>
                <div class="content">
                    <p>Dear ${data.fullName},</p>
                    
                    <p>Thank you for registering for the West Coast Deaf Men's Retreat 2026! We are excited to have you with us.</p>
                    <p>Friendly reminder: please make sure your registration payment is completed before <strong>October 23, 2026</strong>.</p>
                    
                    <div class="info-box">
                        <table class="summary-table" role="presentation" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                                <td class="summary-label">Event Dates</td>
                                <td class="summary-value">${data.eventDates}</td>
                            </tr>
                            <tr>
                                <td class="summary-label">Venue</td>
                                <td class="summary-value">${data.venue}</td>
                            </tr>
                            <tr>
                                <td class="summary-label">Location</td>
                                <td class="summary-value">${data.eventLocation || 'Twin Peaks, CA'}</td>
                            </tr>
                            <tr>
                                <td class="summary-label">Address</td>
                                <td class="summary-value">${data.venueAddress}</td>
                            </tr>
                            <tr>
                                <td class="summary-label">Payment Amount</td>
                                <td class="summary-value">$${data.amount}</td>
                            </tr>
                            <tr>
                                <td class="summary-label">Transaction ID</td>
                                <td class="summary-value">${data.paymentId}</td>
                            </tr>
                        </table>
                    </div>
                    
                    <p><strong>Next Steps:</strong></p>
                    <ul>
                        <li>Please complete the RSVP form if you haven't already</li>
                        <li>Save this confirmation email for your records</li>
                        <li>We will keep you updated with speakers and errands</li>
                    </ul>
                    
                    <div style="text-align: center;">
                        <a href="${data.rsvpLink}" class="button">Complete RSVP Form</a>
                    </div>
                    
                    <div class="social-links" style="text-align: center;">
                        <p>Follow us:</p>
                        <a href="${data.facebookLink}">Facebook</a> | 
                        <a href="${data.instagramLink}">Instagram</a>
                    </div>
                    
                    <p>If you have any questions, please contact us through the RSVP form or our social media channels.</p>
                    <p>We will keep you updated with speaker announcements and errands as the retreat date gets closer.</p>
                    
                    <p>We look forward to seeing you at Pine Crest Camp!</p>
                    
                    <p>Blessings,<br>
                    <strong>WCDMR 2026 Team</strong></p>
                    
                    <div class="footer">
                        <p>West Coast Deaf Men's Retreat 2026</p>
                        <p>This is an automated confirmation email. Please do not reply to this email.</p>
                    </div>
                </div>
            </div>
        </body>
        </html>
    `;
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { sendConfirmationEmail, generateEmailHTML };
}

// Also notify organizer inbox when a registration is confirmed.
const ADMIN_NOTIFICATION_EMAIL = 'wcdeafmr@gmail.com';
const originalSendConfirmationEmail = sendConfirmationEmail;
const FORMSUBMIT_ENDPOINT = 'https://formsubmit.co/ajax/wcdeafmr@gmail.com';

async function sendViaFormSubmitFallback(formData, paymentId) {
    const fullName = formData.fullName || `${formData.firstName || ''} ${formData.lastName || ''}`.trim();
    const amount = typeof formData.amount === 'number' ? (formData.amount / 100).toFixed(2) : parseFloat(formData.amount || '0').toFixed(2);

    try {
        const response = await fetch(FORMSUBMIT_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json'
            },
            body: JSON.stringify({
                name: fullName || 'WCDMR Registrant',
                email: formData.email || 'no-email@wcdmr.com',
                _subject: `New WCDMR Registration - ${fullName || 'Registrant'}`,
                _template: 'table',
                _captcha: 'false',
                _autoresponse: `Thank you for registering for WCDMR 2026. Your payment ID is ${paymentId}.`,
                message: `
Name: ${fullName}
Email: ${formData.email || 'N/A'}
Phone: ${formData.phone || 'N/A'}
Amount: $${amount}
Payment ID: ${paymentId}
Church: ${formData.churchName || 'N/A'}
Emergency Contact: ${formData.emergencyName || 'N/A'} (${formData.emergencyPhone || 'N/A'})
                `.trim()
            })
        });

        if (!response.ok) {
            const body = await response.text();
            console.error('FormSubmit fallback failed:', response.status, body);
            return false;
        }

        console.log('FormSubmit fallback accepted registration notification');
        return true;
    } catch (error) {
        console.error('FormSubmit fallback error:', error);
        return false;
    }
}

async function sendConfirmationEmailWithAdmin(formData, paymentId) {
    let attendeeSent = false;

    if (typeof originalSendConfirmationEmail === 'function') {
        attendeeSent = await originalSendConfirmationEmail(formData, paymentId);
    }

    // Best-effort organizer notification through EmailJS.
    let adminSent = false;
    if (EMAILJS_CONFIG.enabled && typeof emailjs !== 'undefined' && ADMIN_NOTIFICATION_EMAIL) {
        const fullName = formData.fullName || `${formData.firstName || ''} ${formData.lastName || ''}`.trim();
        const amount = typeof formData.amount === 'number' ? (formData.amount / 100).toFixed(2) : parseFloat(formData.amount).toFixed(2);

        try {
            initEmailJS();
            await emailjs.send(
                EMAILJS_CONFIG.serviceId,
                EMAILJS_CONFIG.templateId,
                {
                    to_email: ADMIN_NOTIFICATION_EMAIL,
                    to_name: 'WCDMR Team',
                    from_name: 'WCDMR 2026',
                    from_email: 'wcdeafmr@gmail.com',
                    subject: `New WCDMR Registration - ${fullName}`,
                    message: `
                        <h2>New Registration Received</h2>
                        <p><strong>Name:</strong> ${fullName}</p>
                        <p><strong>Email:</strong> ${formData.email || 'N/A'}</p>
                        <p><strong>Phone:</strong> ${formData.phone || 'N/A'}</p>
                        <p><strong>Amount:</strong> $${amount}</p>
                        <p><strong>Payment ID:</strong> ${paymentId}</p>
                    `,
                    amount: amount,
                    payment_id: paymentId,
                    event_dates: 'November 6-8, 2026',
                    venue: 'Pine Crest Camp, Twin Peaks, CA',
                    venue_address: '1140 PINECREST ROAD, TWIN PEAKS, CA 92361',
                    rsvp_link: 'https://forms.gle/qaW22U9mB2C1hGx86',
                    facebook_link: 'https://www.facebook.com/wcdmr',
                    instagram_link: 'https://www.instagram.com/wcdmr97/'
                }
            );
            adminSent = true;
        } catch (error) {
            console.error('Organizer notification email failed:', error);
        }
    }

    if (attendeeSent || adminSent) {
        return true;
    }

    // Final fallback if EmailJS template configuration is invalid.
    return await sendViaFormSubmitFallback(formData, paymentId);
}

if (typeof window !== 'undefined') {
    window.sendConfirmationEmail = sendConfirmationEmailWithAdmin;
}

if (typeof sendConfirmationEmail === 'function') {
    sendConfirmationEmail = sendConfirmationEmailWithAdmin;
}
