import express from "express"
import { requireAuth, requireRole } from "../middleware/auth.middleware.js"
import {
  getJudgeSubmissions, submitScores, updateScore, getJudgeProgress
} from "../controllers/judging.controller.js"

const router = express.Router()

// All judging routes require auth + JUDGE role
router.use(requireAuth)
router.use(requireRole("JUDGE"))

router.get("/:slug/submissions", getJudgeSubmissions)
router.post("/:slug/scores", submitScores)
router.patch("/:slug/scores/:id", updateScore)
router.get("/:slug/progress", getJudgeProgress)

export default router
