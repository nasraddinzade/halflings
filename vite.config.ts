import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { defineConfig, type Plugin } from 'vite';

/**
 * Takes a frame off the running game and writes it to `.shots/`.
 *
 * Development only, and it exists because looking at the thing is the
 * only check that has ever caught the faults that mattered in this
 * project — a hedge that read as a slab, two buildings facing away from
 * the village, a wheel over dry ground, a field laid across the river.
 * None of those were found by a measurement, and all of them survived one.
 *
 * The developer camera can already hand back the canvas as a data URL,
 * but a picture is only useful if it can be opened; posting it here puts
 * it on disk under a name, where it can be looked at, kept, or compared
 * against the same view taken before a change.
 */
function frameGrabber(): Plugin {
  return {
    name: 'halflings-frame-grabber',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__shot', (request, response) => {
        if (request.method !== 'POST') {
          response.statusCode = 405;
          response.end('post a data url');
          return;
        }
        const chunks: Buffer[] = [];
        request.on('data', (chunk: Buffer) => chunks.push(chunk));
        request.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          const comma = body.indexOf(',');
          const name = (request.url ?? '').replace(/^\/*/, '').replace(/[^\w.-]/g, '') || 'latest';
          const directory = resolve(process.cwd(), '.shots');
          mkdirSync(directory, { recursive: true });
          const file = resolve(directory, `${name}.jpg`);
          writeFileSync(file, Buffer.from(body.slice(comma + 1), 'base64'));
          response.end(file);
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [frameGrabber()],
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
