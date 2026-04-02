import crypto from "crypto"
import bcrypt from "bcryptjs"
import { Prisma } from "@prisma/client"
import prisma from "../utils/prisma.js"
import { sendError, sendSuccess } from "../utils/response.js"
import { collectMemberValidationErrors, isNonEmptyString, isValidEmail, validateSoloRegistration } from "../utils/validators.js"
import {
  sendTemplatedEmail,
  sendSetupPasswordEmail,
  buildEmailVariables
} from "../services/email.service.js"
import { generateRegistrationId } from "../utils/generateRegistrationId.js"
import { generateQrToken } from "../services/qr.service.js"

const BCRYPT_ROUNDS = 12
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173"

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

  const normalizedEmail = email.trim().toLowerCase()

  // Step 6: Validate track
  if (event.hasTracks && trackId) {
    const track = await prisma.track.findFirst({ where: { id: trackId, eventId: event.id } })
    if (!track) throw createError(422, "INVALID_TRACK", "Invalid track for this event")
  }

  // Step 6b: Check cross-registration (solo + team for same event)
  const existingUser = await findOrPrepareUser(normalizedEmail)
  if (existingUser) {
    // Check if already has solo registration
    const existingSoloReg = await prisma.registration.findFirst({
      where: { userId: existingUser.id, eventId: event.id }
    })
    if (existingSoloReg) {
      throw createError(409, "ALREADY_REGISTERED", "Already registered for this event")
    }
    // Check if in a team
    const existingTeamMember = await prisma.teamMember.findFirst({
      where: { userId: existingUser.id, team: { eventId: event.id } }
    })
    if (existingTeamMember) {
      throw createError(409, "ALREADY_REGISTERED", "Already registered in a team for this event")
    }
  }

  // Step 7: Transaction
  let result = null
  let attempt = 0

  while (!result && attempt < 3) {
    try {
      result = await prisma.$transaction(async (tx) => {
        const registrationId = await generateRegistrationId(tx, event.id, event.slug, "solo")
        const initialStatus = determineInitialStatus(event.registrationMode)

        // Find or create user
        let userId
        let isNewUser = false
        let setupTokenValue = null

        const user = await tx.user.findUnique({ where: { email: normalizedEmail } })
        if (user) {
          userId = user.id
        } else {
          isNewUser = true
          const tempPassword = crypto.randomBytes(18).toString("hex")
          const hashedPassword = await bcrypt.hash(tempPassword, BCRYPT_ROUNDS)

          const newUser = await tx.user.create({
            data: {
              name: name.trim(),
              email: normalizedEmail,
              password: hashedPassword,
              role: "PARTICIPANT",
              isVerified: false,
              phone: phone || null,
              institution: institution || null,
              year: year || null,
              branch: branch || null,
              rollNo: rollNo || null
            }
          })
          userId = newUser.id

          setupTokenValue = crypto.randomBytes(32).toString("hex")
          await tx.setupPasswordToken.create({
            data: {
              userId: newUser.id,
              token: setupTokenValue,
              expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000)
            }
          })
        }

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
          isNewUser,
          setupTokenValue,
          email: normalizedEmail,
          name: name.trim(),
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
    email: m.email.trim().toLowerCase(),
    phone: m.phone ? m.phone.trim() : null,
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

  // Check cross-registration for lead
  const lead = normalizedMembers.find(m => m.isLead)
  if (lead) {
    const leadUser = await prisma.user.findUnique({ where: { email: lead.email } })
    if (leadUser) {
      const existingSoloReg = await prisma.registration.findFirst({
        where: { userId: leadUser.id, eventId: event.id }
      })
      if (existingSoloReg) {
        throw createError(409, "ALREADY_REGISTERED", "Team lead is already registered solo for this event")
      }
      const existingTeamMember = await prisma.teamMember.findFirst({
        where: { userId: leadUser.id, team: { eventId: event.id } }
      })
      if (existingTeamMember) {
        throw createError(409, "ALREADY_REGISTERED", "Team lead is already in a team for this event")
      }
    }
  }

  // Step 7: Transaction
  let result = null
  let attempt = 0

  while (!result && attempt < 3) {
    try {
      result = await prisma.$transaction(async (tx) => {
        const registrationId = await generateRegistrationId(tx, event.id, event.slug, "team")
        const initialStatus = determineInitialStatus(event.registrationMode)
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

        let leadEmail = null
        let isNewUser = false
        let setupTokenValue = null

        for (const member of normalizedMembers) {
          let linkedUserId = null

          const existingUser = await tx.user.findUnique({ where: { email: member.email } })

          if (existingUser) {
            linkedUserId = existingUser.id
          } else if (member.isLead) {
            isNewUser = true
            const tempPassword = crypto.randomBytes(18).toString("hex")
            const hashedPassword = await bcrypt.hash(tempPassword, BCRYPT_ROUNDS)

            const newUser = await tx.user.create({
              data: {
                name: member.name,
                email: member.email,
                password: hashedPassword,
                role: "PARTICIPANT",
                isVerified: false
              }
            })

            linkedUserId = newUser.id

            setupTokenValue = crypto.randomBytes(32).toString("hex")
            await tx.setupPasswordToken.create({
              data: {
                userId: newUser.id,
                token: setupTokenValue,
                expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000)
              }
            })
          }

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
              email: member.email,
              phone: member.phone || null,
              isLead: member.isLead
            }
          })
        }

        return {
          team,
          registrationId,
          isNewUser,
          setupTokenValue,
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
  if (!event.registrationOpen) {
    throw createError(403, "REGISTRATION_CLOSED", "Registration is closed")
  }

  if (event.registrationDeadline && new Date() >= event.registrationDeadline) {
    throw createError(403, "REGISTRATION_CLOSED", "Registration deadline has passed")
  }

  if (event.registrationMode === "INVITE_ONLY") {
    throw createError(403, "REGISTRATION_NOT_AVAILABLE", "Registration is invite-only")
  }
}

async function validateCapacity(event) {
  if (event.maxParticipants) {
    const [soloCount, teamCount] = await Promise.all([
      prisma.registration.count({ where: { eventId: event.id } }),
      prisma.team.count({ where: { eventId: event.id } })
    ])
    if (soloCount + teamCount >= event.maxParticipants) {
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

async function findOrPrepareUser(email) {
  return prisma.user.findUnique({ where: { email } })
}

async function sendPostRegistrationEmails(result, event) {
  try {
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

  // Send setup password email if new user
  if (result.isNewUser && result.setupTokenValue) {
    try {
      const setupLink = `${FRONTEND_URL}/auth/setup-password?token=${result.setupTokenValue}`
      await sendSetupPasswordEmail({
        email: result.email,
        setupLink,
        eventName: event.title,
        name: result.name
      })
    } catch (err) {
      console.error("Setup password email failed:", err)
    }
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
    const target = err.meta?.target
    if (target?.includes("rollNo")) {
      return sendError(res, 409, "DUPLICATE_ROLLNO", "Roll number already registered")
    }
    if (target?.includes("userId") && target?.includes("eventId")) {
      return sendError(res, 409, "ALREADY_REGISTERED", "Already registered for this event")
    }
    return sendError(res, 409, "CONFLICT", "A duplicate record exists")
  }

  console.error("Registration error:", err)
  return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Registration failed")
}
