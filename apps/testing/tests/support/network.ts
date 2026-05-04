import type { Page, Route } from '@playwright/test';

/**
 * Browser-side network helpers (non-GraphQL).
 *
 * Decision Context:
 * - `mockLeafletAssets` short-circuits OpenStreetMap tile + Leaflet icon CDN
 *   requests with a 1x1 PNG. We don't validate map tiles; we validate that the
 *   UI mounts Leaflet, creates markers, and renders popups with our contract.
 *   Letting the real CDN respond made the matches-map suite flaky and slow.
 * - `mockJsonRoute` is a small wrapper for endpoints that return JSON (e.g.
 *   /api/profile/avatar, /api/matches/create). Captures payloads.
 * - Previously fixed bugs: none relevant.
 */

export const TRANSPARENT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
  'base64',
);

export async function mockLeafletAssets(page: Page): Promise<void> {
  const fulfillImage = async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: TRANSPARENT_PNG,
    });
  };

  await page.route(/https:\/\/[abc]\.tile\.openstreetmap\.org\/.*/, fulfillImage);
  await page.route(
    /https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/leaflet\/1\.9\.4\/images\/.*/,
    fulfillImage,
  );
}

type JsonRouteOptions = {
  status?: number;
  body?: unknown;
  delayMs?: number;
};

export async function mockJsonRoute(
  page: Page,
  route: string | RegExp,
  options: JsonRouteOptions = {},
): Promise<{ getPayloads: () => unknown[] }> {
  const payloads: unknown[] = [];

  await page.unroute(route).catch(() => undefined);
  await page.route(route, async (incoming: Route) => {
    const raw = incoming.request().postData() ?? 'null';
    try {
      payloads.push(JSON.parse(raw) as unknown);
    } catch {
      payloads.push(raw);
    }

    if (options.delayMs) {
      await new Promise((resolve) => setTimeout(resolve, options.delayMs));
    }

    await incoming.fulfill({
      status: options.status ?? 200,
      contentType: 'application/json',
      body: JSON.stringify(options.body ?? {}),
    });
  });

  return { getPayloads: () => payloads };
}
