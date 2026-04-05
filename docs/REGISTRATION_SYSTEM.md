# Registration System Guide

## Current Setup

Your website now has a **complete registration system** that works **without Google Forms**!

### What Happens When Someone Registers:

1. ✅ **User fills out registration form** (name, email, phone, amount)
2. ✅ **User completes PayPal payment**
3. ✅ **Registration data is automatically stored** (locally for now)
4. ✅ **Confirmation email is sent automatically**
5. ✅ **Success message is shown**

**No Google Form needed!** Everything is handled on your website.

## Optional: Link to Google Forms

If you want to **also** submit to your Google Form (for backup/records), you can enable it:

### Step 1: Get Your Google Form Submission URL

1. Open your Google Form: https://forms.gle/qaW22U9mB2C1hGx86
2. Click the **three dots** (⋮) → **Get pre-filled link**
3. Fill in one field, click **Get link**
4. Copy the URL - it will look like:
   ```
   https://docs.google.com/forms/d/e/1FAIpQLSd.../formResponse
   ```
5. Copy the part after `/d/e/` and before `/formResponse`
   - Example: `1FAIpQLSd...`

### Step 2: Get Field IDs

1. Open your Google Form
2. Right-click on a field → **Inspect** (or press F12)
3. Find the `name` attribute - it looks like `entry.123456789`
4. Note down the field IDs for:
   - Full Name
   - Email
   - Phone
   - Amount

### Step 3: Update Configuration

Open `registration-handler.js` and update:

```javascript
const GOOGLE_FORM_URL = 'https://docs.google.com/forms/d/e/YOUR_FORM_ID_HERE/formResponse';
const USE_GOOGLE_FORM = true; // Change to true

// Update field IDs:
const formFields = {
    'entry.123456789': formData.fullName,      // Replace with your Full Name field ID
    'entry.987654321': formData.email,          // Replace with your Email field ID
    'entry.111222333': formData.phone,          // Replace with your Phone field ID
    'entry.444555666': formData.amount.toString() // Replace with your Amount field ID
};
```

## Registration Data Storage

Currently, registrations are stored in **localStorage** (browser storage). 

### To View Registrations:

Open browser console (F12) and run:
```javascript
JSON.parse(localStorage.getItem('wcdmr_registrations'))
```

### For Production (Recommended):

Set up a backend to store registrations:

1. **Create an API endpoint** to receive registration data
2. **Update `storeRegistrationData()`** in `registration-handler.js` to send data to your API
3. **Store in database** (MySQL, MongoDB, etc.)

Example backend endpoint:
```javascript
// POST /api/registrations
{
    "fullName": "John Doe",
    "email": "john@example.com",
    "phone": "(555) 123-4567",
    "amount": 245.00,
    "paymentId": "PAYPAL-1234567890",
    "timestamp": "2026-02-02T12:00:00Z"
}
```

## Complete Registration Flow

```
User Registration
    ↓
Fill Form (Name, Email, Phone, Amount)
    ↓
Click PayPal Button
    ↓
Complete Payment on PayPal
    ↓
Return to Website
    ↓
┌─────────────────────────────┐
│ Registration Data Stored     │ ← Automatically
│ Email Confirmation Sent      │ ← Automatically
│ (Optional) Submit to Google  │ ← If enabled
│ Success Message Shown        │ ← Automatically
└─────────────────────────────┘
```

## Benefits of This System

✅ **No Google Forms dependency** - Works independently
✅ **Automatic email confirmations** - Sent immediately after payment
✅ **Data stored automatically** - No manual entry needed
✅ **PayPal integration** - Secure payment processing
✅ **Optional Google Forms link** - Can still use if you want backup

## Next Steps

1. ✅ **Test the registration** - Try a test payment
2. ✅ **Check email confirmations** - Verify emails are sent
3. ⚙️ **Optional: Enable Google Forms** - If you want backup submission
4. ⚙️ **Set up backend** - For production data storage (recommended)

## Questions?

- **View registrations:** Check browser localStorage
- **Email issues:** See EMAIL_SETUP.md
- **PayPal issues:** See PAYPAL_SETUP.md
