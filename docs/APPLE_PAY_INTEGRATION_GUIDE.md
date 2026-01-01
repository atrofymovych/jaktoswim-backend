# Apple Pay Integration Guide

## Overview

This guide explains how to add Apple Pay support to your existing Stripe integration. Apple Pay provides a seamless, secure payment experience for users on Apple devices, potentially increasing conversion rates by up to 250%.

## Prerequisites

1. **Existing Stripe Integration** ✅ (Already implemented)
2. **Apple Developer Account** (Required for Merchant ID and certificates)
3. **HTTPS Domain** (Required for web Apple Pay)
4. **Stripe Account** with Apple Pay enabled

## Setup Steps

### 1. Apple Developer Console Setup

#### Create Merchant ID
1. Go to [Apple Developer Console](https://developer.apple.com/account/)
2. Navigate to **Certificates, Identifiers & Profiles**
3. Click **Identifiers** → **+** → **Merchant IDs**
4. Create a new Merchant ID (e.g., `merchant.com.yourcompany.crm`)
5. Note down the Merchant ID for later use

#### Generate Apple Pay Certificate
1. In Stripe Dashboard, go to **Settings** → **Apple Pay**
2. Click **Create certificate signing request**
3. Download the CSR file
4. In Apple Developer Console, go to **Certificates** → **+**
5. Select **Apple Pay Payment Processing Certificate**
6. Upload the CSR from Stripe
7. Download the generated certificate
8. Upload the certificate back to Stripe Dashboard

### 2. Domain Registration

#### Register Your Domain
1. In Stripe Dashboard, go to **Settings** → **Apple Pay**
2. Click **Add domain**
3. Enter your domain (e.g., `yourdomain.com`)
4. Download the verification file
5. Host the verification file at `https://yourdomain.com/.well-known/apple-developer-merchantid-domain-association`
6. Click **Verify** in Stripe Dashboard

### 3. Backend Configuration

Your backend already supports Apple Pay! The integration includes:

- **Apple Pay enabled Payment Intents** when `enable_apple_pay: true`
- **Domain availability checking** via `/stripe/apple-pay/availability`
- **Same webhook handling** for Apple Pay transactions

## Frontend Implementation

### 1. Install Required Dependencies

```bash
npm install @stripe/stripe-js
```

### 2. Check Apple Pay Availability

```javascript
import { loadStripe } from '@stripe/stripe-js';

async function checkApplePayAvailability() {
  const response = await fetch('/stripe/apple-pay/availability?domain=' + window.location.hostname, {
    headers: {
      'X-ORG-ID': 'your_org_id',
      'X-Stripe-Authorization': 'Bearer your_stripe_token'
    }
  });

  const data = await response.json();
  return data.available;
}
```

### 3. Create Apple Pay Button

```html
<!-- Apple Pay Button Container -->
<div id="apple-pay-button" style="display: none;">
  <!-- Apple Pay button will be inserted here -->
</div>

<!-- Regular Payment Form -->
<form id="payment-form">
  <div id="card-element">
    <!-- Stripe Elements will create form elements here -->
  </div>
  <div id="card-errors" role="alert"></div>
  <button id="submit-button">
    <span id="button-text">Pay $20.00</span>
    <span id="spinner" class="spinner hidden"></span>
  </button>
</form>
```

### 4. Complete React Implementation

```javascript
import React, { useState, useEffect } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements,
  CardElement,
  useStripe,
  useElements
} from '@stripe/react-stripe-js';

const stripePromise = loadStripe('pk_test_...'); // Your publishable key

function CheckoutForm() {
  const stripe = useStripe();
  const elements = useElements();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [succeeded, setSucceeded] = useState(false);
  const [applePayAvailable, setApplePayAvailable] = useState(false);
  const [applePayButton, setApplePayButton] = useState(null);

  // Check Apple Pay availability on component mount
  useEffect(() => {
    checkApplePayAvailability();
  }, []);

  const checkApplePayAvailability = async () => {
    try {
      const response = await fetch(`/stripe/apple-pay/availability?domain=${window.location.hostname}`, {
        headers: {
          'X-ORG-ID': 'your_org_id',
          'X-Stripe-Authorization': 'Bearer your_stripe_token'
        }
      });

      const data = await response.json();
      setApplePayAvailable(data.available);

      if (data.available && stripe) {
        createApplePayButton();
      }
    } catch (err) {
      console.error('Error checking Apple Pay availability:', err);
    }
  };

  const createApplePayButton = async () => {
    if (!stripe) return;

    const applePayButton = stripe.applePayButton({
      type: 'pay',
      style: 'black',
      locale: 'en',
      onClick: handleApplePayClick
    });

    const container = document.getElementById('apple-pay-button');
    if (container) {
      container.innerHTML = '';
      container.appendChild(applePayButton);
      container.style.display = 'block';
    }
  };

  const handleApplePayClick = async () => {
    if (!stripe) return;

    setIsLoading(true);
    setError(null);

    try {
      // Create payment intent with Apple Pay enabled
      const response = await fetch('/stripe/payment-intents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-ORG-ID': 'your_org_id',
          'X-Stripe-Authorization': 'Bearer your_stripe_token'
        },
        body: JSON.stringify({
          amount: 2000, // $20.00 in cents
          currency: 'usd',
          description: 'Order #123',
          enable_apple_pay: true
        })
      });

      const { client_secret } = await response.json();

      // Create Apple Pay session
      const { error, paymentIntent } = await stripe.confirmApplePayPayment(client_secret, {
        items: [{
          label: 'Order #123',
          amount: '20.00',
          type: 'final'
        }],
        requiredBillingContactFields: ['emailAddress'],
        requiredShippingContactFields: [],
        shippingMethods: []
      });

      if (error) {
        setError(error.message);
      } else if (paymentIntent.status === 'succeeded') {
        setSucceeded(true);
      }
    } catch (err) {
      setError('An unexpected error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCardPayment = async (event) => {
    event.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Create payment intent (without Apple Pay for card payments)
      const response = await fetch('/stripe/payment-intents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-ORG-ID': 'your_org_id',
          'X-Stripe-Authorization': 'Bearer your_stripe_token'
        },
        body: JSON.stringify({
          amount: 2000,
          currency: 'usd',
          description: 'Order #123'
        })
      });

      const { client_secret } = await response.json();

      // Confirm card payment
      const { error, paymentIntent } = await stripe.confirmCardPayment(client_secret, {
        payment_method: {
          card: elements.getElement(CardElement)
        }
      });

      if (error) {
        setError(error.message);
      } else if (paymentIntent.status === 'succeeded') {
        setSucceeded(true);
      }
    } catch (err) {
      setError('An unexpected error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  if (succeeded) {
    return <div>Payment succeeded!</div>;
  }

  return (
    <div>
      {/* Apple Pay Button */}
      <div id="apple-pay-button" style={{ display: applePayAvailable ? 'block' : 'none' }}>
        {/* Apple Pay button will be inserted here */}
      </div>

      {/* Divider */}
      {applePayAvailable && (
        <div style={{ textAlign: 'center', margin: '20px 0' }}>
          <span style={{ background: 'white', padding: '0 10px' }}>or</span>
        </div>
      )}

      {/* Card Payment Form */}
      <form onSubmit={handleCardPayment}>
        <CardElement
          options={{
            style: {
              base: {
                fontSize: '16px',
                color: '#424770',
                '::placeholder': {
                  color: '#aab7c4',
                },
              },
            },
          }}
        />
        {error && <div style={{ color: 'red' }}>{error}</div>}
        <button disabled={!stripe || isLoading}>
          {isLoading ? 'Processing...' : 'Pay $20.00'}
        </button>
      </form>
    </div>
  );
}

function App() {
  return (
    <Elements stripe={stripePromise}>
      <CheckoutForm />
    </Elements>
  );
}

export default App;
```

### 5. Vanilla JavaScript Implementation

```javascript
// Check Apple Pay availability
async function checkApplePayAvailability() {
  try {
    const response = await fetch(`/stripe/apple-pay/availability?domain=${window.location.hostname}`, {
      headers: {
        'X-ORG-ID': 'your_org_id',
        'X-Stripe-Authorization': 'Bearer your_stripe_token'
      }
    });

    const data = await response.json();
    return data.available;
  } catch (err) {
    console.error('Error checking Apple Pay availability:', err);
    return false;
  }
}

// Initialize Apple Pay
async function initializeApplePay() {
  const stripe = await loadStripe('pk_test_...');
  const isAvailable = await checkApplePayAvailability();

  if (isAvailable) {
    const applePayButton = stripe.applePayButton({
      type: 'pay',
      style: 'black',
      locale: 'en',
      onClick: handleApplePayPayment
    });

    document.getElementById('apple-pay-button').appendChild(applePayButton);
    document.getElementById('apple-pay-button').style.display = 'block';
  }
}

// Handle Apple Pay payment
async function handleApplePayPayment() {
  const stripe = await loadStripe('pk_test_...');

  try {
    // Create payment intent
    const response = await fetch('/stripe/payment-intents', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-ORG-ID': 'your_org_id',
        'X-Stripe-Authorization': 'Bearer your_stripe_token'
      },
      body: JSON.stringify({
        amount: 2000,
        currency: 'usd',
        description: 'Order #123',
        enable_apple_pay: true
      })
    });

    const { client_secret } = await response.json();

    // Confirm Apple Pay payment
    const { error, paymentIntent } = await stripe.confirmApplePayPayment(client_secret, {
      items: [{
        label: 'Order #123',
        amount: '20.00',
        type: 'final'
      }],
      requiredBillingContactFields: ['emailAddress'],
      requiredShippingContactFields: [],
      shippingMethods: []
    });

    if (error) {
      console.error('Apple Pay error:', error);
    } else if (paymentIntent.status === 'succeeded') {
      console.log('Apple Pay payment succeeded!');
      // Handle success
    }
  } catch (err) {
    console.error('Apple Pay payment failed:', err);
  }
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', initializeApplePay);
```

## Testing Apple Pay

### 1. Test Environment Setup
- Use Stripe test mode (`pk_test_...`)
- Test on Safari browser (Apple Pay only works in Safari)
- Use a Mac with Touch ID or iPhone/iPad with Face ID/Touch ID

### 2. Test Cards
Apple Pay uses the same test cards as regular Stripe:
- **Successful payment:** `4242424242424242`
- **Declined payment:** `4000000000000002`
- **3D Secure required:** `4000002500003155`

### 3. Testing Flow
1. Open your app in Safari
2. Click the Apple Pay button
3. Authenticate with Touch ID/Face ID
4. Verify payment appears in Stripe Dashboard
5. Check webhook events are received

## Production Deployment

### 1. Switch to Live Mode
- Update to live API keys (`pk_live_...`)
- Ensure domain is registered in live Stripe account
- Test with real Apple Pay cards

### 2. Monitor Performance
- Track conversion rates with/without Apple Pay
- Monitor Apple Pay specific errors
- Set up alerts for failed Apple Pay transactions

## Troubleshooting

### Common Issues

1. **Apple Pay button not showing**
   - Check domain is registered in Stripe
   - Verify you're using Safari browser
   - Ensure device supports Apple Pay

2. **"Apple Pay is not available"**
   - Check Merchant ID is configured correctly
   - Verify Apple Pay certificate is uploaded
   - Ensure domain verification file is accessible

3. **Payment fails with Apple Pay**
   - Check Stripe logs for specific errors
   - Verify payment intent includes Apple Pay
   - Test with different test cards

### Debug Mode

Enable detailed logging:
```javascript
// Add to your Stripe initialization
const stripe = await loadStripe('pk_test_...', {
  apiVersion: '2023-10-16'
});
```

## Benefits Summary

✅ **Higher Conversion Rates** - Up to 250% improvement
✅ **Better Mobile Experience** - Native iOS integration
✅ **Enhanced Security** - Biometric authentication
✅ **Reduced Friction** - One-tap payments
✅ **Professional UX** - Modern payment experience

## Next Steps

1. **Set up Apple Developer account** and create Merchant ID
2. **Generate and upload Apple Pay certificate** to Stripe
3. **Register your domain** for Apple Pay
4. **Implement frontend Apple Pay button** using the examples above
5. **Test thoroughly** in Safari with test cards
6. **Deploy to production** and monitor performance

The backend integration is already complete - you just need to set up the Apple Developer configuration and implement the frontend Apple Pay button!
