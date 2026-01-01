# Secure Gateway Integration Guide

## Overview

The Secure Gateway provides encrypted communication between frontend and backend, hiding endpoint names and payload data from DevTools.

## How It Works

1. **Encrypted Payload**: All data is encrypted using AES-256-GCM
2. **UUID Aliases**: Endpoints use UUID aliases instead of real names
3. **Silent Failures**: Invalid requests are ignored with warnings

## Available Endpoints

| UUID Alias | Name | Description |
|------------|------|-------------|
| [`a1b2c3d4-e5f6-7890-abcd-ef1234567890`](#update-user-role) | Update User Role | Update user role (non-admin roles only) |

---

## Endpoint Details

### Update User Role
**UUID Alias**: `a1b2c3d4-e5f6-7890-abcd-ef1234567890`

Updates a user's role within the organization. Cannot assign roles containing "ADMIN".

#### Request Format
```javascript
POST /secure-gateway/a1b2c3d4-e5f6-7890-abcd-ef1234567890
Headers:
  Content-Type: application/json
  X-ORG-ID: your-org-id
  Authorization: Bearer your-token

Body:
{
  "payload": "base64-encoded-encrypted-data"
}
```

#### Payload Structure
```javascript
{
  "data": {
    "userId": "string",    // Required: User ID to update
    "role": "string"       // Required: New role (cannot contain "ADMIN")
  },
  "timestamp": 1234567890  // Auto-generated
}
```

#### Response Format
```javascript
// Success
{
  "status": "ok"
}

// Error
{
  "status": "error"
}
```

#### Example Usage
```javascript
// Basic usage
const result = await secureGateway.makeRequest(
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  {
    userId: 'user_123',
    role: 'MODERATOR'
  }
);

if (result.status === 'ok') {
  console.log('✅ Role updated successfully');
} else {
  console.log('❌ Failed to update role');
}
```

#### React Hook Example
```javascript
import { useState } from 'react';

const useRoleUpdate = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const updateRole = async (userId, role) => {
    setLoading(true);
    setError(null);
    
    try {
      const result = await secureGateway.makeRequest(
        'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        { userId, role }
      );
      
      if (result.status === 'ok') {
        setLoading(false);
        return { success: true };
      } else {
        setError('Failed to update role');
        setLoading(false);
        return { success: false };
      }
    } catch (err) {
      setError('Network error');
      setLoading(false);
      return { success: false };
    }
  };

  return { updateRole, loading, error };
};

// Usage in component
const { updateRole, loading, error } = useRoleUpdate();

const handleRoleChange = async (userId, newRole) => {
  const result = await updateRole(userId, newRole);
  if (result.success) {
    toast.success('Role updated successfully');
  } else {
    toast.error('Failed to update role');
  }
};
```

#### Vue.js Composable Example
```javascript
import { ref } from 'vue';

export const useRoleUpdate = () => {
  const loading = ref(false);
  const error = ref(null);

  const updateRole = async (userId, role) => {
    loading.value = true;
    error.value = null;
    
    try {
      const result = await secureGateway.makeRequest(
        'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        { userId, role }
      );
      
      loading.value = false;
      return result.status === 'ok';
    } catch (err) {
      error.value = 'Network error';
      loading.value = false;
      return false;
    }
  };

  return { updateRole, loading, error };
};
```

#### Error Handling
```javascript
const handleRoleUpdate = async (userId, role) => {
  // Validate input
  if (!userId || !role) {
    showError('Invalid input');
    return;
  }

  // Check for admin role
  if (role.toUpperCase().includes('ADMIN')) {
    showError('Cannot assign admin roles');
    return;
  }

  // Make request
  const success = await updateUserRole(userId, role);
  
  if (success) {
    updateUserInList(userId, { role });
    showSuccess('Role updated successfully');
  } else {
    showError('Failed to update role. Please try again.');
  }
};
```

---

## Frontend Implementation

### Encryption Utility

```javascript
// secureGateway.js
import crypto from 'crypto';

class SecureGateway {
  constructor(encryptionKey) {
    this.key = Buffer.from(encryptionKey, 'hex');
  }

  encrypt(payload) {
    try {
      // Generate random IV
      const iv = crypto.randomBytes(16);
      
      // Create cipher
      const cipher = crypto.createCipherGCM('aes-256-gcm', this.key);
      cipher.setAAD(Buffer.from('secure-gateway', 'utf8'));
      
      // Encrypt payload
      let encrypted = cipher.update(JSON.stringify(payload), 'utf8');
      encrypted = Buffer.concat([encrypted, cipher.final()]);
      
      // Get auth tag
      const authTag = cipher.getAuthTag();
      
      // Combine IV + authTag + encrypted data
      const combined = Buffer.concat([iv, authTag, encrypted]);
      
      // Return base64 encoded
      return combined.toString('base64');
    } catch (error) {
      console.error('Encryption failed:', error);
      throw new Error('Failed to encrypt payload');
    }
  }

  async makeRequest(endpointAlias, data) {
    const payload = {
      data,
      timestamp: Date.now()
    };

    const encryptedPayload = this.encrypt(payload);

    const response = await fetch(`/secure-gateway/${endpointAlias}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-ORG-ID': getOrgId(),
        'Authorization': `Bearer ${getToken()}`
      },
      body: JSON.stringify({
        payload: encryptedPayload
      })
    });

    return response.json();
  }
}

