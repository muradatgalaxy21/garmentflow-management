import { motion } from "framer-motion";
import { Factory, Ruler, Shirt, Truck, Layers, CheckCircle } from "lucide-react";
import capabilitiesHero from "@/assets/capabilities-hero.jpg";
import procDesign from "@/assets/proc-design.jpg";
import procFabric from "@/assets/proc-fabric.jpg";
import procCutting from "@/assets/proc-cutting.jpg";
import procQc from "@/assets/proc-qc.jpg";
import procFinishing from "@/assets/proc-finishing.jpg";
import procShipping from "@/assets/proc-shipping.jpg";

const fadeUp = {
  hidden: { opacity: 0, y: 25 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } },
};

// Process steps pairing icons, copy, and preserved background images
const processSteps = [
  { icon: Ruler, title: "Design & Pattern", text: "CAD-based pattern development, grading, and marker planning.", bg: procDesign },
  { icon: Layers, title: "Fabric & Weaving", text: "In-house cotton-to-cloth weaving plus sourcing of premium fabrics.", bg: procFabric },
  { icon: Factory, title: "Cutting & Stitching", text: "60+ sewing machines, automated cutting tables, and skilled stitchers.", bg: procCutting },
  { icon: CheckCircle, title: "Quality Control", text: "Dedicated 10+ member QC team inspects every batch in line and at final stage.", bg: procQc },
  { icon: Shirt, title: "Press & Finishing", text: "Industrial pressing, labeling, poly-bagging, and carton packing.", bg: procFinishing },
  { icon: Truck, title: "Logistics & Shipping", text: "Trusted partners delivering across the globe with full export documentation.", bg: procShipping },
];

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
            End-to-end production infrastructure for woven and knitted garments — built across 30+
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

      {/* Process Steps with preserved background images */}
      <section className="section-padding pt-0">
        <div className="container-wide mx-auto">
          <div className="text-center mb-12">
            <div className="h-[2px] w-12 bg-[#B88E28] mx-auto mb-4" />
            <h2 className="font-heading text-3xl md:text-4xl font-bold text-[#1E293B]">Our Production Process</h2>
            <p className="mt-3 text-gray-600 max-w-xl mx-auto">
              From design through shipping — every stage handled in-house by skilled departments.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {processSteps.map((step, i) => (
              <motion.div
                key={step.title}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={{
                  hidden: { opacity: 0, y: 20 },
                  visible: { opacity: 1, y: 0, transition: { delay: i * 0.1, duration: 0.5 } },
                }}
                className="group relative overflow-hidden rounded-lg border border-[#E4DDD0] bg-white shadow-sm min-h-[180px]"
              >
                {/* Preserved background image for process step */}
                <img
                  src={step.bg}
                  alt=""
                  aria-hidden="true"
                  className="absolute inset-0 w-full h-full object-cover opacity-15 group-hover:opacity-25 transition-opacity duration-500"
                  loading="lazy"
                  width={800}
                  height={600}
                />
                <div className="absolute inset-0 bg-gradient-to-br from-white/95 via-white/90 to-white/70" />

                <div className="relative z-10 flex gap-4 p-6">
                  <div className="shrink-0">
                    <div className="w-11 h-11 rounded-full border border-[#B88E28]/40 bg-[#FAF7F0] text-[#B88E28] flex items-center justify-center">
                      <step.icon className="w-5 h-5" />
                    </div>
                  </div>
                  <div>
                    <h3 className="font-heading font-bold text-[#1E293B] text-base">{step.title}</h3>
                    <p className="mt-1.5 text-sm text-gray-600 leading-relaxed">{step.text}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

