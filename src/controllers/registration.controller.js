import { Prisma } from "@prisma/client"
import prisma from "../utils/prisma.js"
import { sendError, sendSuccess } from "../utils/response.js"
import { collectMemberValidationErrors, isNonEmptyString, validateSoloRegistration } from "../utils/validators.js"
import {
  sendTemplatedEmail,
  buildEmailVariables
} from "../services/email.service.js"
import { generateRegistrationId } from "../utils/generateRegistrationId.js"
import { generateQrToken } from "../services/qr.service.js"

// ─── POST /api/events/:slug/register ────────────────────────────

export const register = async (req, res) => {
  const { slug } = req.params

  try {
    const { type } = req.body || {}

    if (type === "solo") {
      return await handleSoloRegistration(req, res, slug)
    } else if (type === "team") {
      return await handleTeamRegistration(req, res, slug)
    } else {
      return sendError(res, 422, "VALIDATION_ERROR", "type must be 'solo' or 'team'", "type")
    }
  } catch (err) {
    return handleRegistrationError(res, err)
  }
}

// ─── Solo Registration ──────────────────────────────────────────

async function handleSoloRegistration(req, res, slug) {
  const { name, email, phone, rollNo, year, branch, institution, trackId, hearAboutUs } = req.body
  const authenticatedUserId = req.user?.id
  const authenticatedEmail = req.user?.email?.trim().toLowerCase()

  if (!authenticatedUserId || !authenticatedEmail) {
    throw createError(401, "MISSING_TOKEN", "Authentication required")
  }

  // Step 1: Load event
  const event = await loadAndValidateEvent(slug)

  // Step 2-3: Validate registration window + participation mode
  validateRegistrationWindow(event)
  if (event.participationMode === "TEAM_ONLY") {
    throw createError(422, "INVALID_PARTICIPATION_TYPE", "This event only accepts team registrations")
  }

  // Step 4: Validate capacity
  await validateCapacity(event)

  // Step 5: Validate payload
  const details = validateSoloRegistration({ name, email })
  if (Object.keys(details).length > 0) {
    throw createError(422, "VALIDATION_ERROR", "Validation failed", null, details)
  }

  const normalizedEmail = (email || "").trim().toLowerCase() || authenticatedEmail
  if (normalizedEmail !== authenticatedEmail) {
    throw createError(422, "VALIDATION_ERROR", "Registration email must match authenticated account", "email")
  }

  // Step 6: Validate track
  if (event.hasTracks && trackId) {
    const track = await prisma.track.findFirst({ where: { id: trackId, eventId: event.id } })
    if (!track) throw createError(422, "INVALID_TRACK", "Invalid track for this event")
  }

  // Step 6b: Check cross-registration (solo + team for same event)
  const existingSoloReg = await prisma.registration.findFirst({
    where: { userId: authenticatedUserId, eventId: event.id }
  })
  if (existingSoloReg) {
    throw createError(409, "ALREADY_REGISTERED", "Already registered for this event")
  }

  const existingTeamMember = await prisma.teamMember.findFirst({
    where: { userId: authenticatedUserId, team: { eventId: event.id } }
  })
  if (existingTeamMember) {
    throw createError(409, "ALREADY_REGISTERED", "Already registered in a team for this event")
  }

  // Step 7: Transaction
  let result = null
  let attempt = 0

  while (!result && attempt < 3) {
    try {
      result = await prisma.$transaction(async (tx) => {
        const registrationId = await generateRegistrationId(tx, event.id, event.slug, "solo")
        const initialStatus = determineInitialStatus(event.registrationMode)

        const userId = authenticatedUserId

        await tx.user.update({
          where: { id: userId },
          data: {
            name: isNonEmptyString(name) ? name.trim() : undefined,
            phone: isNonEmptyString(phone) ? phone.trim() : undefined,
            institution: isNonEmptyString(institution) ? institution.trim() : undefined,
            year: isNonEmptyString(year) ? String(year).trim() : undefined,
            branch: isNonEmptyString(branch) ? branch.trim() : undefined,
            rollNo: isNonEmptyString(rollNo) ? rollNo.trim() : undefined
          }
        })

        // Generate QR token if check-in required
        const qrCode = event.requiresCheckIn ? generateQrToken() : null

        // Create Registration record
        const registration = await tx.registration.create({
          data: {
            registrationId,
            eventId: event.id,
            userId,
            status: initialStatus,
            trackId: (event.hasTracks && trackId) ? trackId : null,
            hearAboutUs: hearAboutUs || null,
            qrCode
          }
        })

        return {
          registration,
          registrationId,
          email: authenticatedEmail,
          name: isNonEmptyString(name) ? name.trim() : (req.user?.name || "Participant"),
          qrCode
        }
      }, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable
      })
    } catch (txErr) {
      attempt++
      if ((txErr.code === "P2034" || txErr.code === "P2002") && attempt < 3) {
        continue
      }
      throw txErr
    }
  }

  // Step 8: Send emails (outside transaction)
  await sendPostRegistrationEmails(result, event)

  // Step 9: Return response
  return sendSuccess(res, {
    registrationId: result.registrationId,
    type: "solo",
    qrCode: result.qrCode,
    message: "Registration successful"
  }, 201)
}

