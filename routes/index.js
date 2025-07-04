import express from 'express';

import authRoutes from './auth.js';
import dataFiles from './data.js'
import aiRouter from './ai.js'
import exportRouter from './export.js'
import askAssistantRouter from './askAi.js'
const router = express.Router();
import googleSheetRoute from './googlesheet.js'

router.use('/auth', authRoutes);
router.use('/users', dataFiles);
router.use('/users', aiRouter);
router.use('/data', exportRouter);
router.use('/ai', askAssistantRouter);
router.use('/users', googleSheetRoute);


export default router;