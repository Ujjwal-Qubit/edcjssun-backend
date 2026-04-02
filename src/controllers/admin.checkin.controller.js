import prisma from "../utils/prisma.js"
import { sendError, sendSuccess } from "../utils/response.js"

// ─── GET /api/admin/events/:slug/checkin ────────────────────────

export const getCheckInDashboard = async (req, res) => {
  try {
    const { slug } = req.params
    const event = await prisma.event.findUnique({ where: { slug } })
    if (!event) return sendError(res, 404, "EVENT_NOT_FOUND", "Event not found")

    const [
      soloTotal, soloCheckedIn,
      teamTotal, teamCheckedIn
    ] = await Promise.all([
      prisma.registration.count({ where: { eventId: event.id, status: { in: ["SHORTLISTED", "CHECKED_IN"] } } }),
      prisma.registration.count({ where: { eventId: event.id, checkInStatus: true } }),
      prisma.team.count({ where: { eventId: event.id, status: { in: ["SHORTLISTED", "CHECKED_IN"] } } }),
      prisma.team.count({ where: { eventId: event.id, checkInStatus: true } })
    ])

    const expected = soloTotal + teamTotal
    const checkedIn = soloCheckedIn + teamCheckedIn

    // Get recent check-in log
    const recentSoloCheckins = await prisma.registration.findMany({
      where: { eventId: event.id, checkInStatus: true },
      include: { user: { select: { name: true } } },
      orderBy: { checkInTime: "desc" },
      take: 50
    })

    const recentTeamCheckins = await prisma.team.findMany({
      where: { eventId: event.id, checkInStatus: true },
      include: { members: { where: { isLead: true }, select: { name: true } } },
      orderBy: { checkInTime: "desc" },
      take: 50
    })

    const log = [
      ...recentSoloCheckins.map(r => ({
        time: r.checkInTime,
        name: r.user?.name || "Unknown",
        registrationId: r.registrationId,
        type: "solo",
        staff: null
      })),
      ...recentTeamCheckins.map(t => ({
        time: t.checkInTime,
        name: t.members[0]?.name || t.teamName,
        registrationId: t.registrationId,
        type: "team",
        staff: null
      }))
    ].sort((a, b) => new Date(b.time) - new Date(a.time)).slice(0, 50)

    return sendSuccess(res, {
      stats: { expected, checkedIn, notYet: expected - checkedIn, walkIns: 0 },
      log
    })
  } catch (err) {
    console.error("getCheckInDashboard error:", err)
    return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Failed to fetch check-in data")
  }
}

// ─── POST /api/admin/events/:slug/checkin/scan ──────────────────

export const scanQr = async (req, res) => {
  try {
    const { slug } = req.params
    const { qrToken } = req.body

    if (!qrToken) {
      return sendError(res, 400, "VALIDATION_ERROR", "qrToken is required")
    }

    const event = await prisma.event.findUnique({ where: { slug } })
    if (!event) return sendError(res, 404, "EVENT_NOT_FOUND", "Event not found")

    // Find by QR token — check Registration first, then Team
    let record = await prisma.registration.findFirst({
      where: { qrCode: qrToken, eventId: event.id },
      include: { user: { select: { name: true } } }
    })
    let recordType = "solo"

    if (!record) {
      record = await prisma.team.findFirst({
        where: { qrCode: qrToken, eventId: event.id },
        include: { members: { where: { isLead: true }, select: { name: true } } }
      })
      recordType = "team"
    }

    if (!record) {
      return sendError(res, 404, "INVALID_QR", "QR code not recognized")
    }

    // Already checked in?
    if (record.checkInStatus) {
      return sendError(res, 409, "ALREADY_CHECKED_IN", "Already checked in", null, {
        name: recordType === "solo" ? record.user?.name : record.members?.[0]?.name || record.teamName,
        checkInTime: record.checkInTime
      })
    }

    // Validate status
    const validStatuses = ["SHORTLISTED", "PENDING"]
    if (!validStatuses.includes(record.status)) {
      return sendError(res, 403, "NOT_ELIGIBLE", `Cannot check in with status: ${record.status}`)
    }

    // Update
    const updateData = {
      checkInStatus: true,
      checkInTime: new Date(),
      status: "CHECKED_IN"
    }

    if (recordType === "solo") {
      await prisma.registration.update({ where: { id: record.id }, data: updateData })
      return sendSuccess(res, {
        name: record.user?.name,
        registrationId: record.registrationId,
        checkInTime: updateData.checkInTime
      })
    } else {
      await prisma.team.update({ where: { id: record.id }, data: updateData })
      return sendSuccess(res, {
        name: record.members?.[0]?.name || record.teamName,
        registrationId: record.registrationId,
        teamName: record.teamName,
        checkInTime: updateData.checkInTime
      })
    }
  } catch (err) {
    console.error("scanQr error:", err)
    return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Failed to process QR scan")
  }
}

// ─── GET /api/admin/events/:slug/checkin/export ─────────────────

export const exportCheckIn = async (req, res) => {
  try {
    const { slug } = req.params
    const event = await prisma.event.findUnique({ where: { slug } })
    if (!event) return sendError(res, 404, "EVENT_NOT_FOUND", "Event not found")

    const rows = []

    const soloCheckins = await prisma.registration.findMany({
      where: { eventId: event.id, checkInStatus: true },
      include: { user: { select: { name: true } } }
    })

    for (const r of soloCheckins) {
      rows.push({
        Name: r.user?.name || "",
        "Reg ID": r.registrationId,
        Type: "Solo",
        "Check-In Time": r.checkInTime?.toISOString() || "",
        Method: "QR"
      })
    }

    const teamCheckins = await prisma.team.findMany({
      where: { eventId: event.id, checkInStatus: true },
      include: { members: { where: { isLead: true }, select: { name: true } } }
    })

    for (const t of teamCheckins) {
      rows.push({
        Name: t.members[0]?.name || t.teamName,
        "Reg ID": t.registrationId,
        Type: "Team",
        "Check-In Time": t.checkInTime?.toISOString() || "",
        Method: "QR"
      })
    }

    if (rows.length === 0) {
      res.setHeader("Content-Type", "text/csv")
      res.setHeader("Content-Disposition", `attachment; filename="${slug}_checkin.csv"`)
      return res.send("No check-ins")
    }

    const headers = Object.keys(rows[0])
    const csv = [
      headers.join(","),
      ...rows.map(r => headers.map(h => `"${String(r[h] || "").replace(/"/g, '""')}"`).join(","))
    ].join("\n")

    res.setHeader("Content-Type", "text/csv")
    res.setHeader("Content-Disposition", `attachment; filename="${slug}_checkin.csv"`)
    return res.send(csv)
  } catch (err) {
    console.error("exportCheckIn error:", err)
    return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Failed to export check-in data")
  }
}
