# PayPal Setup Guide

## Quick Setup Steps

### Step 1: Get Your PayPal Client ID

1. Go to: https://developer.paypal.com/
2. Sign in with your PayPal business account (the one with your EIN)
3. Go to **Dashboard** → **My Apps & Credentials**
4. Click **"Create App"** (or use existing app)
5. Choose:
   - **App Name:** WCDMR 2026 Registration
   - **Merchant:** Your business account
6. Click **"Create App"**
7. Copy the **Client ID** (looks like: `AeA1QIZXiflr1_-...`)

### Step 2: Update Your Website

#### Option A: Update in HTML (Quick)
1. Open `index.html`
2. Find this line (around line 243):
   ```html
   <script src="https://www.paypal.com/sdk/js?client-id=YOUR_PAYPAL_CLIENT_ID&currency=USD"></script>
   ```
3. Replace `YOUR_PAYPAL_CLIENT_ID` with your actual Client ID:
   ```html
   <script src="https://www.paypal.com/sdk/js?client-id=AeA1QIZXiflr1_-YOUR_ACTUAL_ID&currency=USD"></script>
   ```

#### Option B: Update in JavaScript (Recommended)
1. Open `app.js`
2. Find this line (around line 32):
   ```javascript
   const paypalClientId = 'YOUR_PAYPAL_CLIENT_ID';
   ```
3. Replace with your actual Client ID:
   ```javascript
   const paypalClientId = 'AeA1QIZXiflr1_-YOUR_ACTUAL_ID';
   ```

### Step 3: Test Mode vs Live Mode

**For Testing:**
- Use **Sandbox** Client ID (starts with `AeA1QIZXiflr1_-` or similar)
- Test with PayPal Sandbox accounts
- No real money is processed

**For Production:**
- Use **Live** Client ID (different from Sandbox)
- Switch to Live mode in PayPal Dashboard
- Real payments will be processed

### Step 4: Test Your Integration

1. Open your website
2. Fill out the registration form:
   - Full Name
   - Email
   - Phone
   - Registration Amount
3. Click the PayPal button
4. Sign in with PayPal (or use test account in Sandbox)
5. Complete the payment
6. Check your email for confirmation!

## PayPal Sandbox Testing

### Create Test Accounts

1. Go to: https://developer.paypal.com/
2. Click **"Sandbox"** → **"Accounts"**
3. Click **"Create Account"**
4. Create:
   - **Personal Account** (to test as buyer)
   - **Business Account** (to test as seller)

### Test Cards (Sandbox)

When testing, you can use these test cards in Sandbox:
- **Card:** `4032034815614224`
- **Expiry:** Any future date
- **CVC:** Any 3 digits
- **ZIP:** Any 5 digits

Or use PayPal test accounts you create.

## Important Notes

1. **Business Account Required:** Make sure you're using a PayPal business account (with your EIN)
2. **Email Automation:** Email confirmations will still work automatically after PayPal payments
3. **No Backend Required:** PayPal handles all payment processing client-side
4. **Security:** PayPal handles all sensitive payment data securely

## Troubleshooting

**PayPal button not showing:**
- Check browser console (F12) for errors
- Verify Client ID is correct
- Make sure PayPal SDK script is loaded

**Payment not processing:**
- Check if you're using Sandbox Client ID in Sandbox mode
- Verify your PayPal account is active
- Check PayPal Dashboard for transaction logs

**Email not sending:**
- Email automation is separate from PayPal
- Check EmailJS configuration
- See EMAIL_SETUP.md for email troubleshooting

## Next Steps

1. ✅ Get your PayPal Client ID
2. ✅ Update `index.html` or `app.js` with your Client ID
3. ✅ Test with Sandbox account
4. ✅ Switch to Live mode when ready for production
5. ✅ Monitor payments in PayPal Dashboard

## Support

- PayPal Developer Docs: https://developer.paypal.com/docs/
- PayPal Support: https://www.paypal.com/support
