// Vertical spine linking the four zones. The viewBox is stretched to the
// container height, so non-scaling-stroke keeps the line width constant.
export function ConnectorPath() {
  return (
    <div data-spine className="pipeline-spine absolute left-6 top-2 bottom-2 w-[2px] -translate-x-1/2 hidden md:block" aria-hidden="true">
      <svg viewBox="0 0 2 100" preserveAspectRatio="none" className="w-full h-full overflow-visible">
        <line
          className="pipeline-spine-track"
          x1="1" y1="0" x2="1" y2="100"
          stroke="#E4DDD0"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />
        <line
          data-spine-progress
          className="pipeline-spine-progress"
          x1="1" y1="0" x2="1" y2="100"
          pathLength={1}
          stroke="hsl(var(--gold))"
          strokeWidth={2}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {/* Garment token that travels down the spine as the line draws */}
      <span
        data-spine-marker
        className="pipeline-spine-marker absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-[#B88E28] ring-4 ring-[#B88E28]/20"
      />
    </div>
  );
}
