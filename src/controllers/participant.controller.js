import prisma from "../utils/prisma.js"
import path from "path"
import { sendError, sendSuccess } from "../utils/response.js"
import { upload, uploadSubmissionFile, validateFileType, validateFileSize } from "../services/upload.service.js"
import { sendTemplatedEmail, buildEmailVariables } from "../services/email.service.js"
import { generateQrToken } from "../services/qr.service.js"

const STORAGE_HARD_CAP_MB = Number(process.env.CLOUDINARY_MAX_FILE_SIZE_MB || 20)

const sanitizeNameSegment = (value, fallback = "NA") => {
  const cleaned = String(value || "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_-]/g, "")
  return cleaned || fallback
}

const getInstitutionShortCode = (institution) => {
  const token = String(institution || "").toLowerCase()
  if (token.includes("university") || token.includes("jssun")) return "JSSUN"
  return "JSSATEN"
}

const resolveFileExtension = (originalname, mimeType) => {
  const fromName = path.extname(String(originalname || "")).toLowerCase().replace(/^\./, "")
  if (["ppt", "pptx", "pdf"].includes(fromName)) return fromName

  const mime = String(mimeType || "").toLowerCase()
  if (mime.includes("pdf")) return "pdf"
  if (mime.includes("presentation") || mime.includes("powerpoint")) return "pptx"
  return "pdf"
}

const buildSubmissionFileName = ({ teamName, registrationId, institution, originalname, mimeType }) => {
  const ext = resolveFileExtension(originalname, mimeType)
  const teamToken = sanitizeNameSegment(teamName, "Team")
  const regToken = sanitizeNameSegment(registrationId, "REG")
  const institutionToken = getInstitutionShortCode(institution)
  return `${teamToken}-${regToken}-${institutionToken}.${ext}`
}

// ─── GET /api/participant/:slug/registration ────────────────────

export const getMyRegistration = async (req, res) => {
  try {
    const userId = req.user.id
    const { slug } = req.params

    const event = await prisma.event.findUnique({
      where: { slug },
      include: { settings: true }
    })
    if (!event) {
      return sendError(res, 404, "EVENT_NOT_FOUND", "Event not found")
    }

    // Check solo registration first
    const soloReg = await prisma.registration.findUnique({
      where: { userId_eventId: { userId, eventId: event.id } },
      include: {
        track: { select: { id: true, name: true } },
        submissions: {
          include: { round: { select: { id: true, name: true } } },
          orderBy: { submittedAt: "desc" }
        }
      }
    })

    if (soloReg) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, email: true, phone: true, rollNo: true, year: true, branch: true, institution: true }
      })

      return sendSuccess(res, {
        type: "solo",
        id: soloReg.id,
        registrationId: soloReg.registrationId,
        status: soloReg.status,
        trackId: soloReg.trackId,
        trackName: soloReg.track?.name || null,
        hearAboutUs: soloReg.hearAboutUs,
        checkInStatus: soloReg.checkInStatus,
        checkInTime: soloReg.checkInTime,
        qrCode: soloReg.qrCode,
        submittedAt: soloReg.submittedAt,
        user,
        submissions: soloReg.submissions.map(s => ({
          id: s.id,
          roundId: s.roundId,
          roundName: s.round?.name || null,
          type: s.type,
          fileUrl: s.fileUrl,
          fileName: s.fileName,
          fileSize: s.fileSize,
          externalLink: s.externalLink,
          submittedAt: s.submittedAt,
          score: event.settings?.resultsPublished ? s.score : undefined
        }))
      })
    }

    // Check team registration
    const teamMember = await prisma.teamMember.findFirst({
      where: {
        userId,
        team: { eventId: event.id }
      },
      include: {
        team: {
          include: {
            track: { select: { id: true, name: true } },
            members: {
              select: {
                id: true,
                name: true,
                rollNo: true,
                year: true,
                branch: true,
                institution: true,
                email: true,
                phone: true,
                whatsapp: true,
                isLead: true
              }
            },
            submissions: {
              include: { round: { select: { id: true, name: true } } },
              orderBy: { submittedAt: "desc" }
            }
          }
        }
      }
    })

    if (teamMember?.team) {
      const team = teamMember.team
      const settings = await prisma.eventSettings.findUnique({ where: { id: event.id } })

      return sendSuccess(res, {
        type: "team",
        id: team.id,
        registrationId: team.registrationId,
        teamName: team.teamName,
        teamSize: team.teamSize,
        status: team.status,
        trackId: team.trackId,
        trackName: team.track?.name || null,
        hearAboutUs: team.hearAboutUs,
        checkInStatus: team.checkInStatus,
        checkInTime: team.checkInTime,
        qrCode: team.qrCode,
        submittedAt: team.submittedAt,
        members: team.members,
        submissions: team.submissions.map(s => ({
          id: s.id,
          roundId: s.roundId,
          roundName: s.round?.name || null,
          type: s.type,
          fileUrl: s.fileUrl,
          fileName: s.fileName,
          fileSize: s.fileSize,
          externalLink: s.externalLink,
          submittedAt: s.submittedAt,
          score: settings?.resultsPublished ? s.score : undefined
        }))
      })
    }

    return sendError(res, 404, "REGISTRATION_NOT_FOUND", "Not registered for this event")
  } catch (err) {
    console.error("getMyRegistration error:", err)
    return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Failed to fetch registration")
  }
}

