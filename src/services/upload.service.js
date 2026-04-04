import multer from "multer"
import path from "path"
import { putBufferObject } from "./storage.service.js"

// Blocked executable extensions
const BLOCKED_EXTENSIONS = [".exe", ".sh", ".bat", ".cmd", ".msi", ".com", ".scr", ".ps1"]

// Allowed submission extensions
const DEFAULT_ALLOWED = [".ppt", ".pptx", ".pdf"]

/**
 * Multer config — memory storage, no disk I/O
 */
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB hard cap
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    if (BLOCKED_EXTENSIONS.includes(ext)) {
      return cb(new Error("Invalid file type"), false)
    }
    cb(null, true)
  }
})

/**
 * Validate file extension against round's acceptedFileTypes
 */
export function validateFileType(originalname, acceptedFileTypes) {
  const ext = path.extname(originalname).toLowerCase()
  const bareExt = ext.replace(/^\./, "")

  if (BLOCKED_EXTENSIONS.includes(ext)) {
    return false
  }

  if (!DEFAULT_ALLOWED.includes(ext)) {
    return false
  }

  if (!acceptedFileTypes) {
    return true
  }

  const allowed = acceptedFileTypes
    .split(",")
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean)
    .map((token) => {
      if (token.startsWith(".")) return token
      if (token.includes("/")) {
        if (token.includes("pdf")) return ".pdf"
        if (token.includes("presentation") || token.includes("powerpoint")) return ".pptx"
        return token
      }
      return `.${token}`
    })

  return allowed.includes(ext) || allowed.includes(`.${bareExt}`)
}

/**
 * Validate file size against round's maxFileSize (in MB)
 */
export function validateFileSize(fileSize, maxFileSizeMB = 20) {
  const limit = Number(maxFileSizeMB) * 1024 * 1024
  return fileSize <= limit
}

/**
 * Upload submission file
 */
export async function uploadSubmissionFile(file, { eventSlug, registrationId, fileName }) {
  const selectedName = fileName || file.originalname
  const ext = path.extname(selectedName).toLowerCase()
  const storageKey = `submissions/${eventSlug}/${registrationId}${ext}`
  const result = await putBufferObject({
    storageKey,
    body: file.buffer,
    contentType: file.mimetype,
  })

  return {
    storageKey: result.storageKey,
    fileUrl: result.fileUrl,
    fileName: selectedName,
    fileSize: file.size,
  }
}
