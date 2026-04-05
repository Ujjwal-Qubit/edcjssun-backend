import bcrypt from "bcryptjs"
import crypto from "crypto"
import prisma from "../utils/prisma.js"
import {
  signAccessToken,
  signRefreshToken,
  signResetToken,
  verifyRefreshToken,
  verifyResetToken
} from "../utils/jwt.js"
import { generateOTP } from "../utils/otp.js"
import { sendOtpEmail } from "../services/email.service.js"
import { sendError, sendSuccess } from "../utils/response.js"
import { isValidEmail, isNonEmptyString } from "../utils/validators.js"

const BCRYPT_ROUNDS = 12
const ADMIN_ROLES = new Set(["EVENT_ADMIN", "SUPER_ADMIN"])

const IS_PRODUCTION = process.env.NODE_ENV === "production"
const REFRESH_TOKEN_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || "7d"
const SESSION_MAX_AGE = process.env.SESSION_MAX_AGE || "12h"

const DURATION_MULTIPLIER_MS = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000
}

const parseDurationToMs = (value, fallbackMs) => {
  if (typeof value !== "string") return fallbackMs
  const trimmed = value.trim().toLowerCase()
  const match = trimmed.match(/^(\d+)([smhd])$/)
  if (!match) return fallbackMs

  const amount = Number(match[1])
  const unit = match[2]
  const multiplier = DURATION_MULTIPLIER_MS[unit]

  if (!amount || !multiplier) return fallbackMs
  return amount * multiplier
}

const DEFAULT_REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000
const DEFAULT_SESSION_TTL_MS = 12 * 60 * 60 * 1000

const REFRESH_TOKEN_TTL_MS = parseDurationToMs(REFRESH_TOKEN_EXPIRES_IN, DEFAULT_REFRESH_TOKEN_TTL_MS)
const SESSION_TTL_MS = parseDurationToMs(SESSION_MAX_AGE, DEFAULT_SESSION_TTL_MS)

const COOKIE_BASE_OPTIONS = {
  httpOnly: true,
  secure: IS_PRODUCTION,
  sameSite: IS_PRODUCTION ? "None" : "Lax",
  domain: process.env.COOKIE_DOMAIN || undefined,
  path: "/"
}

const getCookieOptions = (maxAgeMs) => ({
  ...COOKIE_BASE_OPTIONS,
  maxAge: Math.max(1000, Number(maxAgeMs) || REFRESH_TOKEN_TTL_MS)
})

const clearRefreshCookie = (res) => {
  res.clearCookie("refreshToken", COOKIE_BASE_OPTIONS)
}

const createSessionTokens = async ({ userId, role, existingTokenId, sessionExp }) => {
  const nowMs = Date.now()
  const computedSessionExp = typeof sessionExp === "number"
    ? sessionExp
    : Math.floor((nowMs + SESSION_TTL_MS) / 1000)
  const sessionExpiryMs = computedSessionExp * 1000
  const refreshExpiryMs = Math.min(nowMs + REFRESH_TOKEN_TTL_MS, sessionExpiryMs)

  if (refreshExpiryMs <= nowMs) {
    throw new Error("SESSION_EXPIRED")
  }

  let tokenRecordId = existingTokenId

  if (!tokenRecordId) {
    const record = await prisma.refreshToken.create({
      data: {
        userId,
        token: crypto.randomBytes(32).toString("hex"),
        expiresAt: new Date(refreshExpiryMs)
      }
    })

    tokenRecordId = record.id
  }

  const accessToken = signAccessToken({ userId, role })
  const refreshToken = signRefreshToken({
    userId,
    tokenId: tokenRecordId,
    sessionExp: computedSessionExp
  })

  await prisma.refreshToken.update({
    where: { id: tokenRecordId },
    data: {
      token: refreshToken,
      expiresAt: new Date(refreshExpiryMs)
    }
  })

  return {
    accessToken,
    refreshToken,
    refreshTokenMaxAgeMs: refreshExpiryMs - nowMs,
    sessionExpiresAt: new Date(sessionExpiryMs).toISOString()
  }
}

const ensureAdminActor = (req, res) => {
  if (!req?.user?.id || !ADMIN_ROLES.has(req.user.role)) {
    sendError(res, 403, "INSUFFICIENT_ROLE", "Admin access required")
    return false
  }
  return true
}

