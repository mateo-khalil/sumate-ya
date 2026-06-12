// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendEnvPath = path.resolve(__dirname, '.env');

// Load only the frontend app env file. Backend secrets must not bleed into Astro.
dotenv.config({ path: frontendEnvPath, quiet: true });

/**
 * Decision Context:
 * - Why output: 'server': Astro 6 merged 'hybrid' into 'server' — pages prerender by default,
 *   SSR opt-in via `export const prerender = false`. This enables auth middleware, login POST,
 *   and role-gated redirects while keeping public pages static.
 * - Adapter: @astrojs/cloudflare deploys SSR pages to a Cloudflare Worker (free tier, global
 *   edge, no server to manage). Replaced @astrojs/node (which targeted the DigitalOcean droplet).
 * - Runtime env on Cloudflare: SSR code reads PRIVATE_BACKEND_URL / PRIVATE_IS_PROD via
 *   `import.meta.env.*`, which Vite inlines at BUILD time. The deploy pipeline therefore exports
 *   these before `astro build` (see scripts/deploy-frontend.sh) so the Render backend URL is baked
 *   into the Worker bundle. wrangler.jsonc also mirrors them as [vars] for the process.env fallback.
 * - Dev bindings: @astrojs/cloudflare v13 reads wrangler.jsonc bindings in `astro dev`
 *   automatically via @cloudflare/vite-plugin — the old `platformProxy` adapter option was
 *   removed in v13 and is no longer passed here.
 * - Env loading: Dotenv still loads apps/frontend/.env at config time so a local .env can supply
 *   PRIVATE_BACKEND_URL for the build without polluting backend secrets.
 * - Previously fixed bugs: none relevant.
 */
export default defineConfig({
  output: 'server',
  adapter: cloudflare(),
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
    envDir: __dirname,
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
  },
});
