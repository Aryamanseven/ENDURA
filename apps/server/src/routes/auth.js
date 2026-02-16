import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { OAuth2Client } from "google-auth-library";
import { User } from "../models/User.js";
import { PasswordResetToken } from "../models/PasswordResetToken.js";

const router = express.Router();
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

function isValidGoogleClientId(value) {
  return (
    typeof value === "string" &&
    value.endsWith(".apps.googleusercontent.com") &&
    !value.includes("REPLACE_WITH")
  );
}

function signToken(user) {
  const secret = process.env.JWT_SECRET || "dev-secret";
  return jwt.sign(
    {
      email: user.email,
      username: user.username
    },
    secret,
    {
      subject: String(user._id),
      expiresIn: "7d"
    }
  );
}

function buildAuthResponse(user) {
  return {
    _id: user._id,
    username: user.username,
    email: user.email,
    preferences: user.preferences,
    token: signToken(user)
  };
}

router.post("/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ message: "username, email, and password are required" });
    }

    const exists = await User.findOne({ email });
    if (exists) {
      return res.status(409).json({ message: "Email already registered" });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await User.create({ username, email, passwordHash });
    return res.status(201).json(buildAuthResponse(user));
  } catch (error) {
    return res.status(500).json({ message: "Registration failed", error: error.message });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "email and password are required" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    return res.json(buildAuthResponse(user));
  } catch (error) {
    return res.status(500).json({ message: "Login failed", error: error.message });
  }
});

router.post("/google", async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) {
      return res.status(400).json({ message: "Google credential token is required" });
    }

    if (!isValidGoogleClientId(process.env.GOOGLE_CLIENT_ID)) {
      return res.status(500).json({ message: "GOOGLE_CLIENT_ID is missing or invalid on server" });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();
    if (!payload?.email) {
      return res.status(400).json({ message: "Google account did not provide a valid email" });
    }

    let user = await User.findOne({ email: payload.email.toLowerCase() });
    if (!user) {
      const generatedPasswordHash = await bcrypt.hash(crypto.randomUUID(), 10);
      user = await User.create({
        username: payload.name || payload.email.split("@")[0],
        email: payload.email.toLowerCase(),
        passwordHash: generatedPasswordHash
      });
    }

    return res.json(buildAuthResponse(user));
  } catch (error) {
    return res.status(401).json({ message: "Google login failed", error: error.message });
  }
});

router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.json({ message: "If an account exists, a reset token has been generated." });
    }

    await PasswordResetToken.deleteMany({ user_id: user._id });

    const token = crypto.randomBytes(32).toString("hex");
    await PasswordResetToken.create({
      user_id: user._id,
      token,
      expires_at: new Date(Date.now() + 60 * 60 * 1000)
    });

    console.log(`[Password Reset] Token for ${email}: ${token}`);

    return res.json({ message: "If an account exists, a reset token has been generated.", token });
  } catch (error) {
    return res.status(500).json({ message: "Failed to process reset request", error: error.message });
  }
});

router.post("/reset-password", async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      return res.status(400).json({ message: "Token and new password are required" });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    const resetRecord = await PasswordResetToken.findOne({ token });
    if (!resetRecord) {
      return res.status(400).json({ message: "Invalid or expired reset token" });
    }

    if (resetRecord.expires_at < new Date()) {
      await PasswordResetToken.deleteOne({ _id: resetRecord._id });
      return res.status(400).json({ message: "Reset token has expired" });
    }

    const user = await User.findById(resetRecord.user_id);
    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    await user.save();
    await PasswordResetToken.deleteMany({ user_id: user._id });

    return res.json({ message: "Password has been reset successfully" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to reset password", error: error.message });
  }
});

export default router;
