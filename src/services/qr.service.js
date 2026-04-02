import crypto from "crypto"

/**
 * Generate a unique QR code token (UUID-based)
 * This token is stored in Registration.qrCode or Team.qrCode
 * The actual QR image is generated client-side from this token string.
 */
export function generateQrToken() {
  return crypto.randomUUID()
}
