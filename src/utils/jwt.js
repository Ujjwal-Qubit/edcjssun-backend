import jwt from "jsonwebtoken"

/**
 * JWT payload shape per PRD:
 * Access:  { userId, role }
 * Refresh: { userId, tokenId }
 */

export const signAccessToken = ({ userId, role }) => {
  return jwt.sign({ userId, role }, process.env.JWT_ACCESS_SECRET, {
    expiresIn: "15m"
  })
}

export const signRefreshToken = ({ userId, tokenId }) => {
  return jwt.sign({ userId, tokenId }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: "7d"
  })
}

export const signResetToken = (email) => {
  return jwt.sign({ email, purpose: "reset" }, process.env.JWT_ACCESS_SECRET, {
    expiresIn: "10m"
  })
}

export const verifyAccessToken = (token) => {
  return jwt.verify(token, process.env.JWT_ACCESS_SECRET)
}

export const verifyRefreshToken = (token) => {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET)
}

export const verifyResetToken = (token) => {
  const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET)
  if (decoded.purpose !== "reset") throw new Error("Invalid reset token")
  return decoded
}