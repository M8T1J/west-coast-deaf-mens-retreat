#!/usr/bin/env python3
"""
Logo Enhancement Script
Enhances the logo image to make it bolder and more professional.
Requires Pillow: pip3 install Pillow
"""

try:
    from PIL import Image, ImageEnhance, ImageFilter
    import os
    
    # Paths
    logo_input = "/Users/thomas/payment-site/images/logo.JPG"
    logo_output = "/Users/thomas/payment-site/images/logo-enhanced.JPG"
    
    if not os.path.exists(logo_input):
        print(f"Error: Logo file not found at {logo_input}")
        exit(1)
    
    print("Loading logo image...")
    img = Image.open(logo_input)
    
    # Convert to RGB if needed
    if img.mode != 'RGB':
        img = img.convert('RGB')
    
    print("Enhancing logo...")
    
    # Enhance contrast (makes it bolder)
    enhancer = ImageEnhance.Contrast(img)
    img = enhancer.enhance(1.2)  # 20% more contrast
    
    # Enhance sharpness
    enhancer = ImageEnhance.Sharpness(img)
    img = enhancer.enhance(1.3)  # 30% sharper
    
    # Enhance color saturation (makes colors pop)
    enhancer = ImageEnhance.Color(img)
    img = enhancer.enhance(1.15)  # 15% more vibrant
    
    # Apply slight unsharp mask for crispness
    img = img.filter(ImageFilter.UnsharpMask(radius=1, percent=150, threshold=3))
    
    # Save enhanced logo
    print(f"Saving enhanced logo to {logo_output}...")
    img.save(logo_output, 'JPEG', quality=95, optimize=True)
    
    print("✓ Logo enhancement complete!")
    print(f"Enhanced logo saved to: {logo_output}")
    print("\nTo use the enhanced logo, update index.html to use 'logo-enhanced.JPG'")
    
except ImportError:
    print("Pillow (PIL) is not installed.")
    print("Install it with: pip3 install Pillow")
    print("\nOr use the enhance-logo.sh script instead.")
except Exception as e:
    print(f"Error: {e}")
