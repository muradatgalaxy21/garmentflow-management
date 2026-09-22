import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import type { PipelineStage } from "./types";
import { StageIcon } from "./svg/StageIcons";

interface StageCardProps {
  stage: PipelineStage;
}

// Looping "machine running" motions, keyed by the icon part they move
const HOVER_MOTIONS: Record<string, gsap.TweenVars> = {
  ".stage-icon-spin": { strokeDashoffset: -10, duration: 0.6, ease: "none" },
  ".stage-icon-wave": { x: -4, duration: 0.5, yoyo: true, ease: "sine.inOut" },
  ".stage-icon-blade": { y: 4, duration: 0.25, yoyo: true, ease: "power1.inOut" },
  ".stage-icon-squeegee": { y: 24, duration: 0.7, yoyo: true, ease: "power1.inOut" },
  ".stage-icon-needle": { y: 3, duration: 0.12, yoyo: true, ease: "none" },
  ".stage-icon-steam": { y: -3, opacity: 0.3, duration: 0.6, yoyo: true, ease: "sine.inOut" },
};

export function StageCard({ stage }: StageCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const hoverTl = useRef<gsap.core.Timeline | null>(null);
  const isQc = stage.kind === "qc";

  useGSAP(
    () => {
      const tl = gsap.timeline({ paused: true });
      for (const [selector, vars] of Object.entries(HOVER_MOTIONS)) {
        const target = cardRef.current?.querySelector(selector);
        if (target) tl.to(target, { ...vars, repeat: -1 }, 0);
      }
      tl.to(cardRef.current?.querySelector("svg") ?? [], { scale: 1.08, duration: 0.3, ease: "power2.out" }, 0);
      hoverTl.current = tl;
    },
    { scope: cardRef },
  );

  // pause() instead of reverse() because the loops are infinite
  const start = () => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    hoverTl.current?.play();
  };
  const stop = () => {
    hoverTl.current?.pause(0);
  };

  return (
    <div
      ref={cardRef}
      data-stage-card
      onMouseEnter={start}
      onMouseLeave={stop}
      className={`relative flex flex-col gap-3 p-5 rounded-lg bg-white shadow-sm border ${
        isQc ? "border-[#B88E28]/60" : "border-[#E4DDD0]"
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="relative w-12 h-12 text-[#B88E28]">
          {isQc && <span data-qc-pulse className="absolute inset-0 rounded-full border-2 border-[#B88E28] opacity-0" aria-hidden="true" />}
          <StageIcon name={stage.icon} className="relative w-12 h-12" />
        </div>
        <span className="font-heading text-sm font-bold text-[#1E293B]/30">
          {String(stage.order).padStart(2, "0")}
        </span>
      </div>

      {isQc && (
        <span className="self-start text-[10px] font-semibold uppercase tracking-wider text-[#B88E28] bg-[#FAF7F0] border border-[#B88E28]/40 rounded-full px-2 py-0.5">
          Quality Gate
        </span>
      )}

      <div>
        <h3 className="font-heading font-bold text-[#1E293B] text-base leading-snug">{stage.title}</h3>
        <p className="mt-1.5 text-sm text-gray-600 leading-relaxed">{stage.text}</p>
      </div>
    </div>
  );
}
