import prisma from "../utils/prisma.js"
import { sendError, sendSuccess } from "../utils/response.js"

// ─── GET /api/auction/:slug/init ────────────────────────────────

export const initAuction = async (req, res) => {
  try {
    const { slug } = req.params
    const event = await prisma.event.findUnique({ where: { slug } })
    if (!event) return sendError(res, 404, "EVENT_NOT_FOUND", "Event not found")

    if (!event.auctionEnabled) {
      return sendError(res, 403, "AUCTION_DISABLED", "Auction is not enabled for this event")
    }

    const teams = await prisma.team.findMany({
      where: { eventId: event.id, status: "SHORTLISTED" },
      select: {
        id: true,
        teamName: true,
        registrationId: true,
        pointBalance: true,
        problemWon: true,
        members: { where: { isLead: true }, select: { name: true } }
      }
    })

    const problems = await prisma.problem.findMany({
      where: { eventId: event.id },
      orderBy: { order: "asc" }
    })

    return sendSuccess(res, { teams, problems })
  } catch (err) {
    console.error("initAuction error:", err)
    return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Failed to init auction")
  }
}

// ─── GET /api/auction/:slug/leaderboard ─────────────────────────

export const getLeaderboard = async (req, res) => {
  try {
    const { slug } = req.params
    const event = await prisma.event.findUnique({ where: { slug } })
    if (!event) return sendError(res, 404, "EVENT_NOT_FOUND", "Event not found")

    const teams = await prisma.team.findMany({
      where: { eventId: event.id },
      orderBy: { pointBalance: "desc" },
      select: {
        id: true,
        teamName: true,
        registrationId: true,
        pointBalance: true,
        problemWon: true
      }
    })

    return sendSuccess(res, { teams })
  } catch (err) {
    console.error("getLeaderboard error:", err)
    return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Failed to fetch leaderboard")
  }
}

// ─── POST /api/auction/:slug/bid ────────────────────────────────

export const placeBid = async (req, res) => {
  try {
    const { slug } = req.params
    const { teamId, problemId, amount } = req.body

    const event = await prisma.event.findUnique({ where: { slug } })
    if (!event) return sendError(res, 404, "EVENT_NOT_FOUND", "Event not found")

    if (typeof amount !== "number" || amount <= 0) {
      return sendError(res, 400, "INVALID_AMOUNT", "Amount must be a positive number")
    }

    const team = await prisma.team.findFirst({
      where: { id: teamId, eventId: event.id }
    })
    if (!team) return sendError(res, 404, "TEAM_NOT_FOUND", "Team not found")

    if (amount > team.pointBalance) {
      return sendError(res, 400, "INSUFFICIENT_POINTS", "Not enough points")
    }

    const result = await prisma.$transaction(async (tx) => {
      // Deduct points
      const updatedTeam = await tx.team.update({
        where: { id: teamId },
        data: { pointBalance: { decrement: amount } }
      })

      // Create transaction log
      await tx.pointTransaction.create({
        data: {
          teamId,
          eventId: event.id,
          amount: -amount,
          reason: `Bid on problem ${problemId}`,
          createdBy: "AUCTION_SYSTEM"
        }
      })

      return { newBalance: updatedTeam.pointBalance }
    })

    return sendSuccess(res, result)
  } catch (err) {
    console.error("placeBid error:", err)
    return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Failed to place bid")
  }
}

// ─── POST /api/auction/:slug/adjust ─────────────────────────────

export const adjustPoints = async (req, res) => {
  try {
    const { slug } = req.params
    const { teamId, amount, reason } = req.body

    if (!reason) {
      return sendError(res, 400, "REASON_REQUIRED", "Reason is required for point adjustment")
    }

    const event = await prisma.event.findUnique({ where: { slug } })
    if (!event) return sendError(res, 404, "EVENT_NOT_FOUND", "Event not found")

    const result = await prisma.$transaction(async (tx) => {
      const updatedTeam = await tx.team.update({
        where: { id: teamId },
        data: { pointBalance: { increment: amount } }
      })

      await tx.pointTransaction.create({
        data: {
          teamId,
          eventId: event.id,
          amount,
          reason,
          adminNote: `Adjusted by admin`,
          createdBy: "ADMIN"
        }
      })

      return { newBalance: updatedTeam.pointBalance }
    })

    return sendSuccess(res, result)
  } catch (err) {
    console.error("adjustPoints error:", err)
    return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Failed to adjust points")
  }
}

// ─── POST /api/auction/:slug/assign ─────────────────────────────

export const assignProblem = async (req, res) => {
  try {
    const { slug } = req.params
    const { problemId, teamId } = req.body

    const event = await prisma.event.findUnique({ where: { slug } })
    if (!event) return sendError(res, 404, "EVENT_NOT_FOUND", "Event not found")

    await prisma.$transaction(async (tx) => {
      await tx.problem.update({
        where: { id: problemId },
        data: { assignedTeamId: teamId }
      })

      const problem = await tx.problem.findUnique({ where: { id: problemId } })

      await tx.team.update({
        where: { id: teamId },
        data: { problemWon: problem.title }
      })
    })

    return sendSuccess(res, { message: "Problem assigned" })
  } catch (err) {
    console.error("assignProblem error:", err)
    return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Failed to assign problem")
  }
}

