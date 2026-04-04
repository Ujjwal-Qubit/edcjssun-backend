import express from "express"
import { requireAuth } from "../middleware/auth.middleware.js"
import { getSubmissionFileUrl } from "../controllers/submission.file.controller.js"

const router = express.Router()

router.get("/:id/file", requireAuth, getSubmissionFileUrl)

export default router
