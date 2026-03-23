// Auth routes
import express from "express";
import {
    signup,
    login,
    logout,
    refresh,
    me,
} from "../controllers/auth.controller.js";
import {
  forgotPassword,
  verifyOtp,
  resetPassword
} from "../controllers/auth.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import rateLimit from "express-rate-limit";

const router = express.Router();
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 5, // 5 requests per window
  message: { message: "Too many OTP requests, try later" },
});

router.post("/signup", signup);
router.post("/login", login);
router.post("/logout", logout);
router.post("/refresh", refresh);
router.get("/me", requireAuth, me);
router.post("/forgot-password", forgotPassword);
router.post("/verify-otp", verifyOtp);
router.post("/reset-password", resetPassword);
router.post("/forgot-password", otpLimiter, forgotPassword);

export default router;