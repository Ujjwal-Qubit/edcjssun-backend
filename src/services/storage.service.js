import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME
const R2_PUBLIC_URL = String(process.env.R2_PUBLIC_URL || "").replace(/\/$/, "")

const r2Client = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
})

export const normalizeStorageKey = (value) => String(value || "").replace(/^\/+/, "")

export const buildPublicFileUrl = (storageKey) => {
  const key = normalizeStorageKey(storageKey)
  return `${R2_PUBLIC_URL}/${key}`
}

export const putBufferObject = async ({ storageKey, body, contentType }) => {
  const key = normalizeStorageKey(storageKey)
  await r2Client.send(new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    Body: body,
    ContentType: contentType || "application/octet-stream",
  }))

  return {
    storageKey: key,
    fileUrl: buildPublicFileUrl(key),
  }
}

export const getSignedFileUrl = async (storageKey, expiresInSeconds = 900) => {
  const key = normalizeStorageKey(storageKey)
  const command = new GetObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
  })

  return getSignedUrl(r2Client, command, { expiresIn: expiresInSeconds })
}
