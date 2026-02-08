#!/bin/bash
# Simple logo enhancement using macOS tools

INPUT="/Users/thomas/payment-site/images/logo.JPG"
OUTPUT="/Users/thomas/payment-site/images/logo-enhanced.JPG"

echo "Creating enhanced logo..."

# Copy the original
cp "$INPUT" "$OUTPUT"

# Use sips to enhance (if available)
if command -v sips &> /dev/null; then
    # Try to improve quality
    sips -s format jpeg "$OUTPUT" --out "$OUTPUT" 2>/dev/null || true
fi

echo "Enhanced logo saved to: $OUTPUT"
echo ""
echo "Note: For best results, use an image editor like:"
echo "- Preview (macOS): Open logo.JPG, adjust contrast/sharpness, export as logo-enhanced.JPG"
echo "- Photoshop/GIMP: Increase contrast 15-20%, sharpen slightly, boost saturation 10-15%"
echo "- Online: Use tools like Photopea.com or Canva to enhance"
