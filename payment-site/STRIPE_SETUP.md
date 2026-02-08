# Stripe Setup for Testing

## The Problem
Your Stripe key is still set to the placeholder: `pk_test_your_publishable_key_here`

This is why you're getting card errors - Stripe isn't properly initialized!

## Quick Fix

### Step 1: Get Your Stripe Test Key

1. Go to: https://dashboard.stripe.com/test/apikeys
2. Sign in to your Stripe account (or create one if you don't have it)
3. Find **"Publishable key"** under "Standard keys"
4. It will look like: `pk_test_51AbCdEf...` (starts with `pk_test_`)
5. **Copy this key**

### Step 2: Update Your Code

Open `app.js` and find this line (around line 31):
```javascript
const stripe = Stripe('pk_test_your_publishable_key_here');
```

Replace it with your actual key:
```javascript
const stripe = Stripe('pk_test_YOUR_ACTUAL_KEY_HERE');
```

### Step 3: Use Test Cards

**DO NOT use real credit cards for testing!**

Use these Stripe test cards:

#### ✅ Success Card:
- **Card Number:** `4242 4242 4242 4242`
- **Expiry:** Any future date (e.g., `12/25`)
- **CVC:** Any 3 digits (e.g., `123`)
- **ZIP:** Any 5 digits (e.g., `12345`)

#### ❌ Decline Card (to test errors):
- **Card Number:** `4000 0000 0000 0002`
- **Expiry:** Any future date
- **CVC:** Any 3 digits
- **ZIP:** Any 5 digits

#### 🔐 Requires Authentication:
- **Card Number:** `4000 0025 0000 3155`
- **Expiry:** Any future date
- **CVC:** Any 3 digits
- **ZIP:** Any 5 digits

## Important Notes

1. **Test Mode Only:** Make sure you're using test keys (they start with `pk_test_`)
2. **No Real Charges:** Test cards won't charge real money
3. **Test Dashboard:** View test payments at https://dashboard.stripe.com/test/payments
4. **For Production:** When ready, switch to live keys (start with `pk_live_`)

## After Setup

Once you update the Stripe key:
1. Refresh your website
2. Use test card: `4242 4242 4242 4242`
3. Payment should work!
4. Email confirmation should be sent automatically

## Need Help?

- Stripe Test Cards: https://stripe.com/docs/testing
- Stripe Dashboard: https://dashboard.stripe.com/test/dashboard
