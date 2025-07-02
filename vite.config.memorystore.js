import { createBaseConfig } from './vite.config.base.js';

export default createBaseConfig(
  'GoogleCloudMemorystore',
  './Tasks/GoogleCloudMemorystore/src/main-new.js',
  './Tasks/GoogleCloudMemorystore/dist',
);
