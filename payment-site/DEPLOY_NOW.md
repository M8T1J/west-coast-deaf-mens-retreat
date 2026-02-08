# Quick Deployment Guide

## Your Website Location

**GitHub Repository:** https://github.com/M8T1J/west-coast-deaf-mens-retreat

**Your Local Files:** `/Users/thomas/payment-site/`

## To Deploy Your Updated Website with Email Automation:

### Step 1: Open Terminal
- Press `Cmd + Space` and type "Terminal"
- Open Terminal app

### Step 2: Navigate to Your Project
Copy and paste this command:
```bash
cd /Users/thomas/payment-site
```

### Step 3: Check What Changed
```bash
git status
```

### Step 4: Add All Changes
```bash
git add .
```

### Step 5: Commit Changes
```bash
git commit -m "Add email automation with EmailJS"
```

### Step 6: Push to GitHub
```bash
git push origin main
```

### Step 7: Check Your Website
- If using GitHub Pages: https://M8T1J.github.io/west-coast-deaf-mens-retreat/
- Or check your custom domain: www.wcdmr.com

## Alternative: Test Locally First

1. Open Finder
2. Navigate to: `/Users/thomas/payment-site/`
3. Double-click `index.html`
4. It will open in your browser
5. Test the registration form there!

## Files That Were Updated:

✅ `index.html` - Added email service script
✅ `app.js` - Added email sending after payment
✅ `email-service.js` - Email automation service (NEW)
✅ `email-template-for-emailjs.html` - Email template (NEW)

All files are ready to deploy!
