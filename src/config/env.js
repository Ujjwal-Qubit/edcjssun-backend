const REQUIRED_ENV_VARS = [
  "DATABASE_URL",
  "JWT_ACCESS_SECRET",
  "JWT_REFRESH_SECRET",
  "FRONTEND_URL",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET"
]

export function validateEnvironment() {
  const required = [...REQUIRED_ENV_VARS]

  if (process.env.ENABLE_AUCTION === "true") {
    required.push("AUCTION_PASSWORD")
  }

  const missing = required.filter((key) => {
    const value = process.env[key]
    return typeof value !== "string" || value.trim().length === 0
  })

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`)
  }
}
