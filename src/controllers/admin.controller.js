import prisma from "../utils/prisma.js"
import { sendError, sendSuccess, sendPaginated } from "../utils/response.js"

// ─── GET /api/admin/stats ───────────────────────────────────────

export const getStats = async (req, res) => {
  try {
    const [totalEvents, activeEvents, totalSoloRegistrations, totalTeams, totalTeamMembers] = await Promise.all([
      prisma.event.count(),
      prisma.event.count({ where: { status: { in: ["UPCOMING", "REGISTRATION_OPEN", "ONGOING"] } } }),
      prisma.registration.count(),
      prisma.team.count(),
      prisma.teamMember.count()
    ])

    return sendSuccess(res, {
      totalEvents,
      activeEvents,
      totalRegistrations: totalSoloRegistrations + totalTeams,
      totalParticipants: totalSoloRegistrations + totalTeamMembers
    })
  } catch (err) {
    console.error("getStats error:", err)
    return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Failed to fetch stats")
  }
}

// ─── GET /api/admin/events ──────────────────────────────────────

export const getAdminEvents = async (req, res) => {
  try {
    const events = await prisma.event.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: { registrations: true, teams: true }
        }
      }
    })

    const items = events.map(e => ({
      id: e.id,
      slug: e.slug,
      title: e.title,
      eventDate: e.eventDate,
      mode: e.mode,
      registrationMode: e.registrationMode,
      status: e.status,
      participationMode: e.participationMode,
      isPublic: e.isPublic,
      registrationCount: e._count.registrations + e._count.teams
    }))

    return sendSuccess(res, { items })
  } catch (err) {
    console.error("getAdminEvents error:", err)
    return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Failed to fetch events")
  }
}

// ─── POST /api/admin/events ─────────────────────────────────────

export const createEvent = async (req, res) => {
  try {
    const data = req.body

    // Check slug uniqueness
    const existing = await prisma.event.findUnique({ where: { slug: data.slug } })
    if (existing) {
      return sendError(res, 409, "SLUG_EXISTS", "Event slug already exists", "slug")
    }

    const event = await prisma.$transaction(async (tx) => {
      // Create Event
      const newEvent = await tx.event.create({
        data: {
          slug: data.slug,
          title: data.title,
          tagline: data.tagline || null,
          description: data.description,
          coverImage: data.coverImage || null,
          logo: data.logo || null,
          venue: data.venue,
          mode: data.mode || "IN_PERSON",
          eventDate: new Date(data.eventDate),
          eventEndDate: data.eventEndDate ? new Date(data.eventEndDate) : null,
          registrationMode: data.registrationMode || "OPEN_ACCESS",
          participationMode: data.participationMode || "TEAM_ONLY",
          registrationOpen: data.registrationOpen || false,
          registrationDeadline: data.registrationDeadline ? new Date(data.registrationDeadline) : null,
          teamSizeMin: data.teamSizeMin || 1,
          teamSizeMax: data.teamSizeMax || 4,
          maxParticipants: data.maxParticipants || null,
          entryFee: data.entryFee || 0,
          eligibility: data.eligibility || null,
          requiresCheckIn: data.requiresCheckIn || false,
          hasJudging: data.hasJudging || false,
          hasTracks: data.hasTracks || false,
          auctionEnabled: data.auctionEnabled || false,
          status: data.status || "DRAFT",
          isPublic: data.isPublic || false,
          prizePool: data.prizePool || null,
          createdBy: req.user.id
        }
      })

      // Create Rounds
      if (Array.isArray(data.rounds)) {
        for (const round of data.rounds) {
          const createdRound = await tx.round.create({
            data: {
              eventId: newEvent.id,
              order: round.order,
              name: round.name,
              description: round.description || null,
              startTime: round.startTime ? new Date(round.startTime) : null,
              endTime: round.endTime ? new Date(round.endTime) : null,
              roundType: round.roundType,
              submissionRequired: round.submissionRequired || false,
              submissionType: round.submissionType || null,
              submissionDeadline: round.submissionDeadline ? new Date(round.submissionDeadline) : null,
              maxFileSize: round.maxFileSize || null,
              acceptedFileTypes: round.acceptedFileTypes || null,
              isActive: round.isActive !== undefined ? round.isActive : false
            }
          })

          // Create judging criteria if hasJudging
          if (data.hasJudging && Array.isArray(round.criteria)) {
            for (const criterion of round.criteria) {
              await tx.judgingCriteria.create({
                data: {
                  roundId: createdRound.id,
                  name: criterion.name,
                  description: criterion.description || null,
                  maxScore: criterion.maxScore || 10,
                  weight: criterion.weight || 1.0,
                  order: criterion.order
                }
              })
            }
          }
        }
      }

      // Create Prizes
      if (Array.isArray(data.prizes)) {
        for (const prize of data.prizes) {
          await tx.prize.create({
            data: {
              eventId: newEvent.id,
              rank: prize.rank,
              label: prize.label,
              amount: prize.amount,
              perks: prize.perks || "",
              trackId: prize.trackId || null
            }
          })
        }
      }

      // Create Tracks
      if (data.hasTracks && Array.isArray(data.tracks)) {
        for (const track of data.tracks) {
          await tx.track.create({
            data: {
              eventId: newEvent.id,
              name: track.name,
              description: track.description || null,
              prizes: track.prizes || null,
              order: track.order
            }
          })
        }
      }

      // Create EventSettings with defaults
      await tx.eventSettings.create({
        data: {
          id: newEvent.id,
          registrationOpen: data.registrationOpen || false,
          updatedBy: req.user.id
        }
      })

      return newEvent
    })

    const fullEvent = await prisma.event.findUnique({
      where: { id: event.id },
      include: {
        rounds: { include: { judgingCriteria: { orderBy: { order: "asc" } } } },
        prizes: true,
        tracks: true,
        settings: true
      }
    })

    return sendSuccess(res, { event: fullEvent }, 201)
  } catch (err) {
    console.error("createEvent error:", err)
    return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Failed to create event")
  }
}

