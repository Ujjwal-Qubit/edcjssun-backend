import prisma from "../utils/prisma.js"
import { verifyAccessToken } from "../utils/jwt.js"
import { sendError } from "../utils/response.js"

/**
 * requireAuth — PRD spec:
 * 1. Extract Bearer token from Authorization header
 * 2. Verify JWT signature and expiry
 * 3. Load user from DB by userId in token
 * 4. Attach user to req.user
 * 5. Return 401 if token missing, invalid, expired, or user not found
 */
export const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return sendError(res, 401, "MISSING_TOKEN", "No Authorization header")
    }

    const token = authHeader.split(" ")[1]
    if (!token) {
      return sendError(res, 401, "MISSING_TOKEN", "Bearer token missing")
    }

    let decoded
    try {
      decoded = verifyAccessToken(token)
    } catch {
      return sendError(res, 401, "INVALID_TOKEN", "Invalid or expired token")
    }

    // DB lookup per PRD — ensures role changes take effect immediately
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        avatar: true,
        phone: true,
        institution: true,
        year: true,
        branch: true,
        rollNo: true,
        isVerified: true
      }
    })

    if (!user) {
      return sendError(res, 401, "USER_NOT_FOUND", "Token valid but user deleted")
    }

    req.user = user
    return next()
  } catch (err) {
    console.error("Auth middleware error:", err)
    return sendError(res, 401, "INVALID_TOKEN", "Invalid or expired token")
  }
}

/**
 * requireRole — Factory function: requireRole('EVENT_ADMIN', 'SUPER_ADMIN')
 */
export const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return sendError(res, 403, "INSUFFICIENT_ROLE", "Insufficient role permissions")
    }
    return next()
  }
}

/**
 * requireShortlisted — PRD spec:
 * Checks event registrationMode:
 *   OPEN_ACCESS → always eligible (skip status check)
 *   APPLICATION_REVIEW → status must be SHORTLISTED or CHECKED_IN
 *   INVITE_ONLY → status must be SHORTLISTED or CHECKED_IN
 * Looks up user's registration/team for this eventSlug
 */
export const requireShortlisted = async (req, res, next) => {
  try {
    const userId = req.user?.id
    if (!userId) {
      return sendError(res, 401, "MISSING_TOKEN", "Authentication required")
    }

    const slug = req.params.slug
    if (!slug) {
      return sendError(res, 400, "MISSING_SLUG", "Event slug is required")
    }

    const event = await prisma.event.findUnique({
      where: { slug },
      include: { settings: true }
    })

    if (!event) {
      return sendError(res, 404, "EVENT_NOT_FOUND", "Event not found")
    }

    const roundId = req.params.roundId
    let allowRegisteredForRoundOne = false
    if (roundId) {
      const round = await prisma.round.findFirst({
        where: { id: roundId, eventId: event.id },
        select: { order: true }
      })
      allowRegisteredForRoundOne = Number(round?.order) === 1
    }

    // Check solo registration first
    const soloReg = await prisma.registration.findUnique({
      where: { userId_eventId: { userId, eventId: event.id } }
    })

    if (soloReg) {
      // OPEN_ACCESS → always eligible
      if (event.registrationMode === "OPEN_ACCESS") {
        req.registration = soloReg
        req.registrationType = "solo"
        req.event = event
        return next()
      }
      if (allowRegisteredForRoundOne) {
        req.registration = soloReg
        req.registrationType = "solo"
        req.event = event
        return next()
      }
      if (soloReg.status === "SHORTLISTED" || soloReg.status === "CHECKED_IN") {
        req.registration = soloReg
        req.registrationType = "solo"
        req.event = event
        return next()
      }
      return sendError(res, 403, "NOT_ELIGIBLE", "Not eligible to submit")
    }

    // Check team registration
    const teamMember = await prisma.teamMember.findFirst({
      where: {
        userId,
        team: { eventId: event.id }
      },
      include: { team: true }
    })

    if (teamMember?.team) {
      if (event.registrationMode === "OPEN_ACCESS") {
        req.team = teamMember.team
        req.registrationType = "team"
        req.event = event
        return next()
      }
      if (allowRegisteredForRoundOne) {
        req.team = teamMember.team
        req.registrationType = "team"
        req.event = event
        return next()
      }
      if (teamMember.team.status === "SHORTLISTED" || teamMember.team.status === "CHECKED_IN") {
        req.team = teamMember.team
        req.registrationType = "team"
        req.event = event
        return next()
      }
      return sendError(res, 403, "NOT_ELIGIBLE", "Not eligible to submit")
    }

    return sendError(res, 404, "REGISTRATION_NOT_FOUND", "Not registered for this event")
  } catch (err) {
    console.error("requireShortlisted error:", err)
    return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Unable to verify eligibility")
  }
}

/**
 * requireAuctionAuth — Separate password-based auth for auction module
 * Uses X-Auction-Password header
 */
export const requireAuctionAuth = (req, res, next) => {
  const password = req.headers["x-auction-password"]
  const expectedPassword = process.env.AUCTION_PASSWORD

  if (!expectedPassword) {
    return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Auction not configured")
  }

  if (!password || password !== expectedPassword) {
    return sendError(res, 401, "INVALID_AUCTION_AUTH", "Invalid auction password")
  }

  return next()
}

/**
 * Global error handler — catches unhandled errors
 */
export const errorHandler = (err, req, res, _next) => {
  console.error("Unhandled error:", err.message)

  if (err.type === "entity.parse.failed") {
    return sendError(res, 400, "INVALID_JSON", "Malformed JSON request body")
  }

  if (err.message === "Not allowed by CORS") {
    return sendError(res, 403, "CORS_BLOCKED", "Origin not allowed")
  }

  // Multer file size error
  if (err.code === "LIMIT_FILE_SIZE") {
    return sendError(res, 422, "FILE_TOO_LARGE", "File exceeds maximum size limit")
  }

  // Multer file type error
  if (err.message === "Invalid file type") {
    return sendError(res, 422, "INVALID_FILE_TYPE", "File type not allowed")
  }

  return sendError(res, 500, "INTERNAL_SERVER_ERROR", "An unexpected error occurred")
}
