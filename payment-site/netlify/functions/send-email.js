// Netlify Function for Sending Emails
// Supports SMTP (preferred, including iCloud) and SendGrid fallback.

const sgMail = require('@sendgrid/mail');
const nodemailer = require('nodemailer');

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_SECURE = process.env.SMTP_SECURE === 'true';
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const FROM_EMAIL = process.env.FROM_EMAIL || SMTP_USER || 'wcdeafmr@gmail.com';
const FROM_NAME = process.env.FROM_NAME || 'WCDMR 2026';

/**
 * Generate HTML email template
 */
function generateEmailHTML(data) {
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
                .success-icon { font-size: 48px; margin-bottom: 20px; }
                .info-box { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #6366f1; }
                .summary-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
                .summary-table tr { border-bottom: 1px solid #e5e7eb; }
                .summary-table tr:last-child { border-bottom: none; }
                .summary-label { width: 145px; padding: 10px 0; font-weight: bold; color: #6366f1; text-transform: uppercase; font-size: 0.78rem; letter-spacing: 0.04em; vertical-align: top; }
                .summary-value { padding: 10px 0; font-weight: 600; color: #111827; word-break: break-word; vertical-align: top; }
                .button { display: inline-block; background: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
                .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 14px; }
                @media (max-width: 520px) {
                    .summary-label, .summary-value { display: block; width: 100%; padding: 6px 0; }
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <div class="success-icon">✓</div>
                    <h1>Registration Confirmed!</h1>
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

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
};

function buildTextBody(toName, data) {
    return `Dear ${toName},\n\nThank you for registering for WCDMR 2026!\nFriendly reminder: please make sure your registration payment is completed before October 23, 2026.\n\nEvent Dates: ${data.eventDates}\nVenue: ${data.venue}\nLocation: ${data.eventLocation || 'Twin Peaks, CA'}\nAddress: ${data.venueAddress}\nPayment Amount: $${data.amount}\nTransaction ID: ${data.paymentId}\n\nWe will keep you updated with speaker announcements and errands.\n\nWCDMR 2026 Team`;
}

function smtpIsConfigured() {
    return Boolean(SMTP_USER && SMTP_PASS);
}

async function sendWithSmtp(to, toName, data) {
    const subject = `Thank You for Registering, ${toName || 'Registrant'} - WCDMR 2026`;
    const transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_SECURE,
        auth: {
            user: SMTP_USER,
            pass: SMTP_PASS
        }
    });

    await transporter.sendMail({
        from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
        to,
        subject,
        html: generateEmailHTML(data),
        text: buildTextBody(toName, data)
    });
}

async function sendWithSendGrid(to, toName, data) {
    const subject = `Thank You for Registering, ${toName || 'Registrant'} - WCDMR 2026`;
    sgMail.setApiKey(SENDGRID_API_KEY);

    const msg = {
        to,
        from: {
            email: FROM_EMAIL,
            name: FROM_NAME
        },
        subject,
        html: generateEmailHTML(data),
        text: buildTextBody(toName, data)
    };

    await sgMail.send(msg);
}

// Netlify Function Handler
exports.handler = async (event, context) => {
    // Handle CORS preflight
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: CORS_HEADERS,
            body: ''
        };
    }

    // Only allow POST requests
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: CORS_HEADERS,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    try {
        const { to, toName, data } = JSON.parse(event.body);

        if (!to || !toName || !data) {
            return {
                statusCode: 400,
                headers: CORS_HEADERS,
                body: JSON.stringify({ error: 'Missing required fields' })
            };
        }

        if (smtpIsConfigured()) {
            await sendWithSmtp(to, toName, data);
            return {
                statusCode: 200,
                headers: CORS_HEADERS,
                body: JSON.stringify({ success: true, provider: 'smtp' })
            };
        }

        if (SENDGRID_API_KEY) {
            await sendWithSendGrid(to, toName, data);
            return {
                statusCode: 200,
                headers: CORS_HEADERS,
                body: JSON.stringify({ success: true, provider: 'sendgrid' })
            };
        }

        return {
            statusCode: 500,
            headers: CORS_HEADERS,
            body: JSON.stringify({
                error: 'Email service not configured',
                details: 'Set SMTP_USER + SMTP_PASS (preferred) or SENDGRID_API_KEY.'
            })
        };
    } catch (error) {
        console.error('Error sending email:', error);
        return {
            statusCode: 500,
            headers: CORS_HEADERS,
            body: JSON.stringify({ 
                error: 'Failed to send email', 
                details: error.message 
            })
        };
    }
};
