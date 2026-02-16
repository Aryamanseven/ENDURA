import { useState, useEffect, useCallback } from "react";
import { Badge, ButtonGhost } from "./ui.jsx";

export default function CertificatePreviewModal({ blobUrl, mimeType, fileName, onClose }) {
  const [zoom, setZoom] = useState(1);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [handleKeyDown]);

  const isPdf = mimeType === "application/pdf";
  const isImage = mimeType?.startsWith("image/");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/85 backdrop-blur-md" />

      {/* Modal Container */}
      <div
        className="relative z-10 w-full max-w-5xl max-h-[92vh] mx-4 flex flex-col glass-panel rounded-3xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06]">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-sm font-sans font-medium text-white truncate">{fileName || "Certificate"}</span>
            {isPdf && <Badge color="rose">PDF</Badge>}
            {isImage && <Badge color="neon">Image</Badge>}
          </div>

          <div className="flex items-center gap-2">
            {isImage && (
              <>
                <ButtonGhost onClick={() => setZoom((z) => Math.max(z - 0.25, 0.5))}>−</ButtonGhost>
                <button
                  type="button"
                  onClick={() => setZoom(1)}
                  className="rounded-full bg-white/5 border border-white/10 px-3 py-1 text-xs text-white/50 font-mono transition hover:bg-white/10"
                >
                  {Math.round(zoom * 100)}%
                </button>
                <ButtonGhost onClick={() => setZoom((z) => Math.min(z + 0.25, 4))}>+</ButtonGhost>
              </>
            )}
            <ButtonGhost danger onClick={onClose} className="ml-2">✕</ButtonGhost>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4 flex items-center justify-center min-h-[300px]">
          {isPdf && (
            <iframe
              src={blobUrl}
              title="Certificate PDF"
              className="w-full h-full min-h-[70vh] rounded-2xl border border-white/[0.06] bg-white"
            />
          )}

          {isImage && (
            <div className="overflow-auto max-w-full max-h-[75vh] flex items-center justify-center">
              <img
                src={blobUrl}
                alt={fileName || "Certificate"}
                style={{ transform: `scale(${zoom})`, transformOrigin: "center center", transition: "transform 0.2s ease" }}
                className="max-w-none rounded-2xl"
                draggable={false}
              />
            </div>
          )}

          {!isPdf && !isImage && (
            <div className="text-center space-y-3">
              <p className="text-white/40">Preview not available for this file type.</p>
              <a href={blobUrl} download={fileName} className="btn-primary inline-block rounded-full px-6 py-2.5 text-sm font-sans font-bold uppercase tracking-wider">
                Download File
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
