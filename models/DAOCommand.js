const mongoose = require('mongoose');

const DAOCommandSchema = new mongoose.Schema(
  {
    type: { type: String, default: 'Command', immutable: true },

    // Encrypted JS source (frontend encrypts, backend decrypts)
    command: { type: String, required: true },
    commandVersion: { type: Number, default: 1 },
    codeHash: { type: String },

    // Context
    orgId: { type: String, required: true, index: true },
    userId: { type: String, required: true },
    metadata: { type: Object, default: {} },

    // Scheduling
    cronExpr: { type: String }, // required unless RUN_ONCE
    nextRunAt: { type: Date, index: true },
    terminateAfter: { type: Date, index: true },
    disabled: { type: Boolean, default: false, index: true },

    // Action intent (write-once)
    action: {
      type: String,
      enum: ['REGISTER_COMMAND', 'RUN_NOW_AND_REGISTER', 'RUN_ONCE', 'REGISTER_AS_DISABLED', 'REGISTER_AS_ACTIVE'],
      required: true,
    },
    actionAppliedAt: { type: Date },

    // Locking
    lockedAt: { type: Date, default: null },
    lockExpiresAt: { type: Date, default: null },

    status: {
      type: String,
      enum: ['pending', 'running', 'success', 'failed', 'disabled'],
      default: 'pending',
      index: true,
    },
    retryCount: { type: Number, default: 0 },
    retriesAfterFailure: { type: Number, default: 5 },
    delayBetweenRetriesMs: { type: Number, default: 5000 },

    lastExecutedAt: { type: Date },
    runCount: { type: Number, default: 0 },
    successCount: { type: Number, default: 0 },
    failureCount: { type: Number, default: 0 },

    durationMs: { type: Number },
    objectsTouched: { type: Number },
    errorCode: { type: String },
    staleLockCount: { type: Number, default: 0 },

    logs: { type: [String], default: [] },
    runLogs: { type: [Object], default: [] },

    links: { type: [Object], default: [] },
  },
  { timestamps: true, collection: 'dao-commands' }
);

DAOCommandSchema.index({ nextRunAt: 1, status: 1, disabled: 1 });
DAOCommandSchema.index({ lockedAt: 1 });

module.exports = mongoose.model('DAOCommand', DAOCommandSchema);
