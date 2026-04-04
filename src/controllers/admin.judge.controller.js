import crypto from "crypto"
import bcrypt from "bcryptjs"
import prisma from "../utils/prisma.js"
import { sendError, sendSuccess } from "../utils/response.js"
import { sendTemplatedEmail, sendSetupPasswordEmail } from "../services/email.service.js"
import { aggregateAndRank } from "../services/scoring.service.js"

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173"

// ─── GET /api/admin/events/:slug/judges ─────────────────────────

export const getJudges = async (req, res) => {
  try {
    const { slug } = req.params
    const event = await prisma.event.findUnique({ where: { slug } })
    if (!event) return sendError(res, 404, "EVENT_NOT_FOUND", "Event not found")

    const judges = await prisma.judgeAssignment.findMany({
      where: { eventId: event.id },
      include: {
        user: { select: { email: true, avatar: true } },
        scores: { select: { id: true } }
      }
    })

    const items = judges.map(j => ({
      id: j.id,
      userId: j.userId,
      name: j.name,
      email: j.user.email,
      bio: j.bio,
      avatar: j.user.avatar,
      trackId: j.trackId,
      isActive: j.isActive,
      totalScores: j.scores.length
    }))

    return sendSuccess(res, { judges: items })
  } catch (err) {
    console.error("getJudges error:", err)
    return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Failed to fetch judges")
  }
}

// ─── POST /api/admin/events/:slug/judges ────────────────────────

export const addJudge = async (req, res) => {
  try {
    const { slug } = req.params
    const { name, email, bio, trackId } = req.body

    const event = await prisma.event.findUnique({ where: { slug } })
    if (!event) return sendError(res, 404, "EVENT_NOT_FOUND", "Event not found")

    const normalizedEmail = email.trim().toLowerCase()

    // Find or create user with JUDGE role
    let user = await prisma.user.findUnique({ where: { email: normalizedEmail } })
    let isNewUser = false
    let setupTokenValue = null

    if (!user) {
      isNewUser = true
      const tempPassword = crypto.randomBytes(18).toString("hex")
      const hashedPassword = await bcrypt.hash(tempPassword, 12)

      user = await prisma.user.create({
        data: {
          name,
          email: normalizedEmail,
          password: hashedPassword,
          role: "JUDGE",
          isVerified: false
        }
      })

      setupTokenValue = crypto.randomBytes(32).toString("hex")
      await prisma.setupPasswordToken.create({
        data: {
          userId: user.id,
          token: setupTokenValue,
          expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000)
        }
      })
    } else if (user.role === "PARTICIPANT") {
      // Upgrade role to JUDGE
      await prisma.user.update({
        where: { id: user.id },
        data: { role: "JUDGE" }
      })
    }

    // Create JudgeAssignment
    const existing = await prisma.judgeAssignment.findUnique({
      where: { eventId_userId: { eventId: event.id, userId: user.id } }
    })
    if (existing) {
      return sendError(res, 409, "JUDGE_ALREADY_ASSIGNED", "Judge already assigned to this event")
    }

    const assignment = await prisma.judgeAssignment.create({
      data: {
        eventId: event.id,
        userId: user.id,
        name,
        bio: bio || null,
        trackId: trackId || null
      }
    })

    // Send invite email
    if (isNewUser && setupTokenValue) {
      try {
        const setupLink = `${FRONTEND_URL}/auth/setup-password?token=${setupTokenValue}`
        await sendSetupPasswordEmail({
          email: normalizedEmail,
          setupLink,
          eventName: event.title,
          name
        })
      } catch {
        console.error("Judge invite email failed")
      }
    }

    return sendSuccess(res, assignment, 201)
  } catch (err) {
    console.error("addJudge error:", err)
    return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Failed to add judge")
  }
}

// ─── DELETE /api/admin/events/:slug/judges/:judgeId ─────────────

