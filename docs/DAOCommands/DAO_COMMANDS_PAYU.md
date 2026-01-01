# PayU Integration - Quick Reference

## 1. REST API - Direct PayU Status Check

### Endpoint

```
GET /api/payu/orders/{orderId}
```

### Headers

```
X-ORG-ID: your-org-id
X-PayU-Authorization: your-auth-token
```

### Response

```javascript
{
  "orderId": "PAYU_ORDER_ID",
  "status": "COMPLETED",  // NEW, PENDING, COMPLETED, CANCELLED, REJECTED
  "statusDesc": "Transaction completed successfully"
}
```

### Usage - Frontend Polling

```javascript
const pollOrderStatus = async (orderId) => {
  const response = await fetch(`/api/payu/orders/${orderId}`, {
    headers: { 'X-ORG-ID': orgId, 'X-PayU-Authorization': authToken },
  });
  const data = await response.json();

  if (data.status === 'COMPLETED') {
    // ✅ Add card to system
    return { success: true };
  } else if (data.status === 'PENDING' || data.status === 'NEW') {
    // ⏳ Keep polling
    return { success: false, retry: true };
  } else {
    // ❌ Failed
    return { success: false, error: data.statusDesc };
  }
};
```

---

## 2. DAO Commands - Automated Processing

### Available Operations

#### `/payu-check-order-status`

**Input:** `{ orderId: "PAYU_ORDER_ID" }`
**Output:** PayU order status object

#### `/payu-recurring-order`

**Input:** `{ totalAmount: "100", description: "Payment", buyer: { email: "user@example.com" } }`
**Output:** PayU order result

#### `/disable`

**Input:** `(reason = 'Command disabled by self')`
**Output:** `{ success: true, commandId, disabled: true, reason, disabledAt }`
**Description:** Disables the current command and prevents future executions

### Usage - DAO Command Example

```javascript
// Check order status
const status = await dao.ops['/payu-check-order-status']({ orderId: 'PAYU_123' });

if (status.status === 'COMPLETED') {
  // ✅ Success - add card
  await dao.ops['/add-object']({
    type: 'card_connection',
    data: { orderId: status.orderId, status: 'connected' },
  });
  await dao.ops['/log']('Card connected successfully');

  // Disable this command since it's completed
  await dao.ops['/disable']('Card connection completed successfully');
} else {
  // ❌ Failed - log reason
  await dao.ops['/log'](`Failed: ${status.status} - ${status.statusDesc}`);
}
```

---

## 3. Frontend Integration

### Create DAO Command

```javascript
const command = {
  action: 'RUN_ONCE',
  command: encryptCommand(`
    const status = await dao.ops['/payu-check-order-status']({ orderId: '${orderId}' });
    if (status.status === 'COMPLETED') {
      await dao.ops['/log']('Card connected');
    } else {
      await dao.ops['/log']('Failed: ' + status.statusDesc);
    }
  `),
};
```

### Read Command Logs

```javascript
// GET /api/dao/commands/{commandId}
const response = await fetch(`/api/dao/commands/${commandId}`);
const command = await response.json();

const latestLog = command.logs[command.logs.length - 1];
if (latestLog?.includes('connected')) {
  // Success
} else if (latestLog?.includes('Failed')) {
  // Error
}
```

---

## 4. Status Values

| Status      | Meaning          | Action                   |
| ----------- | ---------------- | ------------------------ |
| `NEW`       | Order created    | Keep polling             |
| `PENDING`   | Waiting for user | Keep polling             |
| `COMPLETED` | ✅ Success       | Add card to system       |
| `CANCELLED` | User cancelled   | Show "cancelled" message |
| `REJECTED`  | Payment failed   | Show error message       |

---

## 5. Error Handling

### Common Errors

- **Insufficient funds:** Status = `REJECTED`, Message = "Please ensure your card has at least 1 PLN"
- **User cancelled:** Status = `CANCELLED`, Message = "Payment was cancelled"
- **Timeout:** No response after 5 minutes, Message = "Payment timeout"

### In DAO Commands

```javascript
try {
  const result = await dao.ops['/payu-check-order-status']({ orderId });
  // Handle result
} catch (error) {
  await dao.ops['/log'](`Error: ${error.message}`);
  throw error;
}
```

---

## 6. Guest Checkout (Public Endpoint)

Use the new public endpoint when you need to kick off a one-time PayU payment before the user has a Clerk session (e.g. marketing landing pages).

### Endpoint

```
POST /public/payu/orders/one-time
```

### Required Headers

```
X-ORG-ID: org_123
X-SOURCE: guest_checkout
Content-Type: application/json
```

### Body

```json
{
  "totalAmount": "1000",
  "description": "One-time pass",
  "continueUrl": "https://your-app/checkout/thank-you",
  "buyer": {
    "email": "guest@example.com"
  }
}
```

### Response

```json
{
  "status": "redirect_required",
  "redirectUri": "https://secure.payu.com/pay/?...token...",
  "orderId": "PAYU_ORDER_ID",
  "extOrderId": "guest-org_123-1700000000000-abcd12"
}
```

### Notes

- Collect and validate `X-SOURCE` on the server so you can trace payments.
- Limit inbound traffic with rate-limits or CAPTCHA to prevent abuse.
- Use the returned `extOrderId` to reconcile the webhook notification with the anonymous checkout.
- Continue to rely on the PayU webhook to confirm the final status of the payment.
- Poll status via `GET /public/payu/orders/{orderId}` with the same headers when you cannot wait for the webhook.

### Poll Order Status (Guest)

```
GET /public/payu/orders/{orderId}
```

Headers:

```
X-ORG-ID: org_123
X-SOURCE: guest_checkout
```

Response:

```json
{
  "orderId": "PAYU_ORDER_ID",
  "status": "PENDING",
  "statusDesc": "Waiting for user",
  "extOrderId": "guest-org_123-1700000000000-abcd12",
  "totalAmount": "1000",
  "currencyCode": "PLN",
  "updatedAt": "2024-11-08T12:00:00.000Z"
}
```

---

## Summary

1. **Use REST API** for real-time frontend polling
2. **Use DAO Commands** for automated processing and logging
3. **Only add cards when status = COMPLETED**
4. **Read logs via GET /api/dao/commands/{id}**
5. **Handle all status values appropriately**