// ─── POST /api/auth/signup ──────────────────────────────────────

export const signup = async (req, res) => {
  try {
    const { name, email, password } = req.body || {}

    if (!isNonEmptyString(name) || name.trim().length < 2 || name.trim().length > 100) {
      return sendError(res, 422, "VALIDATION_ERROR", "Name must be 2-100 characters", "name")
    }

    if (!isValidEmail(email)) {
      return sendError(res, 422, "VALIDATION_ERROR", "Valid email is required", "email")
    }

    if (!isNonEmptyString(password) || password.length < 8) {
      return sendError(res, 422, "VALIDATION_ERROR", "Password must be at least 8 characters", "password")
    }

    const normalizedEmail = email.trim().toLowerCase()

    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } })
    if (existing) {
      if (existing.isVerified) {
        return sendError(res, 409, "EMAIL_EXISTS", "Email already registered. Please login instead.")
      }

      const otp = generateOTP()
      await prisma.otp.deleteMany({ where: { email: normalizedEmail } })
      await prisma.otp.create({
        data: {
          email: normalizedEmail,
          otp,
          expiresAt: new Date(Date.now() + 15 * 60 * 1000)
        }
      })

      try {
        await sendOtpEmail(normalizedEmail, otp)
      } catch (emailErr) {
        console.error("Failed to resend verification OTP for existing unverified user:", emailErr)
        return sendError(
          res,
          503,
          "EMAIL_DELIVERY_FAILED",
          "Account exists but OTP email delivery failed. Please try resend in a moment."
        )
      }

      return sendSuccess(res, {
        message: "Account already exists but is not verified. A fresh OTP has been sent."
      })
    }

    const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS)

    await prisma.user.create({
      data: {
        name: name.trim(),
        email: normalizedEmail,
        password: hashedPassword,
        role: "PARTICIPANT",
        isVerified: false
      }
    })

    const otp = generateOTP()
    await prisma.otp.deleteMany({ where: { email: normalizedEmail } })
    await prisma.otp.create({
      data: {
        email: normalizedEmail,
        otp,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000)
      }
    })

    try {
      await sendOtpEmail(normalizedEmail, otp)
    } catch (emailErr) {
      console.error("Failed to send verification OTP email:", emailErr)

      // Roll back signup state so user can retry without hitting EMAIL_EXISTS.
      await prisma.$transaction([
        prisma.otp.deleteMany({ where: { email: normalizedEmail } }),
        prisma.user.deleteMany({ where: { email: normalizedEmail } })
      ])

      return sendError(
        res,
        503,
        "EMAIL_DELIVERY_FAILED",
        "Unable to deliver verification OTP right now. Please try resend in a moment."
      )
    }

    return sendSuccess(res, { message: "Account created. Please verify your email." }, 201)
  } catch (err) {
    console.error("Signup error:", err)
    return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Signup failed")
  }
}

// ─── POST /api/auth/resend-verification ────────────────────────

export const resendVerification = async (req, res) => {
  try {
    const { email } = req.body || {}

    if (!isValidEmail(email)) {
      return sendError(res, 400, "VALIDATION_ERROR", "Valid email is required", "email")
    }

    const normalizedEmail = email.trim().toLowerCase()
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } })

    // Do not reveal account existence.
    if (!user || user.isVerified) {
      return sendSuccess(res, { message: "If your account is pending verification, a new code has been sent." })
    }

    const otp = generateOTP()
    await prisma.otp.deleteMany({ where: { email: normalizedEmail } })
    await prisma.otp.create({
      data: {
        email: normalizedEmail,
        otp,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000)
      }
    })

    try {
      await sendOtpEmail(normalizedEmail, otp)
    } catch (emailErr) {
      console.error("Failed to resend verification OTP email:", emailErr)
      return sendError(
        res,
        503,
        "EMAIL_DELIVERY_FAILED",
        "Unable to deliver verification OTP right now. Please check sender settings and try again."
      )
    }

    return sendSuccess(res, { message: "Verification code sent. Please check your inbox." })
  } catch (err) {
    console.error("Resend verification error:", err)
    return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Failed to resend verification code")
  }
}

// ─── POST /api/auth/verify-email ───────────────────────────────

