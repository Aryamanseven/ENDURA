export const API_URL = import.meta.env.VITE_SERVER_URL || "";
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";
export const PDF_WORKER_URL = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

export function isValidGoogleClientId(value) {
  return (
    typeof value === "string" &&
    value.endsWith(".apps.googleusercontent.com") &&
    !value.includes("REPLACE_WITH")
  );
}
