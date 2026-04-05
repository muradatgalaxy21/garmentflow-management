import { motion } from "framer-motion";
import { Factory, Ruler, Shirt, Truck, Layers, CheckCircle } from "lucide-react";
import heroImage from "@/assets/hero-factory.jpg";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } },
};

// Detailed capabilities list for the manufacturing process
const processSteps = [
  { icon: Ruler, title: "Design & Pattern", text: "CAD-based pattern development, grading, and marker planning." },
  { icon: Layers, title: "Fabric Sourcing", text: "Procurement of premium fabrics from certified mills." },
  { icon: Factory, title: "Cutting & Production", text: "Automated cutting, sewing lines, and specialized finishing." },
  { icon: CheckCircle, title: "Quality Control", text: "In-line and final AQL inspection at every production stage." },
  { icon: Shirt, title: "Finishing & Packing", text: "Pressing, labeling, poly-bagging, and carton packing." },
  { icon: Truck, title: "Logistics & Shipping", text: "FOB, CIF, and door-to-door delivery arrangements worldwide." },
];

// Machine and capacity highlights
const highlights = [
  { label: "Sewing Machines", value: "200+" },
  { label: "Monthly Capacity", value: "80,000 pcs" },
  { label: "Product Types", value: "50+" },
  { label: "QC Staff", value: "15" },
];

export default function CapabilitiesPage() {
  return (
    <>
      {/* Header */}
      <section className="relative py-24 overflow-hidden">
        <div className="absolute inset-0">
          <img src={heroImage} alt="Factory floor" className="w-full h-full object-cover" width={1920} height={1080} />
          <div className="absolute inset-0 bg-primary/80" />
        </div>
        <div className="relative z-10 container-narrow text-center text-primary-foreground px-6">
          <div className="divider-gold mx-auto mb-4" />
          <h1 className="font-heading text-4xl md:text-5xl font-bold">Manufacturing Capabilities</h1>
          <p className="mt-4 text-primary-foreground/70 max-w-lg mx-auto">
            End-to-end production infrastructure for woven and knitted garments.
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

      {/* Process Steps */}
      <section className="section-padding bg-background">
        <div className="container-wide">
          <div className="text-center mb-14">
            <div className="divider-gold mx-auto mb-4" />
            <h2 className="font-heading text-3xl font-bold text-foreground">Our Production Process</h2>
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
                className="flex gap-4 p-6 bg-card rounded-lg border border-border"
              >
                <div className="flex-shrink-0">
                  <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center">
                    <step.icon className="w-5 h-5 text-accent" />
                  </div>
                </div>
                <div>
                  <h3 className="font-heading font-semibold text-card-foreground">{step.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{step.text}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
