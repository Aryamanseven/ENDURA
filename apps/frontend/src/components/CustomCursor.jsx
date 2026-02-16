import { useEffect, useRef, useCallback } from "react";
import gsap from "gsap";

/**
 * CustomCursor — neon ring + dot following the mouse.
 * Expands on hover over interactive elements.
 * Only shown on pointer (non-touch) devices.
 */
export default function CustomCursor() {
  const cursorRef = useRef(null);
  const dotRef = useRef(null);

  const onMove = useCallback((e) => {
    if (!cursorRef.current || !dotRef.current) return;
    gsap.to(cursorRef.current, {
      x: e.clientX,
      y: e.clientY,
      duration: 0.15,
      ease: "power2.out",
    });
    gsap.to(dotRef.current, {
      x: e.clientX,
      y: e.clientY,
      duration: 0.05,
      ease: "power2.out",
    });
  }, []);

  useEffect(() => {
    // Only show on non-touch devices
    const mq = window.matchMedia("(pointer: fine)");
    if (!mq.matches) return;

    document.addEventListener("mousemove", onMove);

    // Expand cursor on interactive elements
    const expand = () => {
      if (cursorRef.current) {
        gsap.to(cursorRef.current, { width: 48, height: 48, backgroundColor: "rgba(255,255,255,0.06)", duration: 0.25 });
      }
    };
    const shrink = () => {
      if (cursorRef.current) {
        gsap.to(cursorRef.current, { width: 20, height: 20, backgroundColor: "transparent", duration: 0.25 });
      }
    };

    const interactiveSelectors = "a, button, [role='button'], input, select, textarea, .magnetic-btn, .glass-panel-hover";

    const observer = new MutationObserver(() => {
      document.querySelectorAll(interactiveSelectors).forEach((el) => {
        el.removeEventListener("mouseenter", expand);
        el.removeEventListener("mouseleave", shrink);
        el.addEventListener("mouseenter", expand);
        el.addEventListener("mouseleave", shrink);
      });
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Initial bind
    document.querySelectorAll(interactiveSelectors).forEach((el) => {
      el.addEventListener("mouseenter", expand);
      el.addEventListener("mouseleave", shrink);
    });

    return () => {
      document.removeEventListener("mousemove", onMove);
      observer.disconnect();
    };
  }, [onMove]);

  return (
    <>
      <div ref={cursorRef} className="custom-cursor hidden md:block" />
      <div ref={dotRef} className="custom-cursor-dot hidden md:block" />
    </>
  );
}
