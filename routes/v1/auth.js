
import express from 'express'
const router = express.Router();
import { register , login , googleLogin } from "../../controllers/v1/authController.js";
import loggedInUserDetails from '../../controllers/v1/loggedInUser.js';
import {isAuthenticated} from '../../middleware/verifyAuth.js';

router.post("/register", register);
router.post("/login", login);
router.post("/auth/google", googleLogin);
router.post("/user/details",isAuthenticated , loggedInUserDetails);

export default router;