// ─── GET /api/admin/events/:slug ────────────────────────────────

export const getAdminEventBySlug = async (req, res) => {
  try {
    const { slug } = req.params

    const event = await prisma.event.findUnique({
      where: { slug },
      include: {
        rounds: {
          orderBy: { order: "asc" },
          include: { judgingCriteria: { orderBy: { order: "asc" } } }
        },
        prizes: { orderBy: { rank: "asc" } },
        tracks: { orderBy: { order: "asc" } },
        settings: true,
        judges: {
          include: { user: { select: { avatar: true, email: true } } }
        }
      }
    })

    if (!event) {
      return sendError(res, 404, "EVENT_NOT_FOUND", "Event not found")
    }

    // Compute stats
    const [totalRegistrations, shortlisted, totalSubmissions, checkedIn] = await Promise.all([
      prisma.registration.count({ where: { eventId: event.id } }).then(sc =>
        prisma.team.count({ where: { eventId: event.id } }).then(tc => sc + tc)
      ),
      Promise.all([
        prisma.registration.count({ where: { eventId: event.id, status: "SHORTLISTED" } }),
        prisma.team.count({ where: { eventId: event.id, status: "SHORTLISTED" } })
      ]).then(([s, t]) => s + t),
      prisma.submission.count({ where: { eventId: event.id } }),
      Promise.all([
        prisma.registration.count({ where: { eventId: event.id, checkInStatus: true } }),
        prisma.team.count({ where: { eventId: event.id, checkInStatus: true } })
      ]).then(([s, t]) => s + t)
    ])

    const daysToEvent = Math.ceil((new Date(event.eventDate) - new Date()) / 86400000)

    return sendSuccess(res, {
      ...event,
      stats: {
        totalRegistrations,
        shortlisted,
        submitted: totalSubmissions,
        checkedIn,
        daysToEvent
      }
    })
  } catch (err) {
    console.error("getAdminEventBySlug error:", err)
    return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Failed to fetch event")
  }
}

// ─── PATCH /api/admin/events/:slug ──────────────────────────────

export const updateEvent = async (req, res) => {
  try {
    const { slug } = req.params
    const data = req.body

    const event = await prisma.event.findUnique({ where: { slug } })
    if (!event) {
      return sendError(res, 404, "EVENT_NOT_FOUND", "Event not found")
    }

    // Build update data — only include provided fields
    const updateData = {}
    const allowedFields = [
      "title", "tagline", "description", "coverImage", "logo", "venue", "mode",
      "registrationMode", "participationMode", "registrationOpen", "teamSizeMin",
      "teamSizeMax", "maxParticipants", "entryFee", "eligibility", "requiresCheckIn",
      "hasJudging", "hasTracks", "auctionEnabled", "status", "isPublic", "prizePool"
    ]

    for (const field of allowedFields) {
      if (data[field] !== undefined) {
        updateData[field] = data[field]
      }
    }

    if (data.eventDate) updateData.eventDate = new Date(data.eventDate)
    if (data.eventEndDate) updateData.eventEndDate = new Date(data.eventEndDate)
    if (data.registrationDeadline !== undefined) {
      updateData.registrationDeadline = data.registrationDeadline ? new Date(data.registrationDeadline) : null
    }

    const updated = await prisma.event.update({
      where: { slug },
      data: updateData
    })

    return sendSuccess(res, updated)
  } catch (err) {
    console.error("updateEvent error:", err)
    return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Failed to update event")
  }
}

// ─── PATCH /api/admin/events/:slug/settings ─────────────────────

