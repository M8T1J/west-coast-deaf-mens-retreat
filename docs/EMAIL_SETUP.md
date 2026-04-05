# Email Automation Setup Guide

This guide will help you set up email automation for registration and payment confirmations.

## Option 1: EmailJS (Quick Setup - Development/Testing)

EmailJS is a client-side email service that's easy to set up and perfect for development.

### Steps:

1. **Sign up for EmailJS**
   - Go to https://www.emailjs.com/
   - Create a free account (100 emails/month free)

2. **Create an Email Service**
   - Go to "Email Services" in your dashboard
   - Add a new service (Gmail, Outlook, etc.)
   - Follow the setup instructions

3. **Create an Email Template**
   - Go to "Email Templates"
   - Create a new template
   - Use these template variables:
     - `{{to_name}}` - Recipient name
     - `{{to_email}}` - Recipient email
     - `{{amount}}` - Payment amount
     - `{{payment_id}}` - Transaction ID
     - `{{event_dates}}` - Event dates
     - `{{venue}}` - Venue name

4. **Get Your Credentials**
   - Service ID
   - Template ID
   - Public Key

5. **Update Configuration**
   - Open `email-service.js`
   - Update `EMAILJS_CONFIG`:
   ```javascript
   const EMAILJS_CONFIG = {
       serviceId: 'your_service_id',
       templateId: 'your_template_id',
       publicKey: 'your_public_key',
       enabled: true
   };
   ```

## Option 2: Backend API (Production - Recommended)

For production use, set up a backend API endpoint to send emails securely.

### Option 2A: Vercel Serverless Function

1. **Install Dependencies**
   ```bash
   npm install @sendgrid/mail
   ```

2. **Set Up SendGrid**
   - Sign up at https://sendgrid.com/
   - Get your API key
   - Verify your sender email

3. **Configure Environment Variables**
   Create `.env.local`:
   ```
   SENDGRID_API_KEY=your_sendgrid_api_key
   FROM_EMAIL=noreply@wcdmr.com
   FROM_NAME=WCDMR 2026
   ```

4. **Deploy to Vercel**
   - The function is already created in `/api/send-email.js`
   - Deploy your site to Vercel
   - Add environment variables in Vercel dashboard

5. **Update Frontend**
   - Open `email-service.js`
   - Update `BACKEND_API_URL`:
   ```javascript
   const BACKEND_API_URL = 'https://your-site.vercel.app/api/send-email';
   ```

### Option 2B: Netlify Functions

1. **Install Dependencies**
   ```bash
   npm install @sendgrid/mail
   ```

2. **Move Function**
   - Move `api/send-email.js` to `netlify/functions/send-email.js`
   - Update export to: `exports.handler = async (event, context) => { ... }`

3. **Configure Environment Variables**
   - In Netlify dashboard: Site settings > Environment variables
   - Add: `SENDGRID_API_KEY`, `FROM_EMAIL`, `FROM_NAME`

4. **Update Frontend**
   ```javascript
   const BACKEND_API_URL = 'https://your-site.netlify.app/.netlify/functions/send-email';
   ```

### Option 2C: AWS Lambda

1. **Create Lambda Function**
   - Use the code from `api/send-email.js`
   - Set handler to: `send-email.handler`

2. **Set Environment Variables**
   - `SENDGRID_API_KEY`
   - `FROM_EMAIL`
   - `FROM_NAME`

3. **Create API Gateway**
   - Create REST API
   - Connect to Lambda function
   - Enable CORS

4. **Update Frontend**
   ```javascript
   const BACKEND_API_URL = 'https://your-api-id.execute-api.region.amazonaws.com/prod/send-email';
   ```

## Option 3: Nodemailer with SMTP

If you prefer using your own SMTP server:

1. **Install Nodemailer**
   ```bash
   npm install nodemailer
   ```

2. **Update `api/send-email.js`**
   - Uncomment the Nodemailer section
   - Configure SMTP settings

3. **Set Environment Variables**
   ```
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER=your-email@gmail.com
   SMTP_PASS=your-app-password
   ```

## Testing

1. **Test EmailJS Setup**
   - Complete a test registration
   - Check browser console for email status
   - Check recipient inbox

2. **Test Backend API**
   ```bash
   curl -X POST https://your-api-url/api/send-email \
     -H "Content-Type: application/json" \
     -d '{
       "to": "test@example.com",
       "toName": "Test User",
       "data": {
         "fullName": "Test User",
         "amount": "100.00",
         "paymentId": "test_123",
         "eventDates": "November 6-8, 2026",
         "venue": "Pine Crest Camp",
         "venueAddress": "1140 PINECREST ROAD, TWIN PEAKS, CA 92361",
         "rsvpLink": "https://forms.gle/qaW22U9mB2C1hGx86"
       }
     }'
   ```

## Email Service Providers Comparison

| Service | Free Tier | Setup Difficulty | Best For |
|---------|-----------|------------------|----------|
| EmailJS | 100/month | Easy | Development |
| SendGrid | 100/day | Medium | Production |
| Mailgun | 5,000/month | Medium | Production |
| AWS SES | 62,000/month | Hard | High Volume |
| SMTP | Varies | Medium | Custom Setup |

## Security Notes

- **Never expose API keys in frontend code**
- Use environment variables for all secrets
- Enable CORS only for your domain
- Rate limit your email endpoint
- Validate email addresses server-side
- Use HTTPS for all API calls

## Troubleshooting

**Email not sending:**
- Check browser console for errors
- Verify API keys are correct
- Check email service dashboard for logs
- Ensure sender email is verified

**CORS errors:**
- Add your domain to CORS whitelist
- Check API endpoint configuration

**Email in spam:**
- Verify sender domain (SPF, DKIM)
- Use a professional email address
- Avoid spam trigger words

## Next Steps

1. Choose your email service
2. Configure credentials
3. Test with a real registration
4. Monitor email delivery
5. Set up email analytics (optional)

For questions or issues, check the service provider's documentation or contact support.
