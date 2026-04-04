import express from "express"
import {
  getMyRegistration, updateMyRegistration, submitDeliverable, getMySubmissions, getCheckinToken, getMyUpdates
} from "../controllers/participant.controller.js"
import { requireAuth, requireShortlisted } from "../middleware/auth.middleware.js"
import { upload } from "../services/upload.service.js"

const router = express.Router()

// PRD: All participant routes use :slug
router.get("/:slug/registration", requireAuth, getMyRegistration)
router.patch("/:slug/registration", requireAuth, updateMyRegistration)
router.get("/:slug/checkin-token", requireAuth, getCheckinToken)
router.post("/:slug/submit/:roundId", requireAuth, requireShortlisted, upload.single("file"), submitDeliverable)
router.get("/:slug/submissions", requireAuth, getMySubmissions)
router.get("/:slug/updates", requireAuth, getMyUpdates)

export default router