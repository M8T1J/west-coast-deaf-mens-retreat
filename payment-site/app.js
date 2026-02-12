// Mobile Menu Toggle
const mobileMenuToggle = document.querySelector('.mobile-menu-toggle');
const navLinks = document.querySelector('.nav-links');

if (mobileMenuToggle && navLinks) {
    mobileMenuToggle.addEventListener('click', () => {
        const isExpanded = mobileMenuToggle.getAttribute('aria-expanded') === 'true';
        mobileMenuToggle.setAttribute('aria-expanded', !isExpanded);
        navLinks.classList.toggle('active');
    });

    // Close menu when clicking on a link
    navLinks.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
            mobileMenuToggle.setAttribute('aria-expanded', 'false');
            navLinks.classList.remove('active');
        });
    });

    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
        if (!navLinks.contains(e.target) && !mobileMenuToggle.contains(e.target)) {
            mobileMenuToggle.setAttribute('aria-expanded', 'false');
            navLinks.classList.remove('active');
        }
    });
}

// PayPal Payment Link Handler
// Your PayPal payment link: https://www.paypal.com/ncp/payment/LNMQ6S8HZWP5C

const PAYPAL_BASE_LINK = 'https://www.paypal.com/ncp/payment/LNMQ6S8HZWP5C';
const DEFAULT_AMOUNT = 245.00; // Default registration fee
const ZELLE_CONTACT = 'wcdmrpayments@gmail.com'; // Zelle email for payments
const ZELLE_RECIPIENT = 'WEST COAST DEAF MEN\'S RETREAT'; // Zelle recipient name

// Generate PayPal payment link with amount
function generatePayPalLink(amount) {
    // PayPal payment links can include amount in the URL
    // Note: You may need to create dynamic payment links in PayPal dashboard
    // For now, we'll use the base link and handle amount via form data
    
    // Store form data in sessionStorage before redirecting
    const formData = {
        fullName: document.getElementById('full-name').value.trim(),
        email: document.getElementById('email').value.trim(),
        phone: document.getElementById('phone').value.trim(),
        amount: amount,
        timestamp: Date.now()
    };
    
    sessionStorage.setItem('wcdmr_registration', JSON.stringify(formData));
    
    // Return the PayPal link
    return PAYPAL_BASE_LINK;
}

// Update PayPal button when amount changes
function updatePayPalButton() {
    const amountInput = document.getElementById('amount');
    const container = document.getElementById('paypal-link-container');
    
    if (!amountInput || !container) return;
    
    const amount = parseFloat(amountInput.value) || DEFAULT_AMOUNT;
    
    container.innerHTML = `
        <button
            type="button"
            id="paypal-payment-link"
            class="paypal-payment-button"
            onclick="handlePayPalClick(event)"
            style="
                display: inline-block;
                background: #0070ba;
                color: #ffffff;
                padding: 16px 34px;
                border-radius: 8px;
                font-size: 18px;
                font-weight: bold;
                text-decoration: none;
                transition: background 0.3s ease;
                border: none;
                cursor: pointer;
                font-family: inherit;
            "
            onmouseover="this.style.background='#005ea6'"
            onmouseout="this.style.background='#0070ba'"
        >
            Complete Registration & Pay $${amount.toFixed(2)} with PayPal
        </button>
    `;
}

