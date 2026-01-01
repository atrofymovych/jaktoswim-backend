# Stripe Integration Guide

## Overview

This guide explains how to integrate Stripe payments into your frontend application using the backend API we've implemented. The integration follows Stripe's recommended patterns for secure payment processing.

## Backend API Endpoints

### 1. Get Public Key
```
GET /stripe/public-key
Headers:
  X-ORG-ID: your_org_id
  X-Stripe-Authorization: Bearer your_stripe_token
```

**Response:**
```json
{
  "public_key": "pk_test_...",
  "test_mode": true
}
```

### 2. Create Payment Intent
```
POST /stripe/payment-intents
Headers:
  X-ORG-ID: your_org_id
  X-Stripe-Authorization: Bearer your_stripe_token
  Content-Type: application/json

Body:
{
  "amount": 2000,           // Amount in cents ($20.00)
  "currency": "usd",        // Currency code
  "description": "Order #123",
  "metadata": {             // Optional custom data
    "order_id": "123",
    "customer_email": "user@example.com"
  }
}
```

**Response:**
```json
{
  "id": "pi_1234567890",
  "client_secret": "pi_1234567890_secret_...",
  "status": "requires_payment_method",
  "amount": 2000,
  "currency": "usd",
  "requires_action": false,
  "next_action": null
}
```

### 3. Confirm Payment Intent
```
POST /stripe/payment-intents/:id/confirm
Headers:
  X-ORG-ID: your_org_id
  X-Stripe-Authorization: Bearer your_stripe_token
  Content-Type: application/json

Body:
{
  "payment_method": "pm_1234567890",  // Optional
  "return_url": "https://yourapp.com/return"  // For 3DS
}
```

### 4. Get Payment History
```
GET /stripe/payments
Headers:
  X-ORG-ID: your_org_id
  X-Stripe-Authorization: Bearer your_stripe_token
```

## Frontend Implementation

### Step 1: Install Stripe.js

```bash
npm install @stripe/stripe-js
```

### Step 2: Initialize Stripe

```javascript
import { loadStripe } from '@stripe/stripe-js';

// Get public key from your backend
async function getStripePublicKey() {
  const response = await fetch('/stripe/public-key', {
    headers: {
      'X-ORG-ID': 'your_org_id',
      'X-Stripe-Authorization': 'Bearer your_stripe_token'
    }
  });
  const data = await response.json();
  return data.public_key;
}

// Initialize Stripe
const stripePublicKey = await getStripePublicKey();
const stripe = await loadStripe(stripePublicKey);
```

### Step 3: Create Payment Form

```html
<!-- Payment Form HTML -->
<form id="payment-form">
  <div id="card-element">
    <!-- Stripe Elements will create form elements here -->
  </div>

  <!-- Display form errors -->
  <div id="card-errors" role="alert"></div>

  <button id="submit-button">
    <span id="button-text">Pay $20.00</span>
    <span id="spinner" class="spinner hidden"></span>
  </button>
</form>
```

```javascript
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements,
  CardElement,
  useStripe,
  useElements
} from '@stripe/react-stripe-js';

// Payment Form Component
function PaymentForm() {
  const stripe = useStripe();
  const elements = useElements();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // 1. Create Payment Intent on your backend
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
          description: 'Order #123'
        })
      });

      const { client_secret } = await response.json();

      // 2. Confirm payment with Stripe
      const { error, paymentIntent } = await stripe.confirmCardPayment(client_secret, {
        payment_method: {
          card: elements.getElement(CardElement),
          billing_details: {
            name: 'Customer Name',
            email: 'customer@example.com'
          }
        }
      });

      if (error) {
        setError(error.message);
      } else if (paymentIntent.status === 'succeeded') {
        // Payment succeeded!
        console.log('Payment succeeded:', paymentIntent);
        // Redirect to success page or show success message
      }
    } catch (err) {
      setError('An unexpected error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
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
      {error && <div className="error">{error}</div>}
      <button disabled={!stripe || isLoading}>
        {isLoading ? 'Processing...' : 'Pay $20.00'}
      </button>
    </form>
  );
}

// Main App Component
function App() {
  const stripePromise = loadStripe('pk_test_...'); // Your publishable key

  return (
    <Elements stripe={stripePromise}>
      <PaymentForm />
    </Elements>
  );
}
```

