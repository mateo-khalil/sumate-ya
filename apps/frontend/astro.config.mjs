// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import node from '@astrojs/node';
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
 * - Adapter: @astrojs/node for standalone/container deployment.
 * - Env loading: Dotenv loads only apps/frontend/.env so backend secrets never enter the
 *   frontend runtime. Backend URL falls back to localhost in development.
 * - Previously fixed bugs: none relevant.
 */
export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
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
