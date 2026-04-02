import { v2 as cloudinary } from "cloudinary"
import multer from "multer"
import path from "path"

// Configure cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
})

// Blocked executable extensions
const BLOCKED_EXTENSIONS = [".exe", ".sh", ".bat", ".cmd", ".msi", ".com", ".scr", ".ps1"]

// Default allowed extensions
const DEFAULT_ALLOWED = [".pptx", ".pdf", ".zip", ".png", ".jpg", ".jpeg", ".doc", ".docx", ".xlsx", ".csv", ".mp4", ".mov"]

/**
 * Multer config — memory storage, no disk I/O
 */
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB hard cap
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

  if (BLOCKED_EXTENSIONS.includes(ext)) {
    return false
  }

  if (!acceptedFileTypes) {
    return DEFAULT_ALLOWED.includes(ext)
  }

  const allowed = acceptedFileTypes.split(",").map(t => t.trim().toLowerCase())
  return allowed.includes(ext)
}

/**
 * Validate file size against round's maxFileSize (in MB)
 */
export function validateFileSize(fileSize, maxFileSizeMB) {
  const limit = maxFileSizeMB ? maxFileSizeMB * 1024 * 1024 : 25 * 1024 * 1024
  return fileSize <= limit
}

/**
 * Upload buffer to Cloudinary
 * Folder structure: events/{eventSlug}/submissions/round-{order}/{registrationId}_{timestamp}.{ext}
 */
export async function uploadToCloudinary(buffer, { folder, publicId, resourceType = "auto" }) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: publicId,
        resource_type: "raw",
        overwrite: true,
        type: "upload", // ensures public delivery
      },
      (error, result) => {
        if (error) reject(error)
        else resolve(result)
      }
    )
    uploadStream.end(buffer)
  })
}

/**
 * Upload submission file
 */
export async function uploadSubmissionFile(file, { eventSlug, roundOrder, registrationId }) {
  const ext = path.extname(file.originalname).toLowerCase()
  const timestamp = Date.now()
  const folder = `events/${eventSlug}/submissions/round-${roundOrder}`
  const publicId = `${registrationId}_${timestamp}`

  const result = await uploadToCloudinary(file.buffer, { folder, publicId })
  return {
    fileUrl: result.secure_url,
    fileName: file.originalname,
    fileSize: file.size
  }
}

/**
 * Upload event asset (cover image, logo)
 */
export async function uploadEventAsset(file, { eventSlug, type }) {
  const timestamp = Date.now()
  const folder = `events/${eventSlug}/assets`
  const publicId = `${type}_${timestamp}`

  const result = await uploadToCloudinary(file.buffer, { folder, publicId })
  return result.secure_url
}

/**
 * Delete from Cloudinary by public_id
 */
export async function deleteFromCloudinary(publicId) {
  return cloudinary.uploader.destroy(publicId)
}
