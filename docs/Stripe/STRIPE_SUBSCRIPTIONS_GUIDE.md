# Stripe Subscriptions Integration Guide

## Overview

This guide explains how to implement and manage Stripe subscriptions in your CRM-as-a-Service platform. The integration provides comprehensive subscription management including products, prices, customers, and recurring billing.

## How Stripe Subscriptions Work

### Core Concepts

1. **Products** - What you're selling (e.g., "Premium Plan", "Basic Plan")
2. **Prices** - How much and how often (e.g., $29/month, $299/year)
3. **Customers** - Who is subscribing
4. **Subscriptions** - The active subscription relationship
5. **Subscription Items** - Individual products within a subscription

### Subscription Lifecycle

```
Create Product → Create Price → Create Customer → Create Subscription → Manage Subscription
```

### Key Features

- **Recurring Billing** - Automatic monthly/yearly charges
- **Proration** - Automatic adjustments when changing plans
- **Trial Periods** - Free trials before billing starts
- **Coupons & Discounts** - Percentage or fixed amount discounts
- **Usage-based Billing** - Metered billing for usage
- **Multiple Plans** - Customers can have multiple subscriptions

## Backend API Endpoints

### Products Management

#### Create Product
```http
POST /stripe/subscriptions/products
Headers:
  X-ORG-ID: your_org_id
  X-Stripe-Authorization: Bearer your_stripe_token
  Content-Type: application/json

Body:
{
  "name": "Premium Plan",
  "description": "Full access to all features",
  "metadata": {
    "category": "premium",
    "features": "unlimited"
  },
  "images": ["https://example.com/image.jpg"],
  "url": "https://yourapp.com/premium",
  "active": true
}
```

#### Get All Products
```http
GET /stripe/subscriptions/products?active=true&limit=10
Headers:
  X-ORG-ID: your_org_id
  X-Stripe-Authorization: Bearer your_stripe_token
```

### Prices Management

#### Create Price
```http
POST /stripe/subscriptions/prices
Headers:
  X-ORG-ID: your_org_id
  X-Stripe-Authorization: Bearer your_stripe_token
  Content-Type: application/json

Body:
{
  "product_id": "prod_1234567890",
  "unit_amount": 29.99,
  "currency": "usd",
  "recurring": {
    "interval": "month",
    "interval_count": 1
  },
  "metadata": {
    "plan_type": "monthly"
  },
  "nickname": "Monthly Premium",
  "active": true
}
```

#### Get Prices for Product
```http
GET /stripe/subscriptions/products/{product_id}/prices?active=true&limit=10
Headers:
  X-ORG-ID: your_org_id
  X-Stripe-Authorization: Bearer your_stripe_token
```

### Customer Management

#### Create Customer
```http
POST /stripe/subscriptions/customers
Headers:
  X-ORG-ID: your_org_id
  X-Stripe-Authorization: Bearer your_stripe_token
  Content-Type: application/json

Body:
{
  "email": "customer@example.com",
  "name": "John Doe",
  "phone": "+1234567890",
  "description": "Premium customer",
  "metadata": {
    "source": "website",
    "campaign": "summer2024"
  },
  "address": {
    "line1": "123 Main St",
    "city": "New York",
    "state": "NY",
    "postal_code": "10001",
    "country": "US"
  }
}
```

### Subscription Management

#### Create Subscription
```http
POST /stripe/subscriptions
Headers:
  X-ORG-ID: your_org_id
  X-Stripe-Authorization: Bearer your_stripe_token
  Content-Type: application/json

Body:
{
  "customer_id": "cus_1234567890",
  "items": [
    {
      "price_id": "price_1234567890",
      "quantity": 1
    }
  ],
  "default_payment_method": "pm_1234567890",
  "trial_period_days": 14,
  "coupon": "WELCOME20",
  "metadata": {
    "plan": "premium",
    "source": "website"
  },
  "collection_method": "charge_automatically",
  "proration_behavior": "create_prorations"
}
```

