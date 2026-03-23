// Email service
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export const sendOtpEmail = async (email, otp) => {
  try {
    await resend.emails.send({
      from: "onboarding@resend.dev", // default test sender
      to: email,
      subject: "Your OTP Code",
      html: `<p>Your OTP is <b>${otp}</b>. It expires in 15 minutes.</p>`,
    });
  } catch (err) {
    console.error("Email send error:", err);
    throw err;
  }
};