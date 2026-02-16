export function formatSeconds(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function formatDateDisplay(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "--";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseDurationInputToSeconds(value) {
  if (!value) return null;
  const text = String(value).trim();
  if (/^\d+$/.test(text)) return Number(text);

  const hhmmss = text.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
  if (hhmmss) return Number(hhmmss[1]) * 3600 + Number(hhmmss[2]) * 60 + Number(hhmmss[3]);

  const mmss = text.match(/^(\d{1,2}):(\d{2})$/);
  if (mmss) return Number(mmss[1]) * 60 + Number(mmss[2]);

  return null;
}

export function parseTimeToSeconds(text) {
  if (!text) return null;
  const cleaned = text.replace(/\n/g, " ").trim();

  const hhmmss = cleaned.match(/(?:^|\D)(\d{1,2})[:h\.\s](\d{1,2})[:m\.\s](\d{1,2})(?:\D|$)/i);
  if (hhmmss) return Number(hhmmss[1]) * 3600 + Number(hhmmss[2]) * 60 + Number(hhmmss[3]);

  const hmsWords = cleaned.match(/(\d{1,2})\s*h(?:ours?)?\s*(\d{1,2})\s*m(?:in(?:ute)?s?)?\s*(\d{1,2})\s*s/i);
  if (hmsWords) return Number(hmsWords[1]) * 3600 + Number(hmsWords[2]) * 60 + Number(hmsWords[3]);

  const hmWords = cleaned.match(/(\d{1,2})\s*h(?:ours?)?\s*(\d{1,2})\s*m(?:in(?:ute)?s?)?/i);
  if (hmWords) return Number(hmWords[1]) * 3600 + Number(hmWords[2]) * 60;

  const mmss = cleaned.match(/(?:^|\D)(\d{1,2})[:m\.\s](\d{2})(?:\D|$)/i);
  if (mmss) return Number(mmss[1]) * 60 + Number(mmss[2]);

  const explicit = cleaned.match(/(?:finish\s*time|official\s*time|net\s*time)\s*[:\-]?\s*(\d{1,2}:\d{2}(?::\d{2})?)/i);
  if (explicit) {
    const parts = explicit[1].split(":").map(Number);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
  }

  return null;
}

export function inferDistanceLabel(text) {
  const lowered = text.toLowerCase().replace(/\s+/g, " ");
  if (/\b5\s*(k|km)\b|\b5k\b/.test(lowered)) return "5K";
  if (/\b10\s*(k|km)\b|\b10k\b/.test(lowered)) return "10K";
  if (/half\s*marathon|\b21\s*(\.1|k|km)\b|\b21\.097\b/.test(lowered)) return "Half Marathon";
  if (/\b25\s*(k|km)\b|\b25k\b/.test(lowered)) return "25K";
  if (/\bmarathon\b|\b42\s*(\.195|k|km)\b/.test(lowered)) return "Marathon";
  return "";
}

export function inferDateIso(text) {
  const cleaned = text.replace(/,/g, " ");
  const patterns = [/(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/, /(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/];
  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (!match) continue;
    if (pattern === patterns[0]) {
      return `${match[1]}-${String(match[2]).padStart(2, "0")}-${String(match[3]).padStart(2, "0")}`;
    }
    return `${match[3]}-${String(match[2]).padStart(2, "0")}-${String(match[1]).padStart(2, "0")}`;
  }

  const monthMap = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12"
  };

  const textual = cleaned.match(/(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{4})/i);
  if (textual) {
    return `${textual[3]}-${monthMap[textual[2].slice(0, 3).toLowerCase()] || "01"}-${String(textual[1]).padStart(2, "0")}`;
  }

  const textualRev = cleaned.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})\s+(\d{4})/i);
  if (textualRev) {
    return `${textualRev[3]}-${monthMap[textualRev[1].slice(0, 3).toLowerCase()] || "01"}-${String(textualRev[2]).padStart(2, "0")}`;
  }

  return "";
}

export function inferTitle(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  return lines.find((l) => l.length >= 5 && l.length <= 60) || "";
}

export function parseGpxRoute(xmlString) {
  const parser = new DOMParser();
  const xml = parser.parseFromString(xmlString, "application/xml");
  const points = Array.from(xml.getElementsByTagName("trkpt")).map((node) => {
    const lat = Number(node.getAttribute("lat"));
    const lon = Number(node.getAttribute("lon"));
    const eleNode = node.getElementsByTagName("ele")[0];
    return { lat, lon, ele: eleNode ? Number(eleNode.textContent) : 0 };
  });
  return points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
}

export function getApiErrorMessage(error, fallbackMessage) {
  if (typeof error?.response?.data?.message === "string" && error.response.data.message.trim()) {
    return error.response.data.message;
  }
  if (typeof error?.message === "string" && error.message.trim()) {
    if (error.message.toLowerCase().includes("network")) {
      return "Cannot reach backend. Check server on port 5000.";
    }
    return error.message;
  }
  return fallbackMessage;
}
