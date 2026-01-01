# DAO Commands API Reference

## Overview

DAO Commands provide a secure, sandboxed environment for executing JavaScript code with controlled access to database operations. Commands can be scheduled to run periodically or triggered manually.

## Command Execution Context

Commands run in a Node.js VM sandbox with access to a `dao` object containing operations and utilities.

### Available Operations

#### Data Operations

- `/add-object` - Create a new object
- `/add-object-bulk` - Create multiple objects
- `/update-object` - Update an existing object
- `/del-object` - Delete an object (soft delete)
- `/get-objects-raw` - Get objects without parsing data field
- `/get-objects-parsed` - Get objects with parsed JSON data field

#### Communication Operations

- `/payu-recurring-order` - Create PayU recurring payment order
- `/payu-check-order-status` - Check PayU order status
- `/get-resend-instance` - Get Resend email service instance
- `/send-sms` - Send SMS message
- `/send-batch-sms` - Send batch SMS messages

#### Command Control Operations

- `/disable` - Disable the current command
- `/set-next-run-at` - Set the next execution time for the current command
- `/log` - Add log entries to command execution logs

## Command Control Operations

### `/disable`

Disables the current command, preventing future executions.

**Parameters:**

- `reason` (string, optional) - Reason for disabling the command

**Example:**

```javascript
await dao.ops['/disable']('Task completed successfully');
```

**Behavior:**

- Sets command status to 'disabled'
- Clears any locks
- Logs the disable action
- Stops command execution immediately

### `/set-next-run-at`

Sets the next execution time for the current command.

**Parameters:**

- `nextRunAt` (Date|string) - Next execution time (Date object or ISO string)
- `reason` (string, optional) - Reason for setting next run time

**Example:**

```javascript
// Set next run in 1 hour
const nextRun = new Date(Date.now() + 60 * 60 * 1000);
await dao.ops['/set-next-run-at'](nextRun, 'Processing batch complete');

// Set next run to specific time
await dao.ops['/set-next-run-at']('2024-01-01T10:00:00Z', 'Scheduled maintenance');
```

**Behavior:**

- Updates `nextRunAt` field in the command
- Sets command status to 'pending'
- Enables the command if it was disabled
- Clears any locks
- Logs the next run time update
- Stops command execution immediately

**Validation:**

- `nextRunAt` parameter is required
- Must be a valid Date object or parseable date string
- Future dates are allowed

## Command Scheduling

Commands support flexible scheduling through the `nextRunAt` field:

### Scheduling Types

1. **Cron-based**: Commands with `cronExpr` automatically calculate next run time
2. **Manual scheduling**: Use `/set-next-run-at` to schedule next execution
3. **One-time**: `RUN_ONCE` commands execute once and disable themselves
4. **Immediate**: `RUN_NOW_AND_REGISTER` commands run immediately then follow cron schedule

### Command States

- `pending` - Waiting for next scheduled execution
- `running` - Currently executing
- `success` - Last execution completed successfully
- `failed` - Last execution failed
- `disabled` - Command is disabled and won't execute

## Error Handling

Commands should handle errors appropriately:

```javascript
try {
  // Command logic
  const result = await dao.ops['/get-objects-parsed']({ type: 'User' });

  if (result.length === 0) {
    // No more work to do, schedule next check in 1 hour
    await dao.ops['/set-next-run-at'](new Date(Date.now() + 3600000), 'No users to process');
  }

  // Process results...
} catch (error) {
  console.error('Command failed:', error);

  // For recoverable errors, you might want to retry later
  if (error.code === 'NETWORK_ERROR') {
    await dao.ops['/set-next-run-at'](new Date(Date.now() + 300000), 'Network error, retry in 5 minutes');
  } else {
    // For permanent failures, disable the command
    await dao.ops['/disable']('Permanent failure: ' + error.message);
  }
}
```

## Best Practices

### Scheduling

1. **Use appropriate intervals**: Don't schedule too frequently to avoid system overload
2. **Handle completion**: Set next run time when work is complete, not at fixed intervals
3. **Consider time zones**: Use UTC for all scheduling to avoid timezone issues

### Error Handling

1. **Graceful degradation**: Use `/set-next-run-at` for temporary failures
2. **Permanent failure handling**: Use `/disable` for unrecoverable errors
3. **Logging**: Use `/log` to record important events and debugging information

### Performance

1. **Batch operations**: Use bulk operations when possible
2. **Limit queries**: Always use appropriate limits and filters
3. **Avoid long-running operations**: Commands should complete within reasonable time limits

## Examples

### Periodic Task with Dynamic Scheduling

```javascript
async function processPendingOrders() {
  const orders = await dao.ops['/get-objects-parsed']({
    type: 'Order',
    filters: { status: 'pending' },
    limit: 10,
  });

  if (orders.length === 0) {
    // No work to do, check again in 1 hour
    await dao.ops['/set-next-run-at'](new Date(Date.now() + 3600000), 'No pending orders');
    return;
  }

  // Process orders...
  for (const order of orders) {
    try {
      await processOrder(order);
      await dao.ops['/log'](`Processed order ${order._id}`);
    } catch (error) {
      await dao.ops['/log'](`Failed to process order ${order._id}: ${error.message}`);
    }
  }

  // Schedule next run immediately if there might be more work
  if (orders.length === 10) {
    await dao.ops['/set-next-run-at'](new Date(), 'More orders may be pending');
  } else {
    await dao.ops['/set-next-run-at'](new Date(Date.now() + 3600000), 'Batch processing complete');
  }
}
```

### Maintenance Task

```javascript
async function cleanupOldData() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const oldRecords = await dao.ops['/get-objects-raw']({
    type: 'LogEntry',
    filters: { createdAt: { $lt: thirtyDaysAgo } },
    limit: 100,
  });

  if (oldRecords.length === 0) {
    // No old data, schedule next cleanup in 1 day
    await dao.ops['/set-next-run-at'](new Date(Date.now() + 24 * 60 * 60 * 1000), 'No old data to clean');
    return;
  }

  // Delete old records...
  for (const record of oldRecords) {
    await dao.ops['/del-object']({ id: record._id });
  }

  await dao.ops['/log'](`Cleaned up ${oldRecords.length} old records`);

  // Schedule next run in 1 hour if there might be more work
  if (oldRecords.length === 100) {
    await dao.ops['/set-next-run-at'](new Date(Date.now() + 3600000), 'More cleanup needed');
  } else {
    await dao.ops['/set-next-run-at'](new Date(Date.now() + 24 * 60 * 60 * 1000), 'Cleanup complete');
  }
}
```

## Command Lifecycle

1. **Creation**: Command is registered with initial configuration
2. **Scheduling**: `nextRunAt` is calculated based on cron expression or manual scheduling
3. **Execution**: Command runs in sandboxed environment
4. **Completion**: Command either succeeds, fails, or schedules next run
5. **Termination**: Command can be disabled manually or automatically

## Monitoring

Commands provide comprehensive logging and monitoring:

- **Execution logs**: Recorded in `logs` and `runLogs` arrays
- **Performance metrics**: Duration, objects touched, success/failure counts
- **Status tracking**: Current state and historical execution data
- **Error tracking**: Detailed error information and retry counts

## Security

Commands run in a restricted environment with:

- **No filesystem access**: Cannot read/write files
- **No network access**: Except through approved operations
- **No process spawning**: Cannot execute system commands
- **Controlled database access**: Only through provided DAO operations
- **Timeout protection**: Commands are terminated after 10 seconds
