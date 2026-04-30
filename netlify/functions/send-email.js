// Netlify Function for Sending Emails
// This file should be placed in /netlify/functions/send-email.js
//
// Install dependencies: npm install @sendgrid/mail
// Set environment variables in Netlify dashboard:
// - SENDGRID_API_KEY
// - FROM_EMAIL
// - FROM_NAME

const sgMail = require('@sendgrid/mail');

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@wcdmr.com';
const FROM_NAME = process.env.FROM_NAME || "West Coast Deaf Men's Retreat";

/**
 * Generate HTML email template
 */
function generateEmailHTML(data) {
    const logoUrl = data.logoUrl || 'https://www.wcdmr.com/images/logo-enhanced.JPG?v=20260430-share1';
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
                    background: #ffffff;
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
                    margin: 0 0 10px 0;
                }
                .header p {
                    color: #244b78;
                    font-size: 17px;
                    font-weight: 600;
                    margin: 0;
                }
                .content {
                    padding: 28px;
                }
                .info-box {
                    background: #f5f5f0;
                    border: 2px solid #2d3748;
                    border-left: 4px solid #c9a961;
                    border-radius: 4px;
                    padding: 20px;
                    margin: 22px 0;
                }
                .info-row {
                    margin: 0;
                    padding: 12px 0;
                    border-bottom: 1px solid #e5e7eb;
                    font-size: 16px;
                }
                .info-row:last-child {
                    border-bottom: none;
                }
                .info-label {
                    font-weight: 700;
                    color: #1e3a5f;
                    text-transform: uppercase;
                    font-size: 0.82rem;
                    letter-spacing: 0.05em;
                    display: inline-block;
                    min-width: 150px;
                    vertical-align: top;
                }
                .amount-value {
                    font-weight: 800;
                    font-size: 1.15rem;
                    color: #12315a;
                }
                .button {
                    display: inline-block;
                    background: #1e3a5f;
                    color: #ffffff;
                    padding: 14px 28px;
                    text-decoration: none;
                    border-radius: 4px;
                    margin: 18px 0;
                    font-weight: 700;
                    border: 2px solid #c9a961;
                }
                .footer {
                    text-align: center;
                    margin-top: 28px;
                    padding-top: 20px;
                    border-top: 2px solid #2d3748;
                    color: #4a5568;
                    font-size: 14px;
                }
                .social-links {
                    text-align: center;
                    margin: 18px 0;
                }
                .social-links a {
                    color: #1e3a5f;
                    font-weight: 600;
                    text-decoration: none;
                    margin: 0 8px;
                }
                ul {
                    margin: 14px 0;
                    padding-left: 22px;
                }
                li {
                    margin: 8px 0;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <img src="${logoUrl}" alt="West Coast Deaf Men's Retreat" class="email-logo">
                    <div class="success-icon">✓</div>
                    <h1>Registration confirmed</h1>
                    <p>West Coast Deaf Men's Retreat 2026</p>
                </div>
                <div class="content">
                    <p>Dear ${data.fullName},</p>

                    <p>Thank you for registering for the West Coast Deaf Men's Retreat 2026. We're glad you'll join us for this time of prayer, worship, and fellowship.</p>

                    <div class="info-box">
                        <div class="info-row">
                            <span class="info-label">Amount</span>
                            <span class="amount-value">$${data.amount}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Reference / ID</span>
                            <span>${data.paymentId}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Event dates</span>
                            <span>${data.eventDates}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Venue</span>
                            <span>${data.venue}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Address</span>
                            <span>${data.venueAddress}</span>
                        </div>
                    </div>

                    <p><strong>Next steps</strong></p>
                    <ul>
                        <li>Complete the RSVP form if you have not already.</li>
                        <li>Keep this email for your records.</li>
                        <li>Follow us for updates.</li>
                    </ul>

                    <div style="text-align: center;">
                        <a href="${data.rsvpLink}" class="button">Complete RSVP form</a>
                    </div>

                    <div class="social-links">
                        <p style="margin: 0 0 8px 0;">Follow us</p>
                        <a href="${data.facebookLink}">Facebook</a> |
                        <a href="${data.instagramLink}">Instagram</a>
                    </div>

                    <p>If you have questions, contact us through the RSVP form or our social channels.</p>
                    <p>We look forward to seeing you at Pine Crest Camp.</p>

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

// Netlify Function Handler
exports.handler = async (event, context) => {
    // Handle CORS preflight
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'POST, OPTIONS'
            },
            body: ''
        };
    }

    // Only allow POST requests
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    try {
        const { to, toName, data } = JSON.parse(event.body);

        if (!to || !toName || !data) {
            return {
                statusCode: 400,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ error: 'Missing required fields' })
            };
        }

        // Check if SendGrid is configured
        if (!SENDGRID_API_KEY) {
            return {
                statusCode: 500,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ error: 'Email service not configured' })
            };
        }

        // Send email using SendGrid
        sgMail.setApiKey(SENDGRID_API_KEY);

        const msg = {
            to: to,
            from: {
                email: FROM_EMAIL,
                name: FROM_NAME
            },
            subject: 'WCDMR 2026 - Registration confirmed',
            html: generateEmailHTML(data),
            text: `Dear ${toName},\n\nThank you for registering for WCDMR 2026. We're glad you'll join us.\n\nAmount: $${data.amount}\nReference / ID: ${data.paymentId}\nEvent Dates: ${data.eventDates}\nVenue: ${data.venue}\nAddress: ${data.venueAddress}\n\nPlease keep this email for your records and complete the RSVP form if needed.\n\nWCDMR 2026 Team`
        };

        await sgMail.send(msg);

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ success: true, message: 'Email sent successfully' })
        };
    } catch (error) {
        console.error('Error sending email:', error);
        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                error: 'Failed to send email', 
                details: error.message 
            })
        };
    }
};
