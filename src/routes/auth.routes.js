import express from "express"
import rateLimit from "express-rate-limit"
import {
  signup, login, logout, refresh, me,
  forgotPassword, verifyOtp, resetPassword, setupPassword
} from "../controllers/auth.controller.js"
import { requireAuth } from "../middleware/auth.middleware.js"

const router = express.Router()

const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { success: false, error: { code: "RATE_LIMITED", message: "Too many requests" } }
})

const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { success: false, error: { code: "RATE_LIMITED", message: "Too many OTP requests, try later" } }
})

router.post("/signup", authLimiter, signup)
router.post("/login", authLimiter, login)
router.post("/logout", logout)
router.post("/refresh", refresh)
router.get("/me", requireAuth, me)
router.post("/forgot-password", otpLimiter, forgotPassword)
router.post("/verify-otp", authLimiter, verifyOtp)
router.post("/reset-password", authLimiter, resetPassword)
router.post("/setup-password", setupPassword)

export default router