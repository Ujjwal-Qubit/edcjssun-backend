import prisma from "../utils/prisma.js"
import { sendError, sendSuccess, sendPaginated } from "../utils/response.js"
import { isValidStatusTransition } from "../utils/validators.js"
import { sendTemplatedEmail, sendBatchTemplatedEmails, buildEmailVariables } from "../services/email.service.js"
import { generateQrToken } from "../services/qr.service.js"
import { generateRegistrationId } from "../utils/generateRegistrationId.js"

// ─── GET /api/admin/events/:slug/registrations ──────────────────

export const getRegistrations = async (req, res) => {
  try {
    const { slug } = req.params
    const { status, year, branch, track, type, search, page = "1", limit = "20" } = req.query

    const event = await prisma.event.findUnique({ where: { slug } })
    if (!event) return sendError(res, 404, "EVENT_NOT_FOUND", "Event not found")

    const pageNum = Math.max(1, parseInt(page) || 1)
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20))

    // Fetch solo registrations
    let soloItems = []
    if (!type || type === "solo") {
      const soloWhere = { eventId: event.id }
      if (status) soloWhere.status = status

      const soloRegs = await prisma.registration.findMany({
        where: soloWhere,
        include: {
          user: { select: { name: true, email: true, year: true, branch: true, rollNo: true } },
          track: { select: { name: true } },
          submissions: { select: { id: true } }
        }
      })

      soloItems = soloRegs
        .filter(r => {
          if (year && r.user.year !== year) return false
          if (branch && r.user.branch !== branch) return false
          if (track && r.trackId !== track) return false
          if (search) {
            const q = search.toLowerCase()
            const match = (r.user.name || "").toLowerCase().includes(q) ||
              (r.user.email || "").toLowerCase().includes(q) ||
              (r.user.rollNo || "").toLowerCase().includes(q) ||
              (r.registrationId || "").toLowerCase().includes(q)
            if (!match) return false
          }
          return true
        })
        .map(r => ({
          id: r.id,
          type: "solo",
          registrationId: r.registrationId,
          name: r.user.name,
          size: 1,
          leadName: r.user.name,
          leadEmail: r.user.email,
          year: r.user.year,
          branch: r.user.branch,
          trackName: r.track?.name || null,
          status: r.status,
          checkInStatus: r.checkInStatus,
          hasSubmission: r.submissions.length > 0,
          submittedAt: r.submittedAt
        }))
    }

    // Fetch team registrations
    let teamItems = []
    if (!type || type === "team") {
      const teamWhere = { eventId: event.id }
      if (status) teamWhere.status = status

      const teams = await prisma.team.findMany({
        where: teamWhere,
        include: {
          members: { select: { name: true, email: true, year: true, branch: true, rollNo: true, isLead: true } },
          track: { select: { name: true } },
          submissions: { select: { id: true } }
        }
      })

      teamItems = teams
        .filter(t => {
          const lead = t.members.find(m => m.isLead)
          if (year && lead?.year !== year) return false
          if (branch && lead?.branch !== branch) return false
          if (track && t.trackId !== track) return false
          if (search) {
            const q = search.toLowerCase()
            const match = (t.teamName || "").toLowerCase().includes(q) ||
              (lead?.email || "").toLowerCase().includes(q) ||
              (lead?.rollNo || "").toLowerCase().includes(q) ||
              (t.registrationId || "").toLowerCase().includes(q) ||
              t.members.some(m => (m.name || "").toLowerCase().includes(q))
            if (!match) return false
          }
          return true
        })
        .map(t => {
          const lead = t.members.find(m => m.isLead)
          return {
            id: t.id,
            type: "team",
            registrationId: t.registrationId,
            name: t.teamName,
            size: t.teamSize,
            leadName: lead?.name || "",
            leadEmail: lead?.email || "",
            year: lead?.year || "",
            branch: lead?.branch || "",
            trackName: t.track?.name || null,
            status: t.status,
            checkInStatus: t.checkInStatus,
            hasSubmission: t.submissions.length > 0,
            submittedAt: t.submittedAt
          }
        })
    }

    // Merge and paginate
    const allItems = [...soloItems, ...teamItems].sort((a, b) =>
      new Date(b.submittedAt) - new Date(a.submittedAt)
    )

    const total = allItems.length
    const paginatedItems = allItems.slice((pageNum - 1) * limitNum, pageNum * limitNum)

    // Build filter options
    const allStatuses = [...new Set(allItems.map(i => i.status))]
    const allYears = [...new Set(allItems.map(i => i.year).filter(Boolean))]
    const allBranches = [...new Set(allItems.map(i => i.branch).filter(Boolean))]
    const tracks = await prisma.track.findMany({ where: { eventId: event.id }, select: { id: true, name: true } })

    return res.status(200).json({
      success: true,
      data: {
        items: paginatedItems,
        total,
        page: pageNum,
        limit: limitNum,
        filters: { statuses: allStatuses, years: allYears, branches: allBranches, tracks }
      }
    })
  } catch (err) {
    console.error("getRegistrations error:", err)
    return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Failed to fetch registrations")
  }
}

