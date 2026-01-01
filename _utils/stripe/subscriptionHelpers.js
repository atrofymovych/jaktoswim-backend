/**
 * Stripe Subscription Helper Functions
 * Utility functions for managing Stripe subscriptions
 */

/**
 * Calculate proration amount for subscription changes
 * @param {Object} subscription - Current subscription object
 * @param {Object} newPrice - New price object
 * @param {Object} oldPrice - Old price object
 * @returns {Object} Proration calculation
 */
function calculateProration(subscription, newPrice, oldPrice) {
  const now = new Date();
  const periodEnd = new Date(subscription.current_period_end * 1000);
  const daysRemaining = Math.ceil((periodEnd - now) / (1000 * 60 * 60 * 24));
  const totalDays = Math.ceil((periodEnd - new Date(subscription.current_period_start * 1000)) / (1000 * 60 * 60 * 24));
  
  const oldAmount = oldPrice.unit_amount;
  const newAmount = newPrice.unit_amount;
  
  const creditAmount = Math.round((oldAmount * daysRemaining) / totalDays);
  const chargeAmount = Math.round((newAmount * daysRemaining) / totalDays);
  
  return {
    daysRemaining,
    totalDays,
    creditAmount,
    chargeAmount,
    netAmount: chargeAmount - creditAmount,
    prorationDate: now
  };
}

/**
 * Get subscription status display information
 * @param {string} status - Stripe subscription status
 * @returns {Object} Status display information
 */
function getSubscriptionStatusInfo(status) {
  const statusMap = {
    'incomplete': {
      label: 'Incomplete',
      color: 'orange',
      description: 'Subscription setup is incomplete',
      action: 'Complete setup'
    },
    'incomplete_expired': {
      label: 'Expired',
      color: 'red',
      description: 'Subscription setup expired',
      action: 'Restart setup'
    },
    'trialing': {
      label: 'Trial',
      color: 'blue',
      description: 'Currently in trial period',
      action: 'View trial details'
    },
    'active': {
      label: 'Active',
      color: 'green',
      description: 'Subscription is active and billing',
      action: 'Manage subscription'
    },
    'past_due': {
      label: 'Past Due',
      color: 'red',
      description: 'Payment failed, retry in progress',
      action: 'Update payment method'
    },
    'canceled': {
      label: 'Canceled',
      color: 'gray',
      description: 'Subscription has been canceled',
      action: 'Reactivate'
    },
    'unpaid': {
      label: 'Unpaid',
      color: 'red',
      description: 'Payment failed, subscription suspended',
      action: 'Update payment method'
    },
    'paused': {
      label: 'Paused',
      color: 'yellow',
      description: 'Subscription is temporarily paused',
      action: 'Resume subscription'
    }
  };

  return statusMap[status] || {
    label: 'Unknown',
    color: 'gray',
    description: 'Unknown subscription status',
    action: 'Contact support'
  };
}

/**
 * Format subscription amount for display
 * @param {number} amount - Amount in cents
 * @param {string} currency - Currency code
 * @returns {string} Formatted amount
 */
function formatSubscriptionAmount(amount, currency = 'usd') {
  const currencySymbols = {
    'usd': '$',
    'eur': '€',
    'gbp': '£',
    'jpy': '¥',
    'cad': 'C$',
    'aud': 'A$'
  };

  const symbol = currencySymbols[currency.toLowerCase()] || currency.toUpperCase();
  const formattedAmount = (amount / 100).toFixed(2);
  
  return `${symbol}${formattedAmount}`;
}

/**
 * Get next billing date from subscription
 * @param {Object} subscription - Stripe subscription object
 * @returns {Date|null} Next billing date
 */
function getNextBillingDate(subscription) {
  if (subscription.status === 'canceled' || subscription.status === 'unpaid') {
    return null;
  }

  if (subscription.trial_end && new Date(subscription.trial_end * 1000) > new Date()) {
    return new Date(subscription.trial_end * 1000);
  }

  return new Date(subscription.current_period_end * 1000);
}

/**
 * Check if subscription is in trial period
 * @param {Object} subscription - Stripe subscription object
 * @returns {boolean} True if in trial
 */
function isInTrial(subscription) {
  if (!subscription.trial_end) return false;
  
  const now = new Date();
  const trialEnd = new Date(subscription.trial_end * 1000);
  
  return now < trialEnd;
}

