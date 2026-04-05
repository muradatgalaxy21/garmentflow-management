import { motion } from "framer-motion";
import { Award, Users, Clock, Target } from "lucide-react";
import qualityImage from "@/assets/quality-inspection.jpg";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } },
};

const values = [
  { icon: Award, title: "Quality First", text: "Every garment passes through rigorous multi-stage quality checks." },
  { icon: Users, title: "Client Partnership", text: "We work as an extension of your team, not just a vendor." },
  { icon: Clock, title: "On-Time Delivery", text: "Reliable timelines with proactive communication at every milestone." },
  { icon: Target, title: "Precision", text: "Accurate pattern grading, consistent sizing, and meticulous finishing." },
];

export default function AboutPage() {
  return (
    <>
      {/* Page Header */}
      <section className="section-padding bg-primary text-primary-foreground">
        <div className="container-narrow text-center">
          <div className="divider-gold mx-auto mb-4" />
          <h1 className="font-heading text-4xl md:text-5xl font-bold">About GarmentCo</h1>
          <p className="mt-4 text-primary-foreground/70 max-w-lg mx-auto">
            A trusted name in garment manufacturing since 2009, serving local and international B2B clients.
          </p>
        </div>
      </section>

      {/* Story Section */}
      <section className="section-padding bg-background">
        <div className="container-wide grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
            <h2 className="font-heading text-3xl font-bold text-foreground">Our Story</h2>
            <p className="mt-4 text-muted-foreground leading-relaxed">
              Founded in Lahore, Pakistan, GarmentCo began as a small tailoring workshop.
              Over 15 years, we have grown into a full-scale manufacturing facility with
              modern machinery, a skilled team of 50-100 professionals, and export
              capabilities spanning 30+ countries.
            </p>
            <p className="mt-3 text-muted-foreground leading-relaxed">
              We specialize in woven and knitted garments, offering services from fabric
              sourcing and pattern development through to bulk production, quality inspection,
              and international shipping.
            </p>
          </motion.div>

          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
            <img
              src={qualityImage}
              alt="Quality inspection at GarmentCo"
              className="rounded-lg object-cover w-full h-72 lg:h-96"
              loading="lazy"
              width={800}
              height={600}
            />
          </motion.div>
        </div>
      </section>

      {/* Values Grid */}
      <section className="section-padding bg-secondary/50">
        <div className="container-wide">
          <div className="text-center mb-12">
            <div className="divider-gold mx-auto mb-4" />
            <h2 className="font-heading text-3xl font-bold text-foreground">Our Values</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {values.map((v, i) => (
              <motion.div
                key={v.title}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={{
                  hidden: { opacity: 0, y: 20 },
                  visible: { opacity: 1, y: 0, transition: { delay: i * 0.1, duration: 0.5 } },
                }}
                className="p-6 bg-card rounded-lg border border-border text-center"
              >
                <v.icon className="w-8 h-8 text-accent mx-auto mb-3" />
                <h3 className="font-heading font-semibold text-card-foreground">{v.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{v.text}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