### Step 4: Handle 3D Secure Authentication

```javascript
const handleSubmit = async (event) => {
  event.preventDefault();

  const { error, paymentIntent } = await stripe.confirmCardPayment(client_secret, {
    payment_method: {
      card: elements.getElement(CardElement)
    }
  });

  if (error) {
    // Handle error
    setError(error.message);
  } else if (paymentIntent.status === 'requires_action') {
    // Handle 3D Secure authentication
    const { error: confirmError } = await stripe.confirmCardPayment(client_secret);

    if (confirmError) {
      setError(confirmError.message);
    } else {
      // Payment succeeded after 3DS
      console.log('Payment succeeded after 3DS');
    }
  } else if (paymentIntent.status === 'succeeded') {
    // Payment succeeded immediately
    console.log('Payment succeeded');
  }
};
```

## Environment Variables Setup

Add these environment variables for each organization:

```bash
# For each org (replace <org_id> with actual org ID)
<org_id>_STRIPE_PUBLIC_KEY=pk_test_...
<org_id>_STRIPE_SECRET_KEY=sk_test_...
<org_id>_STRIPE_WEBHOOK_SECRET=whsec_...
<org_id>_STRIPE_TEST_MODE=true
```

## Webhook Configuration

1. **Set up webhook endpoint in Stripe Dashboard:**
   - URL: `https://yourdomain.com/stripe/webhook`
   - Events to listen for:
     - `payment_intent.succeeded`
     - `payment_intent.payment_failed`
     - `payment_intent.requires_action`
     - `payment_intent.canceled`

2. **Get webhook secret:**
   - Copy the webhook signing secret from Stripe Dashboard
   - Add it to your environment variables as `{org_id}_STRIPE_WEBHOOK_SECRET`

## Complete Frontend Example (React)

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

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsLoading(true);
    setError(null);

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
          description: 'Test payment'
        })
      });

      const { client_secret } = await response.json();

      // Confirm payment
      const { error, paymentIntent } = await stripe.confirmCardPayment(client_secret, {
        payment_method: {
          card: elements.getElement(CardElement)
        }
      });

      if (error) {
        setError(error.message);
      } else {
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
    <form onSubmit={handleSubmit}>
      <CardElement />
      {error && <div style={{ color: 'red' }}>{error}</div>}
      <button disabled={!stripe || isLoading}>
        {isLoading ? 'Processing...' : 'Pay $20.00'}
      </button>
    </form>
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

## Testing

### Test Cards (Test Mode)

- **Successful payment:** `4242424242424242`
- **Declined payment:** `4000000000000002`
- **3D Secure required:** `4000002500003155`
- **Insufficient funds:** `4000000000009995`

### Test Flow

1. Use test API keys (`pk_test_...` and `sk_test_...`)
2. Use test card numbers above
3. Check webhook events in Stripe Dashboard
4. Verify payment records in your database

## Security Best Practices

1. **Never expose secret keys** in frontend code
2. **Always verify webhook signatures** (implemented in backend)
3. **Use HTTPS** in production
4. **Validate amounts** on backend before creating payment intents
5. **Implement proper error handling** and user feedback
6. **Use idempotency keys** for critical operations

## Troubleshooting

### Common Issues

1. **"Invalid API key"** - Check your API keys are correct
2. **"No such payment_intent"** - Payment intent might have expired
3. **Webhook signature verification failed** - Check webhook secret
4. **CORS errors** - Ensure your domain is allowed in Stripe settings

### Debug Mode

Enable debug logging by setting:
```bash
NODE_ENV=development
```

This will show detailed logs in your backend console.

## Production Checklist

- [ ] Switch to live API keys
- [ ] Update webhook endpoint to production URL
- [ ] Test with real payment methods
- [ ] Set up monitoring and alerts
- [ ] Configure proper error handling
- [ ] Implement payment retry logic
- [ ] Set up proper logging and analytics
