# EmailJS Setup Instructions for WCDMR 2026

Your email: **wcdeafmr@gmail.com**

Follow these steps to configure EmailJS:

## Step 1: Add Email Service

1. Go to https://dashboard.emailjs.com/admin/integration
2. Click **"Add New Service"**
3. Choose **Gmail** (since you're using wcdeafmr@gmail.com)
4. Click **"Connect Account"**
5. Sign in with **wcdeafmr@gmail.com** and authorize EmailJS
6. Give it a name like "WCDMR Gmail"
7. **Copy the Service ID** (looks like: `service_xxxxxxx`)

## Step 2: Create Email Template

1. Go to https://dashboard.emailjs.com/admin/template
2. Click **"Create New Template"**
3. Name it: "WCDMR Registration Confirmation"
4. Set **From Name**: `WCDMR 2026`
5. Set **From Email**: `wcdeafmr@gmail.com`
6. Set **To Email**: `{{to_email}}`
7. Set **Subject**: `WCDMR 2026 - Registration Confirmed!`

8. **Email Content** (HTML):
```html
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
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
            <p>Dear {{to_name}},</p>
            
            <p>Thank you for registering for the West Coast Deaf Men's Retreat 2026! We're excited to have you join us for this three-day summit of Prayer, worship, and Fellowship.</p>
            
            <div class="info-box">
                <div class="info-row">
                    <span class="info-label">Event Dates:</span> {{event_dates}}
                </div>
                <div class="info-row">
                    <span class="info-label">Venue:</span> {{venue}}
                </div>
                <div class="info-row">
                    <span class="info-label">Location:</span> {{event_location}}
                </div>
                <div class="info-row">
                    <span class="info-label">Address:</span> {{venue_address}}
                </div>
                <div class="info-row">
                    <span class="info-label">Payment Amount:</span> ${{amount}}
                </div>
                <div class="info-row">
                    <span class="info-label">Transaction ID:</span> {{payment_id}}
                </div>
            </div>
            
            <p><strong>Next Steps:</strong></p>
            <ul>
                <li>Please complete the RSVP form if you haven't already</li>
                <li>Save this confirmation email for your records</li>
                <li>Follow us on social media for updates</li>
            </ul>
            
            <div style="text-align: center;">
                <a href="{{rsvp_link}}" class="button">Complete RSVP Form</a>
            </div>
            
            <div style="text-align: center; margin: 20px 0;">
                <p>Follow us:</p>
                <a href="{{facebook_link}}">Facebook</a> | 
                <a href="{{instagram_link}}">Instagram</a>
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
```

9. **Save the template**
10. **Copy the Template ID** (looks like: `template_xxxxxxx`)

## Step 3: Get Your Public Key

1. Go to https://dashboard.emailjs.com/admin/account/general
2. Find **"Public Key"** section
3. **Copy the Public Key** (looks like: `xxxxxxxxxxxxxxxxxxxxx`)

## Step 4: Update Your Configuration

Open `email-service.js` and update these values:

```javascript
const EMAILJS_CONFIG = {
    serviceId: 'service_xxxxxxx',      // Paste your Service ID here
    templateId: 'template_xxxxxxx',     // Paste your Template ID here
    publicKey: 'xxxxxxxxxxxxxxxxxxxxx', // Paste your Public Key here
    enabled: true                       // Change to true to enable emails
};
```

## Step 5: Test It!

1. Open your website
2. Fill out the registration form
3. Complete a test payment (use Stripe test card: 4242 4242 4242 4242)
4. Check the email inbox for **wcdeafmr@gmail.com** (or the email you entered in the form)
5. You should receive a confirmation email!

## Troubleshooting

**Email not sending?**
- Check browser console (F12) for errors
- Verify all three IDs are correct
- Make sure `enabled: true` is set
- Check EmailJS dashboard for delivery logs

**Email in spam?**
- This is normal for automated emails
- Ask recipients to check spam folder
- Consider verifying your domain (advanced)

**Need help?**
- EmailJS Docs: https://www.emailjs.com/docs/
- Check EmailJS dashboard for delivery status

## Quick Reference

- **Dashboard**: https://dashboard.emailjs.com/
- **Services**: https://dashboard.emailjs.com/admin/integration
- **Templates**: https://dashboard.emailjs.com/admin/template
- **Account Settings**: https://dashboard.emailjs.com/admin/account/general

Once you have all three values (Service ID, Template ID, Public Key), update `email-service.js` and you're ready to go!
