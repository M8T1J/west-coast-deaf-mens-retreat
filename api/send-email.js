// Serverless Function for Sending Emails
// This can be used with Vercel, Netlify Functions, or AWS Lambda
// 
// For Vercel: Place this in /api/send-email.js
// For Netlify: Place this in /netlify/functions/send-email.js
// For AWS Lambda: Deploy as a Lambda function

// Example using SendGrid (recommended for production)
// Install: npm install @sendgrid/mail

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@wcdmr.com';
const FROM_NAME = process.env.FROM_NAME || "West Coast Deaf Men's Retreat";

// Alternative: Using Nodemailer with SMTP
// const nodemailer = require('nodemailer');

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
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #0a0e14; margin: 0; padding: 0; background: #f5f5f0; }
                .container { max-width: 600px; margin: 0 auto; padding: 0; background: white; }
                .header { background: linear-gradient(135deg, #0f1f35 0%, #1e3a5f 50%, #2d4a6b 100%); color: white; padding: 30px 20px 35px; text-align: center; }
                .content { background: #ffffff; padding: 30px; }
                .success-icon { font-size: 48px; margin-bottom: 15px; font-weight: 900; }
                .email-logo { max-width: 350px; width: auto; height: auto; margin: 0 auto 25px; display: block; border-radius: 4px; }
                .header h1 { font-size: 28px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; margin: 0 0 10px 0; }
                .header p { font-size: 18px; font-weight: 600; margin: 0; opacity: 0.95; }
                .info-box { background: #f5f5f0; padding: 20px; border-radius: 4px; margin: 20px 0; border-left: 4px solid #c9a961; border: 2px solid #2d3748; }
                .info-row { margin: 12px 0; padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
                .info-row:last-child { border-bottom: none; }
                .info-label { font-weight: 700; color: #1e3a5f; text-transform: uppercase; font-size: 0.9rem; letter-spacing: 0.05em; display: inline-block; min-width: 140px; }
                .button { display: inline-block; background: #1e3a5f; color: white; padding: 14px 28px; text-decoration: none; border-radius: 4px; margin: 20px 0; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; border: 2px solid #c9a961; }
                .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 2px solid #2d3748; color: #4a5568; font-size: 14px; }
                .social-links { margin: 20px 0; text-align: center; }
                .social-links a { color: #1e3a5f; text-decoration: none; margin: 0 10px; font-weight: 600; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    ${data.logoUrl ? `<img src="${data.logoUrl}" alt="West Coast Deaf Men's Retreat Logo" class="email-logo">` : ''}
                    <div class="success-icon">✓</div>
                    <h1>Registration confirmed</h1>
                    <p>West Coast Deaf Men's Retreat 2026</p>
                </div>
                <div class="content">
                    <p>Dear ${data.fullName},</p>
                    
                    <p>Thank you for registering for the West Coast Deaf Men's Retreat 2026. We're glad you'll join us for this time of prayer, worship, and fellowship.</p>
                    
                    <div class="info-box">
                        <div class="info-row">
                            <span class="info-label">Amount:</span> $${data.amount}
                        </div>
                        <div class="info-row">
                            <span class="info-label">Reference / ID:</span> ${data.paymentId}
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
                        <li>Complete the RSVP form if you have not already.</li>
                        <li>Keep this email for your records.</li>
                        <li>Follow us for updates.</li>
                    </ul>
                    
                    <div style="text-align: center;">
                        <a href="${data.rsvpLink}" class="button">Complete RSVP form</a>
                    </div>

                    <div class="social-links">
                        <p><strong>Follow us:</strong></p>
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

// Vercel/Netlify Serverless Function Handler
export default async function handler(req, res) {
    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { to, toName, data } = req.body;

        if (!to || !toName || !data) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Option 1: Using SendGrid
        if (SENDGRID_API_KEY) {
            const sgMail = require('@sendgrid/mail');
            sgMail.setApiKey(SENDGRID_API_KEY);

            const msg = {
                to: to,
                from: {
                    email: FROM_EMAIL,
                    name: FROM_NAME
                },
                subject: 'WCDMR 2026 - Registration confirmed',
                html: generateEmailHTML(data),
                text: `Dear ${toName},\n\nThank you for registering for WCDMR 2026.\n\nAmount: $${data.amount}\nReference / ID: ${data.paymentId}\nEvent Dates: ${data.eventDates}\nVenue: ${data.venue}\nAddress: ${data.venueAddress}\n\nKeep this email for your records, and complete the RSVP form if you have not already.\n\nWe look forward to seeing you at Pine Crest Camp.\n\nWCDMR 2026 Team`
            };

            await sgMail.send(msg);
            return res.status(200).json({ success: true, message: 'Email sent successfully' });
        }

        // Option 2: Using Nodemailer with SMTP
        // Uncomment and configure if using Nodemailer instead
        /*
        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: process.env.SMTP_PORT || 587,
            secure: process.env.SMTP_SECURE === 'true',
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            }
        });

        await transporter.sendMail({
            from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
            to: to,
            subject: 'WCDMR 2026 - Registration confirmed',
            html: generateEmailHTML(data),
            text: `Dear ${toName},\n\nThank you for registering...`
        });

        return res.status(200).json({ success: true, message: 'Email sent successfully' });
        */

        return res.status(500).json({ error: 'Email service not configured' });
    } catch (error) {
        console.error('Error sending email:', error);
        return res.status(500).json({ error: 'Failed to send email', details: error.message });
    }
}
