import prisma from "../utils/prisma.js"
import { sendError, sendSuccess } from "../utils/response.js"

// ─── GET /api/judging/:slug/submissions ─────────────────────────

export const getJudgeSubmissions = async (req, res) => {
  try {
    const userId = req.user.id
    const { slug } = req.params

    const event = await prisma.event.findUnique({ where: { slug } })
    if (!event) return sendError(res, 404, "EVENT_NOT_FOUND", "Event not found")

    // Verify judge assignment
    const assignment = await prisma.judgeAssignment.findUnique({
      where: { eventId_userId: { eventId: event.id, userId } }
    })
    if (!assignment) {
      return sendError(res, 403, "NOT_ASSIGNED", "Not assigned to judge this event")
    }

    // Get submissions — filtered by track if judge has track assignment
    const where = { eventId: event.id }
    if (assignment.trackId) {
      where.trackId = assignment.trackId
    }

    const submissions = await prisma.submission.findMany({
      where,
      include: {
        team: { select: { teamName: true, registrationId: true } },
        registration: { select: { registrationId: true, user: { select: { name: true } } } },
        round: { select: { id: true, name: true, judgingCriteria: { orderBy: { order: "asc" } } } },
        trackRef: { select: { name: true } },
        scores: {
          where: { judgeId: assignment.id },
          include: { criteria: { select: { name: true } } }
        }
      }
    })

    const items = submissions.map(s => ({
      id: s.id,
      teamName: s.team?.teamName || null,
      participantName: s.registration?.user?.name || null,
      registrationId: s.team?.registrationId || s.registration?.registrationId || null,
      roundId: s.roundId,
      roundName: s.round?.name || null,
      trackName: s.trackRef?.name || null,
      type: s.type,
      fileUrl: s.fileUrl,
      fileName: s.fileName,
      externalLink: s.externalLink,
      formData: s.formData,
      criteria: s.round?.judgingCriteria || [],
      myScores: s.scores.map(sc => ({
        criteriaId: sc.criteriaId,
        criteriaName: sc.criteria.name,
        score: sc.score,
        comment: sc.comment
      })),
      isScored: s.scores.length > 0,
      submittedAt: s.submittedAt
    }))

    return sendSuccess(res, { submissions: items })
  } catch (err) {
    console.error("getJudgeSubmissions error:", err)
    return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Failed to fetch submissions")
  }
}

// ─── POST /api/judging/:slug/scores ─────────────────────────────

export const submitScores = async (req, res) => {
  try {
    const userId = req.user.id
    const { slug } = req.params
    const { submissionId, scores } = req.body

    const event = await prisma.event.findUnique({
      where: { slug },
      include: { settings: true }
    })
    if (!event) return sendError(res, 404, "EVENT_NOT_FOUND", "Event not found")

    // Check judgingOpen
    if (!event.settings?.judgingOpen) {
      return sendError(res, 403, "JUDGING_CLOSED", "Judging is not open")
    }

    // Verify judge assignment
    const assignment = await prisma.judgeAssignment.findUnique({
      where: { eventId_userId: { eventId: event.id, userId } }
    })
    if (!assignment) {
      return sendError(res, 403, "NOT_ASSIGNED", "Not assigned to judge this event")
    }

    // Verify submission belongs to event
    const submission = await prisma.submission.findFirst({
      where: { id: submissionId, eventId: event.id },
      include: { round: { include: { judgingCriteria: true } } }
    })
    if (!submission) {
      return sendError(res, 404, "SUBMISSION_NOT_FOUND", "Submission not found")
    }

    // Validate scores
    if (!Array.isArray(scores) || scores.length === 0) {
      return sendError(res, 400, "VALIDATION_ERROR", "Scores array is required")
    }

    const criteria = submission.round?.judgingCriteria || []
    const submittedCriteriaIds = new Set(scores.map(s => s.criteriaId))
    const allCriteriaCovered = criteria.length > 0 && criteria.every(c => submittedCriteriaIds.has(c.id))
    if (!allCriteriaCovered) {
      return sendError(res, 422, "VALIDATION_ERROR", "All criteria must be scored")
    }

    for (const scoreEntry of scores) {
      const criterion = criteria.find(c => c.id === scoreEntry.criteriaId)
      if (!criterion) {
        return sendError(res, 400, "INVALID_CRITERIA", `Invalid criteria: ${scoreEntry.criteriaId}`)
      }
      if (scoreEntry.score > criterion.maxScore || scoreEntry.score < 0) {
        return sendError(res, 422, "VALIDATION_ERROR", `Score must be between 0 and ${criterion.maxScore}`)
      }
    }

    // Upsert scores
    const existingCount = await prisma.judgeScore.count({
      where: { submissionId, judgeId: assignment.id }
    })
    const savedScores = []
    for (const scoreEntry of scores) {
      const saved = await prisma.judgeScore.upsert({
        where: {
          submissionId_judgeId_criteriaId: {
            submissionId,
            judgeId: assignment.id,
            criteriaId: scoreEntry.criteriaId
          }
        },
        create: {
          submissionId,
          judgeId: assignment.id,
          criteriaId: scoreEntry.criteriaId,
          score: scoreEntry.score,
          comment: scoreEntry.comment || null
        },
        update: {
          score: scoreEntry.score,
          comment: scoreEntry.comment || null,
          scoredAt: new Date()
        }
      })
      savedScores.push(saved)
    }

    return sendSuccess(res, { scores: savedScores }, existingCount === 0 ? 201 : 200)
  } catch (err) {
    console.error("submitScores error:", err)
    return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Failed to submit scores")
  }
}

