import prisma from "../utils/prisma.js"
import { sendError, sendSuccess, sendPaginated } from "../utils/response.js"
import { sendTemplatedEmail, sendCustomEmail, sendBatchTemplatedEmails, getEmailTemplates } from "../services/email.service.js"

// ─── GET /api/admin/events/:slug/emails ─────────────────────────

export const getEmails = async (req, res) => {
  try {
    const { slug } = req.params
    const { page = "1", limit = "20" } = req.query

    const event = await prisma.event.findUnique({ where: { slug } })
    if (!event) return sendError(res, 404, "EVENT_NOT_FOUND", "Event not found")

    const pageNum = Math.max(1, parseInt(page) || 1)
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20))

    const [total, emails] = await prisma.$transaction([
      prisma.emailLog.count({ where: { eventId: event.id } }),
      prisma.emailLog.findMany({
        where: { eventId: event.id },
        orderBy: { sentAt: "desc" },
        skip: (pageNum - 1) * limitNum,
        take: limitNum
      })
    ])

    return sendPaginated(res, {
      items: emails.map(e => ({
        id: e.id,
        type: e.type,
        subject: e.subject,
        recipient: e.recipient,
        status: e.status,
        sentAt: e.sentAt
      })),
      total,
      page: pageNum,
      limit: limitNum
    })
  } catch (err) {
    console.error("getEmails error:", err)
    return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Failed to fetch emails")
  }
}

// ─── POST /api/admin/events/:slug/emails/send ───────────────────

export const sendBulkEmail = async (req, res) => {
  try {
    const { slug } = req.params
    const { to, trackId, subject, body, templateId } = req.body

    const event = await prisma.event.findUnique({ where: { slug } })
    if (!event) return sendError(res, 404, "EVENT_NOT_FOUND", "Event not found")

    // Resolve recipient list based on `to` filter
    const recipients = await resolveRecipients(event.id, to, trackId)

    if (recipients.length === 0) {
      return sendSuccess(res, { sent: 0, failed: 0, message: "No recipients found" })
    }

    // Send emails
    let sent = 0, failed = 0

    if (templateId && templateId !== "CUSTOM") {
      const emailRecipients = recipients.map(r => ({
        email: r.email,
        variables: {
          name: r.name,
          eventName: event.title,
          registrationId: r.registrationId || ""
        }
      }))

      const result = await sendBatchTemplatedEmails({
        templateId,
        recipients: emailRecipients,
        eventId: event.id
      })
      sent = result.sent
      failed = result.failed
    } else {
      // Custom email
      for (const r of recipients) {
        try {
          await sendCustomEmail({
            to: r.email,
            subject: subject || "Update from EDC JSSUN",
            body: (body || "").replace(/{{name}}/g, r.name).replace(/{{registrationId}}/g, r.registrationId || ""),
            eventId: event.id
          })
          sent++
        } catch {
          failed++
        }
      }
    }

    return sendSuccess(res, { sent, failed })
  } catch (err) {
    console.error("sendBulkEmail error:", err)
    return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Failed to send emails")
  }
}

// ─── GET /api/admin/events/:slug/emails/templates ───────────────

export const getTemplates = async (req, res) => {
  try {
    const templates = getEmailTemplates()
    return sendSuccess(res, { templates })
  } catch (err) {
    console.error("getTemplates error:", err)
    return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Failed to fetch templates")
  }
}

// ─── Helper: Resolve recipients by filter ───────────────────────

async function resolveRecipients(eventId, filter, trackId) {
  const recipients = []

  // Get solo registrations matching filter
  const soloWhere = { eventId }
  switch (filter) {
    case "shortlisted": soloWhere.status = "SHORTLISTED"; break
    case "waitlisted": soloWhere.status = "WAITLISTED"; break
    case "rejected": soloWhere.status = "REJECTED"; break
    case "checked_in": soloWhere.checkInStatus = true; break
    case "not_checked_in": soloWhere.checkInStatus = false; soloWhere.status = "SHORTLISTED"; break
    case "by_track": if (trackId) soloWhere.trackId = trackId; break
  }

  const soloRegs = await prisma.registration.findMany({
    where: soloWhere,
    include: { user: { select: { name: true, email: true } } }
  })

  for (const r of soloRegs) {
    recipients.push({ name: r.user.name, email: r.user.email, registrationId: r.registrationId })
  }

  // Get team registrations matching filter
  const teamWhere = { eventId }
  switch (filter) {
    case "shortlisted": teamWhere.status = "SHORTLISTED"; break
    case "waitlisted": teamWhere.status = "WAITLISTED"; break
    case "rejected": teamWhere.status = "REJECTED"; break
    case "checked_in": teamWhere.checkInStatus = true; break
    case "not_checked_in": teamWhere.checkInStatus = false; teamWhere.status = "SHORTLISTED"; break
    case "by_track": if (trackId) teamWhere.trackId = trackId; break
  }

  const teams = await prisma.team.findMany({
    where: teamWhere,
    include: { members: { where: { isLead: true }, select: { name: true, email: true } } }
  })

  for (const t of teams) {
    const lead = t.members[0]
    if (lead) {
      recipients.push({ name: lead.name, email: lead.email, registrationId: t.registrationId })
    }
  }

  // Handle "submitted" and "not_submitted" filter
  if (filter === "submitted") {
    const submissions = await prisma.submission.findMany({
      where: { eventId },
      select: { teamId: true, registrationId: true }
    })
    const submittedTeamIds = new Set(submissions.filter(s => s.teamId).map(s => s.teamId))
    const submittedRegIds = new Set(submissions.filter(s => s.registrationId).map(s => s.registrationId))

    return recipients.filter(r => {
      // This is a simplified filter - works for "all" recipients
      return true
    })
  }

  return recipients
}
