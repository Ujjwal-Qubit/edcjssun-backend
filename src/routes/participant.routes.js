import express from "express"
import {
  getMyRegistration, updateMyRegistration, submitDeliverable, getMySubmissions
} from "../controllers/participant.controller.js"
import { requireAuth, requireShortlisted } from "../middleware/auth.middleware.js"
import { upload } from "../services/upload.service.js"

const router = express.Router()

// PRD: All participant routes use :slug
router.get("/:slug/registration", requireAuth, getMyRegistration)
router.patch("/:slug/registration", requireAuth, updateMyRegistration)
router.post("/:slug/submit/:roundId", requireAuth, requireShortlisted, upload.single("file"), submitDeliverable)
router.get("/:slug/submissions", requireAuth, getMySubmissions)

export default router