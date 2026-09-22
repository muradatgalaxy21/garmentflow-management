import type { RefObject } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(ScrollTrigger, useGSAP);

interface MediaConditions {
  isDesktop: boolean;
  reduceMotion: boolean;
}

// Builds one reveal timeline per zone plus a scrubbed spine on desktop.
// useGSAP reverts everything on unmount, including StrictMode remounts and HMR.
export function usePipelineScroll(scope: RefObject<HTMLElement>) {
  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add(
        {
          isDesktop: "(min-width: 768px)",
          reduceMotion: "(prefers-reduced-motion: reduce)",
        },
        (context) => {
          const { isDesktop, reduceMotion } = (context.conditions ?? {}) as Partial<MediaConditions>;
          const root = scope.current;
          if (reduceMotion || !root) return;

          root.querySelectorAll<HTMLElement>("[data-zone]").forEach((zone) => {
            const strokes = zone.querySelectorAll(".stage-icon-stroke");
            gsap.set(strokes, { strokeDasharray: 1, strokeDashoffset: 1 });

            gsap
              .timeline({
                scrollTrigger: { trigger: zone, start: "top 80%", once: true },
              })
              .from(zone.querySelector("[data-zone-node]"), { scale: 0, duration: 0.4, ease: "back.out(2)" })
              .from(zone.querySelector("[data-zone-label]"), { x: -16, opacity: 0, duration: 0.4, ease: "power2.out" }, "<")
              .from(zone.querySelectorAll("[data-stage-card]"), { y: 24, opacity: 0, duration: 0.5, stagger: 0.12, ease: "power2.out" }, "-=0.2")
              .to(strokes, { strokeDashoffset: 0, duration: 0.8, stagger: 0.015, ease: "power1.inOut" }, "<0.1")
              .fromTo(
                zone.querySelectorAll("[data-qc-pulse]"),
                { scale: 1, opacity: 0.6 },
                { scale: 1.8, opacity: 0, duration: 0.9, repeat: 2, ease: "power1.out" },
                "-=0.3",
              );
          });

          // The spine only exists in the desktop layout
          if (!isDesktop) return;

          const spine = root.querySelector("[data-spine]");
          const progress = root.querySelector("[data-spine-progress]");
          if (!spine || !progress) return;
          gsap.set(progress, { strokeDasharray: 1, strokeDashoffset: 1 });

          gsap
            .timeline({
              scrollTrigger: { trigger: spine, start: "top 60%", end: "bottom 60%", scrub: 0.6 },
            })
            .to(progress, { strokeDashoffset: 0, ease: "none" })
            .fromTo(root.querySelector("[data-spine-marker]"), { top: "0%" }, { top: "100%", ease: "none" }, 0);
        },
      );

      return () => mm.revert();
    },
    { scope },
  );
}
