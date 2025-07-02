import { createBaseConfig } from './vite.config.base.js';

export default createBaseConfig(
  'GoogleCloudFunctions',
  './Tasks/GoogleCloudFunctions/src/main-new.js',
  './Tasks/GoogleCloudFunctions/dist',
);