#### Get Subscription Details
```http
GET /stripe/subscriptions/{subscription_id}
Headers:
  X-ORG-ID: your_org_id
  X-Stripe-Authorization: Bearer your_stripe_token
```

#### Update Subscription
```http
PUT /stripe/subscriptions/{subscription_id}
Headers:
  X-ORG-ID: your_org_id
  X-Stripe-Authorization: Bearer your_stripe_token
  Content-Type: application/json

Body:
{
  "items": [
    {
      "id": "si_1234567890",
      "price_id": "price_new_plan",
      "quantity": 1
    }
  ],
  "proration_behavior": "create_prorations",
  "cancel_at_period_end": false
}
```

#### Cancel Subscription
```http
DELETE /stripe/subscriptions/{subscription_id}?cancel_at_period_end=true&prorate=false
Headers:
  X-ORG-ID: your_org_id
  X-Stripe-Authorization: Bearer your_stripe_token
```

#### Get Customer's Subscriptions
```http
GET /stripe/subscriptions/customer/{customer_id}?status=all&limit=10
Headers:
  X-ORG-ID: your_org_id
  X-Stripe-Authorization: Bearer your_stripe_token
```

## Frontend Implementation

### Step 1: Install Required Packages

```bash
npm install @stripe/stripe-js @stripe/react-stripe-js
```

### Step 2: Subscription Setup Component

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

function SubscriptionSetup() {
  const stripe = useStripe();
  const elements = useElements();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [products, setProducts] = useState([]);
  const [selectedPlan, setSelectedPlan] = useState(null);

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      const response = await fetch('/stripe/subscriptions/products', {
        headers: {
          'X-ORG-ID': 'your_org_id',
          'X-Stripe-Authorization': 'Bearer your_stripe_token'
        }
      });
      const data = await response.json();
      setProducts(data.data);
    } catch (err) {
      console.error('Failed to fetch products:', err);
    }
  };

  const handleSubscribe = async (event) => {
    event.preventDefault();

    if (!stripe || !elements || !selectedPlan) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // 1. Create customer
      const customerResponse = await fetch('/stripe/subscriptions/customers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-ORG-ID': 'your_org_id',
          'X-Stripe-Authorization': 'Bearer your_stripe_token'
        },
        body: JSON.stringify({
          email: 'customer@example.com',
          name: 'John Doe'
        })
      });
      const customer = await customerResponse.json();

      // 2. Create payment method
      const { error: pmError, paymentMethod } = await stripe.createPaymentMethod({
        type: 'card',
        card: elements.getElement(CardElement),
        billing_details: {
          name: 'John Doe',
          email: 'customer@example.com'
        }
      });

      if (pmError) {
        setError(pmError.message);
        return;
      }

      // 3. Create subscription
      const subscriptionResponse = await fetch('/stripe/subscriptions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-ORG-ID': 'your_org_id',
          'X-Stripe-Authorization': 'Bearer your_stripe_token'
        },
        body: JSON.stringify({
          customer_id: customer.id,
          items: [
            {
              price_id: selectedPlan.price_id,
              quantity: 1
            }
          ],
          default_payment_method: paymentMethod.id,
          trial_period_days: 14
        })
      });

      const subscription = await subscriptionResponse.json();

      if (subscription.status === 'incomplete') {
        // Handle 3D Secure authentication
        const { error: confirmError } = await stripe.confirmCardPayment(
          subscription.latest_invoice.payment_intent.client_secret
        );

        if (confirmError) {
          setError(confirmError.message);
        } else {
          // Subscription created successfully
          console.log('Subscription created:', subscription);
        }
      } else {
        // Subscription created successfully
        console.log('Subscription created:', subscription);
      }

    } catch (err) {
      setError('An unexpected error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div>
      <h2>Choose Your Plan</h2>
      
      {products.map(product => (
        <div key={product.id} className="plan-card">
          <h3>{product.name}</h3>
          <p>{product.description}</p>
          <button onClick={() => setSelectedPlan(product)}>
            Select Plan
          </button>
        </div>
      ))}

      {selectedPlan && (
        <form onSubmit={handleSubscribe}>
          <CardElement
            options={{
              style: {
                base: {
                  fontSize: '16px',
                  color: '#424770',
                },
              },
            }}
          />
          {error && <div className="error">{error}</div>}
          <button disabled={!stripe || isLoading}>
            {isLoading ? 'Processing...' : `Subscribe to ${selectedPlan.name}`}
          </button>
        </form>
      )}
    </div>
  );
}

