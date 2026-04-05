import express from "express"
import rateLimit from "express-rate-limit"
import {
  signup, login, logout, refresh, me,
  forgotPassword, verifyOtp, resetPassword, setupPassword,
  resendVerification, verifyEmail,
  requestAdminEmailChangeOtp, verifyAdminEmailChange,
  requestAdminPasswordChangeOtp, confirmAdminPasswordChange
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
router.post("/resend-verification", otpLimiter, resendVerification)
router.post("/verify-email", otpLimiter, verifyEmail)
router.post("/forgot-password", otpLimiter, forgotPassword)
router.post("/verify-otp", authLimiter, verifyOtp)
router.post("/reset-password", authLimiter, resetPassword)
router.post("/setup-password", setupPassword)
router.post("/admin/change-email/request-otp", otpLimiter, requireAuth, requestAdminEmailChangeOtp)
router.post("/admin/change-email/verify", authLimiter, requireAuth, verifyAdminEmailChange)
router.post("/admin/change-password/request-otp", otpLimiter, requireAuth, requestAdminPasswordChangeOtp)
router.post("/admin/change-password/confirm", authLimiter, requireAuth, confirmAdminPasswordChange)

export default router