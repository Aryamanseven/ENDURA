import { useEffect, useState } from "react";
import { api } from "../api.js";
import { extractTextFromCertificate } from "../ocr.js";
import CertificatePreviewModal from "../components/CertificatePreviewModal.jsx";
import {
  formatSeconds,
  parseDurationInputToSeconds,
  parseTimeToSeconds,
  inferDistanceLabel,
  inferDateIso,
  inferTitle
} from "../utils.js";
import { ButtonPrimary, StatusAlert, Spinner } from "../components/ui.jsx";

export default function CertificatesPage() {
  const [certificates, setCertificates] = useState([]);
  const [status, setStatus] = useState("");
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrPreviewText, setOcrPreviewText] = useState("");
  const [certificateFile, setCertificateFile] = useState(null);
  const [form, setForm] = useState({
    title: "",
    distance_label: "",
    official_time_seconds: "",
    event_date: "",
    notes: ""
  });

  const [preview, setPreview] = useState(null);

  useEffect(() => {
    loadCertificates();
  }, []);

  async function loadCertificates() {
    try {
      const { data } = await api.getCertificates();
      setCertificates(data);
    } catch {
      setStatus("Failed to load certificates");
    }
  }

  async function onCertificateFileChange(e) {
    const file = e.target.files?.[0] || null;
    setCertificateFile(file);
    if (!file) {
      setOcrPreviewText("");
      return;
    }

    setOcrLoading(true);
    try {
      const extractedText = await extractTextFromCertificate(file);
      if (extractedText?.trim().length > 0) {
        setOcrPreviewText(extractedText);
      } else {
        setOcrPreviewText("[No text extracted]");
      }

      const inferredSeconds = parseTimeToSeconds(extractedText);
      const inferredDistance = inferDistanceLabel(extractedText);
      const inferredDate = inferDateIso(extractedText);
      const inferredTitle = inferTitle(extractedText);

      const detected = [];
      if (inferredTitle) detected.push("title");
      if (inferredDistance) detected.push("distance");
      if (inferredSeconds) detected.push("time");
      if (inferredDate) detected.push("date");

      setForm((prev) => ({
        title: prev.title || inferredTitle,
        distance_label: prev.distance_label || inferredDistance,
        official_time_seconds: prev.official_time_seconds || (inferredSeconds ? formatSeconds(inferredSeconds) : ""),
        event_date: prev.event_date || inferredDate,
        notes: prev.notes || (detected.length > 0 ? "Auto-filled from certificate" : "")
      }));

      if (detected.length > 0) {
        setStatus(`Auto-detected: ${detected.join(", ")}. Please review before saving.`);
      } else {
        setStatus("Could not detect fields. Fill details manually.");
      }
    } catch (error) {
      setOcrPreviewText(`[Extraction error] ${error?.message || "Unknown"}`);
      setStatus("Auto-read failed. Fill details manually.");
    } finally {
      setOcrLoading(false);
    }
  }

  async function addCertificate() {
    const officialTimeSeconds = parseDurationInputToSeconds(form.official_time_seconds);
    if (!officialTimeSeconds || officialTimeSeconds <= 0) {
      setStatus("Enter official time as hh:mm:ss or seconds.");
      return;
    }

    try {
      const formData = new FormData();
      formData.append("title", form.title);
      formData.append("distance_label", form.distance_label);
      formData.append("official_time_seconds", String(officialTimeSeconds));
      formData.append("event_date", form.event_date);
      formData.append("notes", form.notes || "");
      if (certificateFile) formData.append("file", certificateFile);

      await api.addCertificate(formData);
      setForm({ title: "", distance_label: "", official_time_seconds: "", event_date: "", notes: "" });
      setCertificateFile(null);
      setOcrPreviewText("");
      setStatus("Certificate added.");
      await loadCertificates();
    } catch (error) {
      setStatus(error?.response?.data?.message || "Failed to add certificate");
    }
  }

  async function openFile(cert) {
    try {
      const response = await api.getCertificateFile(cert._id);
      const blobUrl = window.URL.createObjectURL(response.data);
      setPreview({
        blobUrl,
        mimeType: cert.file_mime || response.data.type || "application/octet-stream",
        fileName: cert.file_name || "certificate"
      });
    } catch {
      setStatus("Failed to open file");
    }
  }

  function closePreview() {
    if (preview?.blobUrl) window.URL.revokeObjectURL(preview.blobUrl);
    setPreview(null);
  }

  async function deleteCert(id) {
    if (!confirm("Delete this certificate?")) return;
    try {
      await api.deleteCertificate(id);
      await loadCertificates();
    } catch {
      setStatus("Failed to delete certificate");
    }
  }

  return (
    <div className="space-y-10">
      {/* Header */}
      <div>
        <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-neon mb-2">DOCUMENTS</p>
        <h1 className="text-4xl md:text-5xl font-sans font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
          Certificates
        </h1>
        <p className="font-mono text-xs mt-2" style={{ color: "var(--text-muted)" }}>Official race results and documents</p>
      </div>

      {/* Upload Form */}
      <div className="glass-panel rounded-2xl p-6 space-y-4">
        <p className="font-mono text-[10px] tracking-[0.3em] uppercase" style={{ color: "var(--text-muted)" }}>ADD CERTIFICATE</p>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="block text-[10px] font-mono uppercase tracking-[0.3em] mb-1.5" style={{ color: "var(--text-muted)" }}>EVENT TITLE</label>
            <input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} placeholder="Marathon City 2024" className="input-void w-full" />
          </div>
          <div>
            <label className="block text-[10px] font-mono uppercase tracking-[0.3em] mb-1.5" style={{ color: "var(--text-muted)" }}>DISTANCE</label>
            <select value={form.distance_label} onChange={(e) => setForm((p) => ({ ...p, distance_label: e.target.value }))} className="input-void w-full">
              <option value="">Select distance</option>
              <option value="5K">5K</option>
              <option value="10K">10K</option>
              <option value="Half Marathon">Half Marathon</option>
              <option value="25K">25K</option>
              <option value="Marathon">Marathon</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-mono uppercase tracking-[0.3em] mb-1.5" style={{ color: "var(--text-muted)" }}>OFFICIAL TIME (HH:MM:SS)</label>
            <input value={form.official_time_seconds} onChange={(e) => setForm((p) => ({ ...p, official_time_seconds: e.target.value }))} placeholder="01:45:30" className="input-void w-full" />
          </div>
          <div>
            <label className="block text-[10px] font-mono uppercase tracking-[0.3em] mb-1.5" style={{ color: "var(--text-muted)" }}>EVENT DATE</label>
            <input
              value={form.event_date}
              onChange={(e) => setForm((p) => ({ ...p, event_date: e.target.value }))}
              onFocus={(e) => e.target.showPicker?.()}
              onClick={(e) => e.target.showPicker?.()}
              type="date"
              className="input-void w-full"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-[10px] font-mono uppercase tracking-[0.3em] mb-1.5" style={{ color: "var(--text-muted)" }}>NOTES</label>
            <textarea value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} placeholder="Optional notes..." rows={2} className="input-void w-full resize-none" />
          </div>
          <div className="md:col-span-2">
            <label className="block text-[10px] font-mono uppercase tracking-[0.3em] mb-1.5" style={{ color: "var(--text-muted)" }}>CERTIFICATE FILE (PDF, JPG, PNG)</label>
            <input
              type="file"
              accept=".pdf,.jpeg,.jpg,.png"
              onChange={onCertificateFileChange}
              className="input-void w-full text-sm"
            />
          </div>
        </div>

        {ocrLoading && (
          <div className="flex items-center gap-2 font-mono text-xs mt-3" style={{ color: "var(--text-muted)" }}>
            <Spinner size="sm" />
            Reading certificate and auto-filling fields...
          </div>
        )}

        <StatusAlert text={status} variant="info" />

        <div className="mt-4">
          <ButtonPrimary onClick={addCertificate}>Add Certificate</ButtonPrimary>
        </div>
      </div>

      {/* OCR Debug */}
      {ocrPreviewText && (
        <div className="glass-panel rounded-2xl p-6">
          <div className="flex items-center justify-between mb-3">
            <p className="font-mono text-[10px] tracking-[0.3em] uppercase" style={{ color: "var(--text-muted)" }}>EXTRACTED TEXT</p>
            <button onClick={() => navigator.clipboard.writeText(ocrPreviewText)} className="font-mono text-[10px] tracking-wider hover:text-neon transition" style={{ color: "var(--text-muted)" }}>
              COPY
            </button>
          </div>
          <textarea readOnly value={ocrPreviewText} className="input-void w-full min-h-32 resize-none text-sm font-mono" />
        </div>
      )}

      {/* Certificate List */}
      <div>
        <div className="flex items-center gap-4 mb-6">
          <p className="font-mono text-[10px] tracking-[0.3em] uppercase" style={{ color: "var(--text-muted)" }}>CERTIFICATE VAULT</p>
          <div className="flex-1 h-px" style={{ background: "var(--glass-border)" }} />
        </div>

        {certificates.length === 0 ? (
          <div className="glass-panel rounded-2xl text-center py-12">
            <p className="font-mono text-sm" style={{ color: "var(--text-muted)" }}>No certificates added yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {certificates.map((cert) => (
              <div key={cert._id} className="glass-panel rounded-2xl p-5 flex flex-wrap justify-between gap-3 hover:border-neon/20 transition-colors">
                <div className="space-y-1.5">
                  <p className="font-sans font-semibold text-lg" style={{ color: "var(--text-primary)" }}>{cert.title}</p>
                  <div className="flex flex-wrap items-center gap-x-4 font-mono text-xs" style={{ color: "var(--text-muted)" }}>
                    <span>{cert.distance_label}</span>
                    <span>{formatSeconds(cert.official_time_seconds)}</span>
                    <span>{new Date(cert.event_date).toLocaleDateString()}</span>
                  </div>
                  {cert.notes && <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{cert.notes}</p>}
                  {cert.file_name && <p className="font-mono text-[10px]" style={{ color: "var(--text-muted)" }}>File: {cert.file_name}</p>}
                </div>
                <div className="flex items-start gap-2">
                  {cert.file_name && (
                    <button onClick={() => openFile(cert)} className="font-mono text-[10px] tracking-wider hover:text-neon transition px-3 py-1.5 rounded-lg border" style={{ color: "var(--text-muted)", borderColor: "var(--glass-border)" }}>
                      PREVIEW
                    </button>
                  )}
                  <button onClick={() => deleteCert(cert._id)} className="font-mono text-[10px] tracking-wider text-rose-400/60 hover:text-rose-400 transition px-3 py-1.5 rounded-lg border border-rose-500/10 hover:border-rose-500/30">
                    DELETE
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {preview && (
        <CertificatePreviewModal
          blobUrl={preview.blobUrl}
          mimeType={preview.mimeType}
          fileName={preview.fileName}
          onClose={closePreview}
        />
      )}
    </div>
  );
}
