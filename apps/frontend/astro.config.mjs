// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import vercel from '@astrojs/vercel';
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
 * - Adapter: @astrojs/vercel deploys SSR pages as Vercel Serverless Functions (Fluid Compute)
 *   while prerendered pages ship as static assets on Vercel's edge CDN. Migrated off
 *   @astrojs/cloudflare (Cloudflare Workers); before that the app targeted @astrojs/node on a
 *   DigitalOcean droplet.
 * - Runtime env on Vercel: SSR code reads PRIVATE_BACKEND_URL / PRIVATE_IS_PROD via
 *   `import.meta.env.*`, which Vite inlines at BUILD time. The deploy pipeline therefore exports
 *   these before `astro build` (see scripts/deploy-frontend.sh) so the Render backend URL is baked
 *   into the bundle. When building on Vercel's own CI, set the same vars as Project Environment
 *   Variables so the build step inlines them identically.
 * - Build output: @astrojs/vercel writes to apps/frontend/.vercel/output in Build Output API
 *   format, so `astro build` followed by `vercel deploy --prebuilt` ships exactly what was built
 *   locally (no separate `vercel build` step needed).
 * - No KV/session binding: the prior Cloudflare adapter auto-enabled an Astro Sessions driver
 *   backed by Workers KV (binding SESSION). The app uses JWT cookies, not Astro.session, so that
 *   binding was dropped entirely in the Vercel migration rather than re-provisioned.
 * - Env loading: Dotenv still loads apps/frontend/.env at config time so a local .env can supply
 *   PRIVATE_BACKEND_URL for the build without polluting backend secrets.
 * - Previously fixed bugs: none relevant.
 */
export default defineConfig({
  output: 'server',
  adapter: vercel(),
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
