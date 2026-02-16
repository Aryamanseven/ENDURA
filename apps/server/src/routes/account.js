import express from "express";
import bcrypt from "bcryptjs";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { requireAuth } from "../middleware/auth.js";
import { User } from "../models/User.js";
import { Run } from "../models/Run.js";
import { Certificate } from "../models/Certificate.js";

const router = express.Router();
router.use(requireAuth);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const avatarDir = path.resolve(__dirname, "../../../..", "uploads", "avatars");

if (!fs.existsSync(avatarDir)) {
  fs.mkdirSync(avatarDir, { recursive: true });
}

const avatarStorage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, avatarDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
    cb(null, `${req.user.id}-${Date.now()}${ext}`);
  }
});

const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    const allowed = new Set([".jpg", ".jpeg", ".png", ".webp"]);
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowed.has(ext)) {
      return cb(new Error("Only JPG, PNG, or WebP images are allowed"));
    }
    return cb(null, true);
  }
});

router.get("/profile", async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-passwordHash");
    if (!user) return res.status(404).json({ message: "User not found" });
    return res.json(user);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch profile", error: error.message });
  }
});

router.put("/profile", async (req, res) => {
  try {
    const { username, preferences } = req.body;
    const updates = {};
    if (username) updates.username = username;
    if (preferences?.units) updates["preferences.units"] = preferences.units;

    const user = await User.findByIdAndUpdate(req.user.id, { $set: updates }, { new: true }).select(
      "-passwordHash"
    );
    if (!user) return res.status(404).json({ message: "User not found" });
    return res.json(user);
  } catch (error) {
    return res.status(500).json({ message: "Failed to update profile", error: error.message });
  }
});

router.post("/profile-picture", avatarUpload.single("avatar"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "Image file required" });

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.profilePicture && fs.existsSync(user.profilePicture)) {
      fs.unlinkSync(user.profilePicture);
    }

    user.profilePicture = req.file.path;
    await user.save();

    return res.json({ message: "Profile picture updated", profilePicture: req.file.path });
  } catch (error) {
    return res.status(500).json({ message: "Failed to update picture", error: error.message });
  }
});

router.get("/profile-picture", async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user?.profilePicture || !fs.existsSync(user.profilePicture)) {
      return res.status(404).json({ message: "No profile picture" });
    }
    return res.sendFile(path.resolve(user.profilePicture));
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch picture", error: error.message });
  }
});

router.delete("/profile-picture", async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.profilePicture && fs.existsSync(user.profilePicture)) {
      fs.unlinkSync(user.profilePicture);
    }

    user.profilePicture = null;
    await user.save();

    return res.json({ message: "Profile picture removed" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to remove picture", error: error.message });
  }
});

router.put("/change-password", async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Current and new passwords are required" });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ message: "New password must be at least 6 characters" });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) return res.status(401).json({ message: "Current password is incorrect" });

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    await user.save();

    return res.json({ message: "Password changed successfully" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to change password", error: error.message });
  }
});

router.delete("/delete", async (req, res) => {
  try {
    const userId = req.user.id;

    const certs = await Certificate.find({ user_id: userId });
    for (const cert of certs) {
      if (cert.file_url && fs.existsSync(cert.file_url)) {
        fs.unlinkSync(cert.file_url);
      }
    }

    const user = await User.findById(userId);
    if (user?.profilePicture && fs.existsSync(user.profilePicture)) {
      fs.unlinkSync(user.profilePicture);
    }

    await Promise.all([
      Run.deleteMany({ user_id: userId }),
      Certificate.deleteMany({ user_id: userId }),
      User.findByIdAndDelete(userId)
    ]);

    return res.json({ message: "Account and all data deleted" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to delete account", error: error.message });
  }
});

export default router;