// Initialize with encryption key from environment
const secureGateway = new SecureGateway(process.env.NEXT_PUBLIC_SECURE_GATEWAY_KEY);
```

## Environment Variables

### Backend (.env)
```bash
# 64-character hex key for AES-256 encryption
# ⚠️ CRITICAL: Generate a unique key for each environment
# ⚠️ NEVER commit this key to version control
SECURE_GATEWAY_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
```

### Frontend
```javascript
// ⚠️ SECURITY WARNING: 
// NEVER hardcode encryption keys in frontend code!
// Keys should be injected at build time or runtime from secure sources

// ❌ WRONG - Never do this:
// const ENCRYPTION_KEY = 'hardcoded-key-here';

// ✅ CORRECT - Use environment variables or secure injection:
const ENCRYPTION_KEY = process.env.NEXT_PUBLIC_SECURE_GATEWAY_KEY;

// ✅ OR inject at build time:
const ENCRYPTION_KEY = process.env.REACT_APP_SECURE_GATEWAY_KEY;

// ✅ OR fetch from secure endpoint at runtime:
const ENCRYPTION_KEY = await fetchSecureKey();
```

## Security Features

1. **AES-256-GCM Encryption**: Military-grade encryption
2. **Authentication Tag**: Prevents tampering
3. **Random IV**: Each request uses unique initialization vector
4. **Additional Authenticated Data**: Extra security layer
5. **UUID Aliases**: Endpoint names are hidden
6. **Silent Failures**: Invalid requests are ignored

## Error Handling

All errors return the same simple response: `{ "status": "error" }`

- **Invalid Payload**: Returns 400 with `{ "status": "error" }`
- **Decryption Failed**: Logs warning, returns 400 with `{ "status": "error" }`
- **Unknown Endpoint**: Returns 404 with `{ "status": "error" }`
- **Admin Role Attempt**: Returns 400 with `{ "status": "error" }`
- **User Not Found**: Returns 404 with `{ "status": "error" }`
- **Server Error**: Returns 500 with `{ "status": "error" }`

**Note**: Detailed error information is logged on the server for debugging purposes.

## Benefits

1. **Hidden Endpoints**: UUID aliases hide real endpoint names
2. **Encrypted Data**: Payload is completely encrypted
3. **Tamper Proof**: Authentication tags prevent modification
4. **Silent Failures**: Invalid requests don't reveal information
5. **Simple Responses**: Only `ok` or `error` - no sensitive data leaked
6. **Future Proof**: Easy to add new endpoints with new UUIDs

## Development Tips

1. **Generate UUIDs**: Use online UUID generators for new endpoints
2. **Test Encryption**: Always test encryption/decryption before deployment
3. **Monitor Logs**: Check server logs for decryption warnings
4. **Key Management**: Store encryption keys securely
5. **Error Handling**: Handle all possible error cases gracefully
6. **User Feedback**: Always provide clear feedback to users
7. **Loading States**: Show loading indicators during requests

## Security Best Practices

### ⚠️ CRITICAL SECURITY RULES:

1. **NEVER hardcode keys in frontend code**
2. **Use environment variables only**
3. **Generate unique keys for each environment**
4. **Never commit keys to version control**
5. **Use secure key injection methods**

### Key Generation:
```bash
# Generate a secure 64-character hex key
openssl rand -hex 32
```

### Environment Setup:
```bash
# .env.local (Next.js)
NEXT_PUBLIC_SECURE_GATEWAY_KEY=your-generated-64-char-hex-key

# .env (React)
REACT_APP_SECURE_GATEWAY_KEY=your-generated-64-char-hex-key
```

### Production Deployment:
- Use secure environment variable injection
- Consider using secret management services
- Rotate keys regularly
- Monitor for key exposure