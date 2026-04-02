/**
 * Standardized API response utilities — PRD v2 compliant
 * { success: true, data: { ... } }
 * { success: false, error: { code, message, field?, details? } }
 */

export const sendSuccess = (res, data, status = 200) => {
  return res.status(status).json({
    success: true,
    data
  })
}

export const sendPaginated = (res, { items, total, page, limit }) => {
  return res.status(200).json({
    success: true,
    data: { items, total, page, limit }
  })
}

export const sendError = (res, status, code, message, field, details) => {
  const error = { code, message }
  if (field !== undefined) error.field = field
  if (details !== undefined) error.details = details
  return res.status(status).json({
    success: false,
    error
  })
}
