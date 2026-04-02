import "dotenv/config"
import express from "express"
import cookieParser from "cookie-parser"
import cors from "cors"
import morgan from "morgan"
import rateLimit from "express-rate-limit"

import authRoutes from "./routes/auth.routes.js"
import eventsRoutes from "./routes/events.routes.js"
import participantRoutes from "./routes/participant.routes.js"
import adminRoutes from "./routes/admin.routes.js"
import judgingRoutes from "./routes/judging.routes.js"
import auctionRoutes from "./routes/auction.routes.js"
import { errorHandler } from "./middleware/auth.middleware.js"
import { sendSuccess } from "./utils/response.js"
import { validateEnvironment } from "./config/env.js"

const app = express()
const PORT = process.env.PORT || 3001

validateEnvironment()

// ─── CORS ───────────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:3000",
  "https://edcjssun.com",
  "https://www.edcjssun.com",
  "https://admin.edcjssun.com",
  "https://judge.edcjssun.com",
  "https://auction.edcjssun.com"
]

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc)
    if (!origin || ALLOWED_ORIGINS.includes(origin) || origin.endsWith(".edcjssun.com")) {
      callback(null, true)
    } else {
      callback(new Error("Not allowed by CORS"))
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Auction-Password"]
}))

// ─── Middleware ──────────────────────────────────────────────────
app.use(express.json({ limit: "10mb" }))
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

// Global rate limiter — 200 req/min per IP
app.use(rateLimit({
  windowMs: 60 * 1000,
  max: 200,
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

app.get("/health", (req, res) => {
  return sendSuccess(res, {
    status: "ok",
    service: "edcjssun-backend",
    timestamp: new Date().toISOString()
  })
})

// ─── Routes ─────────────────────────────────────────────────────
app.use("/api/auth", authRoutes)
app.use("/api/events", eventsRoutes)
app.use("/api/participant", participantRoutes)
app.use("/api/admin", adminRoutes)
app.use("/api/judging", judgingRoutes)
app.use("/api/auction", auctionRoutes)

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

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
  console.log(`Environment: ${process.env.NODE_ENV || "development"}`)
})

export default app