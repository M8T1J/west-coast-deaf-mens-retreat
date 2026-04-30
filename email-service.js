// Email Service Configuration
// This file handles sending confirmation emails after registration and payment

// EmailJS Configuration
// Get your credentials from: https://dashboard.emailjs.com/admin

// Initialize EmailJS - will be initialized when public key is set
let emailjsInitialized = false;

const WCDMR_EMAIL_SENDER_NAME = "West Coast Deaf Men's Retreat";
const WCDMR_EVENT_NAME = "West Coast Deaf Men's Retreat 2026";
const WCDMR_EVENT_DATES = 'November 6-8, 2026';
const WCDMR_EVENT_VENUE = 'Pine Crest Camp, Twin Peaks, CA';
const WCDMR_EVENT_ADDRESS = '1140 PINECREST ROAD, TWIN PEAKS, CA 92361';
const WCDMR_FACEBOOK_LINK = 'https://www.facebook.com/wcdmr';
const WCDMR_INSTAGRAM_LINK = 'https://www.instagram.com/wcdmr97/';
const WCDMR_INFO_EMAIL = 'wcdeafmr@gmail.com';

// Option 1: EmailJS (Quick setup for development/testing)
const EMAILJS_CONFIG = {
    serviceId: 'service_ai2qmh6', // Your EmailJS Service ID
    templateId: 'template_jwhfmxk', // EmailJS Template ID (dashboard)
    publicKey: 'U4HrVI_T_57CG3MQF', // Your EmailJS Public Key
    senderName: WCDMR_EMAIL_SENDER_NAME,
    enabled: true // Email automation is now enabled!
};
if (typeof window !== 'undefined' && window.WCDMR_EMAILJS_CONFIG) {
    Object.assign(EMAILJS_CONFIG, window.WCDMR_EMAILJS_CONFIG);
}

// Initialize EmailJS when public key is available (@emailjs/browser v4)
function initEmailJS() {
    const ej = typeof emailjs !== 'undefined' ? emailjs : (typeof window !== 'undefined' ? window.emailjs : undefined);
    if (!ej || !EMAILJS_CONFIG.publicKey || EMAILJS_CONFIG.publicKey === 'YOUR_PUBLIC_KEY' || emailjsInitialized) {
        return;
    }
    try {
        ej.init(EMAILJS_CONFIG.publicKey);
        emailjsInitialized = true;
        console.log('EmailJS initialized successfully');
    } catch (error) {
        console.error('Error initializing EmailJS:', error);
    }
}

function getEmailClient() {
    if (typeof emailjs !== 'undefined') return emailjs;
    if (typeof window !== 'undefined' && window.emailjs) return window.emailjs;
    return undefined;
}

/**
 * Wait for @emailjs/browser to finish loading (defer order or slow CDN).
 */
async function ensureEmailJsReady(timeoutMs = 10000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const ej = getEmailClient();
        if (ej) return ej;
        await new Promise((r) => setTimeout(r, 40));
    }
    console.error('EmailJS SDK did not load in time. Check that @emailjs/browser script is not blocked.');
    return undefined;
}

// Initialize EmailJS when page loads
if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', () => {
        initEmailJS();
    });
}

// Option 2: Backend API endpoint (Recommended for production)
const BACKEND_API_URL = 'https://your-backend-url.com/api/send-email'; // Replace with your backend URL

/**
 * Send registration confirmation email
 * @param {Object} formData - Registration form data
 * @param {string} paymentId - Payment transaction ID
 * @returns {Promise<boolean>} - Success status
 */
function registrationFeeToDollarsNumber(raw) {
    let n = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(/,/g, ''));
    if (!Number.isFinite(n) || n <= 0) return 0;
    const anchor =
        typeof window !== 'undefined' && Number(window.WCDMR_DEFAULT_REGISTRATION_AMOUNT) > 0
            ? Number(window.WCDMR_DEFAULT_REGISTRATION_AMOUNT)
            : 245;
    if (Number.isInteger(n) && n >= 1000 && anchor > 0) {
        const ratio = n / anchor;
        if (ratio >= 99 && ratio <= 101) {
            return n / 100;
        }
    }
    return n;
}

