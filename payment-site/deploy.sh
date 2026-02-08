#!/bin/bash

# Deployment script for West Coast Deaf Men's Retreat site
# This script will initialize git, commit files, and help deploy to GitHub

set -e

echo "🚀 Deploying West Coast Deaf Men's Retreat site to GitHub..."
echo ""

# Check if git is installed
if ! command -v git &> /dev/null; then
    echo "❌ Git is not installed. Please install Git first."
    exit 1
fi

# Navigate to project directory
cd "$(dirname "$0")"
PROJECT_DIR=$(pwd)

echo "📁 Project directory: $PROJECT_DIR"
echo ""

# Initialize git repository if not already initialized
if [ ! -d .git ]; then
    echo "📦 Initializing git repository..."
    git init
    echo "✅ Git repository initialized"
else
    echo "ℹ️  Git repository already initialized"
fi

# Configure git (if not already configured globally)
if [ -z "$(git config user.name)" ]; then
    read -p "Enter your name for git commits: " GIT_NAME
    git config user.name "$GIT_NAME"
fi

if [ -z "$(git config user.email)" ]; then
    read -p "Enter your email for git commits: " GIT_EMAIL
    git config user.email "$GIT_EMAIL"
fi

echo ""
echo "📝 Adding files to git..."
git add .

echo "💾 Committing files..."
git commit -m "Initial commit: West Coast Deaf Men's Retreat 2026 site with payment integration" || echo "ℹ️  Files already committed or no changes to commit"

echo ""
echo "✅ Local git repository is ready!"
echo ""
echo "📋 Next steps to deploy to GitHub:"
echo ""
echo "1. Create a new repository on GitHub:"
echo "   - Go to https://github.com/new"
echo "   - Repository name: west-coast-deaf-mens-retreat (or wcdmr-2026)"
echo "   - Description: West Coast Deaf Men's Retreat 2026 website with payment integration"
echo "   - Choose Public or Private"
echo "   - DO NOT initialize with README, .gitignore, or license"
echo "   - Click 'Create repository'"
echo ""
echo "2. After creating the repository, run these commands:"
echo ""
echo "   git branch -M main"
echo "   git remote add origin https://github.com/YOUR_USERNAME/west-coast-deaf-mens-retreat.git"
echo "   git push -u origin main"
echo ""
echo "   (Replace YOUR_USERNAME with your actual GitHub username)"
echo ""
echo "3. Enable GitHub Pages:"
echo "   - Go to repository Settings > Pages"
echo "   - Source: Deploy from a branch"
echo "   - Branch: main, folder: / (root)"
echo "   - Click Save"
echo ""
echo "4. (Optional) Set up custom domain www.wcdmr.com:"
echo "   - Create a file named CNAME in the repository root"
echo "   - Add 'www.wcdmr.com' to the file"
echo "   - Configure DNS settings"
echo ""

# Check if GitHub CLI is available
if command -v gh &> /dev/null; then
    echo "🔍 GitHub CLI (gh) is installed. Would you like to use it to create the repository?"
    read -p "Create repository using GitHub CLI? (y/n): " USE_GH
    
    if [ "$USE_GH" = "y" ] || [ "$USE_GH" = "Y" ]; then
        echo ""
        read -p "Repository name (default: west-coast-deaf-mens-retreat): " REPO_NAME
        REPO_NAME=${REPO_NAME:-west-coast-deaf-mens-retreat}
        
        echo "Creating repository: $REPO_NAME"
        gh repo create "$REPO_NAME" --public --description "West Coast Deaf Men's Retreat 2026 website with payment integration" --source=. --remote=origin --push
        
        if [ $? -eq 0 ]; then
            echo ""
            echo "✅ Repository created and code pushed to GitHub!"
            echo "🌐 Enable GitHub Pages in Settings > Pages"
        else
            echo "❌ Failed to create repository with GitHub CLI"
            echo "Please create it manually using the steps above"
        fi
    fi
fi

echo ""
echo "✨ Deployment preparation complete!"
echo ""
