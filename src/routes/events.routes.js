import express from "express"
import rateLimit from "express-rate-limit"
import {
  getAllEvents, getEventBySlug, getEventRounds, checkRollNo
} from "../controllers/events.controller.js"
import { register } from "../controllers/registration.controller.js"
import { requireAuth } from "../middleware/auth.middleware.js"

const router = express.Router()

const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { success: false, error: { code: "RATE_LIMITED", message: "Too many registration attempts" } },
  standardHeaders: true,
  skip: (req) => req.method === "OPTIONS"
})

const rollCheckLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  message: { success: false, error: { code: "RATE_LIMITED", message: "Too many roll number checks" } },
  standardHeaders: true,
  skip: (req) => req.method === "OPTIONS"
})

router.get("/", getAllEvents)
router.get("/:slug", getEventBySlug)
router.get("/:slug/rounds", getEventRounds)
router.get("/:slug/check-rollno", rollCheckLimiter, checkRollNo)
router.post("/:slug/register", registrationLimiter, requireAuth, register)

export default router