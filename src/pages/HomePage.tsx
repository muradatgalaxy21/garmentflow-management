import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Factory, Shield, Globe, TrendingUp, Scissors, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import heroImage from "@/assets/hero-factory-enen.jpg";
import fabricImage from "@/assets/proc-fabric.jpg";
import qualityImage from "@/assets/proc-qc.jpg";

// Fade-in animation variant for scroll reveals
const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } },
};

// Headline statistics for the hero strip
const stats = [
  { value: "30+", label: "Years Heritage" },
  { value: "80+", label: "Employees" },
  { value: "60+", label: "Sewing Machines" },
  { value: "10+", label: "QC Staff" },
];

// Core capabilities shown in the grid section
const capabilities = [
  {
    icon: Scissors,
    title: "Cut & Sew",
    description: "Full pattern making, cutting, and assembly across all garment categories.",
  },
  {
    icon: Factory,
    title: "In-House Weaving",
    description: "Cotton-to-cloth conversion on our own loom plus 60+ sewing machines.",
  },
  {
    icon: Shield,
    title: "Quality Assurance",
    description: "Dedicated 10+ member QC team inspects every batch before dispatch.",
  },
  {
    icon: Globe,
    title: "Global Exports",
    description: "Trusted shipping partners delivering to clients across the globe.",
  },
  {
    icon: Package,
    title: "Local Vendor Supply",
    description: "Reliable bulk supply for established local retail and wholesale vendors.",
  },
  {
    icon: TrendingUp,
    title: "Three Generations",
    description: "Family-run since the 1990s with a top-down managerial structure.",
  },
];

export default function HomePage() {
  return (
    <>
      {/* Hero Section */}
      <section className="relative min-h-[85vh] flex items-center overflow-hidden">
        <div className="absolute inset-0">
          <img
            src={heroImage}
            alt="En En Garments manufacturing floor with rows of sewing machines"
            className="w-full h-full object-cover"
            width={1920}
            height={1080}
          />
          <div className="absolute inset-0 bg-primary/75" />
        </div>

        <div className="relative z-10 container-wide px-6 lg:px-12">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={{
              visible: { transition: { staggerChildren: 0.15 } },
            }}
            className="max-w-2xl"
          >
            <motion.div variants={fadeUp} className="divider-gold mb-6" />
            <motion.h1
              variants={fadeUp}
              className="font-heading text-4xl md:text-5xl lg:text-6xl font-bold text-primary-foreground leading-tight"
            >
              Precision Garment Manufacturing — 30+ Years of Heritage
            </motion.h1>
            <motion.p
              variants={fadeUp}
              className="mt-6 text-lg text-primary-foreground/80 font-body leading-relaxed max-w-xl"
            >
              From a single tailor in the 1990s to a full-fledged unit, En En Garments has been
              crafting premium apparel for global exports and trusted local vendors for three
              generations.
            </motion.p>
            <motion.div variants={fadeUp} className="mt-8 flex flex-wrap gap-4">
              <Button asChild size="lg" variant="secondary">
                <Link to="/contact?rfq=true">Request a Quote</Link>
              </Button>
              {/* Capabilities CTA — solid white border + white text reads cleanly on the navy overlay */}
              <Button
                asChild
                size="lg"
                variant="outline"
                className="bg-transparent border-2 border-primary-foreground text-primary-foreground hover:bg-primary-foreground hover:text-primary"
              >
                <Link to="/capabilities">Our Capabilities</Link>
              </Button>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Stats Strip */}
      <section className="bg-primary text-primary-foreground">
        <div className="container-wide px-6 lg:px-12 py-10 grid grid-cols-2 md:grid-cols-4 gap-8">
          {stats.map((stat) => (
            <div key={stat.label} className="text-center">
              <p className="font-heading text-3xl md:text-4xl font-bold text-gold">
                {stat.value}
              </p>
              <p className="mt-1 text-sm opacity-70 tracking-wide">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Capabilities Grid */}
      <section className="section-padding bg-background">
        <div className="container-wide">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={fadeUp}
            className="text-center mb-16"
          >
            <div className="divider-gold mx-auto mb-4" />
            <h2 className="font-heading text-3xl md:text-4xl font-bold text-foreground">
              Manufacturing Capabilities
            </h2>
            <p className="mt-4 text-muted-foreground max-w-xl mx-auto">
              End-to-end garment production powered by experienced workers and a top-down
              managerial structure.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {capabilities.map((cap, i) => (
              <motion.div
                key={cap.title}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-50px" }}
                variants={{
                  hidden: { opacity: 0, y: 20 },
                  visible: {
                    opacity: 1,
                    y: 0,
                    transition: { duration: 0.5, delay: i * 0.1 },
                  },
                }}
                className="p-6 rounded-lg border border-border bg-card hover:shadow-md transition-shadow"
              >
                <cap.icon className="w-8 h-8 text-accent mb-4" />
                <h3 className="font-heading text-lg font-semibold text-card-foreground">
                  {cap.title}
                </h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                  {cap.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* About Preview with Images */}
      <section className="section-padding bg-secondary/50">
        <div className="container-wide grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeUp}
          >
            <div className="divider-gold mb-4" />
            <h2 className="font-heading text-3xl md:text-4xl font-bold text-foreground">
              Three Generations of Craftsmanship
            </h2>
            <p className="mt-4 text-muted-foreground leading-relaxed">
              Founded by Nazim Ud Din — who began as a worker stitching socks and trousers — En En
              Garments grew from a single tailor into a manufacturing unit with 80+ skilled
              employees. Today, his son Zubair Nazim leads the company as Owner and CEO, partnered
              with grandson Firas Ahmad as a top-level manager and partial owner.
            </p>
            <p className="mt-3 text-muted-foreground leading-relaxed">
              We serve both international export clients and trusted local vendors, with cutting,
              stitching, quality check, and press departments under one roof.
            </p>
            <Button asChild className="mt-6" variant="default">
              <Link to="/about">Read Our Story</Link>
            </Button>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeUp}
            className="grid grid-cols-2 gap-4"
          >
            <img
              src={fabricImage}
              alt="Premium fabric stacks at En En Garments"
              className="rounded-lg object-cover w-full h-48 md:h-64"
              loading="lazy"
              width={800}
              height={600}
            />
            <img
              src={qualityImage}
              alt="Quality inspection at En En Garments"
              className="rounded-lg object-cover w-full h-48 md:h-64 mt-8"
              loading="lazy"
              width={800}
              height={600}
            />
          </motion.div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="section-padding bg-primary text-primary-foreground text-center">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={fadeUp}
          className="container-narrow"
        >
          <h2 className="font-heading text-3xl md:text-4xl font-bold">
            Ready to Start Your Next Order?
          </h2>
          <p className="mt-4 text-primary-foreground/70 max-w-lg mx-auto">
            Whether you are exporting overseas or supplying local retail, get a competitive quote
            within 24 hours from our team.
          </p>
          <Button asChild size="lg" variant="secondary" className="mt-8">
            <Link to="/contact?rfq=true">Request a Quote</Link>
          </Button>
        </motion.div>
      </section>
    </>
  );
}
