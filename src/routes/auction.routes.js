import express from "express"
import { requireAuctionAuth } from "../middleware/auth.middleware.js"
import {
  initAuction, getLeaderboard, placeBid, adjustPoints,
  assignProblem, undoLastTransaction, resetAuction,
  getTransactions, exportAuction
} from "../controllers/auction.controller.js"

const router = express.Router()

// Leaderboard is public
router.get("/:slug/leaderboard", getLeaderboard)

// All other auction routes require auction password
router.get("/:slug/init", requireAuctionAuth, initAuction)
router.post("/:slug/bid", requireAuctionAuth, placeBid)
router.post("/:slug/adjust", requireAuctionAuth, adjustPoints)
router.post("/:slug/assign", requireAuctionAuth, assignProblem)
router.post("/:slug/undo", requireAuctionAuth, undoLastTransaction)
router.post("/:slug/reset", requireAuctionAuth, resetAuction)
router.get("/:slug/transactions", requireAuctionAuth, getTransactions)
router.get("/:slug/export", requireAuctionAuth, exportAuction)

export default router
