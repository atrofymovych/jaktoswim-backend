const DAOCommand = require('./models/DAOCommand');
const DAOObject = require('./models/DAOObject');
const ObjectPermission = require('./models/ObjectPermission');
const OrganisationRolesMapping = require('./models/OrganisationRolesMapping');
const PayUToken = require('./models/PayUToken');
const StripePayment = require('./models/StripePayment');
const StripeProduct = require('./models/StripeProduct');
const StripePrice = require('./models/StripePrice');
const StripeCustomer = require('./models/StripeCustomer');
const StripeSubscription = require('./models/StripeSubscription');
const UserOrgBinding = require('./models/UserOrgBinding');
const UserProfile = require('./models/UserProfile');
const DAOAiObject = require('./models/DAOAiObject');
const DAOPublicObject = require('./models/DAOPublicObject');
const ProxyConfig = require('./models/ProxyConfig');


const DEFAULT_MODELS = [
  { model_name: 'DAOObject', schema: DAOObject },
  { model_name: 'ObjectPermission', schema: ObjectPermission },
  { model_name: 'OrganisationRolesMapping', schema: OrganisationRolesMapping },
  { model_name: 'UserOrgBinding', schema: UserOrgBinding },
  { model_name: 'UserProfile', schema: UserProfile },
  { model_name: 'PayUToken', schema: PayUToken },
  { model_name: 'StripePayment', schema: StripePayment },
  { model_name: 'StripeProduct', schema: StripeProduct },
  { model_name: 'StripePrice', schema: StripePrice },
  { model_name: 'StripeCustomer', schema: StripeCustomer },
  { model_name: 'StripeSubscription', schema: StripeSubscription },
  { model_name: 'DAOCommand', schema: DAOCommand },
  { model_name: 'DAOAiObject', schema: DAOAiObject },
  { model_name: 'DAOPublicObject', schema: DAOPublicObject },
  { model_name: 'ProxyConfig', schema: ProxyConfig },
];


