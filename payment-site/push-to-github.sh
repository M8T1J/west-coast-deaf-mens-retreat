#!/bin/bash

# Script to push West Coast Deaf Men's Retreat site to GitHub
# Run this AFTER creating the repository on GitHub

set -e

echo "🚀 Pushing West Coast Deaf Men's Retreat site to GitHub..."
echo ""

# Get repository name
read -p "Enter your GitHub username: " GITHUB_USERNAME
read -p "Enter repository name (default: west-coast-deaf-mens-retreat): " REPO_NAME
REPO_NAME=${REPO_NAME:-west-coast-deaf-mens-retreat}

REPO_URL="https://github.com/${GITHUB_USERNAME}/${REPO_NAME}.git"

echo ""
echo "📋 Repository details:"
echo "   GitHub URL: $REPO_URL"
echo ""

# Check if remote already exists
if git remote get-url origin &> /dev/null; then
    echo "ℹ️  Remote 'origin' already exists: $(git remote get-url origin)"
    read -p "Do you want to update it? (y/n): " UPDATE_REMOTE
    if [ "$UPDATE_REMOTE" = "y" ] || [ "$UPDATE_REMOTE" = "Y" ]; then
        git remote set-url origin "$REPO_URL"
        echo "✅ Remote updated"
    fi
else
    echo "🔗 Adding remote repository..."
    git remote add origin "$REPO_URL"
    echo "✅ Remote added"
fi

echo ""
echo "📤 Pushing code to GitHub..."
git push -u origin main

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Successfully pushed to GitHub!"
    echo ""
    echo "🌐 Next steps:"
    echo "1. Go to https://github.com/${GITHUB_USERNAME}/${REPO_NAME}"
    echo "2. Go to Settings > Pages"
    echo "3. Under 'Source', select 'Deploy from a branch'"
    echo "4. Select 'main' branch and '/' folder"
    echo "5. Click Save"
    echo ""
    echo "Your site will be live at:"
    echo "   https://${GITHUB_USERNAME}.github.io/${REPO_NAME}/"
    echo ""
    echo "Optional: Set up custom domain www.wcdmr.com"
    echo "1. Create a file named 'CNAME' in the repository"
    echo "2. Add 'www.wcdmr.com' to the file"
    echo "3. Configure your DNS settings"
else
    echo ""
    echo "❌ Failed to push. Please check:"
    echo "   - Repository exists on GitHub"
    echo "   - You have push access"
    echo "   - Your GitHub credentials are correct"
    exit 1
fi