// Handle PayPal link click - Integrated registration and payment
function handlePayPalClick(event) {
    // Prevent default navigation
    event.preventDefault();
    
    // Validate form first
    if (!validateForm()) {
        const firstError = document.querySelector('[aria-invalid="true"]');
        if (firstError) {
            firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
            firstError.focus();
        }
        
        // Show error message
        const errorDiv = document.getElementById('payment-errors');
        if (errorDiv) {
            errorDiv.textContent = 'Please fill in all required fields correctly before proceeding to payment.';
            errorDiv.style.display = 'block';
        }
        return false;
    }
    
    // Get form data
    const amount = parseFloat(document.getElementById('amount').value) || DEFAULT_AMOUNT;
    const firstName = document.getElementById('first-name').value.trim();
    const lastName = document.getElementById('last-name').value.trim();
    
    // Get bunk selections
    const bunkSelections = [];
    document.querySelectorAll('input[name^="bunk-"]:checked').forEach(cb => {
        bunkSelections.push(cb.value);
    });
    
    const formData = {
        firstName: firstName,
        lastName: lastName,
        fullName: `${firstName} ${lastName}`,
        email: document.getElementById('email').value.trim(),
        phone: document.getElementById('phone').value.trim(),
        videophone: document.getElementById('videophone').value.trim(),
        fullAddress: document.getElementById('full-address').value.trim(),
        churchName: document.getElementById('church-name').value.trim(),
        emergencyName: document.getElementById('emergency-name').value.trim(),
        emergencyPhone: document.getElementById('emergency-phone').value.trim(),
        bunkSelection: bunkSelections.join(', '),
        youthInfo: document.getElementById('youth-info').value.trim(),
        paymentUnderstanding: document.getElementById('payment-understanding').checked,
        amount: amount,
        timestamp: Date.now()
    };
    
    // Store registration data immediately (before payment)
    if (typeof storeRegistrationData === 'function') {
        storeRegistrationData(formData, 'PENDING');
    }
    
    // Store in sessionStorage for PayPal return
    sessionStorage.setItem('wcdmr_registration', JSON.stringify(formData));
    
    // Show loading state
    const container = document.getElementById('paypal-link-container');
    if (container) {
        container.innerHTML = '<div class="spinner" style="margin: 1rem auto;"></div><p style="text-align: center; color: var(--text-light);">Redirecting to PayPal...</p>';
    }
    
    // Redirect to PayPal after a brief moment
    setTimeout(() => {
        window.location.href = PAYPAL_BASE_LINK;
    }, 500);
    
    return false;
}

// Check for PayPal return (if user comes back from PayPal)
function checkPayPalReturn() {
    const urlParams = new URLSearchParams(window.location.search);
    const paymentStatus = urlParams.get('payment');
    const registrationData = sessionStorage.getItem('wcdmr_registration');
    
    if (paymentStatus === 'success' && registrationData) {
        try {
            const formData = JSON.parse(registrationData);
            
            // Generate payment ID
            const paymentId = `PAYPAL-${formData.timestamp}`;
            
            // Convert amount to cents for email service
            const emailFormData = {
                ...formData,
                amount: formData.amount * 100,
                name: formData.fullName,
                zip: ''
            };
            
            // Complete registration (update status from PENDING to COMPLETED)
            if (typeof completeRegistration === 'function') {
                completeRegistration(formData, paymentId);
            } else {
                // Fallback: store registration data
                if (typeof storeRegistrationData === 'function') {
                    storeRegistrationData(formData, paymentId);
                }
            }
            
            // Send confirmation email if service script is loaded
            if (typeof sendConfirmationEmail === 'function') {
                sendConfirmationEmail(emailFormData, paymentId).then(emailSent => {
                    if (emailSent) {
                        console.log('Confirmation email sent successfully');
                    }
                }).catch(error => {
                    console.error('Error sending email:', error);
                });
            } else {
                console.warn('Email service unavailable: sendConfirmationEmail is not defined');
            }
            
            // Show success message
            showPaymentSuccess(emailFormData, paymentId);
            
            // Clear session storage
            sessionStorage.removeItem('wcdmr_registration');
            
            // Clean URL
            window.history.replaceState({}, document.title, window.location.pathname);
        } catch (error) {
            console.error('Error processing PayPal return:', error);
        }
    }
}