// ─── GET /api/admin/events/:slug/registrations/:id ──────────────

export const getRegistrationDetail = async (req, res) => {
  try {
    const { slug, id } = req.params

    const event = await prisma.event.findUnique({ where: { slug } })
    if (!event) return sendError(res, 404, "EVENT_NOT_FOUND", "Event not found")

    // Try team first
    const team = await prisma.team.findFirst({
      where: { id, eventId: event.id },
      include: {
        members: true,
        submissions: { include: { round: { select: { name: true } } } },
        track: { select: { name: true } }
      }
    })

    if (team) {
      const emailHistory = await prisma.emailLog.findMany({
        where: {
          eventId: event.id,
          recipient: { in: team.members.map(m => m.email) }
        },
        orderBy: { sentAt: "desc" },
        take: 50
      })

      return sendSuccess(res, {
        type: "team",
        ...team,
        trackName: team.track?.name,
        emailHistory
      })
    }

    // Try solo registration
    const registration = await prisma.registration.findFirst({
      where: { id, eventId: event.id },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true, rollNo: true, year: true, branch: true, institution: true } },
        submissions: { include: { round: { select: { name: true } } } },
        track: { select: { name: true } }
      }
    })

    if (registration) {
      const emailHistory = await prisma.emailLog.findMany({
        where: { eventId: event.id, recipient: registration.user.email },
        orderBy: { sentAt: "desc" },
        take: 50
      })

      return sendSuccess(res, {
        type: "solo",
        ...registration,
        trackName: registration.track?.name,
        emailHistory
      })
    }

    return sendError(res, 404, "REGISTRATION_NOT_FOUND", "Registration not found")
  } catch (err) {
    console.error("getRegistrationDetail error:", err)
    return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Failed to fetch registration")
  }
}

// ─── PATCH /api/admin/events/:slug/registrations/:id ────────────

export const updateRegistrationStatus = async (req, res) => {
  try {
    const { slug, id } = req.params
    const { status, notes } = req.body

    const event = await prisma.event.findUnique({
      where: { slug },
      include: { settings: true }
    })
    if (!event) return sendError(res, 404, "EVENT_NOT_FOUND", "Event not found")

    // Try team
    let record = await prisma.team.findFirst({ where: { id, eventId: event.id } })
    let recordType = "team"

    if (!record) {
      record = await prisma.registration.findFirst({ where: { id, eventId: event.id } })
      recordType = "solo"
    }

    if (!record) {
      return sendError(res, 404, "REGISTRATION_NOT_FOUND", "Registration not found")
    }

    // Validate status transition
    if (!isValidStatusTransition(record.status, status)) {
      return sendError(res, 422, "INVALID_STATUS_TRANSITION",
        `Cannot transition from ${record.status} to ${status}`)
    }

    // Update
    if (recordType === "team") {
      await prisma.team.update({
        where: { id },
        data: { status }
      })
    } else {
      await prisma.registration.update({
        where: { id },
        data: { status }
      })
    }

    // Send status email if enabled
    if (event.settings?.notifyOnStatusChange) {
      try {
        let recipientEmail, recipientName
        if (recordType === "team") {
          const lead = await prisma.teamMember.findFirst({
            where: { teamId: id, isLead: true }
          })
          recipientEmail = lead?.email
          recipientName = lead?.name
        } else {
          const user = await prisma.user.findUnique({ where: { id: record.userId } })
          recipientEmail = user?.email
          recipientName = user?.name
        }

        if (recipientEmail) {
          const templateMap = {
            SHORTLISTED: "SHORTLISTED",
            WAITLISTED: "WAITLISTED",
            REJECTED: "REJECTED"
          }

          const templateId = templateMap[status]
          if (templateId) {
            const variables = buildEmailVariables({
              user: { name: recipientName },
              event,
              registrationId: record.registrationId
            })
            variables.statusMessage = status === "SHORTLISTED"
              ? "You can now access your dashboard and submit deliverables."
              : ""

            await sendTemplatedEmail({
              templateId,
              to: recipientEmail,
              variables,
              eventId: event.id
            })
          }
        }
      } catch (emailErr) {
        console.error("Status email failed:", emailErr)
      }
    }

    return sendSuccess(res, { id, status, message: "Status updated" })
  } catch (err) {
    console.error("updateRegistrationStatus error:", err)
    return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Failed to update status")
  }
}

