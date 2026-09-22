import { CheckCircle } from "lucide-react";
import capabilitiesHero from "@/assets/capabilities-hero.jpg";
import PipelineOrchestrator from "@/components/production-pipeline";

// Highlight stats reflecting actual capacity
const highlights = [
  { label: "Sewing Machines", value: "60+" },
  { label: "Total Employees", value: "80+" },
  { label: "QC Staff", value: "10+" },
  { label: "Global Shipping", value: "Yes" },
];

// In-house departments
const departments = [
  "Cutting Department",
  "Stitching Department",
  "Quality Check Department",
  "Press Department",
  "In-House Cotton-to-Cloth Weaving Machine",
  "Sewing Lines (60+ Machines)",
];

export default function CapabilitiesPage() {
  return (
    <div className="bg-[#F5F2EA] min-h-screen text-[#1E293B]">
      {/* Header with preserved capabilitiesHero image and dark slate overlay */}
      <section className="relative h-[450px] md:h-[480px] flex items-center overflow-hidden text-white">
        <div className="absolute inset-0">
          <img
            src={capabilitiesHero}
            alt="En En Garments factory cutting and production floor"
            className="w-full h-full object-cover"
            width={1600}
            height={900}
          />
          <div className="absolute inset-0 bg-[#3C404B]/80 backdrop-brightness-75" />
        </div>
        <div className="relative z-10 container-narrow text-center px-6 mx-auto">
          <div className="h-[2px] w-12 bg-[#B88E28] mx-auto mb-4" />
          <h1 className="font-heading text-4xl md:text-5xl font-bold tracking-tight">
            Manufacturing Capabilities
          </h1>
          <p className="mt-4 text-gray-200 max-w-xl mx-auto text-base md:text-lg font-light leading-relaxed">
            End-to-end production infrastructure for woven and knitted garments â€” built across 30+
            years.
          </p>
        </div>
      </section>

      {/* Capacity Stats Bar */}
      <section className="bg-[#16213E] text-white py-12">
        <div className="container-wide px-6 grid grid-cols-2 md:grid-cols-4 gap-8 text-center mx-auto">
          {highlights.map((h) => (
            <div key={h.label}>
              <p className="font-heading text-3xl md:text-4xl font-bold text-[#C69749]">{h.value}</p>
              <p className="mt-1.5 text-sm text-gray-300 font-medium">{h.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Departments list */}
      <section className="section-padding">
        <div className="container-wide mx-auto">
          <div className="text-center mb-10">
            <div className="h-[2px] w-12 bg-[#B88E28] mx-auto mb-4" />
            <h2 className="font-heading text-3xl md:text-4xl font-bold text-[#1E293B]">In-House Departments</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {departments.map((dept) => (
              <div
                key={dept}
                className="flex items-center gap-3.5 p-4 rounded-lg bg-white border border-[#E4DDD0] shadow-sm"
              >
                <CheckCircle className="w-5 h-5 text-[#B88E28] shrink-0" />
                <span className="text-sm font-semibold text-[#1E293B]">{dept}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <PipelineOrchestrator />
    </div>
  );
}