// ─── PATCH /api/participant/:slug/registration ──────────────────

export const updateMyRegistration = async (req, res) => {
  try {
    const userId = req.user.id
    const { slug } = req.params

    const event = await prisma.event.findUnique({ where: { slug } })
    if (!event) {
      return sendError(res, 404, "EVENT_NOT_FOUND", "Event not found")
    }

    // Check solo registration
    const soloReg = await prisma.registration.findUnique({
      where: { userId_eventId: { userId, eventId: event.id } }
    })

    if (soloReg) {
      if (soloReg.status !== "PENDING") {
        return sendError(res, 403, "EDIT_NOT_ALLOWED", "Can only edit while status is PENDING")
      }

      const { phone, institution } = req.body
      const updateData = {}
      if (phone !== undefined) updateData.phone = phone
      if (institution !== undefined) updateData.institution = institution

      // Update user fields (limited)
      if (Object.keys(updateData).length > 0) {
        await prisma.user.update({
          where: { id: userId },
          data: updateData
        })
      }

      if (req.body.hearAboutUs !== undefined) {
        await prisma.registration.update({
          where: { id: soloReg.id },
          data: { hearAboutUs: req.body.hearAboutUs }
        })
      }

      return sendSuccess(res, { message: "Registration updated" })
    }

    // Check team registration
    const teamMember = await prisma.teamMember.findFirst({
      where: { userId, isLead: true, team: { eventId: event.id } },
      include: { team: true }
    })

    if (!teamMember?.team) {
      return sendError(res, 404, "REGISTRATION_NOT_FOUND", "Not registered for this event")
    }

    const team = teamMember.team

    if (team.status !== "PENDING") {
      return sendError(res, 403, "EDIT_NOT_ALLOWED", "Can only edit while status is PENDING")
    }

    // PRD: Only team lead can edit, only teamName and member names/phones
    const { teamName, members: memberUpdates } = req.body
    const teamUpdateData = {}

    if (typeof teamName === "string" && teamName.trim()) {
      teamUpdateData.teamName = teamName.trim()
    }

    await prisma.$transaction(async (tx) => {
      if (Object.keys(teamUpdateData).length > 0) {
        await tx.team.update({ where: { id: team.id }, data: teamUpdateData })
      }

      // Update member names and phones only — PRD forbids rollNo, email, teamSize changes
      if (Array.isArray(memberUpdates)) {
        for (const mu of memberUpdates) {
          if (!mu.id) continue
          const updateFields = {}
          if (mu.name !== undefined) updateFields.name = mu.name.trim()
          if (mu.phone !== undefined) updateFields.phone = mu.phone.trim()
          if (Object.keys(updateFields).length > 0) {
            await tx.teamMember.update({ where: { id: mu.id }, data: updateFields })
          }
        }
      }
    })

    return sendSuccess(res, { message: "Registration updated" })
  } catch (err) {
    console.error("updateMyRegistration error:", err)
    return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Failed to update registration")
  }
}

