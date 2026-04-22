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
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } },
};

// Each process step pairs an icon, copy, and a related background image
// so the card visually echoes the activity it describes.
const processSteps = [
  { icon: Ruler, title: "Design & Pattern", text: "CAD-based pattern development, grading, and marker planning.", bg: procDesign },
  { icon: Layers, title: "Fabric & Weaving", text: "In-house cotton-to-cloth weaving plus sourcing of premium fabrics.", bg: procFabric },
  { icon: Factory, title: "Cutting & Stitching", text: "60+ sewing machines, automated cutting tables, and skilled stitchers.", bg: procCutting },
  { icon: CheckCircle, title: "Quality Control", text: "Dedicated 10+ member QC team inspects every batch in line and at final stage.", bg: procQc },
  { icon: Shirt, title: "Press & Finishing", text: "Industrial pressing, labeling, poly-bagging, and carton packing.", bg: procFinishing },
  { icon: Truck, title: "Logistics & Shipping", text: "Trusted partners delivering across the globe with full export documentation.", bg: procShipping },
];

// Highlight stats reflecting the actual En En Garments capacity
const highlights = [
  { label: "Sewing Machines", value: "60+" },
  { label: "Total Employees", value: "80+" },
  { label: "QC Staff", value: "10+" },
  { label: "Global Shipping", value: "Yes" },
];

// In-house departments operating under one roof
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
    <>
      {/* Header */}
      <section className="relative h-[460px] flex items-center overflow-hidden">
        <div className="absolute inset-0">
          <img
            src={capabilitiesHero}
            alt="En En Garments factory cutting and production floor"
            className="w-full h-full object-cover"
            width={1600}
            height={900}
          />
          <div className="absolute inset-0 bg-primary/80" />
        </div>
        <div className="relative z-10 container-narrow text-center text-primary-foreground px-6">
          <div className="divider-gold mx-auto mb-4" />
          <h1 className="font-heading text-4xl md:text-5xl font-bold">Manufacturing Capabilities</h1>
          <p className="mt-4 text-primary-foreground/70 max-w-lg mx-auto">
            End-to-end production infrastructure for woven and knitted garments — built across 30+
            years.
          </p>
        </div>
      </section>

      {/* Capacity Stats */}
      <section className="bg-primary text-primary-foreground py-10">
        <div className="container-wide px-6 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {highlights.map((h) => (
            <div key={h.label}>
              <p className="font-heading text-3xl font-bold text-gold">{h.value}</p>
              <p className="mt-1 text-sm opacity-70">{h.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Departments list */}
      <section className="section-padding bg-secondary/40">
        <div className="container-wide">
          <div className="text-center mb-10">
            <div className="divider-gold mx-auto mb-4" />
            <h2 className="font-heading text-3xl font-bold text-foreground">In-House Departments</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {departments.map((dept) => (
              <div
                key={dept}
                className="flex items-center gap-3 p-4 rounded-lg bg-card border border-border"
              >
                <CheckCircle className="w-5 h-5 text-accent flex-shrink-0" />
                <span className="text-sm font-medium text-card-foreground">{dept}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Process Steps with image-backed cards */}
      <section className="section-padding bg-background">
        <div className="container-wide">
          <div className="text-center mb-14">
            <div className="divider-gold mx-auto mb-4" />
            <h2 className="font-heading text-3xl font-bold text-foreground">Our Production Process</h2>
            <p className="mt-3 text-muted-foreground max-w-xl mx-auto">
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
                className="group relative overflow-hidden rounded-lg border border-border bg-card min-h-[180px]"
              >
                {/* Background image bound to this process step, kept subtle for legibility */}
                <img
                  src={step.bg}
                  alt=""
                  aria-hidden="true"
                  className="absolute inset-0 w-full h-full object-cover opacity-20 group-hover:opacity-30 transition-opacity duration-500"
                  loading="lazy"
                  width={800}
                  height={600}
                />
                {/* Soft gradient ensures the text always stays readable over any image */}
                <div className="absolute inset-0 bg-gradient-to-br from-card/95 via-card/85 to-card/60" />

                <div className="relative z-10 flex gap-4 p-6">
                  <div className="flex-shrink-0">
                    <div className="w-10 h-10 rounded-full bg-accent/15 flex items-center justify-center backdrop-blur-sm">
                      <step.icon className="w-5 h-5 text-accent" />
                    </div>
                  </div>
                  <div>
                    <h3 className="font-heading font-semibold text-card-foreground">{step.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{step.text}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
