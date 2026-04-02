/**
 * Scoring service — PRD Section 6.4
 * Weighted scoring + optional z-score normalization
 */

/**
 * Calculate weighted average score for a submission.
 * rawScore = Σ(criterionScore × criterionWeight) / Σ(weights)
 */
export function calculateWeightedScore(scores, criteria) {
  if (!scores || scores.length === 0) return null

  let weightedSum = 0
  let totalWeight = 0

  for (const criteriaItem of criteria) {
    const judgeScores = scores.filter(s => s.criteriaId === criteriaItem.id)
    if (judgeScores.length === 0) continue

    // Average across judges for this criterion
    const avgScore = judgeScores.reduce((sum, s) => sum + s.score, 0) / judgeScores.length
    weightedSum += avgScore * criteriaItem.weight
    totalWeight += criteriaItem.weight
  }

  if (totalWeight === 0) return null
  return weightedSum / totalWeight
}

/**
 * Calculate raw score for a single judge's scoring of a submission.
 */
export function calculateJudgeRawScore(judgeScores, criteria) {
  if (!judgeScores || judgeScores.length === 0) return null

  let weightedSum = 0
  let totalWeight = 0

  for (const criteriaItem of criteria) {
    const score = judgeScores.find(s => s.criteriaId === criteriaItem.id)
    if (!score) continue

    weightedSum += score.score * criteriaItem.weight
    totalWeight += criteriaItem.weight
  }

  if (totalWeight === 0) return null
  return weightedSum / totalWeight
}

/**
 * Z-score normalization per judge.
 * Per judge: zScore = (score - judgeAvg) / judgeStdDev
 * normalizedScore = mean(zScores across all judges for this submission)
 */
export function normalizeScores(submissionScores) {
  // Group scores by judge
  const judgeScoreMap = new Map()
  for (const entry of submissionScores) {
    if (!judgeScoreMap.has(entry.judgeId)) {
      judgeScoreMap.set(entry.judgeId, [])
    }
    judgeScoreMap.get(entry.judgeId).push(entry)
  }

  // Calculate per-judge mean and stddev
  const judgeStats = new Map()
  for (const [judgeId, scores] of judgeScoreMap) {
    const values = scores.map(s => s.rawScore).filter(v => v !== null)
    if (values.length === 0) continue

    const mean = values.reduce((a, b) => a + b, 0) / values.length
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length
    const stdDev = Math.sqrt(variance)

    judgeStats.set(judgeId, { mean, stdDev })
  }

  // Calculate z-scores per submission
  const submissionZScores = new Map()
  for (const entry of submissionScores) {
    const stats = judgeStats.get(entry.judgeId)
    if (!stats || stats.stdDev === 0) continue

    const zScore = (entry.rawScore - stats.mean) / stats.stdDev

    if (!submissionZScores.has(entry.submissionId)) {
      submissionZScores.set(entry.submissionId, [])
    }
    submissionZScores.get(entry.submissionId).push(zScore)
  }

  // Average z-scores per submission
  const result = new Map()
  for (const [submissionId, zScores] of submissionZScores) {
    const avg = zScores.reduce((a, b) => a + b, 0) / zScores.length
    result.set(submissionId, avg)
  }

  return result
}

/**
 * Aggregate and rank submissions for an event.
 * Returns array sorted by finalScore DESC.
 */
export function aggregateAndRank(submissions, allScores, criteria, useNormalization = false) {
  const results = []

  for (const submission of submissions) {
    const submissionScores = allScores.filter(s => s.submissionId === submission.id)
    const weightedScore = calculateWeightedScore(submissionScores, criteria)

    results.push({
      submissionId: submission.id,
      teamId: submission.teamId,
      registrationId: submission.registrationId,
      rawScore: weightedScore,
      finalScore: weightedScore,
      rank: 0
    })
  }

  if (useNormalization && allScores.length > 0) {
    // Build per-judge raw scores for normalization
    const judgeSubmissionScores = []
    const judgeIds = [...new Set(allScores.map(s => s.judgeId))]

    for (const judgeId of judgeIds) {
      for (const submission of submissions) {
        const judgeScoresForSubmission = allScores.filter(
          s => s.submissionId === submission.id && s.judgeId === judgeId
        )
        const rawScore = calculateJudgeRawScore(judgeScoresForSubmission, criteria)
        if (rawScore !== null) {
          judgeSubmissionScores.push({
            submissionId: submission.id,
            judgeId,
            rawScore
          })
        }
      }
    }

    const normalizedMap = normalizeScores(judgeSubmissionScores)
    for (const result of results) {
      if (normalizedMap.has(result.submissionId)) {
        result.finalScore = normalizedMap.get(result.submissionId)
      }
    }
  }

  // Sort by finalScore DESC
  results.sort((a, b) => (b.finalScore || 0) - (a.finalScore || 0))

  // Assign ranks
  results.forEach((r, i) => { r.rank = i + 1 })

  return results
}
