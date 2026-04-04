/**
 * Generate registration IDs per PRD:
 * Pattern: {PREFIX}-{S|T}-{NNNN}
 * PREFIX: derived from event slug (e.g., "FP26" for founders-pit-2026)
 * TYPE: "S" (solo) or "T" (team)
 * SEQUENCE: 4-digit zero-padded, auto-increment per event per type
 * Must be called INSIDE a transaction to avoid race conditions.
 */

function derivePrefix(slug) {
  // Take first letters of each slug segment, uppercase, max 4 chars
  const parts = slug.split("-")
  let prefix = ""
  for (const part of parts) {
    if (part.length > 0) {
      prefix += part[0].toUpperCase()
      // If part contains digits at end, include them
      const digits = part.match(/\d+$/)
      if (digits) {
        prefix += digits[0].slice(-2) // last 2 digits
      }
    }
    if (prefix.length >= 4) break
  }
  return prefix.slice(0, 6) // cap at 6 chars max
}

export async function generateRegistrationId(tx, eventId, eventSlug, type) {
  const prefix = derivePrefix(eventSlug)
  const typeCode = type === "solo" ? "S" : "T"

  const existingIds = type === "solo"
    ? await tx.registration.findMany({ where: { eventId }, select: { registrationId: true } })
    : await tx.team.findMany({ where: { eventId }, select: { registrationId: true } })

  const basePrefix = `${prefix}-${typeCode}-`
  let maxSequence = 0

  for (const row of existingIds) {
    const id = row?.registrationId || ""
    if (!id.startsWith(basePrefix)) continue
    const seqToken = id.slice(basePrefix.length)
    const seqNum = Number.parseInt(seqToken, 10)
    if (Number.isInteger(seqNum) && seqNum > maxSequence) {
      maxSequence = seqNum
    }
  }

  const sequence = String(maxSequence + 1).padStart(4, "0")
  return `${prefix}-${typeCode}-${sequence}`
}
