import { Router } from 'express';

import { authController } from '../controllers/authController.js';

const router = Router();

router.post('/login', authController.login);
router.get('/session', authController.session);
router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);

export default router;
