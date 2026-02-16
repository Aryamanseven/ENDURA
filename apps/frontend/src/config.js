export const API_URL = import.meta.env.VITE_SERVER_URL || "";
export const PDF_WORKER_URL = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
