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

const IS_PRODUCTION = process.env.NODE_ENV === "production"

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: IS_PRODUCTION,
  sameSite: IS_PRODUCTION ? "None" : "Lax",
  domain: process.env.COOKIE_DOMAIN || undefined,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: "/"
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
      return sendError(res, 409, "EMAIL_EXISTS", "Email already registered")
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

    // TODO: Send verification email (verify endpoint undefined in PRD)

    return sendSuccess(res, { message: "Account created. Please verify your email." }, 201)
  } catch (err) {
    console.error("Signup error:", err)
    return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Signup failed")
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

    // PRD: isVerified check
    if (!user.isVerified) {
      return sendError(res, 403, "NOT_VERIFIED", "Email not verified")
    }

    // Create refresh token in DB
    const dbToken = await prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: crypto.randomBytes(32).toString("hex"),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }
    })

    const accessToken = signAccessToken({ userId: user.id, role: user.role })
    const refreshToken = signRefreshToken({ userId: user.id, tokenId: dbToken.id })

    // Update DB token with signed JWT
    await prisma.refreshToken.update({
      where: { id: dbToken.id },
      data: { token: refreshToken }
    })

    res.cookie("refreshToken", refreshToken, COOKIE_OPTIONS)

    return sendSuccess(res, {
      accessToken,
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

    res.clearCookie("refreshToken", COOKIE_OPTIONS)

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

    const existing = await prisma.refreshToken.findUnique({ where: { token } })
    if (!existing || existing.expiresAt < new Date()) {
      return sendError(res, 401, "INVALID_REFRESH", "Refresh token expired or not found")
    }

    // Fetch current user for up-to-date role
    const user = await prisma.user.findUnique({ where: { id: decoded.userId } })
    if (!user) {
      return sendError(res, 401, "INVALID_REFRESH", "User not found")
    }

    const newAccessToken = signAccessToken({ userId: user.id, role: user.role })

    return sendSuccess(res, { accessToken: newAccessToken })
  } catch (err) {
    console.error("Refresh token error:", err)
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
    const dbToken = await prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: crypto.randomBytes(32).toString("hex"),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }
    })

    const accessToken = signAccessToken({ userId: user.id, role: user.role })
    const refreshToken = signRefreshToken({ userId: user.id, tokenId: dbToken.id })

    await prisma.refreshToken.update({
      where: { id: dbToken.id },
      data: { token: refreshToken }
    })

    res.cookie("refreshToken", refreshToken, COOKIE_OPTIONS)

    return sendSuccess(res, {
      accessToken,
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
