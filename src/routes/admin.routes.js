import express from "express"
import { requireAuth, requireRole } from "../middleware/auth.middleware.js"
import {
  getStats, getAdminEvents, createEvent, getAdminEventBySlug, updateEvent, updateEventSettings
} from "../controllers/admin.controller.js"
import {
  getRegistrations, getRegistrationDetail, updateRegistrationStatus,
  bulkUpdateStatus, exportRegistrations, manualCheckIn
} from "../controllers/admin.registration.controller.js"
import {
  getSubmissions, updateSubmission, exportSubmissions
} from "../controllers/admin.submission.controller.js"
import {
  getJudges, addJudge, removeJudge, getScores, publishResults
} from "../controllers/admin.judge.controller.js"
import {
  getCheckInDashboard, scanQr, exportCheckIn
} from "../controllers/admin.checkin.controller.js"
import {
  getEmails, sendBulkEmail, getTemplates
} from "../controllers/admin.email.controller.js"

const router = express.Router()

// All admin routes require auth + admin role
router.use(requireAuth)
router.use(requireRole("EVENT_ADMIN", "SUPER_ADMIN"))

// ─── Platform ───────────────────────────────────────────────────
router.get("/stats", requireRole("SUPER_ADMIN"), getStats)
router.get("/events", getAdminEvents)
router.post("/events", requireRole("SUPER_ADMIN"), createEvent)
router.get("/events/:slug", getAdminEventBySlug)
router.patch("/events/:slug", updateEvent)
router.patch("/events/:slug/settings", updateEventSettings)

// ─── Registrations ──────────────────────────────────────────────
router.get("/events/:slug/registrations", getRegistrations)
router.get("/events/:slug/registrations/export", exportRegistrations)
router.get("/events/:slug/registrations/:id", getRegistrationDetail)
router.patch("/events/:slug/registrations/:id", updateRegistrationStatus)
router.post("/events/:slug/registrations/bulk", bulkUpdateStatus)
router.post("/events/:slug/registrations/checkin/:id", manualCheckIn)

// ─── Submissions ────────────────────────────────────────────────
router.get("/events/:slug/submissions", getSubmissions)
router.get("/events/:slug/submissions/export", exportSubmissions)
router.patch("/events/:slug/submissions/:id", updateSubmission)

// ─── Judging ────────────────────────────────────────────────────
router.get("/events/:slug/judges", getJudges)
router.post("/events/:slug/judges", addJudge)
router.delete("/events/:slug/judges/:judgeId", removeJudge)
router.get("/events/:slug/scores", getScores)
router.post("/events/:slug/results/publish", publishResults)

// ─── Check-In ───────────────────────────────────────────────────
router.get("/events/:slug/checkin", getCheckInDashboard)
router.post("/events/:slug/checkin/scan", scanQr)
router.get("/events/:slug/checkin/export", exportCheckIn)

// ─── Communications ─────────────────────────────────────────────
router.get("/events/:slug/emails", getEmails)
router.post("/events/:slug/emails/send", sendBulkEmail)
router.get("/events/:slug/emails/templates", getTemplates)

export default router
