import { defineConfig } from 'vite';

export default defineConfig({
  // Port comes from the environment when it is set: 5173 is sometimes taken
  // by a neighbouring project, and then the server should quietly move to a
  // free one
  server: { port: Number(process.env['PORT']) || 5173, strictPort: false },
  // Assets are pulled in through `?url` imports from config/assets.ts rather
  // than through publicDir: that way a typo in a path fails the build instead
  // of turning into a 404 at runtime.
  publicDir: false,
  build: {
    target: 'es2022',
    // GLBs are already compressed internally — no point inlining them into JS
    assetsInlineLimit: 0,
  },
});
