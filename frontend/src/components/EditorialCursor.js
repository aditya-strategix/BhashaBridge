'use client';

import { useEffect, useRef } from 'react';

/**
 * Smooth hardware-accelerated editorial cursor ring matched to BhashaBridge's
 * Ivory / Ink / Cobalt / Vermilion theme. Keeps the crisp native OS cursor
 * for zero-lag precision while adding a gentle, eye-friendly trailing halo.
 */
export default function EditorialCursor() {
  const ringRef = useRef(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (!finePointer.matches || reducedMotion.matches) return;

    const ring = ringRef.current;
    if (!ring) return;

    let mouseX = -100;
    let mouseY = -100;
    let ringX = -100;
    let ringY = -100;
    let scale = 1;
    let targetScale = 1;
    let visible = false;
    let mode = 'default'; // 'default' | 'pointer' | 'accent' | 'hidden'
    let rafId = null;

    const isDark = () => document.documentElement.getAttribute('data-theme') === 'dark';

    const applyModeStyles = (nextMode, force = false) => {
      if (!force && mode === nextMode) return;
      mode = nextMode;
      const dark = isDark();
      if (nextMode === 'pointer') {
        targetScale = 1.45;
        ring.style.borderColor = dark ? 'rgba(107, 140, 255, 0.92)' : 'rgba(0, 34, 255, 0.72)';
        ring.style.backgroundColor = dark ? 'rgba(79, 117, 255, 0.16)' : 'rgba(0, 34, 255, 0.08)';
        ring.style.boxShadow = dark ? '0 0 14px rgba(79, 117, 255, 0.45)' : '0 0 0 1px rgba(253, 251, 247, 0.35)';
        ring.style.opacity = '1';
      } else if (nextMode === 'accent') {
        targetScale = 1.45;
        ring.style.borderColor = dark ? 'rgba(255, 92, 64, 0.92)' : 'rgba(255, 51, 17, 0.78)';
        ring.style.backgroundColor = dark ? 'rgba(255, 77, 46, 0.16)' : 'rgba(255, 51, 17, 0.08)';
        ring.style.boxShadow = dark ? '0 0 14px rgba(255, 77, 46, 0.42)' : '0 0 0 1px rgba(253, 251, 247, 0.35)';
        ring.style.opacity = '1';
      } else if (nextMode === 'hidden') {
        targetScale = 0.65;
        ring.style.opacity = '0';
      } else {
        targetScale = 1;
        ring.style.borderColor = dark ? 'rgba(138, 168, 255, 0.65)' : 'rgba(0, 34, 255, 0.42)';
        ring.style.backgroundColor = dark ? 'rgba(244, 241, 234, 0.06)' : 'rgba(253, 251, 247, 0.06)';
        ring.style.boxShadow = dark ? '0 0 10px rgba(79, 117, 255, 0.25)' : '0 0 0 1px rgba(253, 251, 247, 0.35)';
        ring.style.opacity = visible ? '1' : '0';
      }
    };

    const onThemeChange = () => {
      applyModeStyles(mode || 'default', true);
    };

    const detectTarget = (target) => {
      if (!target || !(target instanceof Element)) return 'default';
      if (target.closest('input, textarea, [contenteditable="true"], [disabled], [aria-disabled="true"]')) {
        return 'hidden';
      }
      const interactive = target.closest('a, button, select, summary, [role="button"], label');
      if (interactive) {
        const cls = String(interactive.className || '');
        if (cls.includes('Danger') || cls.includes('logout') || cls.includes('btnLaunch') || cls.includes('headerBtnLive')) {
          return 'accent';
        }
        return 'pointer';
      }
      return 'default';
    };

    const onMouseMove = (e) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
      if (!visible) {
        visible = true;
        ringX = mouseX;
        ringY = mouseY;
        ring.style.opacity = mode === 'hidden' ? '0' : '1';
      }
      applyModeStyles(detectTarget(e.target));
    };

    const onMouseDown = () => {
      if (mode !== 'hidden') {
        targetScale = 0.78;
      }
    };

    const onMouseUp = (e) => {
      const next = detectTarget(e.target);
      mode = ''; // force reapply scale
      applyModeStyles(next);
    };

    const onMouseLeave = () => {
      visible = false;
      ring.style.opacity = '0';
    };

    const tick = () => {
      // Smooth spring lerp (18% per frame) for zero jitter and soft eye comfort
      ringX += (mouseX - ringX) * 0.2;
      ringY += (mouseY - ringY) * 0.2;
      scale += (targetScale - scale) * 0.22;

      ring.style.transform = `translate3d(${ringX - 14}px, ${ringY - 14}px, 0) scale(${scale.toFixed(3)})`;
      rafId = requestAnimationFrame(tick);
    };

    window.addEventListener('mousemove', onMouseMove, { passive: true });
    window.addEventListener('mousedown', onMouseDown, { passive: true });
    window.addEventListener('mouseup', onMouseUp, { passive: true });
    window.addEventListener('bb-theme-change', onThemeChange);
    document.addEventListener('mouseleave', onMouseLeave);
    rafId = requestAnimationFrame(tick);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('bb-theme-change', onThemeChange);
      document.removeEventListener('mouseleave', onMouseLeave);
    };
  }, []);

  return (
    <div
      ref={ringRef}
      aria-hidden="true"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: 28,
        height: 28,
        borderRadius: '50%',
        border: '1.5px solid rgba(0, 34, 255, 0.42)',
        backgroundColor: 'rgba(253, 251, 247, 0.06)',
        boxShadow: '0 0 0 1px rgba(253, 251, 247, 0.35)',
        pointerEvents: 'none',
        zIndex: 2147483647,
        opacity: 0,
        willChange: 'transform, opacity',
        transition: 'border-color 0.16s ease, background-color 0.16s ease, opacity 0.18s ease',
      }}
    />
  );
}
