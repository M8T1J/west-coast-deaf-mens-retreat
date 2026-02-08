# Deploy to GitHub - Quick Guide

Your West Coast Deaf Men's Retreat site is ready to deploy! Follow these steps:

## Step 1: Create GitHub Repository

1. Go to [GitHub](https://github.com) and sign in
2. Click the **+** icon in the top right, then click **New repository**
3. Repository settings:
   - **Repository name**: `west-coast-deaf-mens-retreat` (or `wcdmr-2026`)
   - **Description**: `West Coast Deaf Men's Retreat 2026 website with payment integration`
   - Choose **Public** or **Private**
   - **DO NOT** check "Add a README file"
   - **DO NOT** check "Add .gitignore"
   - **DO NOT** check "Choose a license"
4. Click **Create repository**

## Step 2: Push Your Code

After creating the repository, run this command in the terminal:

```bash
cd /Users/thomas/payment-site
./push-to-github.sh
```

Or manually run:

```bash
cd /Users/thomas/payment-site
git remote add origin https://github.com/YOUR_USERNAME/west-coast-deaf-mens-retreat.git
git branch -M main
git push -u origin main
```

(Replace `YOUR_USERNAME` with your actual GitHub username)

## Step 3: Enable GitHub Pages

1. Go to your repository on GitHub
2. Click **Settings** (in the repository menu)
3. Scroll down to **Pages** (in the left sidebar)
4. Under **Source**:
   - Select **Deploy from a branch**
   - Branch: **main**
   - Folder: **/**
5. Click **Save**

## Step 4: Access Your Site

Your site will be live at:
```
https://YOUR_USERNAME.github.io/west-coast-deaf-mens-retreat/
```

It may take a few minutes for the site to be available after enabling GitHub Pages.

## Step 5: (Optional) Set Up Custom Domain

If you want to use `www.wcdmr.com`:

1. Create a file named `CNAME` in your repository root:
   ```bash
   cd /Users/thomas/payment-site
   echo "www.wcdmr.com" > CNAME
   git add CNAME
   git commit -m "Add CNAME for custom domain"
   git push
   ```

2. Configure DNS settings with your domain provider:
   - Add a CNAME record:
     - Name: `www`
     - Value: `YOUR_USERNAME.github.io`
   - Or add an A record (check GitHub Pages docs for current IP addresses)

3. GitHub will automatically detect the CNAME file

## Troubleshooting

### Authentication Issues
If you get authentication errors when pushing:
- Use a Personal Access Token instead of password
- Generate one at: https://github.com/settings/tokens
- Use the token as your password when pushing

### Repository Not Found
Make sure you:
- Created the repository on GitHub first
- Used the correct repository name
- Have the correct username

### Site Not Loading
- Wait a few minutes after enabling GitHub Pages
- Check repository Settings > Pages for any error messages
- Verify `index.html` is in the root directory

## Need Help?

Check the main [README.md](README.md) and [DEPLOYMENT.md](DEPLOYMENT.md) files for more detailed information.