export const verifyEmail = async (req, res) => {
  try {
    const { email, otp } = req.body || {}

    if (!isValidEmail(email) || !isNonEmptyString(otp)) {
      return sendError(res, 400, "VALIDATION_ERROR", "Email and OTP are required")
    }

    const normalizedEmail = email.trim().toLowerCase()
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } })

    if (!user) {
      return sendError(res, 400, "INVALID_OTP", "Invalid OTP")
    }

    if (user.isVerified) {
      return sendSuccess(res, { message: "Email already verified." })
    }

    const record = await prisma.otp.findFirst({
      where: { email: normalizedEmail, otp: String(otp).trim() },
      orderBy: { createdAt: "desc" }
    })

    if (!record || record.expiresAt < new Date()) {
      return sendError(res, 400, "INVALID_OTP", "Invalid or expired OTP")
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { isVerified: true }
      }),
      prisma.otp.deleteMany({ where: { email: normalizedEmail } })
    ])

    const { accessToken, refreshToken, refreshTokenMaxAgeMs, sessionExpiresAt } = await createSessionTokens({
      userId: user.id,
      role: user.role
    })

    res.cookie("refreshToken", refreshToken, getCookieOptions(refreshTokenMaxAgeMs))

    return sendSuccess(res, {
      accessToken,
      sessionExpiresAt,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        isVerified: true
      }
    })
  } catch (err) {
    console.error("Verify email error:", err)
    return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Email verification failed")
  }
}

// ─── POST /api/auth/login ───────────────────────────────────────

export const login = async (req, res) => {
  try {
    const { email, password } = req.body || {}

    if (!isValidEmail(email) || !isNonEmptyString(password)) {
      return sendError(res, 400, "VALIDATION_ERROR", "Valid email and password are required")
    }

    const normalizedEmail = email.trim().toLowerCase()
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } })

    if (!user) {
      return sendError(res, 401, "INVALID_CREDENTIALS", "Invalid credentials")
    }

    const isMatch = await bcrypt.compare(password, user.password)
    if (!isMatch) {
      return sendError(res, 401, "INVALID_CREDENTIALS", "Invalid credentials")
    }

    // Allow admin accounts to authenticate directly from DB even if email verification is pending.
    const isAdminAccount = ADMIN_ROLES.has(user.role)
    if (!user.isVerified && !isAdminAccount) {
      return sendError(res, 403, "NOT_VERIFIED", "Email not verified")
    }

    const { accessToken, refreshToken, refreshTokenMaxAgeMs, sessionExpiresAt } = await createSessionTokens({
      userId: user.id,
      role: user.role
    })

    res.cookie("refreshToken", refreshToken, getCookieOptions(refreshTokenMaxAgeMs))

    return sendSuccess(res, {
      accessToken,
      sessionExpiresAt,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        isVerified: user.isVerified
      }
    })
  } catch (err) {
    console.error("Login error:", err)
    return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Login failed")
  }
}

// ─── POST /api/auth/logout ──────────────────────────────────────

export const logout = async (req, res) => {
  try {
    const token = req.cookies.refreshToken

    if (token) {
      await prisma.refreshToken.deleteMany({ where: { token } })
    }

    clearRefreshCookie(res)

    return sendSuccess(res, { message: "Logged out" })
  } catch (err) {
    console.error("Logout error:", err)
    return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Logout failed")
  }
}

// ─── POST /api/auth/refresh ─────────────────────────────────────