// ─── POST /api/participant/:slug/submit/:roundId ────────────────

export const submitDeliverable = async (req, res) => {
  try {
    const userId = req.user.id
    const { slug, roundId } = req.params

    // Load event + round
    const event = await prisma.event.findUnique({
      where: { slug },
      include: { settings: true }
    })
    if (!event) {
      return sendError(res, 404, "EVENT_NOT_FOUND", "Event not found")
    }

    const round = await prisma.round.findFirst({
      where: { id: roundId, eventId: event.id }
    })
    if (!round) {
      return sendError(res, 404, "ROUND_NOT_FOUND", "Round not found")
    }

    // Validate round accepts submissions
    if (!round.submissionRequired) {
      return sendError(res, 422, "SUBMISSION_NOT_REQUIRED", "This round does not require submissions")
    }
    if (!round.isActive) {
      return sendError(res, 403, "SUBMISSIONS_CLOSED", "This round is not active")
    }

    // Check submissionsOpen in EventSettings
    if (event.settings && !event.settings.submissionsOpen) {
      return sendError(res, 403, "SUBMISSIONS_CLOSED", "Submissions are closed")
    }

    // Check deadline
    if (round.submissionDeadline && new Date() > round.submissionDeadline) {
      return sendError(res, 403, "SUBMISSIONS_CLOSED", "Submission deadline has passed")
    }

    // Determine submitter (solo or team) — populated by requireShortlisted middleware
    let teamId = null
    let registrationId = null
    let submitterRegId = null
    let submitterTeamName = null
    let submitterInstitution = null

    if (req.registrationType === "solo") {
      registrationId = req.registration.id
      submitterRegId = req.registration.registrationId
      const owner = await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, institution: true }
      })
      submitterTeamName = owner?.name || "Participant"
      submitterInstitution = owner?.institution || "JSSATEN"
    } else if (req.registrationType === "team") {
      teamId = req.team.id
      submitterRegId = req.team.registrationId
      submitterTeamName = req.team.teamName || "Team"
      const leadMember = await prisma.teamMember.findFirst({
        where: { teamId: req.team.id, isLead: true },
        select: { institution: true }
      })
      submitterInstitution = leadMember?.institution || "JSSATEN"
    } else {
      return sendError(res, 403, "NOT_ELIGIBLE", "Not eligible to submit")
    }

    // Handle submission based on type
    const submissionType = round.submissionType || "MIXED"
    let fileUrl = null, fileName = null, fileSize = null, externalLink = null, formData = null
    const trackId = req.body.trackId || null

    if (submissionType === "FILE" || submissionType === "MIXED") {
      if (req.file) {
        const configuredRoundLimitMb = Number(round.maxFileSize || 20)
        const effectiveMaxFileSizeMb = Math.min(configuredRoundLimitMb, STORAGE_HARD_CAP_MB)

        // Validate file type
        if (!validateFileType(req.file.originalname, round.acceptedFileTypes)) {
          return sendError(res, 422, "INVALID_FILE_TYPE", `Accepted types: ${round.acceptedFileTypes || "common document types"}`)
        }
        // Validate file size
        if (!validateFileSize(req.file.size, effectiveMaxFileSizeMb)) {
          return sendError(res, 422, "FILE_TOO_LARGE", `Max file size: ${effectiveMaxFileSizeMb}MB`)
        }
        // Upload to cloudinary
        try {
          const canonicalFileName = buildSubmissionFileName({
            teamName: submitterTeamName,
            registrationId: submitterRegId,
            institution: submitterInstitution,
            originalname: req.file.originalname,
            mimeType: req.file.mimetype,
          })

          const uploaded = await uploadSubmissionFile(req.file, {
            eventSlug: event.slug,
            roundOrder: round.order,
            registrationId: submitterRegId,
            fileName: canonicalFileName,
          })
          fileUrl = uploaded.fileUrl
          fileName = uploaded.fileName
          fileSize = uploaded.fileSize
        } catch (uploadErr) {
          console.error("Upload failed:", uploadErr)
          if (String(uploadErr?.message || "").toLowerCase().includes("file size too large")) {
            return sendError(res, 422, "FILE_TOO_LARGE", `Max file size: ${STORAGE_HARD_CAP_MB}MB`)
          }
          return sendError(res, 500, "UPLOAD_FAILED", "File upload failed")
        }
      } else if (submissionType === "FILE") {
        return sendError(res, 422, "FILE_REQUIRED", "File is required for this submission type")
      }
    }

    if (submissionType === "LINK" || submissionType === "MIXED") {
      if (req.body.externalLink) {
        externalLink = req.body.externalLink
      } else if (submissionType === "LINK") {
        return sendError(res, 422, "LINK_REQUIRED", "External link is required")
      }
    }

    if (submissionType === "FORM" || submissionType === "MIXED") {
      if (req.body.formData) {
        formData = typeof req.body.formData === "string"
          ? JSON.parse(req.body.formData)
          : req.body.formData
      } else if (submissionType === "FORM") {
        return sendError(res, 422, "FORM_DATA_REQUIRED", "Form data is required")
      }
    }

    // For MIXED, at least one content type required
    if (submissionType === "MIXED" && !fileUrl && !externalLink && !formData) {
      return sendError(res, 422, "CONTENT_REQUIRED", "At least one of file, link, or form data is required")
    }

    // Upsert submission — unique on teamId/registrationId + roundId
    const where = teamId
      ? { teamId_roundId: { teamId, roundId } }
      : { registrationId_roundId: { registrationId, roundId } }

    const upsertData = {
      eventId: event.id,
      roundId,
      trackId,
      type: submissionType,
      fileUrl,
      fileName,
      fileSize,
      externalLink,
      formData,
      submittedAt: new Date()
    }

    const existingSubmission = teamId
      ? await prisma.submission.findUnique({ where: { teamId_roundId: { teamId, roundId } } })
      : await prisma.submission.findUnique({ where: { registrationId_roundId: { registrationId, roundId } } })

    const submission = await prisma.submission.upsert({
      where,
      create: {
        ...upsertData,
        teamId,
        registrationId
      },
      update: upsertData
    })

    // Send confirmation email if enabled
    if (event.settings?.notifyOnSubmission) {
      try {
        const variables = buildEmailVariables({
          user: req.user,
          event,
          registrationId: submitterRegId
        })
        variables.submittedAt = new Date().toISOString()

        await sendTemplatedEmail({
          templateId: "SUBMISSION_RECEIVED",
          to: req.user.email,
          variables,
          eventId: event.id
        })
      } catch {
        // Non-blocking
      }
    }

    return sendSuccess(res, {
      id: submission.id,
      type: submission.type,
      fileUrl: submission.fileUrl,
      fileName: submission.fileName,
      fileSize: submission.fileSize,
      externalLink: submission.externalLink,
      submittedAt: submission.submittedAt
    }, existingSubmission ? 200 : 201)
  } catch (err) {
    console.error("submitDeliverable error:", err)
    return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Submission failed")
  }
}

