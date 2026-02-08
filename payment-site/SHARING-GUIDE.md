# How to Share WCDMR 2026 Website for Testing

## Option 1: Local Network Sharing (Easiest - Same WiFi)

### Step 1: Start a Local Server
Open Terminal in the payment-site folder and run:

```bash
# Python 3 (recommended)
python3 -m http.server 8000

# OR if you have Node.js installed
npx http-server -p 8000
```

### Step 2: Find Your Computer's IP Address
```bash
# On Mac:
ifconfig | grep "inet " | grep -v 127.0.0.1

# Look for something like: 192.168.1.100
```

### Step 3: Share the URL
Give your team this URL (replace with your IP):
```
http://192.168.1.100:8000
```

**Note:** Everyone must be on the same WiFi network.

---

## Option 2: Public URL with ngrok (Best for Remote Testing)

### Step 1: Install ngrok
Download from: https://ngrok.com/download
Or install via Homebrew:
```bash
brew install ngrok
```

### Step 2: Start Local Server
```bash
python3 -m http.server 8000
```

### Step 3: Start ngrok (in a new terminal)
```bash
ngrok http 8000
```

### Step 4: Share the ngrok URL
ngrok will give you a public URL like:
```
https://abc123.ngrok.io
```

Share this URL with your team - they can access it from anywhere!

---

## Option 3: Quick Share Script

I've created a `share.sh` script you can run:

```bash
chmod +x share.sh
./share.sh
```

This will automatically:
- Start a local server
- Show your local network URL
- Optionally set up ngrok if installed

---

## Option 4: Deploy to Free Hosting (Permanent Solution)

### GitHub Pages (Free)
1. Create a GitHub repository
2. Push your files
3. Enable GitHub Pages in settings
4. Share the GitHub Pages URL

### Netlify (Free - Easiest)
1. Go to https://netlify.com
2. Drag and drop your `payment-site` folder
3. Get instant public URL
4. Share with team

### Vercel (Free)
1. Install Vercel CLI: `npm i -g vercel`
2. Run: `vercel` in your project folder
3. Follow prompts
4. Get public URL

---

## Testing Checklist for Your Team

When sharing, ask your team to test:

- [ ] View the homepage and navigation
- [ ] Fill out the registration form
- [ ] Test form validation (try submitting with empty fields)
- [ ] Check PayPal button appears after filling form
- [ ] View email preview page
- [ ] Check mobile responsiveness
- [ ] Test all navigation links
- [ ] View committee photos
- [ ] Check schedule section
- [ ] Test admin page (if applicable)

---

## Important Notes

⚠️ **For Testing PayPal:**
- Use PayPal Sandbox mode for testing payments
- Don't use real payment links in testing
- Test the form validation and flow first

⚠️ **Email Testing:**
- EmailJS is configured but needs to be tested
- Check email-preview.html to see the email design
- Test with a real email address to verify delivery

---

## Quick Start Commands

**Local Network:**
```bash
cd /Users/thomas/payment-site
python3 -m http.server 8000
# Then share: http://YOUR_IP:8000
```

**With ngrok (public):**
```bash
cd /Users/thomas/payment-site
python3 -m http.server 8000
# In another terminal:
ngrok http 8000
# Share the ngrok URL
```