function App() {
  return (
    <Elements stripe={stripePromise}>
      <SubscriptionSetup />
    </Elements>
  );
}

export default App;
```

### Step 3: Subscription Management Component

```javascript
import React, { useState, useEffect } from 'react';

function SubscriptionManagement() {
  const [subscriptions, setSubscriptions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSubscriptions();
  }, []);

  const fetchSubscriptions = async () => {
    try {
      const response = await fetch('/stripe/subscriptions/customer/cus_1234567890', {
        headers: {
          'X-ORG-ID': 'your_org_id',
          'X-Stripe-Authorization': 'Bearer your_stripe_token'
        }
      });
      const data = await response.json();
      setSubscriptions(data.data);
    } catch (err) {
      console.error('Failed to fetch subscriptions:', err);
    } finally {
      setLoading(false);
    }
  };

  const cancelSubscription = async (subscriptionId) => {
    try {
      const response = await fetch(`/stripe/subscriptions/${subscriptionId}`, {
        method: 'DELETE',
        headers: {
          'X-ORG-ID': 'your_org_id',
          'X-Stripe-Authorization': 'Bearer your_stripe_token'
        }
      });
      
      if (response.ok) {
        fetchSubscriptions(); // Refresh list
      }
    } catch (err) {
      console.error('Failed to cancel subscription:', err);
    }
  };

  const updateSubscription = async (subscriptionId, newPriceId) => {
    try {
      const response = await fetch(`/stripe/subscriptions/${subscriptionId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-ORG-ID': 'your_org_id',
          'X-Stripe-Authorization': 'Bearer your_stripe_token'
        },
        body: JSON.stringify({
          items: [
            {
              price_id: newPriceId,
              quantity: 1
            }
          ],
          proration_behavior: 'create_prorations'
        })
      });
      
      if (response.ok) {
        fetchSubscriptions(); // Refresh list
      }
    } catch (err) {
      console.error('Failed to update subscription:', err);
    }
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      <h2>My Subscriptions</h2>
      {subscriptions.map(subscription => (
        <div key={subscription.id} className="subscription-card">
          <h3>Subscription #{subscription.id}</h3>
          <p>Status: {subscription.status}</p>
          <p>Current Period: {new Date(subscription.current_period_start * 1000).toLocaleDateString()} - {new Date(subscription.current_period_end * 1000).toLocaleDateString()}</p>
          
          {subscription.status === 'active' && (
            <div>
              <button onClick={() => updateSubscription(subscription.id, 'new_price_id')}>
                Change Plan
              </button>
              <button onClick={() => cancelSubscription(subscription.id)}>
                Cancel Subscription
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default SubscriptionManagement;
```

## Webhook Events

The system handles the following Stripe webhook events:

### Subscription Events
- `customer.subscription.created` - New subscription created
- `customer.subscription.updated` - Subscription modified
- `customer.subscription.deleted` - Subscription canceled
- `customer.subscription.trial_will_end` - Trial ending soon

### Invoice Events
- `invoice.payment_succeeded` - Payment successful
- `invoice.payment_failed` - Payment failed

### Webhook Configuration

1. **Set up webhook endpoint in Stripe Dashboard:**
   - URL: `https://yourdomain.com/stripe/webhook`
   - Events to listen for:
     - `customer.subscription.created`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `customer.subscription.trial_will_end`
     - `invoice.payment_succeeded`
     - `invoice.payment_failed`

2. **Get webhook secret:**
   - Copy the webhook signing secret from Stripe Dashboard
   - Add it to your environment variables as `{org_id}_STRIPE_WEBHOOK_SECRET`

## Environment Variables

Add these environment variables for each organization:

```bash
# For each org (replace <org_id> with actual org ID)
<org_id>_STRIPE_PUBLIC_KEY=pk_test_...
<org_id>_STRIPE_SECRET_KEY=sk_test_...
<org_id>_STRIPE_WEBHOOK_SECRET=whsec_...
<org_id>_STRIPE_TEST_MODE=true
```

## Database Models

The system includes the following database models:

### StripeProduct
- Product information and metadata
- Organization-based isolation
- Active/inactive status

### StripePrice
- Price information for products
- Recurring billing configuration
- Currency and amount details

### StripeCustomer
- Customer information
- Billing and shipping addresses
- Organization association

### StripeSubscription
- Subscription details and status
- Billing periods and trial information
- Payment method and collection details

## Utility Functions

The system includes helper functions in `_utils/stripe/subscriptionHelpers.js`:

- `calculateProration()` - Calculate proration for plan changes
- `getSubscriptionStatusInfo()` - Get status display information
- `formatSubscriptionAmount()` - Format amounts for display
- `getNextBillingDate()` - Calculate next billing date
- `isInTrial()` - Check if subscription is in trial
- `validateSubscriptionData()` - Validate subscription data
- `generateSubscriptionSummary()` - Create subscription summary
- `getSubscriptionMetrics()` - Calculate subscription metrics

## Testing

### Test Cards (Test Mode)

- **Successful payment:** `4242424242424242`
- **Declined payment:** `4000000000000002`
- **3D Secure required:** `4000002500003155`
- **Insufficient funds:** `4000000000009995`

### Test Flow

1. Use test API keys (`pk_test_...` and `sk_test_...`)
2. Create test products and prices
3. Create test customers
4. Create test subscriptions
5. Test webhook events
6. Verify database records

## Security Best Practices

1. **Never expose secret keys** in frontend code
2. **Always verify webhook signatures** (implemented in backend)
3. **Use HTTPS** in production
4. **Validate subscription data** before processing
5. **Implement proper error handling** and user feedback
6. **Use idempotency keys** for critical operations
7. **Monitor subscription events** for anomalies

## Production Checklist

- [ ] Switch to live API keys
- [ ] Update webhook endpoint to production URL
- [ ] Test with real payment methods
- [ ] Set up monitoring and alerts
- [ ] Configure proper error handling
- [ ] Implement subscription retry logic
- [ ] Set up proper logging and analytics
- [ ] Test webhook event handling
- [ ] Configure subscription dunning management
- [ ] Set up subscription analytics and reporting

## Common Use Cases

### 1. SaaS Subscription Management
- Monthly/yearly billing cycles
- Multiple plan tiers
- Trial periods
- Plan upgrades/downgrades

### 2. E-commerce Subscriptions
- Recurring product deliveries
- Subscription boxes
- Digital content access
- Membership programs

### 3. Service Subscriptions
- Professional services
- Consulting retainers
- Maintenance contracts
- Support agreements

## Troubleshooting

### Common Issues

1. **"Invalid price"** - Check price ID exists and is active
2. **"Customer not found"** - Verify customer ID is correct
3. **"Subscription creation failed"** - Check payment method validity
4. **Webhook signature verification failed** - Verify webhook secret
5. **Proration calculation errors** - Check subscription timing

### Debug Mode

Enable debug logging by setting:
```bash
NODE_ENV=development
```

This will show detailed logs in your backend console.

## Support

For additional help:
- Check Stripe documentation: https://stripe.com/docs/subscriptions
- Review webhook logs in Stripe Dashboard
- Monitor application logs for errors
- Test with Stripe's test environment first
