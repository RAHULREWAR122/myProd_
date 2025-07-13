import express from 'express';
const router  = express.Router();
import {isAuthenticated} from "../../middleware/verifyAuth.js";
import { askAssistant } from '../../controllers/v1/aiAssestant.js';

router.post("/assistant", askAssistant);

export default router;
