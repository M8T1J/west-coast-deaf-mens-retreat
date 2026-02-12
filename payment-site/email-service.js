// Email Service Configuration
// This file handles sending confirmation emails after registration and payment

// EmailJS Configuration
// Get your credentials from: https://dashboard.emailjs.com/admin

// Initialize EmailJS - will be initialized when public key is set
let emailjsInitialized = false;

// Option 1: EmailJS (Quick setup for development/testing)
const EMAILJS_CONFIG = {
    serviceId: 'service_ai2qmh6', // Your EmailJS Service ID
    templateId: 'template_k5knn6d', // Your EmailJS Template ID
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
const BACKEND_API_URL = 'https://your-backend-url.com/api/send-email'; // Replace with your backend URL

/**
 * Send registration confirmation email
 * @param {Object} formData - Registration form data
 * @param {string} paymentId - Payment transaction ID
 * @returns {Promise<boolean>} - Success status
 */
async function sendConfirmationEmail(formData, paymentId) {
    const fullName = formData.fullName || `${formData.firstName || ''} ${formData.lastName || ''}`.trim();
    const amount = typeof formData.amount === 'number' ? (formData.amount / 100).toFixed(2) : parseFloat(formData.amount).toFixed(2);
    
    // Get website URL for logo (you'll need to update this with your actual website URL)
    const websiteUrl = typeof window !== 'undefined' ? window.location.origin : 'https://your-website-url.com';
    const logoUrl = `${websiteUrl}/images/logo.JPG`;
    
    const emailData = {
        to: formData.email,
        toName: fullName,
        subject: 'WCDMR 2026 - Registration Confirmed!',
        template: 'confirmation',
        data: {
            fullName: fullName,
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
            venue: 'Pine Crest Camp, Twin Peaks, CA',
            venueAddress: '1140 PINECREST ROAD, TWIN PEAKS, CA 92361',
            rsvpLink: 'https://forms.gle/qaW22U9mB2C1hGx86',
            facebookLink: 'https://www.facebook.com/wcdmr',
            instagramLink: 'https://www.instagram.com/wcdmr97/'
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

        // Fallback to EmailJS (development/testing)
        if (EMAILJS_CONFIG.enabled && typeof emailjs !== 'undefined') {
            try {
                // Initialize EmailJS if not already done
                initEmailJS();
                
                await emailjs.send(
                    EMAILJS_CONFIG.serviceId,
                    EMAILJS_CONFIG.templateId,
                    {
                        to_email: formData.email,
                        to_name: formData.fullName,
                        from_name: 'WCDMR 2026',
                        from_email: 'wcdeafmr@gmail.com',
                        subject: emailData.subject,
                        message: generateEmailHTML(emailData.data),
                        amount: emailData.data.amount,
                        payment_id: paymentId,
                        event_dates: emailData.data.eventDates,
                        venue: emailData.data.venue,
                        venue_address: emailData.data.venueAddress,
                        rsvp_link: emailData.data.rsvpLink,
                        facebook_link: emailData.data.facebookLink,
                        instagram_link: emailData.data.instagramLink
                    }
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
                    <h1>Registration Confirmed!</h1>
                    <p>West Coast Deaf Men's Retreat 2026</p>
                </div>
                <div class="content">
                    <p>Dear ${data.fullName},</p>
                    
                    <p>Thank you for registering for the West Coast Deaf Men's Retreat 2026! We're excited to have you join us for this three-day summit of Prayer, worship, and Fellowship.</p>
                    
                    <div class="info-box">
                        <div class="info-row">
                            <span class="info-label">Payment Amount:</span> $${data.amount}
                        </div>
                        <div class="info-row">
                            <span class="info-label">Transaction ID:</span> ${data.paymentId}
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
                    
                    <p><strong>Next Steps:</strong></p>
                    <ul>
                        <li>Please complete the RSVP form if you haven't already</li>
                        <li>Save this confirmation email for your records</li>
                        <li>Follow us on social media for updates</li>
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
