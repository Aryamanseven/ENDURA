import express from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { requireAuth } from "../middleware/auth.js";
import { getSupabase } from "../config/supabase.js";

const router = express.Router();
router.use(requireAuth);

const avatarUpload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    const allowed = new Set([".jpg", ".jpeg", ".png", ".webp"]);
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowed.has(ext)) return cb(new Error("Only JPG, PNG, or WebP images are allowed"));
    return cb(null, true);
  }
});

/* ── GET PROFILE ── */
router.get("/profile", async (req, res) => {
  try {
    const db = getSupabase();
    const { data, error } = await db
      .from("profiles")
      .select("*")
      .eq("user_id", req.user.id)
      .single();
    if (error || !data) return res.status(404).json({ message: "Profile not found" });
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch profile", error: error.message });
  }
});

/* ── UPDATE PROFILE ── */
router.put("/profile", async (req, res) => {
  try {
    const { username, preferences } = req.body;
    const updates = { updated_at: new Date().toISOString() };
    if (username) updates.username = username;
    if (preferences?.units) {
      // Merge into existing preferences
      const db2 = getSupabase();
      const { data: existing } = await db2.from("profiles").select("preferences").eq("user_id", req.user.id).single();
      updates.preferences = { ...(existing?.preferences || {}), units: preferences.units };
    }

    const db = getSupabase();
    const { data, error } = await db
      .from("profiles")
      .update(updates)
      .eq("user_id", req.user.id)
      .select()
      .single();
    if (error) throw error;
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ message: "Failed to update profile", error: error.message });
  }
});

/* ── UPLOAD AVATAR ── */
router.post("/profile-picture", avatarUpload.single("avatar"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "Image file required" });
    const db = getSupabase();

    // Remove old avatar if exists
    const { data: profile } = await db.from("profiles").select("profile_picture_path").eq("user_id", req.user.id).single();
    if (profile?.profile_picture_path) {
      await db.storage.from("avatars").remove([profile.profile_picture_path]);
    }

    const ext = path.extname(req.file.originalname).toLowerCase() || ".jpg";
    const storagePath = `${req.user.id}/${Date.now()}${ext}`;
    const buffer = fs.readFileSync(req.file.path);
    const { error: uploadErr } = await db.storage.from("avatars").upload(storagePath, buffer, { contentType: req.file.mimetype });
    fs.unlinkSync(req.file.path);
    if (uploadErr) throw uploadErr;

    await db.from("profiles").update({ profile_picture_path: storagePath, updated_at: new Date().toISOString() }).eq("user_id", req.user.id);

    // Get public URL (avatars bucket is public)
    const { data: urlData } = db.storage.from("avatars").getPublicUrl(storagePath);

    return res.json({ message: "Profile picture updated", profilePicture: urlData?.publicUrl || storagePath });
  } catch (error) {
    return res.status(500).json({ message: "Failed to update picture", error: error.message });
  }
});

/* ── GET AVATAR ── */
router.get("/profile-picture", async (req, res) => {
  try {
    const db = getSupabase();
    const { data: profile } = await db.from("profiles").select("profile_picture_path").eq("user_id", req.user.id).single();
    if (!profile?.profile_picture_path) return res.status(404).json({ message: "No profile picture" });

    const { data, error } = await db.storage.from("avatars").download(profile.profile_picture_path);
    if (error || !data) return res.status(404).json({ message: "No profile picture" });

    const buffer = Buffer.from(await data.arrayBuffer());
    const ext = path.extname(profile.profile_picture_path).toLowerCase();
    const mimeMap = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };
    res.type(mimeMap[ext] || "image/jpeg");
    return res.send(buffer);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch picture", error: error.message });
  }
});

/* ── DELETE AVATAR ── */
router.delete("/profile-picture", async (req, res) => {
  try {
    const db = getSupabase();
    const { data: profile } = await db.from("profiles").select("profile_picture_path").eq("user_id", req.user.id).single();
    if (profile?.profile_picture_path) {
      await db.storage.from("avatars").remove([profile.profile_picture_path]);
    }
    await db.from("profiles").update({ profile_picture_path: null, updated_at: new Date().toISOString() }).eq("user_id", req.user.id);
    return res.json({ message: "Profile picture removed" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to remove picture", error: error.message });
  }
});

/* ── CHANGE PASSWORD ── */
// With Clerk, password management happens on the Clerk-hosted side.
// This endpoint is kept as a placeholder that returns a helpful message.
router.put("/change-password", (req, res) => {
  return res.json({ message: "Password is managed by Clerk. Use your Clerk account settings to change it." });
});

/* ── DELETE ACCOUNT ── */
router.delete("/delete", async (req, res) => {
  try {
    const userId = req.user.id;
    const db = getSupabase();

    // Delete certificate files
    const { data: certs } = await db.from("certificates").select("file_path").eq("user_id", userId);
    const certPaths = (certs || []).filter((c) => c.file_path).map((c) => c.file_path);
    if (certPaths.length > 0) await db.storage.from("certificates").remove(certPaths);

    // Delete GPX files
    const { data: runs } = await db.from("runs").select("gpx_path").eq("user_id", userId);
    const gpxPaths = (runs || []).filter((r) => r.gpx_path).map((r) => r.gpx_path);
    if (gpxPaths.length > 0) await db.storage.from("gpx-files").remove(gpxPaths);

    // Delete avatar
    const { data: profile } = await db.from("profiles").select("profile_picture_path").eq("user_id", userId).single();
    if (profile?.profile_picture_path) {
      await db.storage.from("avatars").remove([profile.profile_picture_path]);
    }

    // Delete rows
    await Promise.all([
      db.from("runs").delete().eq("user_id", userId),
      db.from("certificates").delete().eq("user_id", userId),
      db.from("profiles").delete().eq("user_id", userId)
    ]);

    return res.json({ message: "Account and all data deleted" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to delete account", error: error.message });
  }
});

export default router;
