/**
 * Profile REST routes
 *
 * Decision Context:
 * - Why REST: Avatar upload is an infrastructure operation (binary file I/O to Storage)
 *   that does not map to GraphQL, consistent with backend.md's REST vs GraphQL table.
 * - Route is under /api/profile (mounted in app.ts), separate from /api/auth so
 *   middleware composition stays clean and future profile REST endpoints have a home.
 * - Previously fixed bugs: none relevant.
 */

import { Router } from 'express';
import { profileController } from '../controllers/profileController.js';

const router = Router();

router.post('/avatar', profileController.uploadAvatar);

export default router;