// Zelle payment handler
function handleZellePayment() {
    // Validate form first
    if (!validateForm()) {
        const firstError = document.querySelector('[aria-invalid="true"]');
        if (firstError) {
            firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
            firstError.focus();
        }
        
        const errorDiv = document.getElementById('zelle-payment-errors');
        if (errorDiv) {
            errorDiv.textContent = 'Please fill in all required fields correctly before completing registration.';
            errorDiv.style.display = 'block';
        }
        return false;
    }
    
    // Get form data
    const amount = parseFloat(document.getElementById('amount').value) || DEFAULT_AMOUNT;
    const firstName = document.getElementById('first-name').value.trim();
    const lastName = document.getElementById('last-name').value.trim();
    
    // Get bunk selections
    const bunkSelections = [];
    document.querySelectorAll('input[name^="bunk-"]:checked').forEach(cb => {
        bunkSelections.push(cb.value);
    });
    
    const formData = {
        firstName: firstName,
        lastName: lastName,
        fullName: `${firstName} ${lastName}`,
        email: document.getElementById('email').value.trim(),
        phone: document.getElementById('phone').value.trim(),
        videophone: document.getElementById('videophone').value.trim(),
        fullAddress: document.getElementById('full-address').value.trim(),
        churchName: document.getElementById('church-name').value.trim(),
        emergencyName: document.getElementById('emergency-name').value.trim(),
        emergencyPhone: document.getElementById('emergency-phone').value.trim(),
        bunkSelection: bunkSelections.join(', '),
        youthInfo: document.getElementById('youth-info').value.trim(),
        paymentUnderstanding: document.getElementById('payment-understanding').checked,
        amount: amount,
        paymentMethod: 'zelle',
        timestamp: Date.now()
    };
    
    // Generate payment ID for Zelle
    const paymentId = `ZELLE-${formData.timestamp}`;
    
    // Store registration data
    if (typeof storeRegistrationData === 'function') {
        storeRegistrationData(formData, paymentId);
    }
    
    // Convert amount to cents for email service
    const emailFormData = {
        ...formData,
        amount: formData.amount * 100,
        name: formData.fullName,
        zip: ''
    };
    
    // Complete registration
    if (typeof completeRegistration === 'function') {
        completeRegistration(formData, paymentId);
    }
    
    // Send confirmation email
    if (typeof sendConfirmationEmail === 'function') {
        sendConfirmationEmail(emailFormData, paymentId).then(emailSent => {
            if (emailSent) {
                console.log('Confirmation email sent successfully');
            }
        }).catch(error => {
            console.error('Error sending email:', error);
        });
    }
    
    // Show success message
    showPaymentSuccess(emailFormData, paymentId);
    
    return false;
}

// Copy Zelle info to clipboard
function copyZelleInfo() {
    const zelleRecipient = document.getElementById('zelle-recipient-name').textContent.trim();
    const zelleContact = document.getElementById('zelle-contact-info').textContent.trim();
    const zelleAmount = document.getElementById('zelle-amount').textContent.trim();
    const copyText = `Zelle Payment\nRecipient: ${zelleRecipient}\nEmail: ${zelleContact}\nAmount: $${zelleAmount}`;
    
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(copyText).then(() => {
            const btn = document.getElementById('copy-zelle-btn');
            const originalText = btn.textContent;
            btn.textContent = 'Copied!';
            btn.style.background = '#2d5016';
            btn.style.color = '#ffffff';
            setTimeout(() => {
                btn.textContent = originalText;
                btn.style.background = '';
                btn.style.color = '';
            }, 2000);
        }).catch(err => {
            console.error('Failed to copy:', err);
            fallbackCopyTextToClipboard(copyText);
        });
    } else {
        fallbackCopyTextToClipboard(copyText);
    }
}

// Fallback copy function for older browsers
function fallbackCopyTextToClipboard(text) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
        document.execCommand('copy');
        const btn = document.getElementById('copy-zelle-btn');
        const originalText = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => {
            btn.textContent = originalText;
        }, 2000);
    } catch (err) {
        console.error('Fallback copy failed:', err);
    }
    document.body.removeChild(textArea);
}

// Handle payment method selection
function handlePaymentMethodChange() {
    const paypalMethod = document.getElementById('payment-method-paypal');
    const zelleMethod = document.getElementById('payment-method-zelle');
    const paypalSection = document.getElementById('paypal-payment-section');
    const zelleSection = document.getElementById('zelle-payment-section');
    
    if (paypalMethod && zelleMethod && paypalSection && zelleSection) {
        if (paypalMethod.checked) {
            paypalSection.classList.remove('hidden');
            zelleSection.classList.add('hidden');
        } else if (zelleMethod.checked) {
            paypalSection.classList.add('hidden');
            zelleSection.classList.remove('hidden');
            // Update Zelle amount display
            const amount = parseFloat(document.getElementById('amount').value) || DEFAULT_AMOUNT;
            document.getElementById('zelle-amount').textContent = amount.toFixed(2);
        }
    }
}

