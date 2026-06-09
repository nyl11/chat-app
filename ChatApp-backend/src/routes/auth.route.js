import express from 'express';
import{protectRoute} from  "../middleware/auth.middleware.js"
import {login, logout, signup, updateProfile, checkAuth, googleSignup, publishPublicKey, getPublicKey} from "../controllers/auth.controller.js"

const router = express.Router();

router.post("/signup", signup);

router.post("/google-signup", googleSignup);

router.post("/login", login) ;

router.post("/logout",logout ) ;

router.put("/update-profile",protectRoute, updateProfile);

router.get("/check", protectRoute, checkAuth);

// E2EE public key exchange routes
router.put("/publish-key", protectRoute, publishPublicKey);
router.get("/public-key/:userId", protectRoute, getPublicKey);
 
export default router;