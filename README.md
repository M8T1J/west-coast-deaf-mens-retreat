# West Coast Deaf Men's Retreat (WCDMR) 2026

A modern, responsive website for the West Coast Deaf Men's Retreat, migrated from Google Sites to GitHub Pages with integrated payment functionality using Stripe.

## About WCDMR

The West Coast Deaf Men's Retreat is a three-day summit of Prayer, worship, and Fellowship, taking place November 6-8, 2026 at Pine Crest Camp in Twin Peaks, California.

## Features

- 🎨 Modern, responsive design
- 💳 Stripe payment integration for registration fees
- 📧 Registration confirmation email automation
- 📱 Mobile-friendly interface
- ⚡ Fast and lightweight
- 🔒 Secure payment processing
- 📍 Embedded Google Maps for venue location
- 🔗 Integration with Google Forms for RSVP
- 📱 Social media links (Facebook, Instagram)

## Site Structure

- **Home**: Event overview with dates and location
- **Registration**: Payment-enabled registration form
- **Schedule**: Event schedule (coming soon)
- **Speakers**: Information about speakers and leadership
- **Venue**: Details and map of Pine Crest Camp

## Setup Instructions

### 1. Configure Stripe

1. Sign up for a [Stripe account](https://stripe.com) if you don't have one
2. Get your **Publishable Key** from the [Stripe Dashboard](https://dashboard.stripe.com/apikeys)
3. Open `app.js` and replace `pk_test_your_publishable_key_here` with your actual Stripe publishable key:

```javascript
const stripe = Stripe('pk_test_your_actual_key_here');
```

### 2. Backend Setup (Required for Production)

The current implementation includes a client-side example. For production use, you **must** set up a backend server to securely handle payment processing. Here's why:

- **Security**: Never handle payment secrets on the client side
- **PCI Compliance**: Backend handles sensitive payment data
- **Validation**: Server-side validation of payments

#### Option A: Node.js Backend

Create a backend endpoint to handle PaymentIntent creation:

```javascript
// Example Node.js/Express endpoint
app.post('/create-payment-intent', async (req, res) => {
    const { amount, email, fullName, phone } = req.body;
    
    const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        metadata: {
            email: email,
            fullName: fullName,
            phone: phone,
            event: 'WCDMR 2026',
        },
    });
    
    res.json({ client_secret: paymentIntent.client_secret });
});
```

Then update `app.js` to use your backend:

```javascript
const response = await fetch('/create-payment-intent', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
    },
    body: JSON.stringify(formData),
});

const { client_secret } = await response.json();

const { error, paymentIntent } = await stripe.confirmCardPayment(client_secret, {
    payment_method: {
        card: cardElement,
        billing_details: {
            name: formData.name,
            email: formData.email,
        },
    },
});
```

#### Option B: Serverless Functions

Use serverless functions (Vercel, Netlify, AWS Lambda) for backend payment processing.

### 3. Deploy to GitHub Pages

1. Create a new GitHub repository
2. Push your code:

```bash
cd /Users/thomas/payment-site
git init
git add .
git commit -m "Initial commit: WCDMR 2026 site with payment integration"
git branch -M main
git remote add origin https://github.com/yourusername/wcdmr-2026.git
git push -u origin main
```

3. Enable GitHub Pages:
   - Go to your repository Settings
   - Navigate to Pages
   - Select the `main` branch as the source
   - Save

4. Your site will be live at: `https://yourusername.github.io/wcdmr-2026/`

5. **Custom Domain Setup** (if using www.wcdmr.com):
   - Create a file named `CNAME` in your repository root
   - Add `www.wcdmr.com` to the file
   - Configure your DNS settings to point to GitHub Pages
   - GitHub Pages will automatically detect the CNAME file

### Registration Email + Admin Access

- **Admin page:** `admin.html` (redirects to `payment-site/admin.html`)
- **Email preview:** `email-preview.html` (redirects to `payment-site/email-preview.html`)
- **Email service setup:** see `payment-site/EMAIL_SETUP.md`
- **Google / iCloud custom email:** supported through SMTP configuration (App Password required)

### 4. Update Content

- Edit `index.html` to update event details, dates, or content
- Modify `styles.css` to change colors, fonts, and layout
- Update speaker information in the Speakers section
- Adjust registration fee amount in the form

## File Structure

```
payment-site/
├── index.html      # Main HTML file with all sections
├── styles.css      # Stylesheet with responsive design
├── app.js          # JavaScript and Stripe integration
├── README.md       # This file
├── DEPLOYMENT.md   # Detailed deployment guide
├── .gitignore      # Git ignore file
└── .nojekyll       # GitHub Pages configuration
```

## Integration Points

### Google Forms RSVP
The site includes a link to the existing Google Form for RSVP:
- RSVP Form: `https://forms.gle/qaW22U9mB2C1hGx86`

### Social Media
- Facebook: `https://www.facebook.com/wcdmr`
- Instagram: `https://www.instagram.com/wcdmr97/`

### Venue Information
- **Pine Crest Camp**
- Address: 1140 PINECREST ROAD, TWIN PEAKS, CA 92361
- Google Maps embedded on the Venue page

## Security Notes

⚠️ **Important**: This is a client-side implementation for demonstration purposes. For production:

1. **Always use a backend** to handle PaymentIntent creation
2. **Never expose** your Stripe secret key in client-side code
3. **Implement server-side validation** for all payments
4. **Use HTTPS** for all payment processing
5. **Follow PCI DSS guidelines** for handling card data

## Testing

### Test Cards (Stripe Test Mode)

Use these test card numbers in test mode:

- **Success**: `4242 4242 4242 4242`
- **Decline**: `4000 0000 0000 0002`
- **Requires Authentication**: `4000 0025 0000 3155`

Use any future expiry date, any 3-digit CVC, and any ZIP code.

## Updates from Google Sites

This site has been migrated from Google Sites to provide:
- ✅ Better customization options
- ✅ Payment integration capabilities (NEW!)
- ✅ Modern, responsive design
- ✅ Version control with Git
- ✅ Free hosting on GitHub Pages
- ✅ Full control over code and styling
- ✅ Ability to use custom domain (www.wcdmr.com)

## Support

For Stripe-related issues, check the [Stripe Documentation](https://stripe.com/docs).

For questions about the retreat, contact the WCDMR organizers.

## License

MIT License - feel free to use this project for your own purposes.
