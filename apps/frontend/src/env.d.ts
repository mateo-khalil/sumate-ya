/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    user?: {
      id: string;
      email: string;
      displayName: string;
      role: 'player' | 'club_admin';
    };
    /** Raw access token forwarded by middleware for use in API route proxies. */
    accessToken?: string;
  }
}
