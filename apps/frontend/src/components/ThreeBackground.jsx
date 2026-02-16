import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useTheme } from "../ThemeContext.jsx";

/**
 * ThreeBackground — moving topographic wireframe terrain.
 * Replicates the Three.js terrain runner from try.html.
 */
export default function ThreeBackground() {
  const containerRef = useRef(null);
  const { isDark } = useTheme();

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;

    // Scene
    const scene = new THREE.Scene();
    const fogColor = isDark ? 0x030305 : 0xf5f5f7;
    scene.fog = new THREE.FogExp2(fogColor, 0.002);

    // Camera
    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    camera.position.z = 5;
    camera.position.y = 2;
    camera.rotation.x = -0.2;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // Terrain
    const geometry = new THREE.PlaneGeometry(100, 100, 60, 60);
    const count = geometry.attributes.position.count;
    geometry.setAttribute(
      "color",
      new THREE.BufferAttribute(new Float32Array(count * 3), 3)
    );

    const material = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: isDark ? 0.35 : 0.12,
    });

    const wireframe = new THREE.LineSegments(
      new THREE.WireframeGeometry(geometry),
      material
    );
    wireframe.rotation.x = -Math.PI / 2;
    scene.add(wireframe);

    let time = 0;
    const speed = 0.05;
    let animId;

    function animate() {
      time += speed;
      wireframe.position.z = (time * 10) % 10;
      wireframe.rotation.z = Math.sin(time * 0.1) * 0.05;
      renderer.render(scene, camera);
      animId = requestAnimationFrame(animate);
    }
    animate();

    // Resize handler
    function onResize() {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    }
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(animId);
      renderer.dispose();
      geometry.dispose();
      material.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [isDark]);

  return <div ref={containerRef} className="canvas-container" />;
}
