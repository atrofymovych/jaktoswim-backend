# Consent API Integration

## Overview

This documentation describes the integration of the consent management system through the Proxy API for client applications.

Two types of consents are available:
- **gdpr-consent** - GDPR consent management (public, does not require authorization)
- **privacy-policy** - privacy policy (public, does not require authorization)

Private endpoints are also available for linking anonymous consents to a user after authorization:
- **gdpr-consent-link** - linking anonymous GDPR consent to user ID (private, requires authorization)
- **privacy-policy-link** - linking anonymous policy acceptance to user ID (private, requires authorization)

## Configuration

### Consent Types

| Type | Access | Methods | Description |
|-----|--------|----------|-------------|
| `gdpr-consent` | Public | POST | Creating GDPR consent (anonymous or with userId) |
| `privacy-policy` | Public | POST | Creating a record of policy acceptance (anonymous or with userId) |
| `gdpr-consent-link` | Private | POST | Linking anonymous GDPR consent to user ID |
| `privacy-policy-link` | Private | POST | Linking anonymous policy acceptance to user ID |

### Base URLs

Different base URLs are used for different types of requests:

- **Public requests** (gdpr-consent, privacy-policy): `https://dev-dao-api.crm-system.art/public/proxy`
- **Private requests** (gdpr-consent-link, privacy-policy-link): `https://dev-dao-api.crm-system.art/proxy`

**Important:** Private requests require authorization via the `Authorization: Bearer <token>` header.

### Required Headers

All requests to the Proxy API require the following headers:

| Header | Required | Description | Example |
|--------|----------|-------------|---------|
| `X-ORG-ID` | ✅ Yes | Organization ID | `org_Drrt9YtLYHJRkM86Z17YGaUTb3LwLZW` |
| `X-SOURCE` | ✅ Yes | Request source (for tracing). Must be 6 to 200 characters | `web_app`, `mobile_app_ios`, `mobile_app_android`, `api_client` |

**Important:**
- `X-ORG-ID` must start with the `org_` prefix and contain only letters, numbers, and underscores
- `X-SOURCE` is used to track request sources and should be a unique identifier for your application
- Both headers are required for all requests (including public ones)

### Endpoints

#### Public Endpoints (do not require authorization, but require X-ORG-ID and X-SOURCE headers)

##### GDPR Consent
```
POST   /public/proxy/gdpr-consent           - Create new consent (anonymous or with userId)
```

##### Privacy Policy
```
POST   /public/proxy/privacy-policy         - Create a record of policy acceptance (anonymous or with userId)
```

#### Private Endpoints (require authorization via Bearer token and X-ORG-ID, X-SOURCE headers)

##### GDPR Consent Link
```
POST   /proxy/gdpr-consent-link              - Link anonymous GDPR consent to user ID
```

##### Privacy Policy Link
```
POST   /proxy/privacy-policy-link            - Link anonymous policy acceptance to user ID
```

## Data Models

### GDPR Consent

#### GdprConsentData

Data for creating/updating GDPR consent:

```typescript
interface GdprConsentData {
  consentGiven: boolean;        // Consent flag (true/false)
  consentScope: string;         // Consent scope (e.g., 'data_processing')
  consentTextVer: string;        // Consent text version (e.g., '1.0')
  consentMethod: string;        // Consent method (e.g., 'web_app', 'mobile_app')
  consentId?: string;           // Unique consent ID (optional, for anonymous consents)
  userId?: string;              // User ID (optional)
  timestamp?: string;            // Timestamp (optional)
  ipAddress?: string;           // IP address (optional)
}
```

#### GdprConsentResponse

API response when retrieving GDPR consent:

```typescript
interface GdprConsentResponse {
  _id: string;                  // Unique database record ID
  type: 'gdpr-consent';         // Object type
  data: GdprConsentData;        // Consent data
  metadata: {
    userId: string | null;       // User ID (null for anonymous)
    orgId: string;              // Organization ID
    source: string;             // Request source (from X-SOURCE header)
  };
  createdAt: string;            // Creation date (ISO 8601)
  updatedAt: string;            // Update date (ISO 8601)
}
```


### Privacy Policy

#### PrivacyPolicyData

Data for creating a privacy policy record:

```typescript
interface PrivacyPolicyData {
  version: string;              // Policy version (required)
  content?: string;             // Policy content (optional)
  acceptedAt?: string;          // Acceptance date (ISO 8601, optional)
  userId?: string;              // User ID (optional)
  language?: string;            // Policy language (e.g., 'ru', 'en', optional)
  consentId?: string;           // Unique ID for linking (optional, for anonymous records)
}
```

#### PrivacyPolicyResponse

API response when retrieving privacy policy:

```typescript
interface PrivacyPolicyResponse {
  _id: string;                  // Unique database record ID
  type: 'privacy-policy';       // Object type
  data: PrivacyPolicyData;      // Policy data
  metadata: {
    userId: string | null;       // User ID (null for anonymous)
    orgId: string;              // Organization ID
    source: string;             // Request source (from X-SOURCE header)
  };
  createdAt: string;            // Creation date (ISO 8601)
  updatedAt: string;            // Update date (ISO 8601)
}
```

## Request and Response Formats

### POST /public/proxy/gdpr-consent

**Request:**
```json
{
  "data": {
    "consentGiven": true,
    "consentScope": "data_processing",
    "consentTextVer": "1.0",
    "consentMethod": "web_app",
    "consentId": "consent_1234567890_abc123"
  }
}
```

**Response:**
```json
{
  "status": "object_added",
  "object": {
    "_id": "507f1f77bcf86cd799439011",
    "type": "gdpr-consent",
    "data": {
      "consentGiven": true,
      "consentScope": "data_processing",
      "consentTextVer": "1.0",
      "consentMethod": "web_app",
      "consentId": "consent_1234567890_abc123"
    },
    "metadata": {
      "userId": null,
      "orgId": "org_Drrt9YtLYHJRkM86Z17YGaUTb3LwLZW",
      "source": "web_app"
    },
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  }
}
```

**HTTP Status Code:** `200 OK`

### POST /public/proxy/privacy-policy

**Request:**
```json
{
  "data": {
    "version": "1.0",
    "acceptedAt": "2024-01-15T10:30:00.000Z",
    "language": "en",
    "consentId": "privacy_1234567890_abc123"
  }
}
```

**Response:**
```json
{
  "status": "object_added",
  "object": {
    "_id": "507f1f77bcf86cd799439012",
    "type": "privacy-policy",
    "data": {
      "version": "1.0",
      "acceptedAt": "2024-01-15T10:30:00.000Z",
      "language": "en",
      "consentId": "privacy_1234567890_abc123"
    },
    "metadata": {
      "userId": null,
      "orgId": "org_Drrt9YtLYHJRkM86Z17YGaUTb3LwLZW",
      "source": "web_app"
    },
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  }
}
```

**HTTP Status Code:** `200 OK`

## Error Handling

### Error Codes

| Code | Description | Cause |
|------|-------------|-------|
| 400 | Bad Request | Invalid request format or data, missing X-ORG-ID header, invalid X-SOURCE format |
| 403 | Forbidden | Missing required X-SOURCE header, missing authorization for private endpoints |
| 404 | Not Found | Resource not found or consent type not allowed for organization |
| 500 | Internal Server Error | Server error |

### Common Header Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `X-ORG-ID header is required` | Missing X-ORG-ID header | Ensure the header is included in every request |
| `X-SOURCE header required` | Missing X-SOURCE header | Add X-SOURCE header to every request |
| `Source is not correct. Must be from 6 to 200 symbols` | X-SOURCE is too short or too long | Use a value between 6 and 200 characters |
| `Invalid organization ID` | Invalid X-ORG-ID format | Verify that the ID starts with `org_` and contains only letters, numbers, and underscores |
| `Type is not allowed or does not exist` | Consent type not allowed for organization | Ensure that ProxyConfig configuration is created for your organization |

## Anonymous Consent Linking Logic

### General Principle

1. **Anonymous consent creation**: When creating a consent without authorization, specify a unique `consentId` in the `data.consentId` field. The `data.userId` field should be absent or `null`.

2. **Saving consentId**: Save the `consentId` locally (e.g., in localStorage, AsyncStorage, or other storage) for subsequent use.