function normalizeAmountDollarsString(formData) {
    const raw = formData.amount;
    if (raw == null || raw === '') return '0.00';
    const n = registrationFeeToDollarsNumber(raw);
    if (!Number.isFinite(n) || n <= 0) return '0.00';
    return n.toFixed(2);
}

function getEmailStage(paymentId) {
    return String(paymentId || '').startsWith('PENDING-') ? 'pending' : 'confirmed';
}

function buildEmailContent(paymentId, amount) {
    const stage = getEmailStage(paymentId);
    if (stage === 'pending') {
        return {
            stage,
            subject: 'WCDMR 2026 - Complete your PayPal payment',
            heading: 'Registration saved - payment still needed',
            intro:
                "We saved your registration details. To finish your spot, please complete your PayPal payment using the button or browser window that just opened.",
            amountLabel: 'Amount due',
            referenceLabel: 'Pending reference',
            nextSteps: [
                'Complete your PayPal payment to finish registration.',
                'Keep this email for your records until payment is complete.',
                'Contact the WCDMR team if you need help before payment.'
            ],
            outro: 'Once payment is received, your registration will be fully confirmed.',
            support:
                `If you have questions or need help before payment, email ${WCDMR_INFO_EMAIL}.`
        };
    }

    return {
        stage,
        subject: 'WCDMR 2026 - Registration confirmed',
        heading: 'Registration confirmed',
        intro:
            "Thank you for registering for the West Coast Deaf Men's Retreat 2026. We're glad you'll join us for this time of prayer, worship, and fellowship.",
        amountLabel: 'Amount received',
        referenceLabel: 'Reference / ID',
        nextSteps: [
            'Complete the RSVP form if you have not already.',
            'Keep this email for your records.',
            'Follow us for updates and event reminders.'
        ],
        outro: 'We look forward to seeing you at Pine Crest Camp.',
        support:
            'If you have questions, contact us through the RSVP form or our social channels.'
    };
}

