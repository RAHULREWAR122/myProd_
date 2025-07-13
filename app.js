import express from 'express';

import authRoutes from './routes/v1/auth.js';
import dataFiles from './routes/v1/data.js'
import aiRouter from './routes/v1/ai.js'
import exportRouter from './routes/v1/export.js'
import askAssistantRouter from './routes/v1/askAi.js'
const router = express.Router();
import googleSheetRoute from './routes/v1/googlesheet.js'

router.use('/auth', authRoutes);
router.use('/users', dataFiles);
router.use('/users', aiRouter);
router.use('/data', exportRouter);
router.use('/ai', askAssistantRouter);
router.use('/users', googleSheetRoute);

export default router;