3. **Linking after authorization**: After successful user authorization, call the corresponding endpoint `/proxy/gdpr-consent-link` or `/proxy/privacy-policy-link` with the saved `consentId`. This will create a separate object of type `gdpr-consent-link` or `privacy-policy-link` that links the anonymous consent to the user.

### Linking Data Models

#### GdprConsentLinkData

Data for creating a GDPR consent linking record:

```typescript
interface GdprConsentLinkData {
  consentId: string;            // ID of anonymous consent to be linked to user
}
```

#### GdprConsentLinkResponse

API response when creating a linking record:

```typescript
interface GdprConsentLinkResponse {
  _id: string;                  // Unique linking record ID
  type: 'gdpr-consent-link';    // Object type
  data: GdprConsentLinkData;    // Linking data
  metadata: {
    userId: string;             // User ID (from authorization token)
    orgId: string;              // Organization ID
    source: string;             // Request source (from X-SOURCE header)
  };
  createdAt: string;            // Creation date (ISO 8601)
  updatedAt: string;            // Update date (ISO 8601)
}
```

#### PrivacyPolicyLinkData

Data for creating a policy acceptance linking record:

```typescript
interface PrivacyPolicyLinkData {
  consentId: string;            // ID of anonymous policy acceptance to be linked to user
}
```

#### PrivacyPolicyLinkResponse

API response when creating a linking record:

```typescript
interface PrivacyPolicyLinkResponse {
  _id: string;                  // Unique linking record ID
  type: 'privacy-policy-link';   // Object type
  data: PrivacyPolicyLinkData;  // Linking data
  metadata: {
    userId: string;             // User ID (from authorization token)
    orgId: string;              // Organization ID
    source: string;             // Request source (from X-SOURCE header)
  };
  createdAt: string;            // Creation date (ISO 8601)
  updatedAt: string;            // Update date (ISO 8601)
}
```

### POST /proxy/gdpr-consent-link

**Request:**
```json
{
  "data": {
    "consentId": "consent_1234567890_abc123"
  }
}
```

**Response:**
```json
{
  "status": "object_added",
  "object": {
    "_id": "507f1f77bcf86cd799439020",
    "type": "gdpr-consent-link",
    "data": {
      "consentId": "consent_1234567890_abc123"
    },
    "metadata": {
      "userId": "user_1234567890",
      "orgId": "org_Drrt9YtLYHJRkM86Z17YGaUTb3LwLZW",
      "source": "web_app"
    },
    "createdAt": "2024-01-15T10:35:00.000Z",
    "updatedAt": "2024-01-15T10:35:00.000Z"
  }
}
```

**HTTP Status Code:** `200 OK`

**How it works:**
- Creates a new object of type `gdpr-consent-link` with the specified `consentId`
- `userId` is automatically extracted from the authorization token and set in `metadata.userId`
- The linking object serves to connect the anonymous consent (created earlier with this `consentId`) with the authorized user

### POST /proxy/privacy-policy-link

**Request:**
```json
{
  "data": {
    "consentId": "privacy_1234567890_abc123"
  }
}
```

**Response:**
```json
{
  "status": "object_added",
  "object": {
    "_id": "507f1f77bcf86cd799439021",
    "type": "privacy-policy-link",
    "data": {
      "consentId": "privacy_1234567890_abc123"
    },
    "metadata": {
      "userId": "user_1234567890",
      "orgId": "org_Drrt9YtLYHJRkM86Z17YGaUTb3LwLZW",
      "source": "web_app"
    },
    "createdAt": "2024-01-15T10:35:00.000Z",
    "updatedAt": "2024-01-15T10:35:00.000Z"
  }
}
```

**HTTP Status Code:** `200 OK`

**How it works:**
- Creates a new object of type `privacy-policy-link` with the specified `consentId`
- `userId` is automatically extracted from the authorization token and set in `metadata.userId`
- The linking object serves to connect the anonymous policy acceptance (created earlier with this `consentId`) with the authorized user

**Important:**
- Private linking endpoints require the `Authorization: Bearer <token>` header and mandatory `X-ORG-ID` and `X-SOURCE` headers
- `userId` is automatically extracted from the authorization token and set in `metadata.userId`
- A separate object of type `gdpr-consent-link` or `privacy-policy-link` is created that links the `consentId` with the user
- Original `gdpr-consent` and `privacy-policy` objects remain unchanged
- The API does not check for the existence of `consentId` in source objects when creating a link - it always creates a new link object

