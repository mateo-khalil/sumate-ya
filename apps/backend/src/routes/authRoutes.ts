/**
 * Auth route registration
 *
 * Decision Context:
 * - /register-club is the only registration endpoint; player self-registration
 *   is not yet supported — players are created by admins or join via invite.
 * - Named /register-club (not /register) to be explicit: this endpoint creates
 *   a club_admin account + profile + club atomically. A generic /register would
 *   be ambiguous once player registration is added.
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

export default router;
