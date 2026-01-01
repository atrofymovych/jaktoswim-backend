# Test Suite Documentation

## Unit Tests

Unit tests use in-memory MongoDB and mocked dependencies. They run quickly and don't require external services.

### Running Unit Tests

```bash
# Run all unit tests
npm test

# Run specific test file
npm test -- tests/proxy.test.js

# Run with coverage
npm test -- --coverage
```

## Integration Tests

Integration tests make real HTTP requests to the API server. Configuration is hardcoded in the test file.

### Proxy Integration Tests

The `proxy.integration.test.js` file contains integration tests for proxy endpoints.

#### Prerequisites

1. Access to the API server (default: `https://dev-dao-api.crm-system.art`)
2. Valid organization ID
3. Valid authentication token (Bearer token)
4. ProxyConfig must be set up for the test type (or use existing public types)

#### Configuration

**Configuration is hardcoded in the test file.** Edit `tests/proxy.integration.test.js` and update these values:

```javascript
const API_BASE_URL = 'https://dev-dao-api.crm-system.art';
const TEST_ORG_ID = 'org_xxxxxxxxxxxxx'; // Update with your org ID
const TEST_AUTH_TOKEN = 'your_bearer_token_here'; // Update with your auth token
const TEST_SOURCE = 'integration-test';
```

#### Running Integration Tests

```bash
# Run integration tests
npm run test:proxy:integration

# Or directly
npm test -- tests/proxy.integration.test.js
```

#### What Integration Tests Cover

- ✅ POST /proxy/:type - Create objects
- ✅ GET /proxy/:type - List objects with pagination
- ✅ GET /proxy/:type/:id - Get object by ID
- ✅ PUT /proxy/:type/:id - Update objects
- ✅ DELETE /proxy/:type/:id - Soft delete objects
- ✅ Query parameters (limit, skip, dataFilter)
- ✅ Public vs private access
- ✅ Error handling (404, 400, 403)
- ✅ Batch operations with pagination

#### Test Cleanup

Integration tests automatically clean up created objects after all tests complete. If tests are interrupted, you may need to manually clean up test objects.

#### Skipping Tests

If `TEST_ORG_ID` or `TEST_AUTH_TOKEN` are not set (or token is still the default placeholder), integration tests will be skipped automatically with a warning message.

## Test Structure

```
tests/
├── proxy.test.js              # Unit tests for proxy endpoints
├── proxy.integration.test.js  # Integration tests for proxy endpoints
├── dao.test.js                # Unit tests for DAO operations
├── middleware.test.js         # Unit tests for middleware
└── ...
```

## Best Practices

1. **Unit Tests**: Fast, isolated, use mocks
2. **Integration Tests**: Test real API behavior, require external services
3. **Contract Tests**: Verify API contracts and breaking changes
4. **Security Tests**: Test authentication, authorization, input validation

## Troubleshooting

### Integration Tests Fail

1. Check that configuration values in the test file are set correctly
2. Verify API server is accessible
3. Ensure authentication token is valid (not the placeholder value)
4. Check that ProxyConfig exists for test types
5. Verify network connectivity

### Tests Timeout

- Increase timeout in test file (default: 30000ms)
- Check API server response times
- Verify network latency

### Cleanup Issues

- Manually delete test objects if cleanup fails
- Use unique test type names to avoid conflicts
- Check database for orphaned test objects

