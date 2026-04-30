import type { APIRoute } from 'astro';
import { clearAuthCookies, logoutFromBackend, readAccessToken } from '../../../lib/auth';

export const prerender = false;

export const POST: APIRoute = async ({ cookies, redirect }) => {
  const accessToken = readAccessToken(cookies);
  await logoutFromBackend(accessToken);
  clearAuthCookies(cookies);
  return redirect('/', 302);
};
