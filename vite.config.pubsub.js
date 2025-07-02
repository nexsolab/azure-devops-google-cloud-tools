import { createBaseConfig } from './vite.config.base.js';

export default createBaseConfig(
  'GoogleCloudPubSub',
  './Tasks/GoogleCloudPubSub/src/main-new.js',
  './Tasks/GoogleCloudPubSub/dist',
);