// Initialize Zelle contact info
function initializeZelleInfo() {
    const zelleContactEl = document.getElementById('zelle-contact-info');
    const zelleRecipientEl = document.getElementById('zelle-recipient-name');
    const zelleEmailDisplayEl = document.getElementById('zelle-email-display');
    
    if (zelleContactEl) {
        zelleContactEl.textContent = ZELLE_CONTACT;
    }
    if (zelleRecipientEl) {
        zelleRecipientEl.textContent = ZELLE_RECIPIENT;
    }
    if (zelleEmailDisplayEl) {
        zelleEmailDisplayEl.textContent = ZELLE_CONTACT;
    }
}

// Initialize PayPal button on page load
document.addEventListener('DOMContentLoaded', function() {
    updatePayPalButton();
    checkPayPalReturn();
    
    // Update button when amount changes
    const amountInput = document.getElementById('amount');
    if (amountInput) {
        amountInput.addEventListener('input', () => {
            updatePayPalButton();
            // Update Zelle amount if Zelle is selected
            const zelleMethod = document.getElementById('payment-method-zelle');
            if (zelleMethod && zelleMethod.checked) {
                const amount = parseFloat(amountInput.value) || DEFAULT_AMOUNT;
                document.getElementById('zelle-amount').textContent = amount.toFixed(2);
            }
        });
        amountInput.addEventListener('change', () => {
            updatePayPalButton();
            const zelleMethod = document.getElementById('payment-method-zelle');
            if (zelleMethod && zelleMethod.checked) {
                const amount = parseFloat(amountInput.value) || DEFAULT_AMOUNT;
                document.getElementById('zelle-amount').textContent = amount.toFixed(2);
            }
        });
    }
    
    // Handle payment method selection
    const paypalMethod = document.getElementById('payment-method-paypal');
    const zelleMethod = document.getElementById('payment-method-zelle');
    
    if (paypalMethod) {
        paypalMethod.addEventListener('change', handlePaymentMethodChange);
    }
    if (zelleMethod) {
        zelleMethod.addEventListener('change', handlePaymentMethodChange);
    }
    
    // Initialize payment method display
    handlePaymentMethodChange();
    
    // Initialize Zelle contact info
    initializeZelleInfo();
});

// Form Validation
function validateField(fieldId, validator) {
    const field = document.getElementById(fieldId);
    const errorElement = document.getElementById(`${fieldId}-error`);
    
    if (!field || !errorElement) return true;
    
    const value = field.value.trim();
    const isValid = validator(value);
    
    if (!isValid && value) {
        field.setAttribute('aria-invalid', 'true');
        return false;
    } else {
        field.setAttribute('aria-invalid', 'false');
        errorElement.textContent = '';
        return true;
    }
}

// Screen reader announcement function
function announceToScreenReader(message) {
    const announcement = document.getElementById('sr-announcements');
    if (announcement) {
        announcement.textContent = message;
        // Clear after a moment so it can be announced again
        setTimeout(() => {
            announcement.textContent = '';
        }, 1000);
    }
}

