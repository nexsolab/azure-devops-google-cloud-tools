import { defineConfig } from 'vite';

/**
 * Base Vite configuration for Azure DevOps extension tasks
 */
export function createBaseConfig(taskName, entry, outDir) {
  return defineConfig({
    build: {
      target: 'node16',
      outDir,
      emptyOutDir: true,
      lib: {
        entry,
        name: taskName,
        fileName: 'main',
        formats: ['cjs'],
      },
      rollupOptions: {
        external: [
          'azure-pipelines-task-lib',
          'azure-pipelines-tool-lib',
          /^azure-pipelines-task-lib\/.*/,
          /^azure-pipelines-tool-lib\/.*/,
          'vss-web-extension-sdk',
          'google-auth-library',
          'securefiles-babel',
          'node-fetch',
          'return-deep-diff',
          'typed-rest-client',
          /^typed-rest-client\/.*/,
          'os',
          'path',
          'fs',
        ],
        output: {
          format: 'cjs',
          exports: 'auto',
        },
      },
      minify: 'terser',
      terserOptions: {
        compress: {
          drop_console: false,
          drop_debugger: true,
        },
        mangle: {
          keep_fnames: true,
        },
      },
    },
    resolve: {
      alias: {
        '@shared': new URL('./src/shared', import.meta.url).pathname,
      },
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify('production'),
    },
  });
}
