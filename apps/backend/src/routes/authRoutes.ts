import { Router } from 'express';

import { authController } from '../controllers/authController.js';

const router = Router();

router.post('/login', authController.login);
router.get('/session', authController.session);
router.post('/logout', authController.logout);
router.post('/register', authController.register);
router.post('/register-player', authController.registerPlayer);

export default router;