function validateForm() {
    let isValid = true;
    let errorCount = 0;
    
    // Validate first name
    if (!validateField('first-name', (val) => val.length >= 1)) {
        document.getElementById('first-name-error').textContent = 'Please enter your first name';
        isValid = false;
        errorCount++;
    }
    
    // Validate last name
    if (!validateField('last-name', (val) => val.length >= 1)) {
        document.getElementById('last-name-error').textContent = 'Please enter your last name';
        isValid = false;
    }
    
    // Validate email
    if (!validateField('email', (val) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val))) {
        document.getElementById('email-error').textContent = 'Please enter a valid email address';
        isValid = false;
    }
    
    // Validate phone
    if (!validateField('phone', (val) => /^[\d\s\-\(\)]+$/.test(val) && val.replace(/\D/g, '').length >= 10)) {
        document.getElementById('phone-error').textContent = 'Please enter a valid phone number';
        isValid = false;
    }
    
    // Validate full address
    if (!validateField('full-address', (val) => val.length >= 10)) {
        document.getElementById('full-address-error').textContent = 'Please enter your full address';
        isValid = false;
    }
    
    // Validate church name
    if (!validateField('church-name', (val) => val.length >= 2)) {
        document.getElementById('church-name-error').textContent = 'Please enter your church name';
        isValid = false;
    }
    
    // Validate emergency contact name
    if (!validateField('emergency-name', (val) => val.length >= 2)) {
        document.getElementById('emergency-name-error').textContent = 'Please enter emergency contact name';
        isValid = false;
    }
    
    // Validate emergency contact phone
    if (!validateField('emergency-phone', (val) => /^[\d\s\-\(\)]+$/.test(val) && val.replace(/\D/g, '').length >= 10)) {
        document.getElementById('emergency-phone-error').textContent = 'Please enter emergency contact phone number';
        isValid = false;
    }
    
    // Validate bunk selection (at least one checkbox)
    const bunkCheckboxes = document.querySelectorAll('input[name^="bunk-"]:checked');
    if (bunkCheckboxes.length === 0) {
        document.getElementById('bunk-selection-error').textContent = 'Please select at least one bunk option';
        isValid = false;
    } else {
        document.getElementById('bunk-selection-error').textContent = '';
    }
    
    // Validate payment understanding
    const paymentUnderstanding = document.getElementById('payment-understanding');
    if (!paymentUnderstanding.checked) {
        document.getElementById('payment-understanding-error').textContent = 'Please confirm payment understanding';
        isValid = false;
        errorCount++;
    } else {
        document.getElementById('payment-understanding-error').textContent = '';
    }
    
    // Validate payment method selection
    const paymentMethod = document.querySelector('input[name="payment-method"]:checked');
    if (!paymentMethod) {
        document.getElementById('payment-method-error').textContent = 'Please select a payment method';
        isValid = false;
        errorCount++;
    } else {
        document.getElementById('payment-method-error').textContent = '';
    }
    
    // Validate amount
    const amount = parseFloat(document.getElementById('amount').value);
    if (!amount || amount <= 0) {
        document.getElementById('amount-error').textContent = 'Please enter a valid amount';
        isValid = false;
        errorCount++;
    }
    
    // Announce validation results to screen readers
    if (!isValid) {
        announceToScreenReader(`Form validation failed. ${errorCount} error${errorCount > 1 ? 's' : ''} found. Please review the form.`);
        // Focus first error field
        const firstError = document.querySelector('[aria-invalid="true"]');
        if (firstError) {
            firstError.focus();
        }
    }
    
    return isValid;
}

// Real-time validation
['first-name', 'last-name', 'email', 'phone', 'full-address', 'church-name', 'emergency-name', 'emergency-phone', 'amount'].forEach(fieldId => {
    const field = document.getElementById(fieldId);
    if (field) {
        field.addEventListener('blur', () => {
            validateField(fieldId, () => true); // Clear errors on blur if field is empty
        });
        
        field.addEventListener('input', () => {
            const errorElement = document.getElementById(`${fieldId}-error`);
            if (errorElement && field.value.trim()) {
                errorElement.textContent = '';
                field.setAttribute('aria-invalid', 'false');
            }
        });
    }
});

// PayPal handles form submission, so we don't need the old Stripe form handler
// Form validation happens when PayPal button is clicked (in createOrder)

// Payment success is now handled in PayPal's onApprove callback

