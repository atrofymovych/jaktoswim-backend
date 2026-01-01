## AWS S3 Integration - Technical Guide

This document explains the design and implementation of the AWS S3 integration used by the API. It covers endpoints, security, bucket lifecycle, CORS, and the fallback strategy for modern buckets with ACLs disabled.


### Endpoints (mounted at `/aws-s3`)

- POST `/generate-upload-url`
  - Body: `{ fileName: string, fileType: string }`
  - Headers: `X-ORG-ID`
  - Requires authentication (`req.auth()?.userId`)
  - Returns: `{ uploadUrl: string, objectKey: string }`
  - Notes:
    - Generates a presigned PUT URL using `@aws-sdk/s3-request-presigner`.
    - Object keys are normalized: `${orgId}/${userId}/${randomHex}-${encodeURIComponent(fileName)}`.

- POST `/get-private-url`
  - Body: `{ objectKey: string }`
  - Headers: `X-ORG-ID`
  - Returns: `{ secureUrl: string }` (presigned GET URL)

- DELETE `/objects`
  - Body: `{ objectKey: string }`
  - Headers: `X-ORG-ID`
  - Returns: `{ status: 'deleted', objectKey }`

- POST `/objects/make-public`
  - Body: `{ objectKey: string }`
  - Headers: `X-ORG-ID`
  - Returns: `{ status: 'made_public', objectKey, publicUrl }`
  - Behavior: Tries object ACL first; if ACLs are disabled, falls back to a per-object bucket policy statement that grants `s3:GetObject` to `Principal: "*"`.

- POST `/objects/make-private`
  - Body: `{ objectKey: string }`
  - Headers: `X-ORG-ID`
  - Returns: `{ status: 'made_private', objectKey }`
  - Behavior: Tries object ACL first; if ACLs are disabled, removes the per-object policy statement.

### Environment variables per organisation

For an `orgId`, the bucket name is derived by stripping underscores and lowercasing: `${orgId.replace('_','').toLowerCase()}`.

- `${ORG_ID}_AWS_S3_API_KEY`
- `${ORG_ID}_AWS_S3_API_SECRET`
- `${ORG_ID}_AWS_S3_REGION`

Example: `org_ABC123_AWS_S3_API_KEY`.

### S3 client initialization (create-or-use bucket)

On every request, the integration creates an `S3Client` with the org-scoped credentials and performs:

1. HeadBucket: If the bucket exists → proceed. If not → create.
2. For new buckets, configure as a "Super Bucket" (see below).
3. For existing buckets, retroactively ensure CORS and permissive Public Access Block settings are in place.

### "Super Bucket" configuration (new buckets)

When a bucket is created, we immediately apply the following settings:

- PublicAccessBlockConfiguration
  - `BlockPublicAcls: false`
  - `IgnorePublicAcls: false`
  - `BlockPublicPolicy: false`
  - `RestrictPublicBuckets: false`
  - Rationale: Allow object-level public access (either via ACLs or bucket policies). The bucket itself remains private by default; we only expose specific objects when requested.

- Bucket ACL
  - We attempt to set `ACL: 'private'`. If the bucket has ACLs disabled (common in newer S3 defaults), we swallow `AccessControlListNotSupported` and rely solely on bucket policies.

- CORS
  - We set a permissive but explicit CORS policy:
    - AllowedMethods: `GET, PUT, POST, DELETE, HEAD` (S3 handles `OPTIONS` preflights implicitly)
    - AllowedOrigins: `http://localhost:3000`, domain list for the app, and a wildcard subdomain pattern `https://*.crm-system.art`
    - AllowedHeaders: `*`
    - ExposeHeaders: `ETag, Content-Length, Content-Type`
    - MaxAgeSeconds: `86400` (24h)

### Retroactive CORS and Public Access Block (existing buckets)

For already-existing buckets, each operation run ensures:

- CORS is read via `GetBucketCors`. If absent or mismatched, we apply the required config with `PutBucketCors`.
- Public Access Block is (re)applied with permissive flags, so that public reads via policy/ACL can work. This is idempotent.

### Public/Private object strategy

Modern S3 environments may have ACLs disabled. We support both worlds:

1) Preferred path (supported buckets):
   - Make public: `PutObjectAcl` with `ACL: 'public-read'`.
   - Make private: `PutObjectAcl` with `ACL: 'private'`.

2) Fallback path (ACLs disabled):
   - Make public: update the bucket policy to add a statement:
     - `Sid: PublicAccess-<sanitized-key>`
     - `Effect: Allow`
     - `Principal: "*"`
     - `Action: "s3:GetObject"`
     - `Resource: arn:aws:s3:::<bucket>/<objectKey>`
   - Make private: remove that per-object statement.

Notes:
- Bucket policy changes may take a few seconds to propagate. If a freshly public URL returns `AccessDenied`, retry after ~10–30 seconds.
- Public URLs returned to clients include a URL-encoded object key to avoid issues with special characters or unicode.

### URL formats

- Upload URL (presigned PUT): returned by `/generate-upload-url`.
- Public URL (non-signed GET): `https://<bucket>.s3.<region>.amazonaws.com/<urlencoded objectKey>`
- Private URL (presigned GET): returned by `/get-private-url`.

### Security considerations

- Each org uses its own AWS credentials and bucket namespace, isolating data.
- Buckets are private by default. Only explicit actions make an object public (either via ACL or policy).
- CORS is limited to allowed frontend origins.
- Filenames are URL-encoded in S3 keys to prevent path/encoding edge-cases.

### Troubleshooting

- 403 on upload (browser):
  - Check that CORS exists and includes your origin and `PUT` method (the integration auto-fixes this).

- 403 on public URL immediately after make-public:
  - Wait 10–30 seconds for policy propagation if the bucket uses policy fallback.
  - Confirm the returned URL contains an encoded key. If you pasted the non-encoded key manually, encode path segments.

- `AccessControlListNotSupported` errors:
  - Expected on newer buckets. The integration will switch to bucket policy fallback. No action needed.

### Operational notes

- Logging is intentionally minimal; errors and warnings are always logged. Debug logs have been removed from the S3 router for signal.
- The integration is stateless; each request validates/fixes bucket config as needed (CORS and public access block), which keeps operations robust across environments.

### Example curl

Generate upload URL:
```bash
curl -X POST "$API_BASE/aws-s3/generate-upload-url" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -H "X-ORG-ID: <org_id>" \
  -d '{"fileName":"logo.png","fileType":"image/png"}'
```

Make object public:
```bash
curl -X POST "$API_BASE/aws-s3/objects/make-public" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -H "X-ORG-ID: <org_id>" \
  -d '{"objectKey":"<org>/<user>/<random>-logo.png"}'
```

Get private URL (signed GET):
```bash
curl -X POST "$API_BASE/aws-s3/get-private-url" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -H "X-ORG-ID: <org_id>" \
  -d '{"objectKey":"<org>/<user>/<random>-logo.png"}'
```


