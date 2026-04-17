import { motion } from "framer-motion";
import { Award, Users, Clock, Target } from "lucide-react";
import aboutHero from "@/assets/about-hero.jpg";
import qualityImage from "@/assets/proc-qc.jpg";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } },
};

// Core values shown in the grid below the story
const values = [
  { icon: Award, title: "Quality First", text: "Every garment passes through rigorous multi-stage quality checks." },
  { icon: Users, title: "Family Heritage", text: "Three generations of craftsmanship, trust, and accountability." },
  { icon: Clock, title: "On-Time Delivery", text: "Reliable timelines with proactive communication at every milestone." },
  { icon: Target, title: "Precision", text: "Accurate pattern grading, consistent sizing, and meticulous finishing." },
];

// The three-generation timeline highlights the family lineage
const timeline = [
  {
    era: "1990s",
    name: "Nazim Ud Din",
    role: "Founder",
    text: "Started as a worker sewing socks and trousers, then built his own unit from a single tailor into a small workshop with a handful of workers.",
  },
  {
    era: "2000s",
    name: "Zubair Nazim",
    role: "Owner & CEO",
    text: "Joined his father and helped scale the business into a full-fledged manufacturing unit with 80+ employees, expanding into exports and local vendor supply.",
  },
  {
    era: "Present",
    name: "Firas Ahmad",
    role: "Top-Level Manager & Partial Owner",
    text: "Currently studying while actively managing operations alongside his father, carrying the family heritage forward into the next generation.",
  },
];

export default function AboutPage() {
  return (
    <>
      {/* Page Header with image background */}
      <section className="relative py-24 overflow-hidden">
        <div className="absolute inset-0">
          <img
            src={aboutHero}
            alt="Skilled En En Garments worker stitching fabric"
            className="w-full h-full object-cover"
            width={1600}
            height={900}
          />
          <div className="absolute inset-0 bg-primary/80" />
        </div>
        <div className="relative z-10 container-narrow text-center text-primary-foreground px-6">
          <div className="divider-gold mx-auto mb-4" />
          <h1 className="font-heading text-4xl md:text-5xl font-bold">About En En Garments</h1>
          <p className="mt-4 text-primary-foreground/70 max-w-lg mx-auto">
            A family-built garment manufacturing unit serving global exports and local vendors for
            over 30 years.
          </p>
        </div>
      </section>

      {/* Story Section */}
      <section className="section-padding bg-background">
        <div className="container-wide grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
            <div className="divider-gold mb-4" />
            <h2 className="font-heading text-3xl font-bold text-foreground">Our Story</h2>
            <p className="mt-4 text-muted-foreground leading-relaxed">
              En En Garments was founded by <strong>Nazim Ud Din</strong>, who began his journey as
              a worker stitching socks and trousers. With years of hands-on experience he stepped
              out on his own — starting as a single tailor, then growing to a few workers, and
              eventually building a full-fledged manufacturing unit with 80+ employees.
            </p>
            <p className="mt-3 text-muted-foreground leading-relaxed">
              When his son grew up, the two paired up to scale the business together. Our
              grandfather has since passed away — <em>may Allah grant him Jannah</em> — and the
              family heritage continues under the leadership of his son{" "}
              <strong>Zubair Nazim</strong>, current Owner and CEO. Today, Zubair is partnered with
              his elder son <strong>Firas Ahmad</strong>, who is currently studying while serving
              as a top-level manager and partial owner of the factory.
            </p>
            <p className="mt-3 text-muted-foreground leading-relaxed">
              We operate cutting, stitching, quality check, and press departments under one roof,
              along with a large in-house machine that converts cotton threads into cloth, 60+
              sewing machines, and a 10+ member QC team — shipping high-quality clothing across
              the globe with trusted partners.
            </p>
          </motion.div>

          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
            <img
              src={qualityImage}
              alt="Quality inspection at En En Garments"
              className="rounded-lg object-cover w-full h-72 lg:h-96"
              loading="lazy"
              width={800}
              height={600}
            />
          </motion.div>
        </div>
      </section>

      {/* Three Generations Timeline */}
      <section className="section-padding bg-secondary/50">
        <div className="container-wide">
          <div className="text-center mb-12">
            <div className="divider-gold mx-auto mb-4" />
            <h2 className="font-heading text-3xl font-bold text-foreground">Three Generations</h2>
            <p className="mt-3 text-muted-foreground max-w-xl mx-auto">
              A family lineage of craftsmanship — from a single tailor to a manufacturing unit
              trusted across borders.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
            {timeline.map((step, i) => (
              <motion.div
                key={step.name}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.15, duration: 0.5 }}
                className="relative p-6 bg-card rounded-lg border border-border"
              >
                <span className="inline-block text-xs font-semibold tracking-widest uppercase text-accent">
                  {step.era}
                </span>
                <h3 className="font-heading text-xl font-bold text-card-foreground mt-2">
                  {step.name}
                </h3>
                <p className="text-sm text-muted-foreground italic">{step.role}</p>
                <div className="divider-gold my-4" />
                <p className="text-sm text-muted-foreground leading-relaxed">{step.text}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Values Grid */}
      <section className="section-padding bg-background">
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
