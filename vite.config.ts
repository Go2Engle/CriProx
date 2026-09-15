import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

const packageVersion = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
).version;

export default defineConfig({
  plugins: [react()],
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(packageVersion),
  },
  server: {
    proxy: {
      '/mpc-api': {
        target: 'https://mpcfill.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/mpc-api/, ''),
      },
      '/deck-source-api/moxfield': {
        target: 'https://api2.moxfield.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/deck-source-api\/moxfield/, '/v3/decks/all'),
      },
      '/deck-source-api/archidekt': {
        target: 'https://archidekt.com',
        changeOrigin: true,
        rewrite: (path) => `${path.replace(/^\/deck-source-api\/archidekt/, '/api/decks')}/`,
      },
    },
  },
});
