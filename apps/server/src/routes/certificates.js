import express from "express";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requireAuth } from "../middleware/auth.js";
import { Certificate } from "../models/Certificate.js";

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const certificateUploadsDir = path.resolve(__dirname, "../../../..", "uploads", "certificates");

if (!fs.existsSync(certificateUploadsDir)) {
  fs.mkdirSync(certificateUploadsDir, { recursive: true });
}

const allowedExt = new Set([".pdf", ".jpeg", ".jpg", ".png"]);
const allowedMime = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png"
]);

const storage = multer.diskStorage({
  destination: (_, __, callback) => callback(null, certificateUploadsDir),
  filename: (_, file, callback) => {
    const ext = path.extname(file.originalname).toLowerCase();
    callback(null, `${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024
  },
  fileFilter: (_, file, callback) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const isAllowed = allowedExt.has(ext) && allowedMime.has(file.mimetype);
    if (!isAllowed) {
      return callback(new Error("Only PDF, JPEG, JPG, or PNG files are allowed"));
    }
    return callback(null, true);
  }
});

router.use(requireAuth);

router.get("/", async (req, res) => {
  try {
    const certs = await Certificate.find({ user_id: req.user.id }).sort({ event_date: -1 });
    return res.json(certs);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch certificates", error: error.message });
  }
});

router.post("/", upload.single("file"), async (req, res) => {
  try {
    const { title, distance_label, official_time_seconds, event_date, notes } = req.body;

    if (!title || !distance_label || !official_time_seconds || !event_date) {
      return res.status(400).json({
        message: "title, distance_label, official_time_seconds, and event_date are required"
      });
    }

    const cert = await Certificate.create({
      user_id: req.user.id,
      title,
      distance_label,
      official_time_seconds: Number(official_time_seconds),
      event_date,
      notes: notes || "",
      file_url: req.file?.path || null,
      file_name: req.file?.originalname || null,
      file_mime: req.file?.mimetype || null
    });

    return res.status(201).json(cert);
  } catch (error) {
    return res.status(500).json({ message: "Failed to add certificate", error: error.message });
  }
});

router.get("/:id/file", async (req, res) => {
  try {
    const cert = await Certificate.findOne({ _id: req.params.id, user_id: req.user.id });
    if (!cert || !cert.file_url) {
      return res.status(404).json({ message: "Certificate file not found" });
    }

    if (!fs.existsSync(cert.file_url)) {
      return res.status(404).json({ message: "Certificate file missing on disk" });
    }

    if (cert.file_mime) {
      res.type(cert.file_mime);
    }

    if (cert.file_name) {
      res.setHeader("Content-Disposition", `inline; filename="${cert.file_name}"`);
    }

    return res.sendFile(path.resolve(cert.file_url));
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch certificate file", error: error.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const cert = await Certificate.findOneAndDelete({ _id: req.params.id, user_id: req.user.id });
    if (!cert) {
      return res.status(404).json({ message: "Certificate not found" });
    }

    if (cert.file_url && fs.existsSync(cert.file_url)) {
      fs.unlinkSync(cert.file_url);
    }

    return res.json({ message: "Certificate deleted" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to delete certificate", error: error.message });
  }
});

export default router;
