import prisma from "../utils/prisma.js"
import { sendError, sendSuccess, sendPaginated } from "../utils/response.js"
import { sendBatchTemplatedEmails, buildEmailVariables } from "../services/email.service.js"

// ─── GET /api/admin/events/:slug/submissions ────────────────────

export const getSubmissions = async (req, res) => {
  try {
    const { slug } = req.params
    const { round: roundId, track: trackId, status: submissionStatus, reviewer, page = "1", limit = "20" } = req.query

    const event = await prisma.event.findUnique({ where: { slug } })
    if (!event) return sendError(res, 404, "EVENT_NOT_FOUND", "Event not found")

    const pageNum = Math.max(1, parseInt(page) || 1)
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20))

    const where = { eventId: event.id }
    if (roundId) where.roundId = roundId
    if (trackId) where.trackId = trackId
    if (reviewer) where.reviewedBy = reviewer

    const [total, submissions] = await prisma.$transaction([
      prisma.submission.count({ where }),
      prisma.submission.findMany({
        where,
        include: {
          team: { select: { teamName: true, registrationId: true } },
          registration: {
            select: { registrationId: true, user: { select: { name: true } } }
          },
          round: { select: { name: true } },
          trackRef: { select: { name: true } }
        },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        orderBy: { submittedAt: "desc" }
      })
    ])

    const items = submissions.map(s => ({
      id: s.id,
      teamName: s.team?.teamName || null,
      participantName: s.registration?.user?.name || null,
      registrationId: s.team?.registrationId || s.registration?.registrationId || null,
      roundName: s.round?.name || null,
      trackName: s.trackRef?.name || null,
      type: s.type,
      storageKey: s.storageKey,
      fileUrl: s.fileUrl,
      fileName: s.fileName,
      fileSize: s.fileSize,
      externalLink: s.externalLink,
      reviewedBy: s.reviewedBy,
      score: s.score,
      reviewNotes: s.reviewNotes,
      submittedAt: s.submittedAt
    }))

    // Filter by submission status
    let filteredItems = items
    if (submissionStatus === "submitted") {
      filteredItems = items// already submitted (they're in the table)
    }

    // Stats
    const totalSubmitted = total
    const reviewed = submissions.filter(s => s.reviewedBy).length
    const pendingReview = totalSubmitted - reviewed
    const avgScore = submissions.filter(s => s.score != null).length > 0
      ? submissions.filter(s => s.score != null).reduce((sum, s) => sum + s.score, 0) / submissions.filter(s => s.score != null).length
      : null

    return res.status(200).json({
      success: true,
      data: {
        items: filteredItems,
        total,
        page: pageNum,
        limit: limitNum,
        stats: { totalSubmitted, pendingReview, reviewed, avgScore }
      }
    })
  } catch (err) {
    console.error("getSubmissions error:", err)
    return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Failed to fetch submissions")
  }
}

// ─── PATCH /api/admin/events/:slug/submissions/:id ──────────────

export const updateSubmission = async (req, res) => {
  try {
    const { id } = req.params
    const { reviewNotes, reviewedBy, score, track } = req.body

    const updateData = {}
    if (reviewNotes !== undefined) updateData.reviewNotes = reviewNotes
    if (reviewedBy !== undefined) updateData.reviewedBy = reviewedBy
    if (score !== undefined) updateData.score = score
    if (track !== undefined) updateData.track = track

    const submission = await prisma.submission.update({
      where: { id },
      data: updateData
    })

    return sendSuccess(res, submission)
  } catch (err) {
    console.error("updateSubmission error:", err)
    return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Failed to update submission")
  }
}

// ─── GET /api/admin/events/:slug/submissions/export ─────────────

export const exportSubmissions = async (req, res) => {
  try {
    const { slug } = req.params
    const event = await prisma.event.findUnique({ where: { slug } })
    if (!event) return sendError(res, 404, "EVENT_NOT_FOUND", "Event not found")

    const submissions = await prisma.submission.findMany({
      where: { eventId: event.id, fileUrl: { not: null } },
      include: {
        team: { select: { registrationId: true } },
        registration: { select: { registrationId: true } },
        round: { select: { name: true } }
      }
    })

    const rows = submissions.map((s) => ({
      "Registration ID": s.team?.registrationId || s.registration?.registrationId || "unknown",
      "Round": s.round?.name || "general",
      "File Name": s.fileName || "",
      "File Size": s.fileSize || "",
      "File URL": s.fileUrl || ""
    }))

    if (rows.length === 0) {
      res.setHeader("Content-Type", "text/csv")
      res.setHeader("Content-Disposition", `attachment; filename="${slug}_submissions.csv"`)
      res.setHeader("X-File-Name", `${slug}_submissions.csv`)
      return res.send("No submissions")
    }

    const allKeys = [...new Set(rows.flatMap((row) => Object.keys(row)))]
    const header = allKeys.join(",")
    const csvRows = rows.map((row) =>
      allKeys
        .map((key) => {
          const value = row[key] || ""
          return `"${String(value).replace(/"/g, '""')}"`
        })
        .join(",")
    )

    const csv = [header, ...csvRows].join("\n")

    res.setHeader("Content-Type", "text/csv")
    res.setHeader("Content-Disposition", `attachment; filename="${slug}_submissions.csv"`)
    res.setHeader("X-File-Name", `${slug}_submissions.csv`)
    return res.send(csv)
  } catch (err) {
    console.error("exportSubmissions error:", err)
    return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Failed to export submissions")
  }
}

// ─── POST /api/admin/events/:slug/submissions/reminders ─────────

export const sendSubmissionReminders = async (req, res) => {
  try {
    const { slug } = req.params
    const { ids } = req.body || {}

    if (!Array.isArray(ids) || ids.length === 0) {
      return sendError(res, 400, "VALIDATION_ERROR", "ids array is required")
    }

    const event = await prisma.event.findUnique({ where: { slug } })
    if (!event) return sendError(res, 404, "EVENT_NOT_FOUND", "Event not found")

    const submissions = await prisma.submission.findMany({
      where: { id: { in: ids }, eventId: event.id },
      include: {
        round: { select: { submissionDeadline: true } },
        team: {
          select: {
            registrationId: true,
            teamName: true,
            members: { where: { isLead: true }, select: { name: true, email: true } }
          }
        },
        registration: {
          select: {
            registrationId: true,
            user: { select: { name: true, email: true } }
          }
        }
      }
    })

    const recipients = submissions
      .map((submission) => {
        const lead = submission.team?.members?.[0]
        const recipientName = lead?.name || submission.registration?.user?.name
        const recipientEmail = lead?.email || submission.registration?.user?.email
        const registrationId = submission.team?.registrationId || submission.registration?.registrationId || ""
        if (!recipientEmail) return null

        const variables = buildEmailVariables({
          user: { name: recipientName },
          event,
          registrationId,
          teamName: submission.team?.teamName || ""
        })
        variables.submissionDeadline = submission.round?.submissionDeadline
          ? new Date(submission.round.submissionDeadline).toISOString()
          : ""

        return {
          email: recipientEmail,
          variables
        }
      })
      .filter(Boolean)

    if (recipients.length === 0) {
      return sendSuccess(res, { sent: 0, failed: 0, message: "No recipients found" })
    }

    const result = await sendBatchTemplatedEmails({
      templateId: "SUBMISSION_REMINDER",
      recipients,
      eventId: event.id
    })

    return sendSuccess(res, result)
  } catch (err) {
    console.error("sendSubmissionReminders error:", err)
    return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Failed to send reminders")
  }
}