// ─── GET /api/participant/:slug/submissions ─────────────────────

export const getMySubmissions = async (req, res) => {
  try {
    const userId = req.user.id
    const { slug } = req.params

    const event = await prisma.event.findUnique({
      where: { slug },
      include: { settings: true }
    })
    if (!event) {
      return sendError(res, 404, "EVENT_NOT_FOUND", "Event not found")
    }

    // Find user's registration/team
    const soloReg = await prisma.registration.findUnique({
      where: { userId_eventId: { userId, eventId: event.id } }
    })

    let submissions
    if (soloReg) {
      submissions = await prisma.submission.findMany({
        where: { registrationId: soloReg.id, eventId: event.id },
        include: { round: { select: { id: true, name: true } } },
        orderBy: { submittedAt: "desc" }
      })
    } else {
      const teamMember = await prisma.teamMember.findFirst({
        where: { userId, team: { eventId: event.id } },
        include: { team: true }
      })

      if (!teamMember?.team) {
        return sendError(res, 404, "REGISTRATION_NOT_FOUND", "Not registered for this event")
      }

      submissions = await prisma.submission.findMany({
        where: { teamId: teamMember.team.id, eventId: event.id },
        include: { round: { select: { id: true, name: true } } },
        orderBy: { submittedAt: "desc" }
      })
    }

    return sendSuccess(res, {
      submissions: submissions.map(s => ({
        id: s.id,
        roundId: s.roundId,
        roundName: s.round?.name || null,
        type: s.type,
        fileUrl: s.fileUrl,
        fileName: s.fileName,
        fileSize: s.fileSize,
        externalLink: s.externalLink,
        submittedAt: s.submittedAt,
        score: event.settings?.resultsPublished ? s.score : undefined
      }))
    })
  } catch (err) {
    console.error("getMySubmissions error:", err)
    return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Failed to fetch submissions")
  }
}

