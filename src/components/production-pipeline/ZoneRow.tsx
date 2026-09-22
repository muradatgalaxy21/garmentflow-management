import type { PipelineZone } from "./types";
import { StageCard } from "./StageCard";

interface ZoneRowProps {
  zone: PipelineZone;
}

export function ZoneRow({ zone }: ZoneRowProps) {
  const first = zone.stages[0].order;
  const last = zone.stages[zone.stages.length - 1].order;

  return (
    <div data-zone className="relative md:pl-16">
      {/* Node sits on the spine, which is centred 1.5rem from the left edge */}
      <span
        data-zone-node
        className="hidden md:flex absolute left-6 top-0 -translate-x-1/2 w-10 h-10 rounded-full bg-[#16213E] text-[#C69749] font-heading font-bold text-sm items-center justify-center ring-4 ring-[#F5F2EA]"
        aria-hidden="true"
      >
        {zone.order}
      </span>

      <div data-zone-label className="mb-5 md:pt-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#B88E28]">
          Zone {zone.order} &middot; Stages {first}&ndash;{last}
        </p>
        <h3 className="font-heading text-2xl font-bold text-[#1E293B] mt-1">{zone.label}</h3>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        {zone.stages.map((stage) => (
          <StageCard key={stage.id} stage={stage} />
        ))}
      </div>
    </div>
  );
}
