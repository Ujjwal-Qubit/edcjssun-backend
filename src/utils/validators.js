const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_RE = /^[6-9]\d{9}$/

export const isNonEmptyString = (value) => {
  return typeof value === "string" && value.trim().length > 0
}

export const isValidEmail = (email) => {
  return typeof email === "string" && EMAIL_RE.test(email.trim())
}

export const isValidPhone = (phone) => {
  return typeof phone === "string" && PHONE_RE.test(phone.trim())
}

export const isValidUrl = (url) => {
  if (typeof url !== "string") return false
  try {
    const u = new URL(url)
    return u.protocol === "http:" || u.protocol === "https:"
  } catch {
    return false
  }
}

/**
 * Validate team member fields.
 * Returns details object with field-level errors.
 */
export const collectMemberValidationErrors = (members) => {
  const details = {}

  if (!Array.isArray(members) || members.length === 0) {
    details.members = "Members array required and cannot be empty"
    return details
  }

  members.forEach((member, index) => {
    const base = `members[${index}]`
    const isLead = Boolean(member?.isLead)

    if (!isNonEmptyString(member?.name)) {
      details[`${base}.name`] = "Name is required"
    }

    if (!isNonEmptyString(member?.rollNo)) {
      details[`${base}.rollNo`] = "Roll number is required"
    }

    if (isLead) {
      if (!isValidEmail(member?.email)) {
        details[`${base}.email`] = "Lead email is required and must be valid"
      }
      if (!isNonEmptyString(member?.phone)) {
        details[`${base}.phone`] = "Lead phone is required"
      } else if (!isValidPhone(member?.phone)) {
        details[`${base}.phone`] = "Lead phone must be a valid Indian mobile number (10 digits)"
      }
    } else if (isNonEmptyString(member?.email) && !isValidEmail(member?.email)) {
      details[`${base}.email`] = "Invalid email"
    }

    if (!isLead && isNonEmptyString(member?.phone) && !isValidPhone(member?.phone)) {
      details[`${base}.phone`] = "Phone must be a valid Indian mobile number (10 digits)"
    }

    if (typeof member?.isLead !== "boolean") {
      details[`${base}.isLead`] = "isLead must be a boolean"
    }
  })

  return details
}

/**
 * Validate solo registration fields.
 */
export const validateSoloRegistration = ({ name, email }) => {
  const details = {}
  if (!isNonEmptyString(name)) details.name = "Name is required"
  if (!isValidEmail(email)) details.email = "Valid email is required"
  return details
}

/**
 * Valid status transitions per PRD state machine.
 */
const VALID_TRANSITIONS = {
  PENDING: ["SHORTLISTED", "WAITLISTED", "REJECTED", "DISQUALIFIED"],
  SHORTLISTED: ["CHECKED_IN", "DISQUALIFIED"],
  WAITLISTED: ["SHORTLISTED", "REJECTED"],
  CHECKED_IN: ["DISQUALIFIED"],
  REJECTED: [],
  DISQUALIFIED: []
}

export const isValidStatusTransition = (from, to) => {
  const allowed = VALID_TRANSITIONS[from]
  if (!allowed) return false
  return allowed.includes(to)
}
