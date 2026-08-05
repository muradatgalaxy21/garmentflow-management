import { motion } from "framer-motion";
import { Award, Users, Clock, Target } from "lucide-react";
import aboutHero from "@/assets/about-hero.jpg";
import qualityImage from "@/assets/proc-qc.jpg";

const fadeUp = {
  hidden: { opacity: 0, y: 25 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } },
};

// Core values shown in the grid (kept all 4 boxes as requested)
const values = [
  {
    icon: Award,
    title: "Quality First",
    text: "Every garment passes through rigorous multi-stage quality checks.",
  },
  {
    icon: Users,
    title: "Family Heritage",
    text: "Three generations of craftsmanship, trust, and accountability.",
  },
  {
    icon: Clock,
    title: "On-Time Delivery",
    text: "Reliable timelines with proactive communication at every milestone.",
  },
  {
    icon: Target,
    title: "Precision",
    text: "Accurate pattern grading, consistent sizing, and meticulous finishing.",
  },
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
    role: "Manager & Partial Owner",
    text: "Elder son of Zubair, currently studying while serving as a top-level manager and partial owner of the factory.",
  },
];

export default function AboutPage() {
  return (
    <div className="bg-[#F5F2EA] min-h-screen text-[#1E293B]">
      {/* Page Header with background image and sleek dark overlay (increased height) */}
      <section className="relative h-[520px] md:h-[450px] flex items-center overflow-hidden text-white">
        <div className="absolute inset-0">
          <img
            src={aboutHero}
            alt="Skilled En En Garments worker stitching fabric"
            className="w-full h-full object-cover"
            width={1600}
            height={900}
          />
          <div className="absolute inset-0 bg-[#3C404B]/80 backdrop-brightness-75" />
        </div>
        <div className="container-narrow text-center px-6 relative z-10 mx-auto">
          <div className="h-[2px] w-12 bg-[#B88E28] mx-auto mb-4" />
          <h1 className="font-heading text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight">
            About En En Garments
          </h1>
          <p className="mt-4 text-gray-200 max-w-xl mx-auto text-base md:text-lg font-light leading-relaxed">
            A family-built garment manufacturing unit serving global exports and local vendors for
            over 30 years.
          </p>
        </div>
      </section>

      {/* Story Section */}
      <section className="section-padding">
        <div className="container-wide grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
            <div className="h-[2px] w-12 bg-[#B88E28] mb-4" />
            <h2 className="font-heading text-3xl md:text-4xl font-bold text-[#1E293B]">Our Story</h2>
            <p className="mt-5 text-gray-700 leading-relaxed">
              En En Garments was founded by <strong>Nazim Ud Din</strong>, who began his journey as
              a worker stitching socks and trousers. With years of hands-on experience he stepped
              out on his own — starting as a single tailor, then growing to a few workers, and
              eventually building a full-fledged manufacturing unit with 80+ employees.
            </p>
            <p className="mt-4 text-gray-700 leading-relaxed">
              When his son grew up, the two paired up to scale the business together. Our
              grandfather has since passed away — <em>may Allah grant him Jannah</em> — and the
              family heritage continues under the leadership of his son{" "}
              <strong>Zubair Nazim</strong>, current Owner and CEO. Today, Zubair is partnered with
              his elder son <strong>Firas Ahmad</strong>, who is currently studying while serving
              as a top-level manager and partial owner of the factory.
            </p>
            <p className="mt-4 text-gray-700 leading-relaxed">
              We operate cutting, stitching, quality check, and press departments under one roof,
              along with a large in-house machine that converts cotton threads into cloth, 60+
              sewing machines, and a 10+ member QC team — shipping high-quality clothing across
              the globe with trusted partners.
            </p>
          </motion.div>

          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
            <div className="bg-white p-3 rounded-lg border border-[#E5DFD3] shadow-sm">
              <img
                src={qualityImage}
                alt="Quality inspection at En En Garments"
                className="rounded-md object-cover w-full h-72 lg:h-96"
                loading="lazy"
                width={800}
                height={600}
              />
            </div>
          </motion.div>
        </div>
      </section>

      {/* Three Generations Timeline */}
      <section className="section-padding pt-0">
        <div className="container-wide">
          <div className="text-center mb-12">
            <div className="h-[2px] w-12 bg-[#B88E28] mx-auto mb-4" />
            <h2 className="font-heading text-3xl md:text-4xl font-bold text-[#1E293B]">Three Generations</h2>
            <p className="mt-3 text-gray-600 max-w-xl mx-auto">
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
                className="relative p-7 bg-white rounded-lg border border-[#E4DDD0] shadow-sm flex flex-col justify-between"
              >
                <div>
                  <span className="inline-block text-xs font-bold tracking-widest uppercase text-[#B88E28]">
                    {step.era}
                  </span>
                  <h3 className="font-heading text-xl font-bold text-[#1E293B] mt-1">
                    {step.name}
                  </h3>
                  <p className="text-sm text-gray-500 italic mt-0.5">{step.role}</p>
                  <div className="h-[1.5px] w-8 bg-[#B88E28] my-4" />
                  <p className="text-sm text-gray-600 leading-relaxed">{step.text}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Values Grid */}
      <section className="section-padding pt-0">
        <div className="container-wide">
          <div className="text-center mb-12">
            <div className="h-[2px] w-12 bg-[#B88E28] mx-auto mb-4" />
            <h2 className="font-heading text-3xl md:text-4xl font-bold text-[#1E293B]">Our Values</h2>
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
                className="p-6 bg-white rounded-lg border border-[#E4DDD0] shadow-sm text-center flex flex-col items-center"
              >
                <div className="w-12 h-12 rounded-full border border-[#B88E28]/40 bg-[#FAF7F0] flex flex-col items-center justify-center mb-4 text-[#B88E28]">
                  <v.icon className="w-5 h-5" />
                </div>
                <h3 className="font-heading font-bold text-base text-[#1E293B] mb-2">{v.title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{v.text}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