export const removeJudge = async (req, res) => {
  try {
    const { judgeId } = req.params

    // Delete scores first
    await prisma.judgeScore.deleteMany({ where: { judgeId } })
    await prisma.judgeAssignment.delete({ where: { id: judgeId } })

    return sendSuccess(res, { message: "Judge removed" })
  } catch (err) {
    console.error("removeJudge error:", err)
    return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Failed to remove judge")
  }
}

// ─── GET /api/admin/events/:slug/scores ─────────────────────────

export const getScores = async (req, res) => {
  try {
    const { slug } = req.params
    const event = await prisma.event.findUnique({ where: { slug } })
    if (!event) return sendError(res, 404, "EVENT_NOT_FOUND", "Event not found")

    // Get all submissions for this event
    const submissions = await prisma.submission.findMany({
      where: { eventId: event.id },
      include: {
        team: { select: { teamName: true, registrationId: true } },
        registration: { select: { registrationId: true, user: { select: { name: true } } } }
      }
    })

    // Get all scores
    const allScores = await prisma.judgeScore.findMany({
      where: { submission: { eventId: event.id } },
      include: {
        judge: { select: { name: true } },
        criteria: { select: { name: true, maxScore: true, weight: true } }
      }
    })

    // Get all criteria for this event's rounds
    const criteria = await prisma.judgingCriteria.findMany({
      where: { round: { eventId: event.id } }
    })

    // Aggregate and rank
    const rankings = aggregateAndRank(submissions, allScores, criteria)

    // Enrich with names
    const enriched = rankings.map(r => {
      const submission = submissions.find(s => s.id === r.submissionId)
      return {
        ...r,
        name: submission?.team?.teamName || submission?.registration?.user?.name || "Unknown",
        registrationId: submission?.team?.registrationId || submission?.registration?.registrationId || null
      }
    })

    return sendSuccess(res, { rankings: enriched })
  } catch (err) {
    console.error("getScores error:", err)
    return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Failed to fetch scores")
  }
}

// ─── POST /api/admin/events/:slug/results/publish ───────────────

export const publishResults = async (req, res) => {
  try {
    const { slug } = req.params
    const event = await prisma.event.findUnique({ where: { slug } })
    if (!event) return sendError(res, 404, "EVENT_NOT_FOUND", "Event not found")

    // Update settings
    await prisma.eventSettings.update({
      where: { id: event.id },
      data: { resultsPublished: true }
    })

    // Update relevant rounds
    await prisma.round.updateMany({
      where: { eventId: event.id },
      data: { resultsPublished: true }
    })

    // Send results email to all registered participants
    try {
      const soloRegs = await prisma.registration.findMany({
        where: { eventId: event.id },
        include: { user: { select: { name: true, email: true } } }
      })

      const teams = await prisma.team.findMany({
        where: { eventId: event.id },
        include: { members: { where: { isLead: true }, select: { name: true, email: true } } }
      })

      const recipients = [
        ...soloRegs.map(r => ({ email: r.user.email, variables: { name: r.user.name, eventName: event.title, dashboardUrl: `${FRONTEND_URL}/events/${event.slug}/dashboard` } })),
        ...teams.flatMap(t => t.members.map(m => ({ email: m.email, variables: { name: m.name, eventName: event.title, dashboardUrl: `${FRONTEND_URL}/events/${event.slug}/dashboard` } })))
      ]

      if (recipients.length > 0) {
        const { sendBatchTemplatedEmails } = await import("../services/email.service.js")
        await sendBatchTemplatedEmails({
          templateId: "RESULTS_ANNOUNCED",
          recipients,
          eventId: event.id
        })
      }
    } catch (emailErr) {
      console.error("Results email failed:", {
        message: emailErr?.message || "Unknown error",
        eventId: event.id,
        slug: event.slug,
        timestamp: new Date().toISOString()
      })
    }

    return sendSuccess(res, { message: "Results published" })
  } catch (err) {
    console.error("publishResults error:", err)
    return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Failed to publish results")
  }
}