// ─── Team Registration ──────────────────────────────────────────

async function handleTeamRegistration(req, res, slug) {
  const { teamName, teamSize, members, trackId, hearAboutUs } = req.body
  const authenticatedUserId = req.user?.id
  const authenticatedEmail = req.user?.email?.trim().toLowerCase()

  if (!authenticatedUserId || !authenticatedEmail) {
    throw createError(401, "MISSING_TOKEN", "Authentication required")
  }

  // Step 1: Load event
  const event = await loadAndValidateEvent(slug)

  // Step 2-3: Validate registration window + participation mode
  validateRegistrationWindow(event)
  if (event.participationMode === "SOLO_ONLY") {
    throw createError(422, "INVALID_PARTICIPATION_TYPE", "This event only accepts solo registrations")
  }

  // Step 4: Validate capacity
  await validateCapacity(event)

  // Step 5: Validate payload
  const details = {}
  const parsedTeamSize = Number(teamSize)

  if (!isNonEmptyString(teamName)) {
    details.teamName = "Team name is required"
  }

  if (!Number.isInteger(parsedTeamSize) || parsedTeamSize < 1) {
    details.teamSize = "Team size must be a positive integer"
  }

  if (parsedTeamSize < event.teamSizeMin || parsedTeamSize > event.teamSizeMax) {
    details.teamSize = `Team size must be between ${event.teamSizeMin} and ${event.teamSizeMax}`
  }

  const memberDetails = collectMemberValidationErrors(members)
  Object.assign(details, memberDetails)

  if (Array.isArray(members) && members.length > 0) {
    if (members.length !== parsedTeamSize) {
      details.members = "Members count must match declared team size"
    }

    const leadCount = members.filter(m => m?.isLead === true).length
    if (leadCount !== 1) {
      details.isLead = "Exactly one member must be marked as team lead"
    }

    // Check rollNo uniqueness within payload
    const rollNoSet = new Set()
    members.forEach((member, index) => {
      const roll = typeof member?.rollNo === "string" ? member.rollNo.trim() : ""
      if (roll) {
        if (rollNoSet.has(roll)) {
          details[`members[${index}].rollNo`] = "Duplicate roll numbers in payload"
        }
        rollNoSet.add(roll)
      }
    })
  }

  if (Object.keys(details).length > 0) {
    throw createError(422, "VALIDATION_ERROR", "Validation failed", null, details)
  }

  // Validate track
  if (event.hasTracks && trackId) {
    const track = await prisma.track.findFirst({ where: { id: trackId, eventId: event.id } })
    if (!track) throw createError(422, "INVALID_TRACK", "Invalid track for this event")
  }

  // Step 6: Check roll number DB uniqueness
  const normalizedMembers = members.map(m => ({
    name: m.name.trim(),
    rollNo: m.rollNo ? m.rollNo.trim() : null,
    year: m.year ? String(m.year) : null,
    branch: m.branch ? m.branch.trim() : null,
    institution: isNonEmptyString(m.institution) ? m.institution.trim() : null,
    email: isNonEmptyString(m.email) ? m.email.trim().toLowerCase() : "",
    phone: isNonEmptyString(m.phone) ? m.phone.trim() : null,
    whatsapp: isNonEmptyString(m.whatsapp) ? m.whatsapp.trim() : null,
    isLead: m.isLead
  }))

  const rollNos = normalizedMembers.filter(m => m.rollNo).map(m => m.rollNo)
  if (rollNos.length > 0) {
    const existing = await prisma.teamMember.findMany({
      where: {
        rollNo: { in: rollNos },
        team: { eventId: event.id }
      },
      select: { rollNo: true }
    })
    if (existing.length > 0) {
      throw createError(409, "DUPLICATE_ROLLNO", `Roll number ${existing[0].rollNo} is already registered for this event`, `rollNo`)
    }
  }

  // Check cross-registration for authenticated lead
  const lead = normalizedMembers.find(m => m.isLead)
  if (!lead) {
    throw createError(422, "VALIDATION_ERROR", "Team lead is required", "isLead")
  }

  if (!lead.email || lead.email !== authenticatedEmail) {
    throw createError(422, "VALIDATION_ERROR", "Team lead email must match authenticated account", "members")
  }

  const existingSoloReg = await prisma.registration.findFirst({
    where: { userId: authenticatedUserId, eventId: event.id }
  })
  if (existingSoloReg) {
    throw createError(409, "ALREADY_REGISTERED", "Team lead is already registered solo for this event")
  }

  const existingTeamMember = await prisma.teamMember.findFirst({
    where: { userId: authenticatedUserId, team: { eventId: event.id } }
  })
  if (existingTeamMember) {
    throw createError(409, "ALREADY_REGISTERED", "Team lead is already in a team for this event")
  }

  // Step 7: Transaction
  let result = null
  let attempt = 0

  while (!result && attempt < 3) {
    try {
      result = await prisma.$transaction(async (tx) => {
        const registrationId = await generateRegistrationId(tx, event.id, event.slug, "team")
        const initialStatus = "PENDING"
        const qrCode = event.requiresCheckIn ? generateQrToken() : null

        const team = await tx.team.create({
          data: {
            registrationId,
            eventId: event.id,
            teamName: teamName.trim(),
            teamSize: parsedTeamSize,
            status: initialStatus,
            trackId: (event.hasTracks && trackId) ? trackId : null,
            hearAboutUs: hearAboutUs || null,
            qrCode
          }
        })

        let leadEmail = authenticatedEmail

        for (const member of normalizedMembers) {
          const linkedUserId = member.isLead ? authenticatedUserId : null

          if (member.isLead) {
            leadEmail = member.email
          }

          await tx.teamMember.create({
            data: {
              teamId: team.id,
              userId: linkedUserId,
              name: member.name,
              rollNo: member.rollNo || null,
              year: member.year || null,
              branch: member.branch || null,
              institution: member.institution || null,
              email: member.email,
              phone: member.phone || null,
              whatsapp: member.whatsapp || null,
              isLead: member.isLead
            }
          })
        }

        return {
          team,
          registrationId,
          email: leadEmail,
          name: teamName.trim(),
          qrCode
        }
      }, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable
      })
    } catch (txErr) {
      attempt++
      if ((txErr.code === "P2034" || txErr.code === "P2002") && attempt < 3) {
        continue
      }
      throw txErr
    }
  }

  // Step 8: Send emails
  await sendPostRegistrationEmails(result, event)

  // Step 9: Return
  return sendSuccess(res, {
    registrationId: result.registrationId,
    type: "team",
    teamName: teamName.trim(),
    qrCode: result.qrCode,
    message: "Registration successful"
  }, 201)
}

