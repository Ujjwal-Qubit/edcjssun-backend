import { Resend } from "resend"
import prisma from "../utils/prisma.js"

const DEFAULT_FROM = process.env.EMAIL_FROM || "EDC JSSUN <onboarding@resend.dev>"
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173"

let resendClient = null

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return null

  if (!resendClient) {
    resendClient = new Resend(apiKey)
  }

  return resendClient
}

// ─── Core send function ─────────────────────────────────────────

async function sendEmail({ to, subject, html }) {
  const client = getResendClient()
  if (!client) {
    throw new Error("RESEND_API_KEY missing")
  }

  if (!DEFAULT_FROM || DEFAULT_FROM.toLowerCase().includes("test@example.com")) {
    throw new Error("EMAIL_FROM is not configured with a valid verified sender")
  }

  const result = await client.emails.send({
    from: DEFAULT_FROM,
    to,
    subject,
    html
  })

  if (result?.error) {
    const resendMessage = result.error?.message || "Unknown Resend send error"
    throw new Error(`Resend email delivery failed: ${resendMessage}`)
  }

  if (!result?.data?.id && !result?.id) {
    throw new Error("Resend email delivery failed: missing message id")
  }

  return { skipped: false, data: result }
}

async function sendBatchEmails(emails) {
  if (!process.env.RESEND_API_KEY) {
    console.warn("RESEND_API_KEY missing. Skipping batch email send.")
    return { skipped: true, sent: 0, failed: 0 }
  }

  let sent = 0
  let failed = 0

  // Resend batch supports up to 100 per call
  const batches = []
  for (let i = 0; i < emails.length; i += 100) {
    batches.push(emails.slice(i, i + 100))
  }

  for (const batch of batches) {
    for (const email of batch) {
      try {
        await sendEmail(email)
        sent++
      } catch {
        failed++
      }
    }
  }

  return { skipped: false, sent, failed }
}

// ─── Template variable replacement ──────────────────────────────

function replaceVariables(template, variables) {
  let result = template
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`{{${key}}}`, "g"), value || "")
  }
  return result
}

function formatDate(date) {
  if (!date) return ""
  return new Date(date).toLocaleDateString("en-IN", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  })
}

// ─── Email Templates (All 13 per PRD) ───────────────────────────

