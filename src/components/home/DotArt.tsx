"use client";

import { useEffect, useRef } from "react";

/*
 * Hero artwork: the Balle mark (public/brand/mark.webp, the owner's logo) rebuilt as a field of
 * dots. The mark is drawn once to an offscreen canvas and sampled on a grid; cells inside it get
 * a full dot, the rest of a soft disc behind it gets a faint one. A slow wave swells the dots so
 * the mark reads as if it were breathing. Until the image has loaded only the faint disc shows.
 */
const INK = "7, 62, 50";
const MARK_SRC = "/brand/mark.webp";

// The mark fills this share of the sampled square (the B is squarer than the old ball, so a little less).
const SHARE = 0.66;

function markMask(img: HTMLImageElement, px: number) {
  const c = document.createElement("canvas");
  c.width = px;
  c.height = px;
  const g = c.getContext("2d");
  if (!g) return null;
  const side = px * SHARE;
  g.drawImage(img, (px - side) / 2, (px - side) / 2, side, side);
  return g.getImageData(0, 0, px, px).data;
}

export function DotArt() {
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const host = stage.current;
    const el = canvas.current;
    if (!host || !el) return;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let dots: { x: number; y: number; r: number; a: number; on: boolean; d: number }[] = [];
    let frame = 0;
    let w = 0;
    let h = 0;
    let markImg: HTMLImageElement | null = null;

    const layout = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = host.clientWidth;
      h = host.clientHeight;
      el.width = Math.round(w * dpr);
      el.height = Math.round(h * dpr);
      el.style.width = `${w}px`;
      el.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const size = Math.max(120, Math.min(h * 0.82, w * 0.86));
      const step = Math.max(4.2, size / 64);
      const mask = markImg ? markMask(markImg, 256) : null;
      const cx = w / 2;
      const cy = h / 2;
      const halo = size * 0.72;
      dots = [];
      for (let y = cy - halo; y <= cy + halo; y += step) {
        for (let x = cx - halo; x <= cx + halo; x += step) {
          const dist = Math.hypot(x - cx, y - cy);
          if (dist > halo) continue;
          const u = (x - (cx - size / 2)) / size;
          const v = (y - (cy - size / 2)) / size;
          let on = false;
          if (mask && u >= 0 && u < 1 && v >= 0 && v < 1) {
            const i = (Math.floor(v * 256) * 256 + Math.floor(u * 256)) * 4 + 3;
            on = mask[i] > 120;
          }
          const fade = 1 - dist / halo;
          dots.push({ x, y, r: on ? step * 0.36 : step * 0.12, a: on ? 1 : 0.1 + fade * 0.16, on, d: dist / size });
        }
      }
    };

    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      for (const p of dots) {
        const swell = still ? 1 : 1 + 0.16 * Math.sin(t / 900 - p.d * 9);
        ctx.fillStyle = `rgba(${INK}, ${p.a})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.on ? p.r * swell : p.r, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const loop = (t: number) => {
      draw(t);
      frame = requestAnimationFrame(loop);
    };

    layout();
    const img = new Image();
    img.onload = () => {
      markImg = img;
      layout();
      if (still) draw(0);
    };
    img.src = MARK_SRC;
    if (still) draw(0);
    else frame = requestAnimationFrame(loop);
    const ro = new ResizeObserver(() => {
      layout();
      if (still) draw(0);
    });
    ro.observe(host);
    const onVis = () => {
      cancelAnimationFrame(frame);
      if (!document.hidden && !still) frame = requestAnimationFrame(loop);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelAnimationFrame(frame);
      img.onload = null;
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return (
    <div ref={stage} className="hero-stage" aria-hidden="true">
      <canvas ref={canvas} className="hero-canvas" />
    </div>
  );
}