function showPaymentSuccess(formData, paymentId) {
    const paymentForm = document.getElementById('registration-form');
    const paymentSuccess = document.getElementById('payment-success');
    const successMessage = document.getElementById('success-message');
    
    if (paymentForm) paymentForm.classList.add('hidden');
    if (paymentSuccess) paymentSuccess.classList.remove('hidden');
    
    const emailStatus = typeof sendConfirmationEmail !== 'undefined' ? 
        'A confirmation email has been sent to your email address.' : 
        'Please check your email for confirmation (if email service is configured).';
    
    if (successMessage) {
        successMessage.innerHTML = `
            <p>Your payment of <strong>$${(formData.amount / 100).toFixed(2)}</strong> has been processed successfully.</p>
            <p>${emailStatus}</p>
            <p style="margin-top: 1rem; font-size: 0.9rem; color: #6b7280;">
                Transaction ID: <code style="background: #f3f4f6; padding: 2px 6px; border-radius: 4px;">${paymentId || 'N/A'}</code>
            </p>
        `;
    }
    
    // Announce success to screen readers
    announceToScreenReader(`Registration successful! Payment of $${(formData.amount / 100).toFixed(2)} processed. Transaction ID: ${paymentId || 'N/A'}`);
    
    // Focus success message for screen readers
    if (paymentSuccess) {
        paymentSuccess.setAttribute('tabindex', '-1');
        paymentSuccess.focus();
        // Scroll to success message
        paymentSuccess.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

function resetForm() {
    const paymentForm = document.getElementById('registration-form');
    const paymentSuccess = document.getElementById('payment-success');
    
    if (paymentForm) {
        paymentForm.classList.remove('hidden');
        paymentForm.classList.remove('loading');
        paymentForm.reset();
    }
    
    if (paymentSuccess) {
        paymentSuccess.classList.add('hidden');
        paymentSuccess.removeAttribute('tabindex');
    }
    
    // Clear all error messages
    document.querySelectorAll('.field-error').forEach(error => {
        error.textContent = '';
    });
    
    // Reset aria-invalid attributes
    document.querySelectorAll('[aria-invalid]').forEach(field => {
        field.setAttribute('aria-invalid', 'false');
    });
    
    // Clear payment errors
    const paymentErrors = document.getElementById('payment-errors');
    if (paymentErrors) {
        paymentErrors.textContent = '';
        paymentErrors.style.display = 'none';
    }
    
    // Clear session storage
    sessionStorage.removeItem('wcdmr_registration');
    
    // Re-initialize PayPal button
    updatePayPalButton();
    
    // Announce to screen readers
    announceToScreenReader('Form reset. Ready for new registration.');
    
    // Focus on first field
    const firstName = document.getElementById('first-name');
    if (firstName) {
        firstName.focus();
    }
    
    // Scroll to form
    const registrationSection = document.getElementById('registration');
    if (registrationSection) {
        registrationSection.scrollIntoView({ behavior: 'smooth' });
    }
}

function scrollToPayment() {
    document.getElementById('registration').scrollIntoView({ behavior: 'smooth' });
}

// No longer needed - removed selectPlan function

// Smooth scrolling for navigation links with offset for sticky header
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const targetId = this.getAttribute('href');
        const target = document.querySelector(targetId);
        if (target) {
            const headerOffset = 80;
            const elementPosition = target.getBoundingClientRect().top;
            const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

            window.scrollTo({
                top: offsetPosition,
                behavior: 'smooth'
            });
        }
    });
});

// Add fade-in animation on scroll
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('fade-in');
            observer.unobserve(entry.target);
        }
    });
}, observerOptions);

// Observe sections for fade-in animation
document.querySelectorAll('section').forEach(section => {
    observer.observe(section);
});

// Format phone number inputs
function formatPhoneInput(input) {
    if (!input) return;
    input.addEventListener('input', (e) => {
        let value = e.target.value.replace(/\D/g, '');
        if (value.length > 0) {
            if (value.length <= 3) {
                value = `(${value}`;
            } else if (value.length <= 6) {
                value = `(${value.slice(0, 3)}) ${value.slice(3)}`;
            } else {
                value = `(${value.slice(0, 3)}) ${value.slice(3, 6)}-${value.slice(6, 10)}`;
            }
        }
        e.target.value = value;
    });
}

// Apply phone formatting to all phone fields
formatPhoneInput(document.getElementById('phone'));
formatPhoneInput(document.getElementById('videophone'));
formatPhoneInput(document.getElementById('emergency-phone'));

// Format ZIP code input
const zipInput = document.getElementById('billing-zip');
if (zipInput) {
    zipInput.addEventListener('input', (e) => {
        let value = e.target.value.replace(/\D/g, '');
        if (value.length > 5) {
            value = `${value.slice(0, 5)}-${value.slice(5, 9)}`;
        }
        e.target.value = value;
    });
}

// Form validation and additional handlers can be added here