// ─── POST /api/admin/events/:slug/registrations/bulk ────────────

export const bulkUpdateStatus = async (req, res) => {
  try {
    const { slug } = req.params
    const { ids, status } = req.body
    const validStatuses = ["PENDING", "SHORTLISTED", "WAITLISTED", "REJECTED", "CHECKED_IN", "DISQUALIFIED"]

    if (!Array.isArray(ids) || ids.length === 0 || !status) {
      return sendError(res, 400, "VALIDATION_ERROR", "ids array and status are required")
    }

    if (!validStatuses.includes(status)) {
      return sendError(res, 422, "VALIDATION_ERROR", "Invalid status value", "status")
    }

    const event = await prisma.event.findUnique({
      where: { slug },
      include: { settings: true }
    })
    if (!event) return sendError(res, 404, "EVENT_NOT_FOUND", "Event not found")

    let updated = 0
    const emailRecipients = []

    await prisma.$transaction(async (tx) => {
      for (const id of ids) {
        // Try team
        let record = await tx.team.findFirst({ where: { id, eventId: event.id } })
        let recordType = "team"

        if (!record) {
          record = await tx.registration.findFirst({ where: { id, eventId: event.id } })
          recordType = "solo"
        }

        if (!record) continue
        if (!isValidStatusTransition(record.status, status)) continue

        if (recordType === "team") {
          await tx.team.update({ where: { id }, data: { status } })
          const lead = await tx.teamMember.findFirst({ where: { teamId: id, isLead: true } })
          if (lead) {
            emailRecipients.push({
              email: lead.email,
              variables: buildEmailVariables({
                user: { name: lead.name },
                event,
                registrationId: record.registrationId,
                teamName: record.teamName
              })
            })
          }
        } else {
          await tx.registration.update({ where: { id }, data: { status } })
          const user = await tx.user.findUnique({ where: { id: record.userId } })
          if (user) {
            emailRecipients.push({
              email: user.email,
              variables: buildEmailVariables({
                user,
                event,
                registrationId: record.registrationId
              })
            })
          }
        }
        updated++
      }
    })

    // Send batch emails
    let emailsSent = 0
    if (event.settings?.notifyOnStatusChange && emailRecipients.length > 0) {
      const templateMap = { SHORTLISTED: "SHORTLISTED", WAITLISTED: "WAITLISTED", REJECTED: "REJECTED" }
      const templateId = templateMap[status]
      if (templateId) {
        const result = await sendBatchTemplatedEmails({
          templateId,
          recipients: emailRecipients,
          eventId: event.id
        })
        emailsSent = result.sent
      }
    }

    return sendSuccess(res, { updated, emailsSent })
  } catch (err) {
    console.error("bulkUpdateStatus error:", err)
    return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Failed to bulk update")
  }
}

// ─── GET /api/admin/events/:slug/registrations/export ───────────

