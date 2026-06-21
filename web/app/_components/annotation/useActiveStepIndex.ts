"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/** Track which trajectory step block is most visible while scrolling.
 *  `rootMargin` shrinks the observation band — on mobile the labels sheet
 *  covers the top of the viewport, so the band must start below it. */
export function useActiveStepIndex(
  stepIndices: number[],
  fallback = 0,
  refreshKey = 0,
  rootMargin = "-8% 0px -45% 0px",
) {
  const [activeStepIndex, setActiveStepIndex] = useState(fallback);
  const refs = useRef(new Map<number, HTMLElement>());
  const stepKey = stepIndices.join("|");

  const setStepRef = useCallback((stepIndex: number, el: HTMLElement | null) => {
    if (el) refs.current.set(stepIndex, el);
    else refs.current.delete(stepIndex);
  }, []);

  useEffect(() => {
    if (stepIndices.length === 0) return;
    setActiveStepIndex((prev) => (stepIndices.includes(prev) ? prev : stepIndices[0]));
  }, [stepKey, stepIndices]);

  useLayoutEffect(() => {
    if (stepIndices.length === 0) return;

    let observer: IntersectionObserver | null = null;
    const ratios = new Map<number, number>();

    const pickBest = () => {
      let bestIndex: number | null = null;
      let bestRatio = 0;
      for (const [index, ratio] of ratios) {
        if (ratio > bestRatio) {
          bestRatio = ratio;
          bestIndex = index;
        }
      }
      if (bestIndex != null) {
        setActiveStepIndex(bestIndex);
        return;
      }

      // Fallback when no intersection ratios (e.g. after collapsing context blocks).
      let bestTop = Infinity;
      for (const [index, el] of refs.current) {
        const rect = el.getBoundingClientRect();
        if (rect.bottom <= 0 || rect.top >= window.innerHeight) continue;
        if (rect.top < bestTop) {
          bestTop = rect.top;
          bestIndex = index;
        }
      }
      if (bestIndex != null) setActiveStepIndex(bestIndex);
    };

    const attach = () => {
      observer?.disconnect();
      ratios.clear();
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const index = Number((entry.target as HTMLElement).dataset.stepIndex);
            if (Number.isNaN(index)) continue;
            if (entry.isIntersecting && entry.intersectionRatio > 0) {
              ratios.set(index, entry.intersectionRatio);
            } else {
              ratios.delete(index);
            }
          }
          pickBest();
        },
        { threshold: [0, 0.15, 0.35, 0.55, 0.75, 1], rootMargin },
      );

      for (const el of refs.current.values()) observer.observe(el);
    };

    attach();
    const raf1 = requestAnimationFrame(() => {
      attach();
      requestAnimationFrame(attach);
    });

    return () => {
      cancelAnimationFrame(raf1);
      observer?.disconnect();
    };
  }, [stepKey, stepIndices.length, refreshKey, rootMargin]);

  return { activeStepIndex, setStepRef };
}