// ─── POST /api/auction/:slug/undo ───────────────────────────────

export const undoLastTransaction = async (req, res) => {
  try {
    const { slug } = req.params
    const event = await prisma.event.findUnique({ where: { slug } })
    if (!event) return sendError(res, 404, "EVENT_NOT_FOUND", "Event not found")

    const lastTransaction = await prisma.pointTransaction.findFirst({
      where: { eventId: event.id },
      orderBy: { createdAt: "desc" }
    })

    if (!lastTransaction) {
      return sendError(res, 404, "NO_TRANSACTIONS", "No transactions to undo")
    }

    await prisma.$transaction(async (tx) => {
      // Reverse the amount
      await tx.team.update({
        where: { id: lastTransaction.teamId },
        data: { pointBalance: { decrement: lastTransaction.amount } }
      })

      // Create reversal transaction
      await tx.pointTransaction.create({
        data: {
          teamId: lastTransaction.teamId,
          eventId: event.id,
          amount: -lastTransaction.amount,
          reason: `UNDO: ${lastTransaction.reason}`,
          adminNote: "Reversed by admin",
          createdBy: "ADMIN"
        }
      })
    })

    return sendSuccess(res, {
      reversedAmount: lastTransaction.amount,
      message: "Last transaction reversed"
    })
  } catch (err) {
    console.error("undoLastTransaction error:", err)
    return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Failed to undo")
  }
}

// ─── POST /api/auction/:slug/reset ──────────────────────────────

export const resetAuction = async (req, res) => {
  try {
    const { slug } = req.params
    const { confirmPassword } = req.body

    // Extra password confirmation required
    if (confirmPassword !== process.env.AUCTION_PASSWORD) {
      return sendError(res, 403, "INVALID_CONFIRMATION", "Password confirmation failed")
    }

    const event = await prisma.event.findUnique({ where: { slug } })
    if (!event) return sendError(res, 404, "EVENT_NOT_FOUND", "Event not found")

    await prisma.$transaction(async (tx) => {
      // Reset all teams to 1000 points
      await tx.team.updateMany({
        where: { eventId: event.id },
        data: { pointBalance: 1000, problemWon: null }
      })

      // Clear problem assignments
      await tx.problem.updateMany({
        where: { eventId: event.id },
        data: { assignedTeamId: null }
      })

      // Delete all point transactions
      await tx.pointTransaction.deleteMany({
        where: { eventId: event.id }
      })
    })

    return sendSuccess(res, { message: "Auction reset complete" })
  } catch (err) {
    console.error("resetAuction error:", err)
    return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Failed to reset auction")
  }
}

// ─── GET /api/auction/:slug/transactions ────────────────────────

export const getTransactions = async (req, res) => {
  try {
    const { slug } = req.params
    const event = await prisma.event.findUnique({ where: { slug } })
    if (!event) return sendError(res, 404, "EVENT_NOT_FOUND", "Event not found")

    const transactions = await prisma.pointTransaction.findMany({
      where: { eventId: event.id },
      orderBy: { createdAt: "desc" },
      include: {
        team: { select: { teamName: true, registrationId: true } }
      }
    })

    return sendSuccess(res, { transactions })
  } catch (err) {
    console.error("getTransactions error:", err)
    return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Failed to fetch transactions")
  }
}

// ─── GET /api/auction/:slug/export ──────────────────────────────

export const exportAuction = async (req, res) => {
  try {
    const { slug } = req.params
    const event = await prisma.event.findUnique({ where: { slug } })
    if (!event) return sendError(res, 404, "EVENT_NOT_FOUND", "Event not found")

    const teams = await prisma.team.findMany({
      where: { eventId: event.id },
      select: { teamName: true, registrationId: true, pointBalance: true, problemWon: true }
    })

    const transactions = await prisma.pointTransaction.findMany({
      where: { eventId: event.id },
      orderBy: { createdAt: "asc" },
      include: { team: { select: { teamName: true } } }
    })

    const rows = teams.map(t => ({
      "Team Name": t.teamName,
      "Reg ID": t.registrationId,
      "Final Points": t.pointBalance,
      "Problem Won": t.problemWon || "",
      "Transactions": transactions
        .filter(tx => tx.team.teamName === t.teamName)
        .map(tx => `${tx.amount > 0 ? "+" : ""}${tx.amount} (${tx.reason})`)
        .join("; ")
    }))

    if (rows.length === 0) {
      res.setHeader("Content-Type", "text/csv")
      res.setHeader("Content-Disposition", `attachment; filename="${slug}_auction.csv"`)
      return res.send("No data")
    }

    const headers = Object.keys(rows[0])
    const csv = [
      headers.join(","),
      ...rows.map(r => headers.map(h => `"${String(r[h] || "").replace(/"/g, '""')}"`).join(","))
    ].join("\n")

    res.setHeader("Content-Type", "text/csv")
    res.setHeader("Content-Disposition", `attachment; filename="${slug}_auction.csv"`)
    return res.send(csv)
  } catch (err) {
    console.error("exportAuction error:", err)
    return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Failed to export auction data")
  }
}