// ─── Helper functions ───────────────────────────────────────────

async function loadAndValidateEvent(slug) {
  const event = await prisma.event.findUnique({
    where: { slug },
    include: { settings: true }
  })

  if (!event || !event.isPublic) {
    throw createError(404, "EVENT_NOT_FOUND", "Event not found")
  }

  return event
}

function validateRegistrationWindow(event) {
  const effectiveRegistrationOpen = event?.settings?.registrationOpen ?? event.registrationOpen
  const effectiveRegistrationDeadline = event?.settings?.registrationDeadline ?? event.registrationDeadline

  if (!effectiveRegistrationOpen) {
    throw createError(403, "REGISTRATION_CLOSED", "Registration is closed")
  }

  if (effectiveRegistrationDeadline && new Date() >= effectiveRegistrationDeadline) {
    throw createError(403, "REGISTRATION_CLOSED", "Registration deadline has passed")
  }

  if (event.registrationMode === "INVITE_ONLY") {
    throw createError(403, "REGISTRATION_NOT_AVAILABLE", "Registration is invite-only")
  }
}

async function validateCapacity(event) {
  if (event.maxParticipants) {
    const [soloCount, teamMemberCount] = await Promise.all([
      prisma.registration.count({ where: { eventId: event.id } }),
      prisma.teamMember.count({ where: { team: { eventId: event.id } } })
    ])

    const totalParticipants = soloCount + teamMemberCount
    if (totalParticipants >= event.maxParticipants) {
      throw createError(422, "EVENT_FULL", "Event has reached maximum capacity")
    }
  }
}

