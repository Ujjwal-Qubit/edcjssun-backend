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

    const allowedFields = ["to", "templateId", "subject", "body", "trackId"]
    const unknownFields = Object.keys(req.body || {}).filter((key) => !allowedFields.includes(key))
    if (unknownFields.length > 0) {
      return sendError(res, 422, "VALIDATION_ERROR", `Unsupported fields: ${unknownFields.join(", ")}`)
    }

    const normalizedTo = normalizeRecipientFilter(to)
    if (!normalizedTo) {
      return sendError(res, 422, "VALIDATION_ERROR", "Invalid 'to' filter")
    }

    const normalizedTemplateId = typeof templateId === "string" ? templateId.trim() : "CUSTOM"
    const normalizedSubject = typeof subject === "string" ? subject.trim() : ""
    const normalizedBody = typeof body === "string" ? body.trim() : ""
    const normalizedTrackId = typeof trackId === "string" ? trackId.trim() : ""

    if (normalizedTo === "by_track" && !normalizedTrackId) {
      return sendError(res, 422, "VALIDATION_ERROR", "trackId is required when to='by_track'")
    }

    if (!normalizedTemplateId) {
      return sendError(res, 422, "VALIDATION_ERROR", "templateId is required")
    }

    if (normalizedTemplateId === "CUSTOM") {
      if (!normalizedSubject) {
        return sendError(res, 422, "VALIDATION_ERROR", "subject is required for CUSTOM template")
      }
      if (!normalizedBody) {
        return sendError(res, 422, "VALIDATION_ERROR", "body is required for CUSTOM template")
      }
    }

    const event = await prisma.event.findUnique({
      where: { slug },
      include: { settings: true }
    })
    if (!event) return sendError(res, 404, "EVENT_NOT_FOUND", "Event not found")

    if (isTemplateBlockedByCommunicationToggles(normalizedTemplateId, event.settings)) {
      return sendError(res, 403, "COMMUNICATION_DISABLED", "This communication type is disabled in event settings")
    }

    if (isRecipientFilterBlockedByCommunicationToggles(normalizedTo, event.settings)) {
      return sendError(res, 403, "COMMUNICATION_DISABLED", "This communication type is disabled in event settings")
    }

    // Resolve recipient list based on `to` filter
    const recipients = await resolveRecipients(event.id, normalizedTo, normalizedTrackId)

    if (recipients.length === 0) {
      return sendSuccess(res, { sent: 0, failed: 0, message: "No recipients found" })
    }

    // Send emails
    let sent = 0, failed = 0

    if (normalizedTemplateId && normalizedTemplateId !== "CUSTOM") {
      const emailRecipients = recipients.map(r => ({
        email: r.email,
        variables: {
          name: r.name,
          eventName: event.title,
          registrationId: r.registrationId || ""
        }
      }))

      const result = await sendBatchTemplatedEmails({
        templateId: normalizedTemplateId,
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
            subject: normalizedSubject || "Update from EDC JSSUN",
            body: normalizedBody.replace(/{{name}}/g, r.name).replace(/{{registrationId}}/g, r.registrationId || ""),
            eventId: event.id
          })
          sent++
        } catch {
          failed++
        }
      }
    }

    return sendSuccess(res, {
      sent,
      failed,
      status: "Delivered",
      recipients: normalizedTo,
      subject: normalizedSubject || normalizedTemplateId,
      time: new Date().toISOString()
    })
  } catch (err) {
    console.error("sendBulkEmail error:", {
      message: err?.message || "Unknown error",
      slug: req.params?.slug,
      adminUserId: req.user?.id,
      timestamp: new Date().toISOString()
    })
    return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Failed to send emails")
  }
}

// ─── POST /api/admin/events/:slug/updates ──────────────────────

export const postEventUpdate = async (req, res) => {
  try {
    const { slug } = req.params
    const { to, trackId, subject, body } = req.body

    const normalizedTo = normalizeRecipientFilter(to)
    if (!normalizedTo) {
      return sendError(res, 422, "VALIDATION_ERROR", "Invalid 'to' filter")
    }

    const normalizedTrackId = typeof trackId === "string" ? trackId.trim() : ""
    const normalizedSubject = typeof subject === "string" ? subject.trim() : ""
    const normalizedBody = typeof body === "string" ? body.trim() : ""

    if (!normalizedSubject) {
      return sendError(res, 422, "VALIDATION_ERROR", "subject is required")
    }
    if (!normalizedBody) {
      return sendError(res, 422, "VALIDATION_ERROR", "body is required")
    }
    if (normalizedTo === "by_track" && !normalizedTrackId) {
      return sendError(res, 422, "VALIDATION_ERROR", "trackId is required when to='by_track'")
    }

    const event = await prisma.event.findUnique({
      where: { slug },
      include: { settings: true }
    })
    if (!event) return sendError(res, 404, "EVENT_NOT_FOUND", "Event not found")

    if (isRecipientFilterBlockedByCommunicationToggles(normalizedTo, event.settings)) {
      return sendError(res, 403, "COMMUNICATION_DISABLED", "This communication type is disabled in event settings")
    }

    const recipients = await resolveRecipients(event.id, normalizedTo, normalizedTrackId)
    if (recipients.length === 0) {
      return sendSuccess(res, {
        posted: 0,
        status: "Posted",
        recipients: normalizedTo,
        subject: normalizedSubject,
        time: new Date().toISOString(),
        message: "No recipients found"
      })
    }

    await prisma.$transaction(
      recipients.map((recipient) =>
        prisma.emailLog.create({
          data: {
            eventId: event.id,
            recipient: recipient.email,
            type: "UPDATE_POST",
            subject: normalizedSubject,
            body: normalizedBody,
            status: "POSTED"
          }
        })
      )
    )

    return sendSuccess(res, {
      posted: recipients.length,
      status: "Posted",
      recipients: normalizedTo,
      subject: normalizedSubject,
      time: new Date().toISOString()
    })
  } catch (err) {
    console.error("postEventUpdate error:", {
      message: err?.message || "Unknown error",
      slug: req.params?.slug,
      adminUserId: req.user?.id,
      timestamp: new Date().toISOString()
    })
    return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Failed to post update")
  }
}

function normalizeRecipientFilter(value) {
  if (typeof value !== "string") return "all"

  const normalized = value.trim().toLowerCase()
  const allowed = new Set([
    "all",
    "shortlisted",
    "waitlisted",
    "rejected",
    "checked_in",
    "not_checked_in",
    "by_track",
    "submitted",
    "not_submitted"
  ])

  return allowed.has(normalized) ? normalized : null
}

function isTemplateBlockedByCommunicationToggles(templateId, settings) {
  if (!templateId || templateId === "CUSTOM") return false

  if (["SHORTLISTED", "REJECTED", "WAITLISTED"].includes(templateId)) {
    return settings?.notifyOnStatusChange === false
  }

  if (["PPT_REMINDER", "SUBMISSION_REMINDER", "SUBMISSION_RECEIVED"].includes(templateId)) {
    return settings?.notifyOnSubmission === false
  }

  if (["REGISTRATION_CONFIRMED", "APPLICATION_RECEIVED"].includes(templateId)) {
    return settings?.notifyOnRegistration === false
  }

  return false
}

function isRecipientFilterBlockedByCommunicationToggles(filter, settings) {
  if (["shortlisted", "waitlisted", "rejected"].includes(filter)) {
    return settings?.notifyOnStatusChange === false
  }

  if (["submitted", "not_submitted"].includes(filter)) {
    return settings?.notifyOnSubmission === false
  }

  return false
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
