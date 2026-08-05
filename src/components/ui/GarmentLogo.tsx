import React from "react";

interface GarmentLogoProps {
  className?: string;
  size?: number;
}

export function GarmentLogo({ className = "h-8 w-8", size = 32 }: GarmentLogoProps) {
  return (
    <div className={`relative inline-flex items-center justify-center shrink-0 ${className}`}>
      <svg
        viewBox="0 0 100 100"
        width={size}
        height={size}
        className="w-full h-full"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Outer subtle shield / garment tag shape */}
        <rect width="100" height="100" rx="24" fill="url(#logo-grad)" />
        <rect x="2" y="2" width="96" height="96" rx="22" stroke="#475569" strokeWidth="1.5" strokeOpacity="0.2" />
        
        {/* Intertwined EE initials & thread needle styling */}
        <path
          d="M28 32 H68 M28 32 V68 M28 50 H60 M28 68 H68"
          stroke="#FFFFFF"
          strokeWidth="7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M52 32 H76 M52 50 H72 M52 68 H76"
          stroke="#3B82F6"
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        
        {/* Stitching dots accent */}
        <circle cx="78" cy="32" r="3" fill="#93C5FD" />
        <circle cx="78" cy="68" r="3" fill="#93C5FD" />

        <defs>
          <linearGradient id="logo-grad" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
            <stop stopColor="#1E293B" />
            <stop offset="1" stopColor="#334155" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

export default GarmentLogo;