export const refresh = async (req, res) => {
  try {
    const token = req.cookies.refreshToken

    if (!token) {
      return sendError(res, 401, "INVALID_REFRESH", "No refresh token provided")
    }

    let decoded
    try {
      decoded = verifyRefreshToken(token)
    } catch {
      return sendError(res, 401, "INVALID_REFRESH", "Invalid refresh token")
    }

    if (!decoded?.tokenId || !decoded?.userId) {
      clearRefreshCookie(res)
      return sendError(res, 401, "INVALID_REFRESH", "Malformed refresh token")
    }

    if (typeof decoded.sessionExp === "number" && Date.now() >= decoded.sessionExp * 1000) {
      await prisma.refreshToken.deleteMany({ where: { id: decoded.tokenId } })
      clearRefreshCookie(res)
      return sendError(res, 401, "SESSION_EXPIRED", "Session expired. Please log in again")
    }

    const existing = await prisma.refreshToken.findUnique({ where: { id: decoded.tokenId } })

    if (!existing || existing.token !== token) {
      clearRefreshCookie(res)
      return sendError(res, 401, "INVALID_REFRESH", "Refresh token rotated or not found")
    }

    if (existing.expiresAt < new Date()) {
      await prisma.refreshToken.deleteMany({ where: { id: existing.id } })
      clearRefreshCookie(res)
      return sendError(res, 401, "INVALID_REFRESH", "Refresh token expired")
    }

    // Fetch current user for up-to-date role
    const user = await prisma.user.findUnique({ where: { id: decoded.userId } })
    if (!user) {
      await prisma.refreshToken.deleteMany({ where: { id: decoded.tokenId } })
      clearRefreshCookie(res)
      return sendError(res, 401, "INVALID_REFRESH", "User not found")
    }

    const {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      refreshTokenMaxAgeMs,
      sessionExpiresAt
    } = await createSessionTokens({
      userId: user.id,
      role: user.role,
      existingTokenId: existing.id,
      sessionExp: decoded.sessionExp
    })

    res.cookie("refreshToken", newRefreshToken, getCookieOptions(refreshTokenMaxAgeMs))

    return sendSuccess(res, {
      accessToken: newAccessToken,
      sessionExpiresAt
    })
  } catch (err) {
    console.error("Refresh token error:", err)
    if (err?.message === "SESSION_EXPIRED") {
      clearRefreshCookie(res)
      return sendError(res, 401, "SESSION_EXPIRED", "Session expired. Please log in again")
    }
    return sendError(res, 401, "INVALID_REFRESH", "Invalid refresh token")
  }
}

// ─── POST /api/auth/forgot-password ─────────────────────────────

export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body || {}

    // Always return 200 — no email enumeration
    if (!isValidEmail(email)) {
      return sendSuccess(res, { message: "If account exists, OTP sent" })
    }

    const normalizedEmail = email.trim().toLowerCase()
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } })

    if (user) {
      const otp = generateOTP()

      await prisma.otp.deleteMany({ where: { email: normalizedEmail } })
      await prisma.otp.create({
        data: {
          email: normalizedEmail,
          otp,
          expiresAt: new Date(Date.now() + 15 * 60 * 1000)
        }
      })

      try {
        await sendOtpEmail(normalizedEmail, otp)
      } catch (emailErr) {
        console.error("Failed to send OTP email:", emailErr)
      }
    }

    return sendSuccess(res, { message: "If account exists, OTP sent" })
  } catch (err) {
    console.error("Forgot password error:", err)
    return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Failed to process")
  }
}

// ─── POST /api/auth/verify-otp ──────────────────────────────────

export const verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body || {}

    if (!isValidEmail(email) || !isNonEmptyString(otp)) {
      return sendError(res, 400, "VALIDATION_ERROR", "Email and OTP are required")
    }

    const normalizedEmail = email.trim().toLowerCase()

    const record = await prisma.otp.findFirst({
      where: { email: normalizedEmail, otp: String(otp).trim() },
      orderBy: { createdAt: "desc" }
    })

    if (!record) {
      return sendError(res, 400, "INVALID_OTP", "Invalid OTP")
    }

    if (record.expiresAt < new Date()) {
      return sendError(res, 400, "INVALID_OTP", "OTP expired")
    }

    // PRD: Generate short-lived resetToken (10min JWT with email)
    const resetToken = signResetToken(normalizedEmail)

    return sendSuccess(res, { verified: true, resetToken })
  } catch (err) {
    console.error("Verify OTP error:", err)
    return sendError(res, 500, "INTERNAL_SERVER_ERROR", "OTP verification failed")
  }
}

// ─── POST /api/auth/reset-password ──────────────────────────────

