require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { clerkMiddleware } = require('@clerk/express');

const injectOrgConnection = require('./middlewares/injectOrgConnection');
const requireRole = require('./middlewares/requireRole');
const webhookRoute = require('./routes/integrations/clerkWebhook');
const healthcheckRoute = require('./routes/health');
const authRoute = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const profileRoutes = require('./routes/profile');
const daoRoutes = require('./routes/dao/dao');
const telegramRoutes = require('./routes/telegram');
const filesRoutes = require('./routes/integrations/cloudinary');
const payuIntegration = require('./routes/integrations/payu/payuIntegration');
const payuPublicIntegration = require('./routes/integrations/payu/payuPublic');
const payuIntegrationWebhook = require('./routes/integrations/payu/payuWebhook');
const stripeIntegration = require('./routes/integrations/stripe/stripeIntegration');
const stripeWebhook = require('./routes/integrations/stripe/stripeWebhook');
const stripeSubscriptions = require('./routes/integrations/stripe/stripeSubscriptions');
const usersRoutes = require('./routes/users');
const daoCommandsRoutes = require('./routes/dao/daoCommands');
const secureGatewayRoutes = require('./routes/secureGateway');
const resendRoutes = require('./routes/integrations/resendIntegration');
const twilioRoutes = require('./routes/integrations/twilioIntegration');
const gcsBucketsIntegration = require('./routes/integrations/gcsBucketsIntegration');
const vertexAiIntegration = require('./routes/integrations/vertexAiIntegration');
const daoPublic = require('./routes/dao/daoPublic');
const proxyRoutes = require('./routes/proxy');
const validateProxyType = require('./middlewares/validateProxyType');
const awsS3Integration = require('./routes/integrations/awsS3Integration');
const openAiIntegration = require('./routes/integrations/openAiIntegration');
const deepseekIntegration = require('./routes/integrations/deepseekIntegration');
const dailyIntegration = require('./routes/integrations/dailyIntegration');
const GitHubActionsValidator = require('github-actions-validator-node');
const { claimDueCommand, executeCommand } = require('./_utils/daoCommands/daoCommandRunner');
const erl = require('express-rate-limit');
const { metricsEndpoint, metricsMiddleware } = require('./prometheus');
const telegramMonitor = require('./_utils/monitoring/telegramMonitor');
const telegramMonitoringMiddleware = require('./middlewares/telegramMonitoring');

const workflowValidator = new GitHubActionsValidator({
  strictMode: process.env.GITHUB_ACTIONS_STRICT_MODE === 'true',
  validateInputs: true,
  validateOutputs: true,
});

workflowValidator.initialize().catch(() => {});

const app = express();
app.set('trust proxy', 1);

if (process.env.NODE_ENV !== 'test' && process.env.DISABLE_METRICS !== 'true') {
  app.use(metricsMiddleware);
}

app.use(telegramMonitoringMiddleware);

const rateLimit = erl;
const { ipKeyGenerator } = erl;
let RedisStore, IORedis;

try {
  ({ RedisStore } = require('rate-limit-redis'));
  IORedis = require('ioredis');
} catch (_) {}

function buildStore() {
  if (process.env.REDIS_URL && RedisStore && IORedis) {
    const client = new IORedis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 2,
      enableOfflineQueue: false,
    });
    return new RedisStore({ sendCommand: (...args) => client.call(...args) });
  }
  return undefined;
}

const baseLimiterOpts = {
  windowMs: 60 * 1000,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => req.method === 'OPTIONS' || req.path === '/healthcheck',
  keyGenerator: (req, res) =>
    (typeof req.auth === 'function' ? req.auth()?.userId : req.auth?.userId) ||
    req.headers['x-org-id'] ||
    ipKeyGenerator(req, res),
  message: { error: 'Too many requests, slow down.' },
  store: buildStore(),
};

const WRITE_PATHS = new Set(['/add-object', '/update-object', '/del-object', '/add-object-bulk']);

const publicWriteLimiter = rateLimit({ ...baseLimiterOpts, limit: 30 });
const publicBulkLimiter = rateLimit({ ...baseLimiterOpts, limit: 10 });
const publicReadLimiter = rateLimit({
  ...baseLimiterOpts,
  limit: 1200,
  skip: (req) => baseLimiterOpts.skip(req) || WRITE_PATHS.has(req.path),
});

const publicResendLimiter = rateLimit({
  ...baseLimiterOpts,
  limit: 500,
  skip: (req) => baseLimiterOpts.skip(req) || WRITE_PATHS.has(req.path),
});

const publicTwilioLimiter = rateLimit({
  ...baseLimiterOpts,
  limit: 500,
  skip: (req) => baseLimiterOpts.skip(req) || WRITE_PATHS.has(req.path),
});

const publicS3Limiter = rateLimit({
  ...baseLimiterOpts,
  limit: 200,
  skip: (req) => baseLimiterOpts.skip(req) || WRITE_PATHS.has(req.path),
});

const publicPayuLimiter = rateLimit({
  ...baseLimiterOpts,
  limit: 120,
});

const publicProxyLimiter = rateLimit({
  ...baseLimiterOpts,
  limit: 1200,
  skip: (req) => baseLimiterOpts.skip(req) || ['POST', 'PUT', 'DELETE'].includes(req.method),
});

