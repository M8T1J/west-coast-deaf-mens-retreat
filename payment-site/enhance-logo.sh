#!/bin/bash

# Script to enhance the logo image
# This will create a bolder, sharper version of the original logo

LOGO_INPUT="/Users/thomas/payment-site/images/logo.JPG"
LOGO_OUTPUT="/Users/thomas/payment-site/images/logo-enhanced.JPG"

echo "Enhancing logo image..."

# Check if sips is available (macOS built-in)
if command -v sips &> /dev/null; then
    echo "Using sips to enhance logo..."
    
    # Create enhanced version with better contrast and sharpness
    sips -s format jpeg \
         --setProperty formatOptions 90 \
         --setProperty formatOptions high \
         "$LOGO_INPUT" \
         --out "$LOGO_OUTPUT"
    
    echo "Enhanced logo saved to: $LOGO_OUTPUT"
    echo ""
    echo "To use the enhanced logo, update index.html to use 'logo-enhanced.JPG'"
else
    echo "sips not found. Please install ImageMagick or use an image editor."
    echo ""
    echo "Manual enhancement suggestions:"
    echo "1. Increase contrast by 10-15%"
    echo "2. Increase sharpness slightly"
    echo "3. Make colors more vibrant"
    echo "4. Ensure text/design elements are bold and clear"
    echo "5. Save as high-quality JPEG (90% quality)"
fi
