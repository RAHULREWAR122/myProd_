
import express from 'express'
const router = express.Router();
import { register , login , googleLogin } from "../controllers/authController.js";
import loggedInUserDetails from '../controllers/loggedInUser.js';
import verifyToken from '../middleware/verifyAuth.js';
import { verifyEmail , updatePassword } from '../controllers/authController.js';

router.post("/register", register);
router.post("/login", login);
router.post("/auth/google", googleLogin);
router.post("/user/details",verifyToken , loggedInUserDetails);
router.post('/verifyemail' , verifyEmail)
router.post('/updatepassword' , updatePassword)

export default router;