/**
 * Get trial days remaining
 * @param {Object} subscription - Stripe subscription object
 * @returns {number} Days remaining in trial
 */
function getTrialDaysRemaining(subscription) {
  if (!isInTrial(subscription)) return 0;
  
  const now = new Date();
  const trialEnd = new Date(subscription.trial_end * 1000);
  const diffTime = trialEnd - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return Math.max(0, diffDays);
}

/**
 * Validate subscription data before creation
 * @param {Object} subscriptionData - Subscription data to validate
 * @returns {Object} Validation result
 */
function validateSubscriptionData(subscriptionData) {
  const errors = [];
  const warnings = [];

  // Required fields
  if (!subscriptionData.customer_id) {
    errors.push('Customer ID is required');
  }

  if (!subscriptionData.items || subscriptionData.items.length === 0) {
    errors.push('At least one subscription item is required');
  }

  // Validate items
  if (subscriptionData.items) {
    subscriptionData.items.forEach((item, index) => {
      if (!item.price_id) {
        errors.push(`Item ${index + 1}: Price ID is required`);
      }
      if (!item.quantity || item.quantity < 1) {
        warnings.push(`Item ${index + 1}: Quantity should be at least 1`);
      }
    });
  }

  // Validate trial period
  if (subscriptionData.trial_period_days) {
    if (subscriptionData.trial_period_days < 1 || subscriptionData.trial_period_days > 365) {
      warnings.push('Trial period should be between 1 and 365 days');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Generate subscription summary for display
 * @param {Object} subscription - Stripe subscription object
 * @returns {Object} Subscription summary
 */
function generateSubscriptionSummary(subscription) {
  const statusInfo = getSubscriptionStatusInfo(subscription.status);
  const nextBilling = getNextBillingDate(subscription);
  const inTrial = isInTrial(subscription);
  const trialDaysRemaining = getTrialDaysRemaining(subscription);

  // Calculate total amount
  let totalAmount = 0;
  let currency = 'usd';
  
  if (subscription.items && subscription.items.data) {
    subscription.items.data.forEach(item => {
      totalAmount += (item.price.unit_amount * item.quantity);
      currency = item.price.currency;
    });
  }

  return {
    id: subscription.id,
    status: subscription.status,
    statusInfo,
    totalAmount: formatSubscriptionAmount(totalAmount, currency),
    nextBillingDate: nextBilling,
    inTrial,
    trialDaysRemaining,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    items: subscription.items?.data || [],
    customer: subscription.customer,
    created: new Date(subscription.created * 1000)
  };
}

/**
 * Get subscription metrics for analytics
 * @param {Array} subscriptions - Array of subscription objects
 * @returns {Object} Subscription metrics
 */
function getSubscriptionMetrics(subscriptions) {
  const metrics = {
    total: subscriptions.length,
    active: 0,
    trialing: 0,
    canceled: 0,
    pastDue: 0,
    totalRevenue: 0,
    averageRevenue: 0,
    churnRate: 0
  };

  let totalRevenue = 0;

  subscriptions.forEach(sub => {
    // Count by status
    switch (sub.status) {
      case 'active':
        metrics.active++;
        break;
      case 'trialing':
        metrics.trialing++;
        break;
      case 'canceled':
        metrics.canceled++;
        break;
      case 'past_due':
        metrics.pastDue++;
        break;
    }

    // Calculate revenue (simplified - you might want more complex logic)
    if (sub.status === 'active' && sub.items?.data) {
      sub.items.data.forEach(item => {
        totalRevenue += (item.price.unit_amount * item.quantity);
      });
    }
  });

  metrics.totalRevenue = totalRevenue;
  metrics.averageRevenue = metrics.total > 0 ? totalRevenue / metrics.total : 0;
  metrics.churnRate = metrics.total > 0 ? (metrics.canceled / metrics.total) * 100 : 0;

  return metrics;
}

module.exports = {
  calculateProration,
  getSubscriptionStatusInfo,
  formatSubscriptionAmount,
  getNextBillingDate,
  isInTrial,
  getTrialDaysRemaining,
  validateSubscriptionData,
  generateSubscriptionSummary,
  getSubscriptionMetrics
};
