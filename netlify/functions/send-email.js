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
                .info-row { margin: 10px 0; }
                .info-label { font-weight: bold; color: #6366f1; }
                .button { display: inline-block; background: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
                .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 14px; }
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
            subject: 'WCDMR 2026 - Registration Confirmed!',
            html: generateEmailHTML(data),
            text: `Dear ${toName},\n\nThank you for registering for WCDMR 2026!\n\nPayment Amount: $${data.amount}\nTransaction ID: ${data.paymentId}\nEvent Dates: ${data.eventDates}\nVenue: ${data.venue}\n\nWe look forward to seeing you!\n\nWCDMR 2026 Team`
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
