import { useRef } from "react";
import { PIPELINE_ZONES } from "./data";
import { ZoneRow } from "./ZoneRow";
import { ConnectorPath } from "./svg/ConnectorPath";
import { usePipelineScroll } from "./usePipelineScroll";

export default function PipelineOrchestrator() {
  const sectionRef = useRef<HTMLElement>(null);
  usePipelineScroll(sectionRef);

  return (
    <section ref={sectionRef} className="section-padding pt-0" aria-labelledby="production-process-heading">
      <div className="container-wide mx-auto">
        <div className="text-center mb-14">
          <div className="h-[2px] w-12 bg-[#B88E28] mx-auto mb-4" />
          <h2 id="production-process-heading" className="font-heading text-3xl md:text-4xl font-bold text-[#1E293B]">
            Our Production Process
          </h2>
          <p className="mt-3 text-gray-600 max-w-xl mx-auto">
            Thirteen stages across four zones, from yarn to carton, with three quality gates along the way.
          </p>
        </div>

        <div className="relative flex flex-col gap-14">
          <ConnectorPath />
          {PIPELINE_ZONES.map((zone) => (
            <ZoneRow key={zone.id} zone={zone} />
          ))}
        </div>
      </div>
    </section>
  );
}