// in future this needs to be stored in our private DB
// and ofcourse queried as well from our private DB
// for multi-tenant-support
function getMongoClusterConfiguration() {
  const org_2zbiM3GXBaulTnCdlqimkqnPUTE_MONGODB_CLUSTER = process.env['org_2zbiM3GXBaulTnCdlqimkqnPUTE_MONGODB_CLUSTER'];
  const org_2zmXGAn5R70nSzO0N7BmTplvIce_MONGODB_CLUSTER = process.env['org_2zmXGAn5R70nSzO0N7BmTplvIce_MONGODB_CLUSTER'];
  const org_WkRST1dPV1pEUk9XT1c_MONGODB_CLUSTER = process.env['org_WkRST1dPV1pEUk9XT1c_MONGODB_CLUSTER'];
  const org_w2hR9pA5eG7zT3xY1jL4kF8cM0bV6dI_MONGODB_CLUSTER = process.env['org_w2hR9pA5eG7zT3xY1jL4kF8cM0bV6dI_MONGODB_CLUSTER'];
   const org_Drrt9YtLYHJRkM86Z17YGaUTb3LwLZW_MONGODB_CLUSTER = process.env['org_Drrt9YtLYHJRkM86Z17YGaUTb3LwLZW_MONGODB_CLUSTER'];

  const org_2zbiM3GXBaulTnCdlqimkqnPUTE_MONGODB_DATABASE_NAME = process.env['org_2zbiM3GXBaulTnCdlqimkqnPUTE_MONGODB_DATABASE_NAME'];
  const org_2zmXGAn5R70nSzO0N7BmTplvIce_MONGODB_DATABASE_NAME = process.env['org_2zmXGAn5R70nSzO0N7BmTplvIce_MONGODB_DATABASE_NAME'];
  const org_WkRST1dPV1pEUk9XT1c_MONGODB_DATABASE_NAME = process.env['org_WkRST1dPV1pEUk9XT1c_MONGODB_DATABASE_NAME'];
  const org_w2hR9pA5eG7zT3xY1jL4kF8cM0bV6dI_MONGODB_DATABASE_NAME = process.env['org_w2hR9pA5eG7zT3xY1jL4kF8cM0bV6dI_MONGODB_DATABASE_NAME'];
  const org_Drrt9YtLYHJRkM86Z17YGaUTb3LwLZW_MONGODB_DATABASE_NAME = process.env['org_Drrt9YtLYHJRkM86Z17YGaUTb3LwLZW_MONGODB_DATABASE_NAME'];

  const org_2zbiM3GXBaulTnCdlqimkqnPUTE_MONGODB_AUTH_SOURCE = process.env['org_2zbiM3GXBaulTnCdlqimkqnPUTE_MONGODB_AUTH_SOURCE'];
  const org_2zmXGAn5R70nSzO0N7BmTplvIce_MONGODB_AUTH_SOURCE = process.env['org_2zmXGAn5R70nSzO0N7BmTplvIce_MONGODB_AUTH_SOURCE'];
  const org_WkRST1dPV1pEUk9XT1c_MONGODB_AUTH_SOURCE = process.env['org_WkRST1dPV1pEUk9XT1c_MONGODB_AUTH_SOURCE'];
  const org_w2hR9pA5eG7zT3xY1jL4kF8cM0bV6dI_MONGODB_AUTH_SOURCE = process.env['org_w2hR9pA5eG7zT3xY1jL4kF8cM0bV6dI_MONGODB_AUTH_SOURCE'];
  const org_Drrt9YtLYHJRkM86Z17YGaUTb3LwLZW_MONGODB_AUTH_SOURCE = process.env['org_Drrt9YtLYHJRkM86Z17YGaUTb3LwLZW_MONGODB_AUTH_SOURCE'];

  return {
    org_2zbiM3GXBaulTnCdlqimkqnPUTE: {
      url: `mongodb://${org_2zbiM3GXBaulTnCdlqimkqnPUTE_MONGODB_CLUSTER}/${org_2zbiM3GXBaulTnCdlqimkqnPUTE_MONGODB_DATABASE_NAME}?authSource=${org_2zbiM3GXBaulTnCdlqimkqnPUTE_MONGODB_AUTH_SOURCE}&directConnection=true`,
      models: DEFAULT_MODELS,
    },
    org_2zmXGAn5R70nSzO0N7BmTplvIce: {
      url: `mongodb://${org_2zmXGAn5R70nSzO0N7BmTplvIce_MONGODB_CLUSTER}/${org_2zmXGAn5R70nSzO0N7BmTplvIce_MONGODB_DATABASE_NAME}?authSource=${org_2zmXGAn5R70nSzO0N7BmTplvIce_MONGODB_AUTH_SOURCE}&directConnection=true`,
      models: DEFAULT_MODELS,
    },
    org_WkRST1dPV1pEUk9XT1c: {
      url: `mongodb://${org_WkRST1dPV1pEUk9XT1c_MONGODB_CLUSTER}/${org_WkRST1dPV1pEUk9XT1c_MONGODB_DATABASE_NAME}?authSource=${org_WkRST1dPV1pEUk9XT1c_MONGODB_AUTH_SOURCE}&directConnection=true`,
      models: DEFAULT_MODELS,
    },
    org_w2hR9pA5eG7zT3xY1jL4kF8cM0bV6dI: {
      url: `mongodb://${org_w2hR9pA5eG7zT3xY1jL4kF8cM0bV6dI_MONGODB_CLUSTER}/${org_w2hR9pA5eG7zT3xY1jL4kF8cM0bV6dI_MONGODB_DATABASE_NAME}?authSource=${org_w2hR9pA5eG7zT3xY1jL4kF8cM0bV6dI_MONGODB_AUTH_SOURCE}&directConnection=true`,
      models: DEFAULT_MODELS,
    },
    org_Drrt9YtLYHJRkM86Z17YGaUTb3LwLZW: {
      url: `mongodb://${org_Drrt9YtLYHJRkM86Z17YGaUTb3LwLZW_MONGODB_CLUSTER}/${org_Drrt9YtLYHJRkM86Z17YGaUTb3LwLZW_MONGODB_DATABASE_NAME}?authSource=${org_Drrt9YtLYHJRkM86Z17YGaUTb3LwLZW_MONGODB_AUTH_SOURCE}&directConnection=true`,
      models: DEFAULT_MODELS,
    },
  };
}

module.exports = { getMongoClusterConfiguration };