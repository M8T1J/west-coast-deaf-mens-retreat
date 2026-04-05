# Testing Your Registration System

## Quick Test Guide

### Step 1: Open Your Website

The website should open automatically in your browser. If not:
1. Open Finder
2. Navigate to: `/Users/thomas/payment-site/`
3. Double-click `index.html`

### Step 2: Test the Registration Form

1. **Scroll to the Registration section** (or click "Registration" in the menu)

2. **Fill out the form:**
   - **Full Name:** Test User
   - **Email:** your-email@example.com (use your real email to test email confirmation)
   - **Phone:** (555) 123-4567
   - **Registration Fee:** 245.00 (or any amount)

3. **Click the PayPal button:**
   - The button will say "Pay $245.00 with PayPal" (or your entered amount)
   - This will redirect to PayPal

### Step 3: Test PayPal Payment

**Option A: Use Real PayPal (Recommended for Testing)**
- Sign in with your PayPal account
- Complete the payment
- You'll be redirected back to the website

**Option B: Use PayPal Sandbox (If Available)**
- Use test PayPal account
- Complete test payment
- Return to website

### Step 4: Check Results

After payment, you should see:

1. ✅ **Success Message** - "Registration Successful!"
2. ✅ **Email Confirmation** - Check your email inbox
3. ✅ **Registration Stored** - Data is saved locally

### Step 5: View Stored Registrations

1. Open browser console (Press `F12` or `Cmd+Option+I`)
2. Go to **Console** tab
3. Type this and press Enter:
   ```javascript
   JSON.parse(localStorage.getItem('wcdmr_registrations'))
   ```
4. You'll see all stored registrations!

## What to Test

✅ **Form Validation:**
- Try submitting with empty fields
- Try invalid email format
- Try invalid phone number
- Try zero or negative amount

✅ **PayPal Integration:**
- Button updates when amount changes
- Form validates before allowing PayPal redirect
- Payment completion redirects back

✅ **Email Automation:**
- Check email inbox after payment
- Verify email contains all registration details
- Check spam folder if not received

✅ **Data Storage:**
- View stored registrations in console
- Verify all data is saved correctly

## Troubleshooting

**Website won't open:**
- Make sure you're opening `index.html` from `/Users/thomas/payment-site/`
- Try a different browser

**PayPal button not showing:**
- Check browser console (F12) for errors
- Make sure all JavaScript files are loaded

**Email not sending:**
- Check EmailJS configuration in `email-service.js`
- Verify EmailJS is enabled
- Check browser console for errors

**Registration data not storing:**
- Check browser console for errors
- Make sure `registration-handler.js` is loaded
- Check localStorage in browser DevTools

## Test Checklist

- [ ] Form validation works
- [ ] PayPal button appears and updates with amount
- [ ] PayPal payment completes successfully
- [ ] Success message shows after payment
- [ ] Email confirmation is received
- [ ] Registration data is stored (check console)
- [ ] Can view stored registrations

## Next Steps After Testing

Once everything works:
1. ✅ Deploy to your live website (www.wcdmr.com)
2. ✅ Set up PayPal return URL
3. ✅ Test with real payment
4. ✅ Monitor registrations

Enjoy testing! 🎉