## Best Practices

1. **Required headers**: Always include `X-ORG-ID` and `X-SOURCE` in every request
2. **Caching consents**: Store consent information locally for quick access
3. **Preventing request spam**: Store flags in local storage (localStorage, AsyncStorage, etc.) indicating which consents have already been sent to the server. Check these flags before sending a request to avoid duplicate requests and spam. Example: `localStorage.setItem('gdpr_consent_sent', 'true')` after successfully sending GDPR consent
4. **Version checking**: Regularly check the relevance of privacy policy versions
5. **Offline mode handling**: Store consents locally and synchronize when network is available
6. **Logging**: Log all consent actions for audit purposes
7. **Validation**: Validate data before sending to the server
8. **Unique X-SOURCE**: Use a unique identifier for each application/platform (e.g., `web_app_1.0.0`, `mobile_app_ios_1.0.0`, `mobile_app_android_1.0.0`, `api_client_v2`)
9. **ConsentId for anonymous users**: Generate a unique `consentId` for anonymous consents (e.g., `consent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`)
10. **Linking after authorization**: Always call linking endpoints immediately after successful user authorization
11. **Linking error handling**: If linking fails, check the correctness of `consentId`, ensure the record exists, and that you are using the correct authorization token. The API always creates a new link object, even if `consentId` is not found in source objects

## FAQ (Frequently Asked Questions)

### 🧐 General Questions and Configuration

#### Q: The documentation only describes POST methods (creation and linking). Are there methods for retrieving (GET), updating (PUT/PATCH), or deleting (DELETE) existing consents?

**A:** While the Proxy API in general supports a full set of CRUD operations, **for `gdpr-consent` and `privacy-policy` types, only the POST method is available**.

Method availability depends on the `ProxyConfig.enabledMethods` configuration for your organization. For consent types (`gdpr-consent`, `privacy-policy`, `gdpr-consent-link`, `privacy-policy-link`), only the `POST` method is enabled in the configuration.

**Available operations for consents:**
- **POST** `/public/proxy/gdpr-consent` - create GDPR consent
- **POST** `/public/proxy/privacy-policy` - create privacy policy acceptance record
- **POST** `/proxy/gdpr-consent-link` - link anonymous GDPR consent to user
- **POST** `/proxy/privacy-policy-link` - link anonymous policy acceptance to user

**Important:** To check if a user has given consent, use your own client-side mechanisms (e.g., checking local flags or queries to other APIs in your system).

#### Q: It is stated that X-ORG-ID should contain "only letters, numbers, and underscores". Are uppercase letters allowed?

**A:** Yes, uppercase letters are allowed. X-ORG-ID format: `org_` + letters (uppercase and lowercase), numbers, and underscores. Example: `org_Drrt9YtLYHJRkM86Z17YGaUTb3LwLZW` - valid format.

#### Q: Is it mandatory to use the application version in X-SOURCE (as in the example `web_app_1.0.0`) or is `web_app` sufficient?

**A:** The application version in X-SOURCE is not mandatory. Minimum requirements: length from 6 to 200 characters and uniqueness of the identifier. You can use:
- `web_app` (minimum 6 characters) ✅
- `mobile_app_ios` ✅
- `web_app_1.0.0` (recommended for better tracing) ✅
- `api_client_v2` ✅

Using a version is recommended for better request source tracking, but not required.

#### Q: Only base URLs for dev-dao-api are provided. Are there other environments (test/staging or production), and what are their base URLs?

**A:** Yes, usually the following environments are available:

- **Development**: `https://dev-dao-api.crm-system.art`
- **Staging/Test**: `https://staging-dao-api.crm-system.art` (confirm with administrator)
- **Production**: `https://dao-api.crm-system.art` (confirm with administrator)

**Important:** Confirm the actual URLs for your organization with the system administrator or in your organization's documentation.

### 🔗 Questions about Linking Anonymous Consents

#### Q: What happens if I try to link a non-existent consentId? Will an error be returned (e.g., 404), or will a link object be created that points to nowhere?