export const exportRegistrations = async (req, res) => {
  try {
    const { slug } = req.params

    const event = await prisma.event.findUnique({ where: { slug } })
    if (!event) return sendError(res, 404, "EVENT_NOT_FOUND", "Event not found")

    const rows = []

    // Solo registrations
    const soloRegs = await prisma.registration.findMany({
      where: { eventId: event.id },
      include: {
        user: { select: { name: true, email: true, phone: true, rollNo: true, year: true, branch: true } },
        track: { select: { name: true } }
      }
    })

    for (const r of soloRegs) {
      rows.push({
        "Reg ID": r.registrationId,
        "Type": "Solo",
        "Name": r.user.name,
        "Size": 1,
        "Status": r.status,
        "Track": r.track?.name || "",
        "Member 1 Name": r.user.name,
        "Member 1 Roll No": r.user.rollNo || "",
        "Member 1 Year": r.user.year || "",
        "Member 1 Branch": r.user.branch || "",
        "Member 1 Email": r.user.email,
        "Member 1 Phone": r.user.phone || "",
        "Submitted At": r.submittedAt?.toISOString() || ""
      })
    }

    // Team registrations
    const teams = await prisma.team.findMany({
      where: { eventId: event.id },
      include: {
        members: { orderBy: { isLead: "desc" } },
        track: { select: { name: true } }
      }
    })

    for (const t of teams) {
      const row = {
        "Reg ID": t.registrationId,
        "Type": "Team",
        "Name": t.teamName,
        "Size": t.teamSize,
        "Status": t.status,
        "Track": t.track?.name || "",
        "Submitted At": t.submittedAt?.toISOString() || ""
      }

      t.members.forEach((m, i) => {
        row[`Member ${i + 1} Name`] = m.name
        row[`Member ${i + 1} Roll No`] = m.rollNo || ""
        row[`Member ${i + 1} Year`] = m.year || ""
        row[`Member ${i + 1} Branch`] = m.branch || ""
        row[`Member ${i + 1} Email`] = m.email
        row[`Member ${i + 1} Phone`] = m.phone || ""
      })

      rows.push(row)
    }

    // Generate CSV
    if (rows.length === 0) {
      res.setHeader("Content-Type", "text/csv")
      res.setHeader("Content-Disposition", `attachment; filename="${slug}_registrations.csv"`)
      return res.send("No registrations")
    }

    const allKeys = [...new Set(rows.flatMap(r => Object.keys(r)))]
    const header = allKeys.join(",")
    const csvRows = rows.map(r =>
      allKeys.map(k => {
        const val = r[k] || ""
        return `"${String(val).replace(/"/g, '""')}"`
      }).join(",")
    )

    const csv = [header, ...csvRows].join("\n")

    res.setHeader("Content-Type", "text/csv")
    res.setHeader("Content-Disposition", `attachment; filename="${slug}_registrations.csv"`)
    return res.send(csv)
  } catch (err) {
    console.error("exportRegistrations error:", err)
    return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Failed to export registrations")
  }
}

// ─── POST /api/admin/events/:slug/registrations/checkin/:id ─────

export const manualCheckIn = async (req, res) => {
  try {
    const { slug, id } = req.params
    const { type: checkInType } = req.body // "manual" or "walkin"

    const event = await prisma.event.findUnique({ where: { slug } })
    if (!event) return sendError(res, 404, "EVENT_NOT_FOUND", "Event not found")

    // Walk-in: create a new registration
    if (checkInType === "walkin") {
      const settings = await prisma.eventSettings.findUnique({ where: { id: event.id } })
      if (!settings?.allowWalkIns) {
        return sendError(res, 403, "WALKINS_NOT_ALLOWED", "Walk-in registrations are not allowed")
      }

      // For walk-ins, we just create a registration with CHECKED_IN status
      const { name, email } = req.body
      if (!name || !email) {
        return sendError(res, 400, "VALIDATION_ERROR", "Name and email required for walk-ins")
      }

      // Find or create user
      let user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } })
      if (!user) {
        const crypto = await import("crypto")
        const bcrypt = await import("bcryptjs")
        const tempPassword = crypto.randomBytes(18).toString("hex")
        const hashedPassword = await bcrypt.hash(tempPassword, 12)
        user = await prisma.user.create({
          data: { name, email: email.trim().toLowerCase(), password: hashedPassword, isVerified: false }
        })
      }

      const regId = await prisma.$transaction(async (tx) => {
        return generateRegistrationId(tx, event.id, event.slug, "solo")
      })

      const registration = await prisma.registration.create({
        data: {
          registrationId: regId,
          eventId: event.id,
          userId: user.id,
          status: "CHECKED_IN",
          checkInStatus: true,
          checkInTime: new Date(),
          qrCode: generateQrToken()
        }
      })

      return sendSuccess(res, {
        checkInStatus: true,
        checkInTime: registration.checkInTime,
        registrationId: registration.registrationId
      })
    }

    // Regular manual check-in
    let record = await prisma.team.findFirst({ where: { id, eventId: event.id } })
    let recordType = "team"

    if (!record) {
      record = await prisma.registration.findFirst({ where: { id, eventId: event.id } })
      recordType = "solo"
    }

    if (!record) {
      return sendError(res, 404, "REGISTRATION_NOT_FOUND", "Registration not found")
    }

    if (record.checkInStatus) {
      return sendError(res, 409, "ALREADY_CHECKED_IN", "Already checked in", null, {
        checkInTime: record.checkInTime
      })
    }

    const updateData = {
      checkInStatus: true,
      checkInTime: new Date(),
      status: "CHECKED_IN"
    }

    if (recordType === "team") {
      await prisma.team.update({ where: { id }, data: updateData })
    } else {
      await prisma.registration.update({ where: { id }, data: updateData })
    }

    return sendSuccess(res, {
      checkInStatus: true,
      checkInTime: updateData.checkInTime
    })
  } catch (err) {
    console.error("manualCheckIn error:", err)
    return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Failed to check in")
  }
}