export const resetPassword = async (req, res) => {
  try {
    const { resetToken, newPassword } = req.body || {}

    if (!isNonEmptyString(resetToken)) {
      return sendError(res, 401, "INVALID_RESET_TOKEN", "Reset token is required")
    }

    if (!isNonEmptyString(newPassword) || newPassword.length < 8) {
      return sendError(res, 422, "VALIDATION_ERROR", "Password must be at least 8 characters", "newPassword")
    }

    let decoded
    try {
      decoded = verifyResetToken(resetToken)
    } catch {
      return sendError(res, 401, "INVALID_RESET_TOKEN", "Invalid or expired reset token")
    }

    const user = await prisma.user.findUnique({ where: { email: decoded.email } })
    if (!user) {
      return sendError(res, 401, "INVALID_RESET_TOKEN", "User not found")
    }

    const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_ROUNDS)

    await prisma.$transaction([
      prisma.user.update({
        where: { email: decoded.email },
        data: { password: hashedPassword }
      }),
      prisma.otp.deleteMany({ where: { email: decoded.email } }),
      prisma.refreshToken.deleteMany({ where: { userId: user.id } })
    ])

    return sendSuccess(res, { message: "Password reset successful" })
  } catch (err) {
    console.error("Reset password error:", err)
    return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Reset password failed")
  }
}

// ─── POST /api/auth/setup-password ──────────────────────────────

export const setupPassword = async (req, res) => {
  try {
    const { token, password } = req.body || {}

    if (!isNonEmptyString(token)) {
      return sendError(res, 401, "INVALID_SETUP_TOKEN", "Setup token is required")
    }

    if (!isNonEmptyString(password) || password.length < 8) {
      return sendError(res, 422, "VALIDATION_ERROR", "Password must be at least 8 characters", "password")
    }

    const setupToken = await prisma.setupPasswordToken.findUnique({
      where: { token: token.trim() },
      include: { user: true }
    })

    if (!setupToken || setupToken.usedAt || setupToken.expiresAt < new Date()) {
      return sendError(res, 401, "INVALID_SETUP_TOKEN", "Invalid, expired, or already used token")
    }

    const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS)

    const user = await prisma.$transaction(async (tx) => {
      const updatedUser = await tx.user.update({
        where: { id: setupToken.userId },
        data: {
          password: hashedPassword,
          isVerified: true
        }
      })

      await tx.setupPasswordToken.update({
        where: { id: setupToken.id },
        data: { usedAt: new Date() }
      })

      return updatedUser
    })

    // PRD: Auto-login — return accessToken + set refreshToken cookie
    const { accessToken, refreshToken, refreshTokenMaxAgeMs, sessionExpiresAt } = await createSessionTokens({
      userId: user.id,
      role: user.role
    })

    res.cookie("refreshToken", refreshToken, getCookieOptions(refreshTokenMaxAgeMs))

    return sendSuccess(res, {
      accessToken,
      sessionExpiresAt,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        isVerified: user.isVerified
      }
    })
  } catch (err) {
    console.error("Setup password error:", err)
    return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Failed to setup password")
  }
}

// ─── POST /api/auth/admin/change-email/request-otp ─────────────

export const requestAdminEmailChangeOtp = async (req, res) => {
  try {
    if (!ensureAdminActor(req, res)) return

    const { newEmail } = req.body || {}
    if (!isValidEmail(newEmail)) {
      return sendError(res, 422, "VALIDATION_ERROR", "Valid new email is required", "newEmail")
    }

    const normalizedEmail = newEmail.trim().toLowerCase()
    if (normalizedEmail === req.user.email?.trim().toLowerCase()) {
      return sendError(res, 422, "VALIDATION_ERROR", "New email must be different from current email", "newEmail")
    }

    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } })
    if (existing) {
      return sendError(res, 409, "EMAIL_EXISTS", "Email already in use", "newEmail")
    }

    const otp = generateOTP()
    await prisma.otp.deleteMany({ where: { email: normalizedEmail } })
    await prisma.otp.create({
      data: {
        email: normalizedEmail,
        otp,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000)
      }
    })

    await sendOtpEmail(normalizedEmail, otp)

    return sendSuccess(res, { message: "OTP sent to the new admin email." })
  } catch (err) {
    console.error("requestAdminEmailChangeOtp error:", err)
    return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Failed to send OTP")
  }
}

// ─── POST /api/auth/admin/change-email/verify ──────────────────

