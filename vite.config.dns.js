import path from 'path';
import { createBaseConfig } from './vite.config.base.js';

const config = createBaseConfig(
  'GoogleCloudDNS',
  './Tasks/GoogleCloudDNS/src/main-new.js',
  './Tasks/GoogleCloudDNS/dist',
);

// Update the alias to use absolute path
config.resolve.alias['@shared'] = path.resolve('./src/shared');

export default config;