export const updateEventSettings = async (req, res) => {
  try {
    const { slug } = req.params
    const { toggles, deadlines, limits, communications, automation } = req.body

    const event = await prisma.event.findUnique({ where: { slug } })
    if (!event) {
      return sendError(res, 404, "EVENT_NOT_FOUND", "Event not found")
    }

    // Build settings update
    const settingsUpdate = { updatedBy: req.user.id }

    if (toggles) {
      if (toggles.registrationOpen !== undefined) settingsUpdate.registrationOpen = toggles.registrationOpen
      if (toggles.submissionsOpen !== undefined) settingsUpdate.submissionsOpen = toggles.submissionsOpen
      if (toggles.leaderboardVisible !== undefined) settingsUpdate.leaderboardVisible = toggles.leaderboardVisible
      if (toggles.resultsPublished !== undefined) settingsUpdate.resultsPublished = toggles.resultsPublished
      if (toggles.checkInEnabled !== undefined) settingsUpdate.checkInEnabled = toggles.checkInEnabled
      if (toggles.judgingOpen !== undefined) settingsUpdate.judgingOpen = toggles.judgingOpen
    }

    if (deadlines) {
      if (deadlines.registrationDeadline !== undefined) {
        settingsUpdate.registrationDeadline = deadlines.registrationDeadline ? new Date(deadlines.registrationDeadline) : null
      }
      if (deadlines.checkInOpenTime !== undefined) {
        settingsUpdate.checkInOpenTime = deadlines.checkInOpenTime ? new Date(deadlines.checkInOpenTime) : null
      }
    }

    if (communications) {
      if (communications.notifyOnRegistration !== undefined) settingsUpdate.notifyOnRegistration = communications.notifyOnRegistration
      if (communications.notifyOnStatusChange !== undefined) settingsUpdate.notifyOnStatusChange = communications.notifyOnStatusChange
      if (communications.notifyOnSubmission !== undefined) settingsUpdate.notifyOnSubmission = communications.notifyOnSubmission
      if (communications.reminderHoursBefore !== undefined) settingsUpdate.reminderHoursBefore = communications.reminderHoursBefore
    }

    if (automation) {
      if (automation.autoCloseRegistration !== undefined) settingsUpdate.autoCloseRegistration = automation.autoCloseRegistration
      if (automation.autoOpenSubmissions !== undefined) settingsUpdate.autoOpenSubmissions = automation.autoOpenSubmissions
    }

    // Update or create settings
    const settings = await prisma.eventSettings.upsert({
      where: { id: event.id },
      create: { id: event.id, ...settingsUpdate },
      update: settingsUpdate
    })

    // limits fields update the Event model, not EventSettings
    if (limits) {
      const eventUpdate = {}
      if (limits.teamSizeMin !== undefined) eventUpdate.teamSizeMin = limits.teamSizeMin
      if (limits.teamSizeMax !== undefined) eventUpdate.teamSizeMax = limits.teamSizeMax
      if (limits.maxParticipants !== undefined) eventUpdate.maxParticipants = limits.maxParticipants
      if (limits.maxTeamsPerProblem !== undefined) {
        await prisma.eventSettings.update({
          where: { id: event.id },
          data: { maxTeamsPerProblem: limits.maxTeamsPerProblem }
        })
      }
      if (Object.keys(eventUpdate).length > 0) {
        await prisma.event.update({ where: { id: event.id }, data: eventUpdate })
      }
    }

    // Also sync registrationOpen toggle to Event model
    if (toggles?.registrationOpen !== undefined) {
      await prisma.event.update({
        where: { id: event.id },
        data: { registrationOpen: toggles.registrationOpen }
      })
    }

    // Return in structured format
    const updatedEvent = await prisma.event.findUnique({ where: { id: event.id } })
    const updatedSettings = await prisma.eventSettings.findUnique({ where: { id: event.id } })

    return sendSuccess(res, {
      toggles: {
        registrationOpen: updatedSettings.registrationOpen,
        submissionsOpen: updatedSettings.submissionsOpen,
        leaderboardVisible: updatedSettings.leaderboardVisible,
        resultsPublished: updatedSettings.resultsPublished,
        checkInEnabled: updatedSettings.checkInEnabled,
        judgingOpen: updatedSettings.judgingOpen
      },
      deadlines: {
        registrationDeadline: updatedSettings.registrationDeadline,
        checkInOpenTime: updatedSettings.checkInOpenTime
      },
      limits: {
        maxTeamsPerProblem: updatedSettings.maxTeamsPerProblem,
        teamSizeMin: updatedEvent.teamSizeMin,
        teamSizeMax: updatedEvent.teamSizeMax,
        maxParticipants: updatedEvent.maxParticipants
      },
      communications: {
        notifyOnRegistration: updatedSettings.notifyOnRegistration,
        notifyOnStatusChange: updatedSettings.notifyOnStatusChange,
        notifyOnSubmission: updatedSettings.notifyOnSubmission,
        reminderHoursBefore: updatedSettings.reminderHoursBefore
      },
      automation: {
        autoCloseRegistration: updatedSettings.autoCloseRegistration,
        autoOpenSubmissions: updatedSettings.autoOpenSubmissions
      }
    })
  } catch (err) {
    console.error("updateEventSettings error:", err)
    return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Failed to update settings")
  }
}