// ─── PATCH /api/judging/:slug/scores/:id ────────────────────────

export const updateScore = async (req, res) => {
  try {
    const userId = req.user.id
    const { slug, id } = req.params
    const { score, comment } = req.body

    const event = await prisma.event.findUnique({
      where: { slug },
      include: { settings: true }
    })
    if (!event) return sendError(res, 404, "EVENT_NOT_FOUND", "Event not found")

    if (!event.settings?.judgingOpen) {
      return sendError(res, 403, "JUDGING_CLOSED", "Judging is not open")
    }

    // Verify this score belongs to the judge
    const existingScore = await prisma.judgeScore.findUnique({
      where: { id },
      include: { judge: true }
    })
    if (!existingScore || existingScore.judge.userId !== userId) {
      return sendError(res, 403, "NOT_AUTHORIZED", "Can only edit your own scores")
    }

    const updated = await prisma.judgeScore.update({
      where: { id },
      data: {
        score: score !== undefined ? score : existingScore.score,
        comment: comment !== undefined ? comment : existingScore.comment,
        scoredAt: new Date()
      }
    })

    return sendSuccess(res, updated)
  } catch (err) {
    console.error("updateScore error:", err)
    return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Failed to update score")
  }
}

// ─── GET /api/judging/:slug/progress ────────────────────────────

export const getJudgeProgress = async (req, res) => {
  try {
    const userId = req.user.id
    const { slug } = req.params

    const event = await prisma.event.findUnique({ where: { slug } })
    if (!event) return sendError(res, 404, "EVENT_NOT_FOUND", "Event not found")

    const assignment = await prisma.judgeAssignment.findUnique({
      where: { eventId_userId: { eventId: event.id, userId } }
    })
    if (!assignment) {
      return sendError(res, 403, "NOT_ASSIGNED", "Not assigned to judge this event")
    }

    // Count total submissions to judge
    const where = { eventId: event.id }
    if (assignment.trackId) where.trackId = assignment.trackId

    const total = await prisma.submission.count({ where })

    // Count scored submissions (where this judge has at least one score)
    const scored = await prisma.judgeScore.groupBy({
      by: ["submissionId"],
      where: { judgeId: assignment.id }
    })

    const scoredCount = scored.length
    const remaining = total - scoredCount
    const percentage = total > 0 ? Math.round((scoredCount / total) * 100) : 0

    return sendSuccess(res, { total, scored: scoredCount, remaining, percentage })
  } catch (err) {
    console.error("getJudgeProgress error:", err)
    return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Failed to fetch progress")
  }
}
