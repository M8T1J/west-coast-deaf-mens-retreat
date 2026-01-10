// Payment Form Handler
// Initialize Stripe - Replace with your publishable key from Stripe Dashboard
const stripe = Stripe('pk_test_your_publishable_key_here'); // Replace with your actual key
const elements = stripe.elements();

// Create card element
const cardElement = elements.create('card', {
    style: {
        base: {
            fontSize: '16px',
            color: '#1f2937',
            '::placeholder': {
                color: '#9ca3af',
            },
        },
        invalid: {
            color: '#ef4444',
        },
    },
});

// Mount card element
cardElement.mount('#card-element');

// Handle real-time validation errors from the card Element
cardElement.on('change', ({error}) => {
    const displayError = document.getElementById('card-errors');
    if (error) {
        displayError.textContent = error.message;
        displayError.style.display = 'block';
    } else {
        displayError.textContent = '';
        displayError.style.display = 'none';
    }
});

// Handle form submission
const paymentForm = document.getElementById('payment-form');
paymentForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const submitButton = document.getElementById('submit-button');
    const buttonText = document.getElementById('button-text');
    const spinner = document.getElementById('spinner');
    
    // Disable button and show spinner
    submitButton.disabled = true;
    buttonText.classList.add('hidden');
    spinner.classList.remove('hidden');

    const formData = {
        amount: parseFloat(document.getElementById('amount').value) * 100, // Convert to cents
        email: document.getElementById('email').value,
        name: document.getElementById('name').value,
        fullName: document.getElementById('full-name').value,
        phone: document.getElementById('phone').value,
        zip: document.getElementById('billing-zip').value,
    };

    try {
        // Create payment intent on your backend
        // For now, this is a client-side example. In production, you should:
        // 1. Create a backend endpoint (Node.js, Python, etc.) that creates a PaymentIntent
        // 2. Call that endpoint to get the client_secret
        // 3. Use the client_secret to confirm the payment
        
        // Example API call (replace with your actual backend endpoint):
        /*
        const response = await fetch('/create-payment-intent', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(formData),
        });
        
        const { client_secret } = await response.json();
        */

        // For demonstration, we'll create a payment method first
        // In production, use PaymentIntents API
        const { error: createError, paymentMethod } = await stripe.createPaymentMethod({
            type: 'card',
            card: cardElement,
            billing_details: {
                name: formData.name,
                email: formData.email,
                address: {
                    postal_code: formData.zip,
                },
            },
        });

        if (createError) {
            throw createError;
        }

        // Simulate payment processing (replace with actual PaymentIntent confirmation)
        // In production, confirm the payment with your backend
        await simulatePaymentSuccess(formData, paymentMethod.id);

    } catch (error) {
        // Handle errors
        const displayError = document.getElementById('card-errors');
        displayError.textContent = error.message || 'An error occurred. Please try again.';
        displayError.style.display = 'block';
        
        // Re-enable button
        submitButton.disabled = false;
        buttonText.classList.remove('hidden');
        spinner.classList.add('hidden');
    }
});

// Simulate payment success (replace with actual payment confirmation)
async function simulatePaymentSuccess(formData, paymentMethodId) {
    // In production, this would be handled by your backend
    // confirming the PaymentIntent with the payment method
    
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Show success message
    showPaymentSuccess(formData);
}

function showPaymentSuccess(formData) {
    const paymentForm = document.getElementById('payment-form');
    const paymentSuccess = document.getElementById('payment-success');
    const successMessage = document.getElementById('success-message');
    
    paymentForm.classList.add('hidden');
    paymentSuccess.classList.remove('hidden');
    
    successMessage.textContent = `Your payment of $${(formData.amount / 100).toFixed(2)} has been processed successfully. A confirmation email has been sent to ${formData.email}.`;
    
    // Scroll to success message
    paymentSuccess.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function resetForm() {
    const paymentForm = document.getElementById('payment-form');
    const paymentSuccess = document.getElementById('payment-success');
    
    paymentForm.classList.remove('hidden');
    paymentSuccess.classList.add('hidden');
    
    paymentForm.reset();
    cardElement.clear();
    
    // Re-enable button
    const submitButton = document.getElementById('submit-button');
    const buttonText = document.getElementById('button-text');
    const spinner = document.getElementById('spinner');
    
    submitButton.disabled = false;
    buttonText.classList.remove('hidden');
    spinner.classList.add('hidden');
    
    // Scroll to form
    document.getElementById('registration').scrollIntoView({ behavior: 'smooth' });
}

function scrollToPayment() {
    document.getElementById('registration').scrollIntoView({ behavior: 'smooth' });
}

// No longer needed - removed selectPlan function

// Smooth scrolling for navigation links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// Form validation and additional handlers can be added here