export const verifyAdminEmailChange = async (req, res) => {
  try {
    if (!ensureAdminActor(req, res)) return

    const { newEmail, otp } = req.body || {}
    if (!isValidEmail(newEmail) || !isNonEmptyString(otp)) {
      return sendError(res, 422, "VALIDATION_ERROR", "New email and OTP are required")
    }

    const normalizedEmail = newEmail.trim().toLowerCase()
    const currentEmail = req.user.email?.trim().toLowerCase()
    if (normalizedEmail === currentEmail) {
      return sendError(res, 422, "VALIDATION_ERROR", "New email must be different from current email", "newEmail")
    }

    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } })
    if (existing) {
      return sendError(res, 409, "EMAIL_EXISTS", "Email already in use", "newEmail")
    }

    const record = await prisma.otp.findFirst({
      where: { email: normalizedEmail, otp: String(otp).trim() },
      orderBy: { createdAt: "desc" }
    })

    if (!record || record.expiresAt < new Date()) {
      return sendError(res, 400, "INVALID_OTP", "Invalid or expired OTP")
    }

    const updated = await prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: req.user.id },
        data: { email: normalizedEmail, isVerified: true },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          avatar: true,
          isVerified: true
        }
      })

      await tx.otp.deleteMany({ where: { email: normalizedEmail } })
      return user
    })

    return sendSuccess(res, { message: "Admin email updated successfully", user: updated })
  } catch (err) {
    console.error("verifyAdminEmailChange error:", err)
    return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Failed to update email")
  }
}

// ─── POST /api/auth/admin/change-password/request-otp ──────────

export const requestAdminPasswordChangeOtp = async (req, res) => {
  try {
    if (!ensureAdminActor(req, res)) return

    const normalizedEmail = req.user.email?.trim().toLowerCase()
    if (!isValidEmail(normalizedEmail)) {
      return sendError(res, 422, "VALIDATION_ERROR", "Admin email is invalid")
    }

    const otp = generateOTP()
    await prisma.otp.deleteMany({ where: { email: normalizedEmail } })
    await prisma.otp.create({
      data: {
        email: normalizedEmail,
        otp,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000)
      }
    })

    await sendOtpEmail(normalizedEmail, otp)

    return sendSuccess(res, { message: "OTP sent to current admin email." })
  } catch (err) {
    console.error("requestAdminPasswordChangeOtp error:", err)
    return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Failed to send OTP")
  }
}

// ─── POST /api/auth/admin/change-password/confirm ──────────────

export const confirmAdminPasswordChange = async (req, res) => {
  try {
    if (!ensureAdminActor(req, res)) return

    const { otp, newPassword } = req.body || {}
    if (!isNonEmptyString(otp) || !isNonEmptyString(newPassword)) {
      return sendError(res, 422, "VALIDATION_ERROR", "OTP and new password are required")
    }

    if (newPassword.length < 8) {
      return sendError(res, 422, "VALIDATION_ERROR", "Password must be at least 8 characters", "newPassword")
    }

    const normalizedEmail = req.user.email?.trim().toLowerCase()
    const record = await prisma.otp.findFirst({
      where: { email: normalizedEmail, otp: String(otp).trim() },
      orderBy: { createdAt: "desc" }
    })

    if (!record || record.expiresAt < new Date()) {
      return sendError(res, 400, "INVALID_OTP", "Invalid or expired OTP")
    }

    const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_ROUNDS)

    await prisma.$transaction([
      prisma.user.update({
        where: { id: req.user.id },
        data: { password: hashedPassword }
      }),
      prisma.otp.deleteMany({ where: { email: normalizedEmail } }),
      prisma.refreshToken.deleteMany({ where: { userId: req.user.id } })
    ])

    clearRefreshCookie(res)
    return sendSuccess(res, { message: "Password updated successfully. Please log in again." })
  } catch (err) {
    console.error("confirmAdminPasswordChange error:", err)
    return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Failed to update password")
  }
}

// ─── GET /api/auth/me ───────────────────────────────────────────

export const me = async (req, res) => {
  try {
    return sendSuccess(res, {
      id: req.user.id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
      avatar: req.user.avatar,
      phone: req.user.phone,
      institution: req.user.institution,
      year: req.user.year,
      branch: req.user.branch,
      rollNo: req.user.rollNo,
      isVerified: req.user.isVerified
    })
  } catch (err) {
    console.error("Me error:", err)
    return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Failed to fetch current user")
  }
}
