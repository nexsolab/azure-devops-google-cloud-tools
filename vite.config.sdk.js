import { createBaseConfig } from './vite.config.base.js';

export default createBaseConfig(
  'GoogleCloudSdkTool',
  './Tasks/GoogleCloudSdkTool/gcloudcli.ts',
  './Tasks/GoogleCloudSdkTool/dist',
);
