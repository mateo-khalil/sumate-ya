/**
 * Auth route registration
 *
 * Decision Context:
 * - /register-club creates a club_admin account + profile + club atomically.
 *   Named explicitly (not /register) so adding /register-player later is unambiguous.
 * - /register-player creates a player account + profile. Minimal flow — no club row.
 * - Previously fixed bugs:
 *   - Route was /register (P3 audit) — renamed to /register-club for REST clarity.
 */
import { Router } from 'express';

import { authController } from '../controllers/authController.js';

const router = Router();

router.post('/login', authController.login);
router.get('/session', authController.session);
router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);
router.post('/register-club', authController.register);
router.post('/register-player', authController.registerPlayer);

export default router;
