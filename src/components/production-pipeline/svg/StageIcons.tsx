import type { ReactElement } from "react";
import type { StageIconName } from "../types";

// Every stroked shape uses pathLength=1 so GSAP can draw it in by
// animating strokeDashoffset from 1 to 0, without the DrawSVG plugin.
const stroke = {
  className: "stage-icon-stroke",
  pathLength: 1,
} as const;

const ICONS: Record<StageIconName, ReactElement> = {
  // Circular knitting machine: yarn cones feeding a needle cylinder, tube fabric below
  knit: (
    <>
      <path {...stroke} d="M14 6 l3 7 h-6 z M34 6 l3 7 h-6 z" />
      <path {...stroke} d="M14 13 L22 20 M34 13 L26 20" />
      <ellipse {...stroke} cx="24" cy="21" rx="12" ry="4" />
      <ellipse className="stage-icon-spin" cx="24" cy="21" rx="12" ry="4" strokeDasharray="2 3" />
      <path {...stroke} d="M12 21 v8 M36 21 v8" />
      <path {...stroke} d="M16 29 h16 v13 q-8 4 -16 0 z" />
    </>
  ),
  // Dye vat with liquid surface and stenter rollers
  dye: (
    <>
      <path {...stroke} d="M8 18 v20 q0 4 4 4 h24 q4 0 4 -4 v-20" />
      <path {...stroke} className="stage-icon-stroke stage-icon-wave" d="M8 26 q4 -3 8 0 t8 0 t8 0 t8 0" />
      <circle {...stroke} cx="16" cy="10" r="3" />
      <circle {...stroke} cx="32" cy="10" r="3" />
      <path {...stroke} d="M16 13 L24 30 L32 13" />
    </>
  ),
  // Multi-ply spread with a CNC cutting head above
  cut: (
    <>
      <path {...stroke} d="M6 34 h36 M6 38 h36 M6 42 h36" />
      <path {...stroke} d="M10 8 h28 M24 8 v8" />
      <rect {...stroke} x="19" y="16" width="10" height="7" rx="1" />
      <path {...stroke} className="stage-icon-stroke stage-icon-blade" d="M24 23 v8" />
    </>
  ),
  // Screen-print frame with squeegee pass
  print: (
    <>
      <rect {...stroke} x="8" y="14" width="32" height="24" rx="1" />
      <rect {...stroke} x="12" y="18" width="24" height="16" />
      <path {...stroke} d="M18 26 l6 -5 l6 5 l-6 5 z" />
      <path {...stroke} className="stage-icon-stroke stage-icon-squeegee" d="M10 8 h28 M24 8 v4" />
    </>
  ),
  // Inspection lens over a panel, with a pass mark
  qc: (
    <>
      <rect {...stroke} x="6" y="8" width="24" height="30" rx="2" />
      <path {...stroke} d="M11 16 h14 M11 22 h10" />
      <circle {...stroke} cx="30" cy="30" r="8" />
      <path {...stroke} d="M36 36 L42 42" />
      <path {...stroke} className="stage-icon-stroke stage-icon-check" d="M26 30 l3 3 l5 -6" />
    </>
  ),
  // Sewing machine arm, needle bar, and fabric bed
  sew: (
    <>
      <path {...stroke} d="M6 40 h36" />
      <path {...stroke} d="M10 40 v-26 q0 -4 4 -4 h22 q4 0 4 4 v8 h-10" />
      <path {...stroke} d="M30 22 v6" />
      <path {...stroke} className="stage-icon-stroke stage-icon-needle" d="M30 28 v8" />
      <circle {...stroke} cx="38" cy="14" r="3" />
    </>
  ),
  // Four-hole button and a hang tag
  trim: (
    <>
      <circle {...stroke} cx="18" cy="24" r="10" />
      <circle {...stroke} cx="15" cy="21" r="1.5" />
      <circle {...stroke} cx="21" cy="21" r="1.5" />
      <circle {...stroke} cx="15" cy="27" r="1.5" />
      <circle {...stroke} cx="21" cy="27" r="1.5" />
      <path {...stroke} d="M32 14 l8 4 v18 h-12 v-18 z" />
      <circle {...stroke} cx="34" cy="19" r="1.5" />
    </>
  ),
  // Steam iron with rising steam
  steam: (
    <>
      <path {...stroke} d="M6 38 h30 q6 0 6 -6 v-4 h-24 q-12 0 -12 10 z" />
      <path {...stroke} d="M22 28 v-6 h14 v6" />
      <path {...stroke} className="stage-icon-stroke stage-icon-steam" d="M14 18 q-3 -4 0 -8 M22 16 q-3 -4 0 -8" />
    </>
  ),
  // Sealed carton with tape strip
  pack: (
    <>
      <path {...stroke} d="M6 16 l18 -8 l18 8 v20 l-18 8 l-18 -8 z" />
      <path {...stroke} d="M6 16 l18 8 l18 -8 M24 24 v20" />
      <path {...stroke} d="M15 12 l18 8" />
    </>
  ),
  // Delivery truck
  dispatch: (
    <>
      <rect {...stroke} x="4" y="14" width="24" height="20" rx="1" />
      <path {...stroke} d="M28 20 h8 l6 7 v7 h-14 z" />
      <circle {...stroke} cx="12" cy="37" r="4" />
      <circle {...stroke} cx="34" cy="37" r="4" />
    </>
  ),
};

interface StageIconProps {
  name: StageIconName;
  className?: string;
}

export function StageIcon({ name, className }: StageIconProps) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {ICONS[name]}
    </svg>
  );
}
