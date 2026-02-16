import { PDF_WORKER_URL } from "./config.js";

function normalizeText(text) {
  return text.replace(/\s+/g, " ").trim();
}

function textQualityScore(text, confidence) {
  const normalized = normalizeText(text);
  const lengthBoost = Math.min(normalized.length, 1200) / 18;
  const keywordBoost =
    (/marathon|half|5k|10k|certificate|official|finish/i.test(normalized) ? 30 : 0) +
    (/\b\d{1,2}:\d{2}(?::\d{2})?\b/.test(normalized) ? 25 : 0) +
    (/\b\d{4}[-\/]\d{1,2}[-\/]\d{1,2}\b/.test(normalized) ? 15 : 0);
  return confidence + lengthBoost + keywordBoost;
}

function dedupeLines(text) {
  const seen = new Set();
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 1)
    .filter((l) => {
      const key = l.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join("\n");
}

async function createOcrCandidates(input) {
  if (typeof input !== "string" && !(input instanceof File) && !(input instanceof Blob)) {
    return [input];
  }

  const sourceUrl = typeof input === "string" ? input : URL.createObjectURL(input);

  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = sourceUrl;
    });

    const maxWidth = 2600;
    const scale = Math.min(1, maxWidth / image.width);
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));

    const baseCanvas = document.createElement("canvas");
    baseCanvas.width = width;
    baseCanvas.height = height;
    const baseCtx = baseCanvas.getContext("2d");
    if (!baseCtx) return [input];
    baseCtx.drawImage(image, 0, 0, width, height);

    const variants = [baseCanvas.toDataURL("image/png")];

    const processedCanvas = document.createElement("canvas");
    processedCanvas.width = width;
    processedCanvas.height = height;
    const processedCtx = processedCanvas.getContext("2d");
    if (processedCtx) {
      processedCtx.drawImage(baseCanvas, 0, 0);
      const imgData = processedCtx.getImageData(0, 0, width, height);
      const pixels = imgData.data;
      for (let i = 0; i < pixels.length; i += 4) {
        const luma = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
        const v = luma > 145 ? 255 : 0;
        pixels[i] = v;
        pixels[i + 1] = v;
        pixels[i + 2] = v;
      }
      processedCtx.putImageData(imgData, 0, 0);
      variants.push(processedCanvas.toDataURL("image/png"));
    }

    const grayCanvas = document.createElement("canvas");
    grayCanvas.width = width;
    grayCanvas.height = height;
    const grayCtx = grayCanvas.getContext("2d");
    if (grayCtx) {
      grayCtx.drawImage(baseCanvas, 0, 0);
      const imgData = grayCtx.getImageData(0, 0, width, height);
      const pixels = imgData.data;
      for (let i = 0; i < pixels.length; i += 4) {
        const luma = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
        const boosted = Math.min(255, luma * 1.15);
        pixels[i] = boosted;
        pixels[i + 1] = boosted;
        pixels[i + 2] = boosted;
      }
      grayCtx.putImageData(imgData, 0, 0);
      variants.push(grayCanvas.toDataURL("image/png"));
    }

    return variants;
  } finally {
    if (typeof input !== "string") URL.revokeObjectURL(sourceUrl);
  }
}

async function recognizeWithTesseract(input) {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");

  const candidates = await createOcrCandidates(input);
  const psmModes = [6, 11, 4];
  let bestText = "";
  let bestScore = -1;

  for (const psm of psmModes) {
    await worker.setParameters({
      tessedit_pageseg_mode: String(psm),
      preserve_interword_spaces: "1",
      tessedit_char_whitelist:
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789:/-.() ,"
    });

    for (const candidate of candidates) {
      const result = await worker.recognize(candidate);
      const text = (result.data.text || "").trim();
      const confidence = Number(result.data.confidence || 0);
      const score = textQualityScore(text, confidence);
      if (score > bestScore) {
        bestScore = score;
        bestText = text;
      }
    }
  }

  await worker.terminate();
  return dedupeLines(bestText);
}

export async function extractTextFromCertificate(file) {
  const ext = file.name.split(".").pop()?.toLowerCase();

  if (ext === "pdf") {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER_URL;
    const data = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data }).promise;

    const maxPages = Math.min(pdf.numPages, 5);
    let extractedText = "";

    for (let p = 1; p <= maxPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      extractedText += ` ${content.items.map((item) => item.str || "").join(" ")}`;
    }

    if (extractedText.trim().length >= 120) return dedupeLines(extractedText);

    let ocrText = "";
    const ocrPages = Math.min(pdf.numPages, 3);
    for (let p = 1; p <= ocrPages; p++) {
      const page = await pdf.getPage(p);
      const viewport = page.getViewport({ scale: 2.5 });
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      if (!context) continue;
      await page.render({ canvasContext: context, viewport }).promise;
      ocrText += `\n${await recognizeWithTesseract(canvas.toDataURL("image/png"))}`;
    }

    return dedupeLines(`${extractedText}\n${ocrText}`.trim());
  }

  return recognizeWithTesseract(file);
}