**A:** The API **does not check** for the existence of `consentId` in source objects when creating a link. A new object of type `gdpr-consent-link` or `privacy-policy-link` will be created with the specified `consentId`, even if such `consentId` does not exist in the source `gdpr-consent` or `privacy-policy` objects. No error will be returned (status 200 OK).

**Recommendation:** On the client side, check for the existence of `consentId` before calling the linking endpoint to avoid creating "dangling" links.

#### Q: Can the same consentId be linked to multiple user IDs?

**A:** Yes, technically this is possible. The API does not check if `consentId` has already been linked to another user. Each call to `/proxy/gdpr-consent-link` or `/proxy/privacy-policy-link` creates a new link object with `userId` from the authorization token.

**Recommendation:** On the client side, check if `consentId` has already been used for linking to avoid duplicate links.

#### Q: Public endpoints allow optionally passing userId. If the user is already authorized, should we use a Public endpoint with userId or a Private endpoint?

**A:** If the user is authorized, you can use both approaches:

**Option 1:** Public endpoint with `userId` in `data.userId`
- Advantages: does not require authorization, can be used immediately
- Disadvantages: `userId` is passed in the request body (less secure)

**Option 2:** Private endpoint (if configured in ProxyConfig) + automatic extraction of `userId` from token
- Advantages: `userId` is automatically extracted from token, more secure
- Disadvantages: requires authorization

**Recommendation:** For authorized users, use private endpoints (if configured), as `userId` is automatically extracted from the token and not passed in the request body.

#### Q: If the user is authorized and we use a Public endpoint with userId, why do we need the linking mechanism at all?

**A:** The linking mechanism is intended for cases when:
1. Consent was created **anonymously** (without `userId`) before user authorization
2. The user authorized **after** creating the consent
3. It is necessary to link a previously created anonymous consent to an authorized user

If you create consent **after authorization**, you can immediately use a Public endpoint with `userId` or a Private endpoint (if configured) - the linking mechanism is not needed in this case.

### 🛠️ Questions about Data Models and Request Processing

#### Q: Which fields from GdprConsentData and PrivacyPolicyData are mandatory for POST requests?

**A:** The API does not perform field mandatory validation at the schema level. The only requirement: the `data` field must be an object (not null, not an array, not a primitive).

**Recommendations for mandatory fields (at business logic level):**

For `GdprConsentData`:
- `consentGiven` - recommended (consent flag)
- `consentScope` - recommended (consent scope)
- `consentTextVer` - recommended (text version)
- `consentMethod` - recommended (consent method)
- `consentId` - optional (for anonymous consents)
- `userId` - optional (if user is authorized)

For `PrivacyPolicyData`:
- `version` - recommended (policy version)
- Other fields are optional

**Important:** Field mandatory validation should be performed on the client side before sending the request.

#### Q: In PrivacyPolicyData, the content field is optional. Do we need to pass the actual policy text, or is version sufficient?

**A:** The `content` field is optional. It is sufficient to pass only `version` - the policy text itself can be stored on the server side or in a separate system. The `content` field is used if you want to save a copy of the policy text along with the acceptance record.

**Recommendation:** If the policy text is stored separately (e.g., in a CMS), it is sufficient to pass only `version`. If you need a complete history with texts, pass `content`.

#### Q: Examples show 200 OK for successful object addition. Will other HTTP statuses be used for successful operations (e.g., 201 Created)?

**A:** No, all successful operations return **200 OK**. The API does not use 201 Created. The response body has a `status` field that indicates the operation type:
- `"object_added"` - for POST (creation)
- `"object_updated"` - for PUT (update)
- `"object_deleted"` - for DELETE (deletion)

#### Q: If a 403 error (Missing authorization) occurs during linking, what will be the error text in the response body?

**A:** For a 403 (Forbidden) error due to missing authorization, the response will have the following format:

```json
{
  "error": "Forbidden: authentication required"
}
```

Or, if the X-SOURCE header is missing:

```json
{
  "error": "X-SOURCE header required"
}
```

All errors are returned in the format `{ "error": "error text" }` with the corresponding HTTP status code.

---

**© 2023 DAO.Framework. All rights protected.**