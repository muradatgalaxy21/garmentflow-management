import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Factory, Shield, Globe, TrendingUp, Scissors, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import heroImage from "@/assets/hero-factory.jpg";
import fabricImage from "@/assets/fabric-texture.jpg";
import qualityImage from "@/assets/quality-inspection.jpg";

// Fade-in animation variant for scroll reveals
const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } },
};

// Key statistics to display in the stats strip
const stats = [
  { value: "15+", label: "Years Experience" },
  { value: "50+", label: "Global Clients" },
  { value: "1M+", label: "Units / Year" },
  { value: "100%", label: "Quality Inspected" },
];

// Core capabilities shown in the grid section
const capabilities = [
  {
    icon: Scissors,
    title: "Cut & Sew",
    description: "Full-service pattern making, cutting, and assembly for all garment types.",
  },
  {
    icon: Factory,
    title: "Mass Production",
    description: "Scalable manufacturing from 500 to 100,000+ units per order.",
  },
  {
    icon: Shield,
    title: "Quality Assurance",
    description: "AQL 2.5 inspection standard with dedicated QC team at every stage.",
  },
  {
    icon: Globe,
    title: "Export Ready",
    description: "Shipping to 30+ countries with full export documentation support.",
  },
  {
    icon: Package,
    title: "Private Label",
    description: "Custom branding, labeling, and packaging tailored to your brand.",
  },
  {
    icon: TrendingUp,
    title: "Competitive Pricing",
    description: "Direct factory pricing with transparent cost breakdowns.",
  },
];

export default function HomePage() {
  return (
    <>
      {/* Hero Section */}
      <section className="relative min-h-[85vh] flex items-center overflow-hidden">
        {/* Background image with overlay */}
        <div className="absolute inset-0">
          <img
            src={heroImage}
            alt="Modern garment manufacturing facility"
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
              Precision Garment Manufacturing for Global Brands
            </motion.h1>
            <motion.p
              variants={fadeUp}
              className="mt-6 text-lg text-primary-foreground/80 font-body leading-relaxed max-w-xl"
            >
              From prototype to production, we deliver premium quality garments
              with competitive pricing and reliable international logistics.
            </motion.p>
            <motion.div variants={fadeUp} className="mt-8 flex flex-wrap gap-4">
              <Button asChild size="lg" variant="secondary">
                <Link to="/contact?rfq=true">Request a Quote</Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10"
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
              End-to-end garment production with modern machinery and skilled workforce.
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
              Crafted With Care, Built For Scale
            </h2>
            <p className="mt-4 text-muted-foreground leading-relaxed">
              With over 15 years in garment manufacturing, we combine traditional
              craftsmanship with modern production techniques. Our facility houses
              state-of-the-art machinery and a dedicated team of 50-100 skilled professionals.
            </p>
            <p className="mt-3 text-muted-foreground leading-relaxed">
              We serve both local and international B2B clients, offering end-to-end
              solutions from fabric sourcing to finished product delivery.
            </p>
            <Button asChild className="mt-6" variant="default">
              <Link to="/about">Learn More About Us</Link>
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
              alt="Premium fabric texture"
              className="rounded-lg object-cover w-full h-48 md:h-64"
              loading="lazy"
              width={800}
              height={800}
            />
            <img
              src={qualityImage}
              alt="Garment quality inspection"
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
            Get a competitive quote within 24 hours. Our team is ready to discuss
            your requirements, MOQs, and delivery timelines.
          </p>
          <Button asChild size="lg" variant="secondary" className="mt-8">
            <Link to="/contact?rfq=true">Request a Quote</Link>
          </Button>
        </motion.div>
      </section>
    </>
  );
}