const TEMPLATES = {
  REGISTRATION_CONFIRMED: {
    subject: "Registration Confirmed — {{eventName}}",
    body: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1a1a2e;">Registration Confirmed! 🎉</h2>
      <p>Hi {{name}},</p>
      <p>Your registration for <strong>{{eventName}}</strong> has been confirmed.</p>
      <div style="background: #f0f4ff; padding: 16px; border-radius: 8px; margin: 16px 0;">
        <p style="margin: 4px 0;"><strong>Registration ID:</strong> {{registrationId}}</p>
        <p style="margin: 4px 0;"><strong>Team:</strong> {{teamName}}</p>
        <p style="margin: 4px 0;"><strong>Event Date:</strong> {{eventDate}}</p>
        <p style="margin: 4px 0;"><strong>Venue:</strong> {{venue}}</p>
      </div>
      <p>View your dashboard: <a href="{{dashboardUrl}}">{{dashboardUrl}}</a></p>
      <p>Best of luck!<br/>EDC JSSUN</p>
    </div>`
  },

  APPLICATION_RECEIVED: {
    subject: "Application Received — {{eventName}}",
    body: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1a1a2e;">Application Received! 📝</h2>
      <p>Hi {{name}},</p>
      <p>Your application for <strong>{{eventName}}</strong> has been received and is under review.</p>
      <div style="background: #fff8e1; padding: 16px; border-radius: 8px; margin: 16px 0;">
        <p style="margin: 4px 0;"><strong>Registration ID:</strong> {{registrationId}}</p>
        <p style="margin: 4px 0;"><strong>Status:</strong> Under Review</p>
      </div>
      <p>We'll notify you once the review is complete.</p>
      <p>Best regards,<br/>EDC JSSUN</p>
    </div>`
  },

  SETUP_PASSWORD: {
    subject: "Set Your Password — {{eventName}}",
    body: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1a1a2e;">Welcome! Set Your Password 🔐</h2>
      <p>Hi {{name}},</p>
      <p>An account has been created for you for <strong>{{eventName}}</strong>.</p>
      <p>Please set your password to access your dashboard:</p>
      <p><a href="{{setupPasswordUrl}}" style="display: inline-block; background: #4f46e5; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none;">Set Password</a></p>
      <p style="font-size: 12px; color: #666;">This link expires in 48 hours.</p>
      <p>Best regards,<br/>EDC JSSUN</p>
    </div>`
  },

  SHORTLISTED: {
    subject: "You're In! — {{eventName}}",
    body: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #059669;">Congratulations! You've Been Shortlisted! 🎉</h2>
      <p>Hi {{name}},</p>
      <p>Great news! You've been shortlisted for <strong>{{eventName}}</strong>.</p>
      <div style="background: #ecfdf5; padding: 16px; border-radius: 8px; margin: 16px 0;">
        <p style="margin: 4px 0;"><strong>Registration ID:</strong> {{registrationId}}</p>
        <p style="margin: 4px 0;"><strong>Event Date:</strong> {{eventDate}}</p>
        <p style="margin: 4px 0;"><strong>Venue:</strong> {{venue}}</p>
      </div>
      <p>{{statusMessage}}</p>
      <p>Visit your dashboard: <a href="{{dashboardUrl}}">{{dashboardUrl}}</a></p>
      <p>See you there!<br/>EDC JSSUN</p>
    </div>`
  },

  REJECTED: {
    subject: "Thank You for Applying — {{eventName}}",
    body: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1a1a2e;">Thank You for Your Application</h2>
      <p>Hi {{name}},</p>
      <p>Thank you for applying to <strong>{{eventName}}</strong>.</p>
      <p>Unfortunately, we won't be able to move forward with your application at this time. We received many strong applications and the selection was highly competitive.</p>
      <p>We encourage you to apply for our future events!</p>
      <p>Best regards,<br/>EDC JSSUN</p>
    </div>`
  },

  WAITLISTED: {
    subject: "You're on the Waitlist — {{eventName}}",
    body: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #d97706;">You're on the Waitlist ⏳</h2>
      <p>Hi {{name}},</p>
      <p>Your application for <strong>{{eventName}}</strong> has been waitlisted.</p>
      <p>If a spot opens up, we'll move you to the shortlisted group and notify you immediately.</p>
      <p>Best regards,<br/>EDC JSSUN</p>
    </div>`
  },

  SUBMISSION_RECEIVED: {
    subject: "Submission Confirmed — {{eventName}}",
    body: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1a1a2e;">Submission Received! ✅</h2>
      <p>Hi {{name}},</p>
      <p>Your submission for <strong>{{eventName}}</strong> has been received.</p>
      <div style="background: #f0f4ff; padding: 16px; border-radius: 8px; margin: 16px 0;">
        <p style="margin: 4px 0;"><strong>Registration ID:</strong> {{registrationId}}</p>
        <p style="margin: 4px 0;"><strong>Submitted at:</strong> {{submittedAt}}</p>
      </div>
      <p>You can resubmit until the deadline if needed.</p>
      <p>Best of luck!<br/>EDC JSSUN</p>
    </div>`
  },

  SUBMISSION_REMINDER: {
    subject: "Reminder: Deadline Approaching — {{eventName}}",
    body: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #d97706;">Submission Deadline Approaching ⏰</h2>
      <p>Hi {{name}},</p>
      <p>This is a reminder that the submission deadline for <strong>{{eventName}}</strong> is approaching.</p>
      <div style="background: #fff8e1; padding: 16px; border-radius: 8px; margin: 16px 0;">
        <p style="margin: 4px 0;"><strong>Deadline:</strong> {{submissionDeadline}}</p>
      </div>
      <p>Submit your work here: <a href="{{dashboardUrl}}">{{dashboardUrl}}</a></p>
      <p>Best regards,<br/>EDC JSSUN</p>
    </div>`
  },

  EVENT_DAY_REMINDER: {
    subject: "See You Tomorrow! — {{eventName}}",
    body: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1a1a2e;">See You Tomorrow! 🚀</h2>
      <p>Hi {{name}},</p>
      <p><strong>{{eventName}}</strong> is happening tomorrow!</p>
      <div style="background: #f0f4ff; padding: 16px; border-radius: 8px; margin: 16px 0;">
        <p style="margin: 4px 0;"><strong>Date:</strong> {{eventDate}}</p>
        <p style="margin: 4px 0;"><strong>Venue:</strong> {{venue}}</p>
        <p style="margin: 4px 0;"><strong>Registration ID:</strong> {{registrationId}}</p>
      </div>
      <p>Please arrive on time and have your QR code ready for check-in.</p>
      <p>See you there!<br/>EDC JSSUN</p>
    </div>`
  },

  RESULTS_ANNOUNCED: {
    subject: "Results Are Out — {{eventName}}",
    body: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1a1a2e;">Results Are Published! 🏆</h2>
      <p>Hi {{name}},</p>
      <p>The results for <strong>{{eventName}}</strong> are now available!</p>
      <p>View the results on your dashboard: <a href="{{dashboardUrl}}">{{dashboardUrl}}</a></p>
      <p>Thank you for participating!</p>
      <p>Best regards,<br/>EDC JSSUN</p>
    </div>`
  },

  JUDGE_INVITATION: {
    subject: "You're Invited to Judge — {{eventName}}",
    body: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #4f46e5;">Judge Invitation 🎓</h2>
      <p>Hi {{name}},</p>
      <p>You have been invited to judge <strong>{{eventName}}</strong>.</p>
      <p>Please set up your account and access the judging portal:</p>
      <p><a href="{{setupPasswordUrl}}" style="display: inline-block; background: #4f46e5; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none;">Set Password & Access Portal</a></p>
      <p>Best regards,<br/>EDC JSSUN</p>
    </div>`
  },

  CHECKIN_INSTRUCTIONS: {
    subject: "Check-In Instructions — {{eventName}}",
    body: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1a1a2e;">Check-In Instructions 📋</h2>
      <p>Hi {{name}},</p>
      <p>Here are your check-in instructions for <strong>{{eventName}}</strong>:</p>
      <div style="background: #f0f4ff; padding: 16px; border-radius: 8px; margin: 16px 0;">
        <p style="margin: 4px 0;"><strong>Registration ID:</strong> {{registrationId}}</p>
        <p style="margin: 4px 0;"><strong>Event Date:</strong> {{eventDate}}</p>
        <p style="margin: 4px 0;"><strong>Venue:</strong> {{venue}}</p>
      </div>
      <p>Please have your QR code ready for scanning at the venue.</p>
      <p>See you there!<br/>EDC JSSUN</p>
    </div>`
  },

  CUSTOM: {
    subject: "{{subject}}",
    body: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      {{body}}
    </div>`
  }
}

// ─── Public API ─────────────────────────────────────────────────

/**
 * Get all template definitions with variable placeholders.
 */
export function getEmailTemplates() {
  return Object.entries(TEMPLATES).map(([id, tmpl]) => ({
    id,
    name: id.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
    subject: tmpl.subject,
    body: tmpl.body,
    variables: (tmpl.body.match(/{{(\w+)}}/g) || []).map(v => v.replace(/[{}]/g, ""))
  }))
}

/**
 * Send a templated email and log it.
 */
export async function sendTemplatedEmail({ templateId, to, variables, eventId }) {
  const template = TEMPLATES[templateId]
  if (!template) throw new Error(`Unknown template: ${templateId}`)

  const subject = replaceVariables(template.subject, variables)
  const html = replaceVariables(template.body, variables)

  let status = "SENT"
  let error = null

  try {
    await sendEmail({ to, subject, html })
  } catch (err) {
    status = "FAILED"
    error = err.message
    console.error(`Email to ${to} failed:`, err.message)
  }

  // Log in EmailLog
  try {
    await prisma.emailLog.create({
      data: {
        eventId: eventId || null,
        recipient: to,
        type: templateId,
        subject,
        body: html,
        status,
        error
      }
    })
  } catch (logErr) {
    console.error("EmailLog creation failed:", logErr.message)
  }

  return { status, error }
}

/**
 * Send batch templated emails.
 * recipients: [{ email, variables }]
 */
export async function sendBatchTemplatedEmails({ templateId, recipients, eventId }) {
  let sent = 0
  let failed = 0

  for (const { email, variables } of recipients) {
    const result = await sendTemplatedEmail({
      templateId,
      to: email,
      variables,
      eventId
    })
    if (result.status === "SENT") sent++
    else failed++
  }

  return { sent, failed }
}

/**
 * Send custom email (admin-initiated).
 */
export async function sendCustomEmail({ to, subject, body, eventId }) {
  return sendTemplatedEmail({
    templateId: "CUSTOM",
    to,
    variables: { subject, body },
    eventId
  })
}

/**
 * Build common template variables for an event participant.
 */
export function buildEmailVariables({ user, event, registrationId, teamName, qrCode }) {
  return {
    name: user?.name || teamName || "",
    teamName: teamName || "",
    registrationId: registrationId || "",
    eventName: event?.title || "",
    eventDate: formatDate(event?.eventDate),
    venue: event?.venue || "",
    dashboardUrl: `${FRONTEND_URL}/events/${event?.slug}/dashboard`,
    setupPasswordUrl: "",
    qrCodeUrl: qrCode || "",
    statusMessage: "",
    submissionDeadline: "",
    submittedAt: ""
  }
}

// ─── Legacy exports (backward compat) ───────────────────────────

export async function sendOtpEmail(email, otp) {
  return sendEmail({
    to: email,
    subject: "Your OTP Code",
    html: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1a1a2e;">Your OTP Code 🔢</h2>
      <p>Your OTP is <strong style="font-size: 24px; color: #4f46e5;">${otp}</strong></p>
      <p>It expires in 15 minutes. Do not share this with anyone.</p>
      <p>If you didn't request this, please ignore this email.</p>
    </div>`
  })
}

export async function sendRegistrationConfirmationEmail({ email, teamName, registrationId, eventName }) {
  return sendTemplatedEmail({
    templateId: "REGISTRATION_CONFIRMED",
    to: email,
    variables: {
      name: teamName,
      teamName,
      registrationId,
      eventName,
      eventDate: "",
      venue: "",
      dashboardUrl: `${FRONTEND_URL}/events`
    }
  })
}

export async function sendSetupPasswordEmail({ email, setupLink, eventName, name }) {
  return sendTemplatedEmail({
    templateId: "SETUP_PASSWORD",
    to: email,
    variables: {
      name: name || email,
      eventName,
      setupPasswordUrl: setupLink
    }
  })
}
