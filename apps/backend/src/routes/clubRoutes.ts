/**
 * Club REST routes
 *
 * Decision Context:
 * - Why REST: Club image upload is an infrastructure operation (binary file I/O to
 *   Supabase Storage) that does not map to GraphQL, consistent with backend.md's
 *   REST vs GraphQL table and the profileRoutes pattern for avatar uploads.
 * - Mounted at /api/club in app.ts, separate from /api/profile so each resource
 *   type has its own route namespace for future expansion.
 * - Previously fixed bugs: none relevant.
 */

import { Router } from 'express';
import { clubController } from '../controllers/clubController.js';

const router = Router();

router.post('/image', clubController.uploadClubImage);

export default router;