function determineInitialStatus(registrationMode) {
  switch (registrationMode) {
    case "OPEN_ACCESS": return "SHORTLISTED"
    case "APPLICATION_REVIEW": return "PENDING"
    case "INVITE_ONLY": return "PENDING"
    default: return "PENDING"
  }
}

async function sendPostRegistrationEmails(result, event) {
  try {
    if (event?.settings?.notifyOnRegistration === false) {
      return
    }

    const templateId = event.registrationMode === "OPEN_ACCESS"
      ? "REGISTRATION_CONFIRMED"
      : "APPLICATION_RECEIVED"

    const variables = buildEmailVariables({
      user: { name: result.name },
      event,
      registrationId: result.registrationId,
      teamName: result.name
    })

    await sendTemplatedEmail({
      templateId,
      to: result.email,
      variables,
      eventId: event.id
    })
  } catch (err) {
    console.error("Registration email failed:", err)
  }
}

function createError(status, code, message, field, details) {
  const err = new Error(message)
  err.status = status
  err.code = code
  err.field = field
  err.details = details
  return err
}

function handleRegistrationError(res, err) {
  if (err.status) {
    return sendError(res, err.status, err.code, err.message, err.field, err.details)
  }

  if (err.code === "P2002") {
    const target = Array.isArray(err.meta?.target) ? err.meta.target : [err.meta?.target]
    if (target?.includes("rollNo")) {
      return sendError(res, 409, "DUPLICATE_ROLLNO", "Roll number already registered")
    }
    if (target?.includes("userId") && target?.includes("eventId")) {
      return sendError(res, 409, "ALREADY_REGISTERED", "Already registered for this event")
    }
    if (target?.includes("registrationId")) {
      return sendError(res, 409, "CONFLICT", "A registration conflict occurred. Please retry once.")
    }
    return sendError(res, 409, "CONFLICT", "A similar registration already exists. Please review and try again.")
  }

  console.error("Registration error:", err)
  return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Registration failed")
}