app.use('/clerk/webhook', express.raw({ type: 'application/json' }), webhookRoute);
app.use('/stripe/webhook', express.raw({ type: 'application/json' }), stripeWebhook);

app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-ORG-ID',
      'X-SOURCE',
      'X-Telegram-Init-Data',
      'X-PayU-Authorization',
      'X-Stripe-Authorization',
    ],
  })
);
app.use(express.json({ limit: '1mb' }));

app.use('/public/dao/add-object', publicWriteLimiter);
app.use('/public/dao/update-object', publicWriteLimiter);
app.use('/public/dao/del-object', publicWriteLimiter);
app.use('/public/dao/add-object-bulk', publicBulkLimiter);
app.use('/public/dao', publicReadLimiter);
app.use('/public/payu', publicPayuLimiter);
app.use('/public/dao', injectOrgConnection, daoPublic);
app.use('/public/payu', injectOrgConnection, payuPublicIntegration);
app.use('/public/proxy/:type', publicProxyLimiter, injectOrgConnection, validateProxyType, proxyRoutes);
app.use('/resend', publicResendLimiter);
app.use('/twilio', publicTwilioLimiter);
app.use('/aws-s3', publicS3Limiter);
app.use('/metrics', metricsEndpoint);

app.get('/cache-stats', (req, res) => {
  const cacheService = require('./services/cacheService');
  const permissionCacheService = require('./services/permissionCacheService');
  res.json({
    main: cacheService.getStats(),
    permission: permissionCacheService.getStats(),
  });
});

const cacheMetricsService = require('./services/cacheMetricsService');
cacheMetricsService.start();
app.use('/telegram', telegramRoutes);

app.use(clerkMiddleware());

app.use('/healthcheck', healthcheckRoute);

app.use('/auth', injectOrgConnection, authRoute);
app.use('/profile', injectOrgConnection, profileRoutes);
app.use('/dao', injectOrgConnection, daoRoutes);
app.use('/proxy/:type', injectOrgConnection, validateProxyType, proxyRoutes);
app.use('/resend', resendRoutes);
app.use('/twilio', twilioRoutes);
app.use('/payu', injectOrgConnection, payuIntegration);
app.use('/stripe', injectOrgConnection, stripeIntegration);
app.use('/stripe/subscriptions', injectOrgConnection, stripeSubscriptions);
app.use('/files', injectOrgConnection, filesRoutes);
app.use('/users', injectOrgConnection, usersRoutes);
app.use('/dao-commands', injectOrgConnection, daoCommandsRoutes);
app.use('/secure-gateway', injectOrgConnection, secureGatewayRoutes);
app.use('/aws-s3', injectOrgConnection, awsS3Integration);
app.use('/admin', injectOrgConnection, requireRole(['ADMIN', 'SUB_ADMIN', 'ORG_ADMIN', 'SUPER_ADMIN']), adminRoutes);
app.use('/gcs-buckets', injectOrgConnection, gcsBucketsIntegration);
app.use('/vertex-ai', injectOrgConnection, vertexAiIntegration);
app.use('/openai', injectOrgConnection, openAiIntegration);
app.use('/deepseek', injectOrgConnection, deepseekIntegration);
app.use('/daily', injectOrgConnection, dailyIntegration);

async function bootstrap() {
  if (process.env.NODE_ENV === 'test') {
    return;
  }

  if (!process.env.COMMAND_DECRYPT_KEY) {
    console.error('DECRYPT_KEY IS NOT DEFINED after Secret Manager load');
    process.exit(1);
  }

  const PORT = process.env.PORT || 8080;
  const server = app.listen(PORT, () => {});

  const daoCommandProcessorEnabled = process.env.DAO_COMMAND_PROCESSOR_ENABLED === 'true';
  if (daoCommandProcessorEnabled) {
    console.log('DAO command processor is ENABLED - processing DAO commands');
  } else {
    console.log('DAO command processor is DISABLED - running without DAO command processing');
  }

  let polling = false;

  async function tick() {
    if (polling) {
      return;
    }
    polling = true;
    try {
      const daoCommandProcessorEnabled = process.env.DAO_COMMAND_PROCESSOR_ENABLED === 'true';

      if (!daoCommandProcessorEnabled) {
        return;
      }

      const INTER_CMD_DELAY_MS = process.env.COMMAND_INTER_COMMAND_DELAY_MS
        ? Number(process.env.COMMAND_INTER_COMMAND_DELAY_MS)
        : 100;

      for (;;) {
        const cmd = await claimDueCommand('web-poller');
        if (!cmd) {
          break;
        }
        await executeCommand(cmd, process.env.COMMAND_DECRYPT_KEY);
        if (INTER_CMD_DELAY_MS > 0) {
          await new Promise((resolve) => setTimeout(resolve, INTER_CMD_DELAY_MS));
        }
      }
    } catch (e) {
      console.error('poller tick failed:', e);
    } finally {
      polling = false;
    }
  }

  const POLL_MS = process.env.COMMAND_POLL_INTERVAL_MS ? Number(process.env.COMMAND_POLL_INTERVAL_MS) : 1000;

  if (POLL_MS > 0) {
    const pollHandle = setInterval(tick, POLL_MS);

    function shutdown() {
      clearInterval(pollHandle);
      server.close(() => process.exit(0));
    }

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  }
}

bootstrap().catch((e) => {
  console.error('bootstrap failed:', e);
  process.exit(1);
});
