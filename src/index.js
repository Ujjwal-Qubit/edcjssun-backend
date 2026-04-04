import "./config/loadEnv.js"
import express from "express"
import cookieParser from "cookie-parser"
import cors from "cors"
import morgan from "morgan"
import rateLimit from "express-rate-limit"

import authRoutes from "./routes/auth.routes.js"
import eventsRoutes from "./routes/events.routes.js"
import participantRoutes from "./routes/participant.routes.js"
import submissionRoutes from "./routes/submission.routes.js"
import adminRoutes from "./routes/admin.routes.js"
import judgingRoutes from "./routes/judging.routes.js"
import auctionRoutes from "./routes/auction.routes.js"
import { errorHandler } from "./middleware/auth.middleware.js"
import { sendSuccess } from "./utils/response.js"
import { validateEnvironment } from "./config/env.js"
import prisma from "./utils/prisma.js"

const app = express()
const PORT = process.env.PORT || 3001
const ENABLE_AUCTION = process.env.ENABLE_AUCTION === "true"

validateEnvironment()

// ─── CORS ───────────────────────────────────────────────────────
const normalizeOrigin = (origin) => {
  if (!origin || typeof origin !== "string") return null

  const trimmed = origin.trim().replace(/\/+$/, "")
  if (!trimmed) return null

  // Accept env values like "edcjssun-events-frontend.vercel.app"
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`

  try {
    return new URL(withProtocol).origin
  } catch {
    return null
  }
}

const envOrigins = [
  ...(process.env.FRONTEND_URL || "").split(","),
  process.env.VERCEL_URL,
  process.env.RENDER_EXTERNAL_URL
]
  .map(normalizeOrigin)
  .filter(Boolean)

const devOrigins = ["http://localhost:5173", "http://localhost:5174", "http://localhost:3000"]
  .map(normalizeOrigin)
  .filter(Boolean)

const defaultProdOrigins = ["https://edcjssun-events-frontend.vercel.app"]
  .map(normalizeOrigin)
  .filter(Boolean)

const prodOrigins = envOrigins.length > 0 ? envOrigins : defaultProdOrigins
const allowedOrigins = new Set(process.env.NODE_ENV === "production" ? prodOrigins : [...prodOrigins, ...devOrigins])

app.use(cors({
  origin: (origin, callback) => {
    const normalizedOrigin = normalizeOrigin(origin)

    // Allow requests with no origin (mobile apps, curl, etc)
    if (!origin || (normalizedOrigin && allowedOrigins.has(normalizedOrigin))) {
      callback(null, true)
    } else {
      callback(new Error("Not allowed by CORS"))
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Auction-Password"]
}))

console.log("CORS allowed origins:", [...allowedOrigins])

// ─── Middleware ──────────────────────────────────────────────────
app.use(express.json({ limit: "20mb" }))
app.use(cookieParser())

// Structured JSON logging per PRD
app.use(morgan((tokens, req, res) => {
  return JSON.stringify({
    method: tokens.method(req, res),
    url: tokens.url(req, res),
    status: parseInt(tokens.status(req, res)),
    responseTime: `${tokens["response-time"](req, res)}ms`,
    timestamp: new Date().toISOString()
  })
}))

// Global rate limiter — 1000 req/min per IP
app.use(rateLimit({
  windowMs: 60 * 1000,
  max: 1000,
  message: {
    success: false,
    error: { code: "RATE_LIMITED", message: "Too many requests from this IP" }
  },
  standardHeaders: true,
  legacyHeaders: false
}))

// ─── Health Check ───────────────────────────────────────────────
app.get("/", (req, res) => {
  return sendSuccess(res, {
    status: "ok",
    service: "edcjssun-backend",
    timestamp: new Date().toISOString()
  })
})

app.get("/health", async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`
    return sendSuccess(res, {
      status: "ok",
      service: "edcjssun-backend",
      database: "ok",
      timestamp: new Date().toISOString()
    })
  } catch (_err) {
    return res.status(503).json({
      success: false,
      error: { code: "DB_UNAVAILABLE", message: "Database health check failed" }
    })
  }
})

// ─── Routes ─────────────────────────────────────────────────────
app.use("/api/auth", authRoutes)
app.use("/api/events", eventsRoutes)
app.use("/api/participant", participantRoutes)
app.use("/api/submissions", submissionRoutes)
app.use("/api/admin", adminRoutes)
app.use("/api/judging", judgingRoutes)
if (ENABLE_AUCTION) {
  app.use("/api/auction", auctionRoutes)
} else {
  console.log("Auction module disabled (ENABLE_AUCTION=false)")
}

// ─── 404 ────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: { code: "ROUTE_NOT_FOUND", message: `Route ${req.method} ${req.path} not found` }
  })
})

// ─── Global Error Handler ───────────────────────────────────────
app.use(errorHandler)

// ─── Start ──────────────────────────────────────────────────────
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason instanceof Error ? reason.message : String(reason))
})

process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err.message)
  process.exit(1)
})

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
  console.log(`Environment: ${process.env.NODE_ENV || "development"}`)
})

const shutdown = (signal) => {
  console.log(`${signal} received. Shutting down gracefully...`)
  server.close(async () => {
    try {
      await prisma.$disconnect()
    } catch (_err) {
      // Ignore disconnect errors during shutdown
    }
    process.exit(0)
  })
}

process.on("SIGTERM", () => shutdown("SIGTERM"))
process.on("SIGINT", () => shutdown("SIGINT"))

export default app