// ─── GET /api/participant/:slug/checkin-token ──────────────────

export const getCheckinToken = async (req, res) => {
  try {
    const userId = req.user.id
    const { slug } = req.params

    const event = await prisma.event.findUnique({ where: { slug } })
    if (!event) {
      return sendError(res, 404, "EVENT_NOT_FOUND", "Event not found")
    }

    const ensureToken = async (recordType, recordId, existingToken) => {
      if (existingToken) {
        return existingToken
      }

      const token = generateQrToken()
      if (recordType === "team") {
        await prisma.team.update({ where: { id: recordId }, data: { qrCode: token } })
      } else {
        await prisma.registration.update({ where: { id: recordId }, data: { qrCode: token } })
      }
      return token
    }

    const soloReg = await prisma.registration.findUnique({
      where: { userId_eventId: { userId, eventId: event.id } }
    })

    if (soloReg) {
      const token = await ensureToken("solo", soloReg.id, soloReg.qrCode)
      return sendSuccess(res, {
        token,
        registrationId: soloReg.registrationId,
        type: "solo",
        checkInStatus: soloReg.checkInStatus,
        checkInTime: soloReg.checkInTime
      })
    }

    const teamMember = await prisma.teamMember.findFirst({
      where: { userId, team: { eventId: event.id } },
      include: { team: true }
    })

    if (teamMember?.team) {
      const token = await ensureToken("team", teamMember.team.id, teamMember.team.qrCode)
      return sendSuccess(res, {
        token,
        registrationId: teamMember.team.registrationId,
        type: "team",
        checkInStatus: teamMember.team.checkInStatus,
        checkInTime: teamMember.team.checkInTime
      })
    }

    return sendError(res, 404, "REGISTRATION_NOT_FOUND", "Not registered for this event")
  } catch (err) {
    console.error("getCheckinToken error:", err)
    return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Failed to generate check-in token")
  }
}

// ─── GET /api/participant/:slug/updates ───────────────────────

export const getMyUpdates = async (req, res) => {
  try {
    const userId = req.user.id
    const { slug } = req.params

    const event = await prisma.event.findUnique({ where: { slug } })
    if (!event) {
      return sendError(res, 404, "EVENT_NOT_FOUND", "Event not found")
    }

    const recipientEmails = new Set([String(req.user.email || "").toLowerCase()])

    const soloReg = await prisma.registration.findUnique({
      where: { userId_eventId: { userId, eventId: event.id } },
      include: { user: { select: { email: true } } }
    })

    if (soloReg?.user?.email) {
      recipientEmails.add(String(soloReg.user.email).toLowerCase())
    } else {
      const teamMember = await prisma.teamMember.findFirst({
        where: { userId, team: { eventId: event.id } },
        include: {
          team: {
            include: {
              members: { select: { email: true } }
            }
          }
        }
      })

      if (!teamMember?.team) {
        return sendError(res, 404, "REGISTRATION_NOT_FOUND", "Not registered for this event")
      }

      for (const member of teamMember.team.members || []) {
        if (member?.email) {
          recipientEmails.add(String(member.email).toLowerCase())
        }
      }
    }

    const updates = await prisma.emailLog.findMany({
      where: {
        eventId: event.id,
        recipient: {
          in: Array.from(recipientEmails)
        }
      },
      orderBy: { sentAt: "desc" },
      take: 100
    })

    return sendSuccess(res, {
      updates: updates.map((entry) => ({
        id: entry.id,
        type: entry.type,
        subject: entry.subject,
        body: entry.body,
        status: entry.status,
        sentAt: entry.sentAt
      }))
    })
  } catch (err) {
    console.error("getMyUpdates error:", err)
    return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Failed to fetch updates")
  }
}