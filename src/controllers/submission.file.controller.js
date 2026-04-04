import prisma from "../utils/prisma.js"
import { sendError, sendSuccess } from "../utils/response.js"
import { getSignedFileUrl } from "../services/storage.service.js"

const isPrivilegedRole = (role) => ["EVENT_ADMIN", "SUPER_ADMIN"].includes(String(role || ""))

export const getSubmissionFileUrl = async (req, res) => {
  try {
    const userId = req.user?.id
    const userRole = req.user?.role
    const { id } = req.params

    const submission = await prisma.submission.findUnique({
      where: { id },
      include: {
        event: { select: { slug: true } },
      },
    })

    if (!submission) {
      return sendError(res, 404, "SUBMISSION_NOT_FOUND", "Submission not found")
    }

    if (!isPrivilegedRole(userRole)) {
      if (submission.registrationId) {
        const registration = await prisma.registration.findUnique({
          where: { id: submission.registrationId },
          select: { userId: true },
        })

        if (!registration || registration.userId !== userId) {
          return sendError(res, 403, "FORBIDDEN", "You are not allowed to access this submission file")
        }
      } else if (submission.teamId) {
        const membership = await prisma.teamMember.findFirst({
          where: { teamId: submission.teamId, userId },
          select: { id: true },
        })

        if (!membership) {
          return sendError(res, 403, "FORBIDDEN", "You are not allowed to access this submission file")
        }
      } else {
        return sendError(res, 403, "FORBIDDEN", "You are not allowed to access this submission file")
      }
    }

    if (submission.externalLink) {
      return sendSuccess(res, { url: submission.externalLink })
    }

    if (!submission.storageKey && !submission.fileUrl) {
      return sendError(res, 404, "FILE_NOT_FOUND", "Submission file is not available")
    }

    const useSignedUrls = String(process.env.R2_PRIVATE_BUCKET || "false").toLowerCase() === "true"
    const resolvedUrl = useSignedUrls && submission.storageKey
      ? await getSignedFileUrl(submission.storageKey)
      : submission.fileUrl

    if (!resolvedUrl) {
      return sendError(res, 404, "FILE_NOT_FOUND", "Submission file is not available")
    }

    return sendSuccess(res, { url: resolvedUrl })
  } catch (err) {
    console.error("getSubmissionFileUrl error:", err)
    return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Failed to fetch file URL")
  }
}
