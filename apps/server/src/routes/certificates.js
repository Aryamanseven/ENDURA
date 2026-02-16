import express from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { requireAuth } from "../middleware/auth.js";
import { getSupabase } from "../config/supabase.js";

const router = express.Router();

const allowedExt = new Set([".pdf", ".jpeg", ".jpg", ".png"]);
const allowedMime = new Set(["application/pdf", "image/jpeg", "image/jpg", "image/png"]);

const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowedExt.has(ext) || !allowedMime.has(file.mimetype)) {
      return cb(new Error("Only PDF, JPEG, JPG, or PNG files are allowed"));
    }
    return cb(null, true);
  }
});

router.use(requireAuth);

/* ── LIST ── */
router.get("/", async (req, res) => {
  try {
    const db = getSupabase();
    const { data, error } = await db
      .from("certificates")
      .select("*")
      .eq("user_id", req.user.id)
      .order("event_date", { ascending: false });
    if (error) throw error;
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch certificates", error: error.message });
  }
});

/* ── CREATE ── */
router.post("/", upload.single("file"), async (req, res) => {
  try {
    const { title, distance_label, official_time_seconds, event_date, notes } = req.body;
    if (!title || !distance_label || !official_time_seconds || !event_date) {
      return res.status(400).json({ message: "title, distance_label, official_time_seconds, and event_date are required" });
    }

    const db = getSupabase();
    let filePath = null;

    if (req.file) {
      const ext = path.extname(req.file.originalname).toLowerCase();
      filePath = `${req.user.id}/${Date.now()}${ext}`;
      const buffer = fs.readFileSync(req.file.path);
      await db.storage.from("certificates").upload(filePath, buffer, { contentType: req.file.mimetype });
      fs.unlinkSync(req.file.path);
    }

    const { data: cert, error } = await db
      .from("certificates")
      .insert({
        user_id: req.user.id,
        title,
        distance_label,
        official_time_seconds: Number(official_time_seconds),
        event_date,
        notes: notes || "",
        file_path: filePath,
        file_name: req.file?.originalname || null,
        file_mime: req.file?.mimetype || null
      })
      .select()
      .single();

    if (error) throw error;
    return res.status(201).json(cert);
  } catch (error) {
    return res.status(500).json({ message: "Failed to add certificate", error: error.message });
  }
});

/* ── DOWNLOAD FILE ── */
router.get("/:id/file", async (req, res) => {
  try {
    const db = getSupabase();
    const { data: cert } = await db
      .from("certificates")
      .select("file_path, file_name, file_mime")
      .eq("id", req.params.id)
      .eq("user_id", req.user.id)
      .single();

    if (!cert?.file_path) return res.status(404).json({ message: "Certificate file not found" });

    const { data, error } = await db.storage.from("certificates").download(cert.file_path);
    if (error || !data) return res.status(404).json({ message: "Certificate file missing in storage" });

    const buffer = Buffer.from(await data.arrayBuffer());
    if (cert.file_mime) res.type(cert.file_mime);
    if (cert.file_name) res.setHeader("Content-Disposition", `inline; filename="${cert.file_name}"`);
    return res.send(buffer);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch certificate file", error: error.message });
  }
});

/* ── DELETE ── */
router.delete("/:id", async (req, res) => {
  try {
    const db = getSupabase();
    const { data: cert } = await db
      .from("certificates")
      .select("id, file_path")
      .eq("id", req.params.id)
      .eq("user_id", req.user.id)
      .single();

    if (!cert) return res.status(404).json({ message: "Certificate not found" });

    if (cert.file_path) {
      await db.storage.from("certificates").remove([cert.file_path]);
    }

    await db.from("certificates").delete().eq("id", cert.id);
    return res.json({ message: "Certificate deleted" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to delete certificate", error: error.message });
  }
});

export default router;
