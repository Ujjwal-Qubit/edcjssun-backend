// Auth controller
import bcrypt from "bcryptjs";
import prisma from "../prisma/client.js";
import {
    signAccessToken,
    signRefreshToken,
    verifyRefreshToken,
} from "../utils/jwt.js";
import { generateOTP } from "../utils/otp.js";
import { sendOtpEmail } from "../services/email.service.js";

// SIGNUP
export const signup = async (req, res) => {
    try {
        const { name, email, password } = req.body || {};

        if (!name || !email || !password) {
            return res.status(400).json({ message: "Missing required fields" });
        }

        const existing = await prisma.user.findUnique({ where: { email } });

        if (existing) {
            return res.status(409).json({ message: "Email already exists" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const user = await prisma.user.create({
            data: {
                name,
                email,
                password: hashedPassword,
            },
        });

        const { password: _, ...userWithoutPassword } = user;
        return res.status(201).json({ message: "User created", user: userWithoutPassword });
    } catch (err) {
        console.error("Signup error FULL:", err);
        return res.status(500).json({ message: "Signup failed" });
    }
};


// LOGIN
export const login = async (req, res) => {
    try {
        const { email, password } = req.body || {};

        if (!email || !password) {
            return res.status(400).json({ message: "Missing required fields" });
        }

        const user = await prisma.user.findUnique({ where: { email } });

        if (!user) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        const payload = { id: user.id, role: user.role };

        const accessToken = signAccessToken(payload);
        const refreshToken = signRefreshToken(payload);

        // store refresh token in DB
        await prisma.refreshToken.create({
            data: {
                userId: user.id,
                token: refreshToken,
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            },
        });

        // send refresh token as cookie
        res.cookie("refreshToken", refreshToken, {
            httpOnly: true,
            secure: false, // true in production
            sameSite: "lax",
        });

        const { password: _, ...userWithoutPassword } = user;
        return res.json({ accessToken, user: userWithoutPassword });

    } catch (err) {
        console.error("Login error FULL:", err);  // 👈 IMPORTANT
        return res.status(500).json({ message: "Login failed" });
    }
};


// REFRESH TOKEN
export const refresh = async (req, res) => {
    try {
        const token = req.cookies.refreshToken;

        if (!token) {
            return res.status(401).json({ message: "No token" });
        }

        const decoded = verifyRefreshToken(token);

        const exists = await prisma.refreshToken.findUnique({
            where: { token },
        });

        if (!exists) {
            return res.status(403).json({ message: "Invalid token" });
        }

        const newAccessToken = signAccessToken({
            id: decoded.id,
            role: decoded.role,
        });

        return res.json({ accessToken: newAccessToken });

    } catch (err) {
        console.error("Refresh token error:", err);
        return res.status(403).json({ message: "Invalid refresh token" });
    }
};


// LOGOUT
export const logout = async (req, res) => {
    try {
        const token = req.cookies.refreshToken;

        if (token) {
            await prisma.refreshToken.deleteMany({
                where: { token },
            });
        }

        res.clearCookie("refreshToken", {
            httpOnly: true,
            secure: false, // true in production
            sameSite: "lax",
        });

        return res.json({ message: "Logged out" });

    } catch (err) {
        console.error("Logout error:", err);
        return res.status(500).json({ message: "Logout failed" });
    }
};


// GET CURRENT USER
export const me = async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
        });

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        const { password: _, ...userWithoutPassword } = user;
        return res.json({ user: userWithoutPassword });
    } catch (err) {
        console.error("Me error:", err);
        return res.status(500).json({ message: "Error fetching user" });
    }
};

// FORGOT PASSWORD API
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email required" });
    }

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const otp = generateOTP();

    await prisma.otp.deleteMany({ where: { email } });

    await prisma.otp.create({
      data: {
        email,
        otp,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 min
      },
    });

    
    await sendOtpEmail(email, otp);

    return res.json({ message: "OTP sent to email" });

  } catch (err) {
    console.error("Forgot password error:", err);
    return res.status(500).json({ message: "Failed to send OTP" });
  }
};

// Verify OTP
export const verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ message: "Missing fields" });
    }

    const record = await prisma.otp.findFirst({
      where: { email, otp },
      orderBy: { createdAt: "desc" },
    });

    if (!record) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    if (record.expiresAt < new Date()) {
      return res.status(400).json({ message: "OTP expired" });
    }

    

    return res.json({ message: "OTP verified" });

  } catch (err) {
    console.error("Verify OTP error:", err);
    return res.status(500).json({ message: "OTP verification failed" });
  }
};

// Reset Password
export const resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({ message: "Missing fields" });
    }

    const record = await prisma.otp.findFirst({
      where: { email, otp },
      orderBy: { createdAt: "desc" },
    });

    if (!record || record.expiresAt < new Date()) {
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { email },
      data: { password: hashedPassword },
    });


    await prisma.otp.deleteMany({
        where: { email },
    });
    return res.json({ message: "Password reset successful" });

  } catch (err) {
    console.error("Reset password error:", err);
    return res.status(500).json({ message: "Reset failed" });
  }
};