async function sendConfirmationEmail(formData, paymentId) {
    const toAddr = formData.email != null ? String(formData.email).trim() : '';
    if (!toAddr || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toAddr)) {
        console.warn('sendConfirmationEmail: invalid or missing email address');
        return false;
    }

    const fullName = (formData.fullName || `${formData.firstName || ''} ${formData.lastName || ''}`.trim()).trim() || 'Registrant';
    const amount = normalizeAmountDollarsString(formData);
    const senderName = String(EMAILJS_CONFIG.senderName || WCDMR_EMAIL_SENDER_NAME).trim() || WCDMR_EMAIL_SENDER_NAME;
    const emailContent = buildEmailContent(paymentId, amount);
    
    // Get website URL for logo (you'll need to update this with your actual website URL)
    const websiteUrl = typeof window !== 'undefined' ? window.location.origin : 'https://your-website-url.com';
    const logoUrl = `${websiteUrl}/images/logo-enhanced.JPG?v=20260430-share1`;
    
    const emailData = {
        to: toAddr,
        toName: fullName,
        subject: emailContent.subject,
        template: 'confirmation',
        data: {
            fullName: fullName,
            firstName: formData.firstName || '',
            lastName: formData.lastName || '',
            email: toAddr,
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
            emailHeading: emailContent.heading,
            introCopy: emailContent.intro,
            amountLabel: emailContent.amountLabel,
            referenceLabel: emailContent.referenceLabel,
            nextStepOne: emailContent.nextSteps[0],
            nextStepTwo: emailContent.nextSteps[1],
            nextStepThree: emailContent.nextSteps[2],
            outroCopy: emailContent.outro,
            supportCopy: emailContent.support,
            eventName: WCDMR_EVENT_NAME,
            eventDates: WCDMR_EVENT_DATES,
            venue: WCDMR_EVENT_VENUE,
            venueAddress: WCDMR_EVENT_ADDRESS,
            rsvpLink: 'https://forms.gle/qaW22U9mB2C1hGx86',
            facebookLink: WCDMR_FACEBOOK_LINK,
            instagramLink: WCDMR_INSTAGRAM_LINK
        }
    };

    try {
        // Try backend API first (production)
        if (BACKEND_API_URL && BACKEND_API_URL !== 'https://your-backend-url.com/api/send-email') {
            const response = await fetch(BACKEND_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(emailData)
            });

            if (response.ok) {
                console.log('Confirmation email sent via backend API');
                return true;
            } else {
                console.error('Backend email API failed, trying EmailJS...');
            }
        }

        // EmailJS (same template/service as dashboard test — must match EmailJS template variable names)
        if (!EMAILJS_CONFIG.enabled) {
            console.warn('EmailJS disabled in config.');
            return false;
        }

        const ej = await ensureEmailJsReady();
        if (!ej) {
            console.warn('EmailJS client unavailable.');
            return false;
        }

        const sendOnce = async () => {
            initEmailJS();

            // Do not pass full HTML as `message`: the EmailJS body should be only
            // emailjs-registration-confirmation-template.html (placeholders). If `message`
            // contains a second full document, clients show duplicate layouts—especially
            // broken on narrow screens. Omit `message` unless your template is message-only.
            const templateParams = {
                to_email: toAddr,
                user_email: toAddr,
                email: toAddr,
                // Compatibility aliases for templates using spaced/capitalized variable names.
                'To email': toAddr,
                'To Email': toAddr,
                'to email': toAddr,
                name: senderName,
                user_name: fullName,
                to_name: fullName,
                full_name: fullName,
                from_name: senderName,
                from_title: senderName,
                sender_name: senderName,
                organization_name: senderName,
                'From Name': senderName,
                'From name': senderName,
                "West Coast Deaf Men's Retreat": senderName,
                "West Coast Deaf Men’s Retreat": senderName,
                subject: emailData.subject,
                amount: amount,
                payment_id: paymentId,
                email_heading: emailContent.heading,
                intro_copy: emailContent.intro,
                amount_label: emailContent.amountLabel,
                reference_label: emailContent.referenceLabel,
                next_step_one: emailContent.nextSteps[0],
                next_step_two: emailContent.nextSteps[1],
                next_step_three: emailContent.nextSteps[2],
                outro_copy: emailContent.outro,
                support_copy: emailContent.support,
                event_dates: emailData.data.eventDates,
                venue: emailData.data.venue,
                venue_address: emailData.data.venueAddress,
                rsvp_link: emailData.data.rsvpLink,
                facebook_link: emailData.data.facebookLink,
                instagram_link: emailData.data.instagramLink
            };

            await ej.send(
                EMAILJS_CONFIG.serviceId,
                EMAILJS_CONFIG.templateId,
                templateParams,
                { publicKey: EMAILJS_CONFIG.publicKey }
            );
        };

        try {
            await sendOnce();
            console.log('Confirmation email sent via EmailJS');
            return true;
        } catch (emailjsError) {
            const err = emailjsError && typeof emailjsError === 'object'
                ? { text: emailjsError.text, status: emailjsError.status, message: emailjsError.message }
                : String(emailjsError);
            console.error('EmailJS error (will retry once):', JSON.stringify(err), emailjsError);
            try {
                await new Promise((r) => setTimeout(r, 400));
                await sendOnce();
                console.log('Confirmation email sent via EmailJS (after retry)');
                return true;
            } catch (retryErr) {
                const err2 = retryErr && typeof retryErr === 'object'
                    ? { text: retryErr.text, status: retryErr.status, message: retryErr.message }
                    : String(retryErr);
                console.error('EmailJS error (retry failed):', JSON.stringify(err2), retryErr);
                return false;
            }
        }
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
    const amountLabel = data.amountLabel || 'Amount received';
    const referenceLabel = data.referenceLabel || 'Reference / ID';
    const heading = data.emailHeading || 'Registration confirmed';
    const introCopy =
        data.introCopy ||
        "Thank you for registering for the West Coast Deaf Men's Retreat 2026. We're glad you'll join us for this time of prayer, worship, and fellowship.";
    const nextStepOne = data.nextStepOne || 'Complete the RSVP form if you have not already.';
    const nextStepTwo = data.nextStepTwo || 'Keep this email for your records.';
    const nextStepThree = data.nextStepThree || 'Follow us for updates and event reminders.';
    const supportCopy = data.supportCopy || 'If you have questions, contact us through the RSVP form or our social channels.';
    const outroCopy = data.outroCopy || 'We look forward to seeing you at Pine Crest Camp.';

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
                    background: linear-gradient(135deg, #0f1f35 0%, #1e3a5f 50%, #2d4a6b 100%); 
                    color: white; 
                    padding: 30px 20px 35px; 
                    text-align: center; 
                }
                .email-logo {
                    max-width: 350px;
                    width: auto;
                    height: auto;
                    max-height: none;
                    margin: 0 auto 25px;
                    display: block;
                    border-radius: 4px;
                }
                .success-icon { 
                    font-size: 48px; 
                    margin-bottom: 15px; 
                    font-weight: 900;
                }
                .header h1 {
                    font-size: 28px;
                    font-weight: 800;
                    text-transform: uppercase;
                    letter-spacing: 0.1em;
                    margin: 0 0 10px 0;
                }
                .header p {
                    font-size: 18px;
                    font-weight: 600;
                    margin: 0;
                    opacity: 0.95;
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
                .info-row { 
                    margin: 12px 0; 
                    padding: 8px 0;
                    border-bottom: 1px solid #e5e7eb;
                }
                .info-row:last-child {
                    border-bottom: none;
                }
                .info-label { 
                    font-weight: 700; 
                    color: #1e3a5f; 
                    text-transform: uppercase;
                    font-size: 0.9rem;
                    letter-spacing: 0.05em;
                    display: inline-block;
                    min-width: 140px;
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
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    ${data.logoUrl ? `<img src="${data.logoUrl}" alt="West Coast Deaf Men's Retreat Logo" class="email-logo" style="max-width: 350px; width: auto; height: auto; margin: 0 auto 25px; display: block; border-radius: 4px;">` : ''}
                    <div class="success-icon">✓</div>
                    <h1>${heading}</h1>
                    <p>${data.eventName || WCDMR_EVENT_NAME}</p>
                </div>
                <div class="content">
                    <p>Dear ${data.fullName},</p>
                    
                    <p>${introCopy}</p>
                    
                    <div class="info-box">
                        <div class="info-row">
                            <span class="info-label">${amountLabel}:</span> $${data.amount}
                        </div>
                        <div class="info-row">
                            <span class="info-label">${referenceLabel}:</span> ${data.paymentId}
                        </div>
                        <div class="info-row">
                            <span class="info-label">Event Dates:</span> ${data.eventDates}
                        </div>
                        <div class="info-row">
                            <span class="info-label">Venue:</span> ${data.venue}
                        </div>
                        <div class="info-row">
                            <span class="info-label">Address:</span> ${data.venueAddress}
                        </div>
                    </div>
                    
                    <p><strong>Next steps:</strong></p>
                    <ul>
                        <li>${nextStepOne}</li>
                        <li>${nextStepTwo}</li>
                        <li>${nextStepThree}</li>
                    </ul>
                    
                    <div style="text-align: center;">
                        <a href="${data.rsvpLink}" class="button">Complete RSVP form</a>
                    </div>
                    
                    <div class="social-links" style="text-align: center;">
                        <p>Follow us:</p>
                        <a href="${data.facebookLink}">Facebook</a> | 
                        <a href="${data.instagramLink}">Instagram</a>
                    </div>
                    
                    <p>${supportCopy}</p>
                    
                    <p>${outroCopy}</p>
                    
                    <p>Blessings,<br>
                    <strong>WCDMR 2026 Team</strong></p>
                    
                    <div class="footer">
                        <p>West Coast Deaf Men's Retreat 2026</p>
                        <p>This message was sent automatically. Replies may not be monitored.</p>
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
