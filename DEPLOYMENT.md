# Deployment Guide

Quick guide to deploy your payment site to GitHub Pages.

## Step-by-Step Deployment

### 1. Initialize Git Repository

```bash
cd /Users/thomas/payment-site
git init
git add .
git commit -m "Initial commit: Payment site migrated from Google Sites"
```

### 2. Create GitHub Repository

1. Go to [GitHub](https://github.com) and create a new repository
2. Name it something like `payment-site` or `your-payment-site`
3. **Don't** initialize with README, .gitignore, or license (we already have these)

### 3. Push to GitHub

```bash
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
git push -u origin main
```

Replace `YOUR_USERNAME` and `YOUR_REPO_NAME` with your actual GitHub username and repository name.

### 4. Enable GitHub Pages

1. Go to your repository on GitHub
2. Click on **Settings**
3. Scroll down to **Pages** (in the left sidebar)
4. Under **Source**, select:
   - **Branch**: `main`
   - **Folder**: `/ (root)`
5. Click **Save**

### 5. Access Your Site

Your site will be live at:
```
https://YOUR_USERNAME.github.io/YOUR_REPO_NAME/
```

It may take a few minutes for the site to be available after enabling GitHub Pages.

## Custom Domain (Optional)

If you want to use a custom domain:

1. Create a file named `CNAME` in your repository root
2. Add your domain name (e.g., `payments.example.com`) to the file
3. Configure your DNS settings to point to GitHub Pages:
   - Add a CNAME record pointing to `YOUR_USERNAME.github.io`
4. GitHub Pages will automatically detect the CNAME file

## Update Your Stripe Key

**Before going live**, update your Stripe publishable key in `app.js`:

1. Get your publishable key from [Stripe Dashboard](https://dashboard.stripe.com/apikeys)
2. Open `app.js`
3. Replace `pk_test_your_publishable_key_here` with your actual key
4. Commit and push the changes:

```bash
git add app.js
git commit -m "Update Stripe publishable key"
git push
```

## Testing

After deployment:

1. Test the site on different devices (desktop, tablet, mobile)
2. Test the payment form (use Stripe test cards in test mode)
3. Verify all links and navigation work correctly
4. Check that the contact form submits properly

## Troubleshooting

### Site Not Loading
- Wait a few minutes after enabling GitHub Pages
- Check the repository Settings > Pages for any error messages
- Verify your HTML file is named `index.html` (lowercase)

### Stripe Not Working
- Ensure you've added your Stripe publishable key
- Check browser console for any JavaScript errors
- Verify Stripe.js is loading correctly
- Make sure you're using the correct test/live key

### Styles Not Loading
- Verify `styles.css` is in the same directory as `index.html`
- Check that the file path in HTML is correct: `<link rel="stylesheet" href="styles.css">`

## Continuous Deployment

Every time you make changes:

```bash
git add .
git commit -m "Describe your changes"
git push
```

Changes will automatically be reflected on GitHub Pages within a few minutes.
