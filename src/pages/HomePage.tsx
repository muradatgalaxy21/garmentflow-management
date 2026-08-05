import { useRef } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
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

// Core capabilities displayed in swiped container
const capabilities = [
  {
    num: "01",
    title: "Cut & Sew",
    description: "Full pattern making, cutting, and assembly across all garment categories.",
  },
  {
    num: "02",
    title: "In-House Weaving",
    description: "Cotton-to-cloth conversion on our own loom plus 60+ sewing machines.",
  },
  {
    num: "03",
    title: "Quality Check",
    description: "Dedicated 10+ member QC team inspects every batch before dispatch.",
  },
  {
    num: "04",
    title: "Global Exports",
    description: "Export-ready bulk apparel shipping with trusted logistics partners worldwide.",
  },
  {
    num: "05",
    title: "Local Vendor Supply",
    description: "Reliable bulk supply for established domestic retail and wholesale vendors.",
  },
  {
    num: "06",
    title: "Three Generations",
    description: "Family-owned legacy with top-down managerial oversight and craftsmanship.",
  },
];

export default function HomePage() {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: "left" | "right") => {
    if (scrollRef.current) {
      const scrollAmount = direction === "left" ? -360 : 360;
      scrollRef.current.scrollBy({ left: scrollAmount, behavior: "smooth" });
    }
  };

  return (
    <>
      {/* Hero Section */}
      <section className="relative h-[640px] overflow-hidden">
        <div className="absolute inset-0">
          <img
            src={heroImage}
            alt="Factory floor — workers at sewing machines"
            className="w-full h-full object-cover"
            width={1920}
            height={1080}
          />
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "linear-gradient(100deg, rgba(20, 28, 50, 0.92) 0%, rgba(20, 28, 50, 0.72) 42%, rgba(20, 28, 50, 0.35) 75%)",
            }}
          />
        </div>

        <div className="relative z-10 max-w-[1360px] mx-auto px-6 lg:px-[40px] h-full flex flex-col justify-center gap-[26px]">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={{
              visible: { transition: { staggerChildren: 0.15 } },
            }}
            className="max-w-[640px]"
          >
            <motion.div variants={fadeUp} className="w-[56px] h-[3px] bg-[#C69749] mb-[26px]" />
            <motion.h1
              variants={fadeUp}
              className="font-heading text-4xl md:text-5xl lg:text-[52px] font-bold text-[#FAF7EF] leading-[1.12] m-0"
            >
              Precision Garment Manufacturing — 30+ Years of Heritage
            </motion.h1>
            <motion.p
              variants={fadeUp}
              className="mt-[26px] text-[17px] text-[#D8D2C2] font-body leading-[1.7] max-w-[560px] m-0"
            >
              From a single tailor in the 1990s to a full-fledged manufacturing unit, En En Garments has
              crafted premium apparel for global exports and trusted local vendors across three
              generations.
            </motion.p>
            <motion.div variants={fadeUp} className="mt-[34px] flex flex-wrap gap-4">
              <Link
                to="/contact?rfq=true"
                className="btn-fill-gold inline-flex items-center justify-center px-[28px] py-[15px] rounded-[3px] text-[14.5px] font-bold tracking-[0.01em]"
              >
                Request a Quote
              </Link>
              <Link
                to="/capabilities"
                className="btn-fill-outline inline-flex items-center justify-center px-[28px] py-[15px] rounded-[3px] text-[14.5px] font-semibold tracking-[0.01em]"
              >
                Our Capabilities
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Stats Strip */}
      <section className="bg-[#16213E]">
        <div className="max-w-[1360px] mx-auto px-6 lg:px-[40px] py-[44px] grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {stats.map((stat) => (
            <div key={stat.label}>
              <p className="font-heading text-3xl md:text-[34px] font-bold text-[#C69749] m-0">
                {stat.value}
              </p>
              <p className="mt-[6px] text-[13px] text-[#AFB6CC] tracking-[0.03em] m-0">
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Manufacturing Capabilities Section (Horizontally Swiped Container) */}
      <section className="bg-[#F7F3EA] py-[100px] lg:py-[110px]">
        <div className="max-w-[1360px] mx-auto px-6 lg:px-[40px]">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={fadeUp}
            className="text-center max-w-[680px] mx-auto mb-[50px]"
          >
            <div className="w-[44px] h-[2px] bg-[#C69749] mx-auto mb-[18px]" />
            <h2 className="font-heading text-3xl md:text-[34px] font-bold text-[#1B2A4A] m-0 mb-[14px]">
              Manufacturing Capabilities
            </h2>
            <p className="text-[15.5px] text-[#6B6250] leading-[1.7] m-0">
              End-to-end garment production powered by experienced workers and a top-down managerial structure.
            </p>
          </motion.div>

          {/* Swipe controls */}
          <div className="flex items-center justify-end mb-4 px-2">
            <div className="flex gap-2">
              <button
                onClick={() => scroll("left")}
                aria-label="Previous capability"
                className="w-9 h-9 rounded-full border border-[#E4DDC9] bg-[#FAF7EF] text-[#1B2A4A] flex items-center justify-center hover:bg-[#1B2A4A] hover:text-[#FAF7EF] hover:border-[#1B2A4A] transition-colors"
              >
                <ChevronLeft size={18} />
              </button>
              <button
                onClick={() => scroll("right")}
                aria-label="Next capability"
                className="w-9 h-9 rounded-full border border-[#E4DDC9] bg-[#FAF7EF] text-[#1B2A4A] flex items-center justify-center hover:bg-[#1B2A4A] hover:text-[#FAF7EF] hover:border-[#1B2A4A] transition-colors"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>

          {/* Horizontally Swiped Container */}
          <div
            ref={scrollRef}
            className="flex gap-[28px] overflow-x-auto snap-x snap-mandatory scroll-smooth pb-4 pt-1 px-1 cursor-grab active:cursor-grabbing"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
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
                    transition: { duration: 0.5, delay: i * 0.08 },
                  },
                }}
                className="snap-start shrink-0 w-[300px] md:w-[380px] bg-[#FAF7EF] border border-[#E4DDC9] rounded-[4px] p-[36px_32px] hover:shadow-lg transition-all"
              >
                <div className="font-heading text-[20px] font-bold text-[#C69749] mb-[18px]">
                  {cap.num}
                </div>
                <h3 className="text-[18px] font-bold text-[#1B2A4A] m-0 mb-[10px]">
                  {cap.title}
                </h3>
                <p className="text-[14.5px] text-[#6B6250] leading-[1.65] m-0">
                  {cap.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* About Preview / Three Generations of Craftsmanship */}
      <section className="bg-[#EFE8D9] py-[100px]">
        <div className="max-w-[1360px] mx-auto px-6 lg:px-[40px] grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-[70px] items-center">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeUp}
          >
            <div className="w-[44px] h-[2px] bg-[#C69749] mb-[18px]" />
            <h2 className="font-heading text-3xl md:text-[32px] font-bold text-[#1B2A4A] m-0 mb-[22px]">
              Three Generations of Craftsmanship
            </h2>
            <p className="text-[15px] text-[#5B5142] leading-[1.8] m-0 mb-[18px]">
              Founded by Nazim Ud Din — who began as a worker stitching socks and trousers — En En
              Garments grew from a single tailor into a manufacturing unit with 80+ skilled
              employees. Today, his son Zubair Nazim leads the company as Owner and CEO, partnered
              with elder son Firas Ahmad as a top-level manager and partial owner.
            </p>
            <p className="text-[15px] text-[#5B5142] leading-[1.8] m-0 mb-[30px]">
              We serve both international export clients and trusted local vendors, with cutting,
              stitching, quality check, and press departments under one roof.
            </p>
            <Link
              to="/about"
              className="btn-fill-navy inline-flex items-center justify-center px-[26px] py-[13px] rounded-[3px] text-[14px] font-semibold"
            >
              Read Our Story
            </Link>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeUp}
            className="grid grid-cols-2 gap-[16px]"
          >
            <img
              src={fabricImage}
              alt="Folded fabric stacks"
              className="rounded-[4px] object-cover w-full h-[340px] shadow-sm"
              loading="lazy"
              width={800}
              height={600}
            />
            <img
              src={qualityImage}
              alt="Tailor fitting a garment"
              className="rounded-[4px] object-cover w-full h-[340px] mt-[36px] shadow-sm"
              loading="lazy"
              width={800}
              height={600}
            />
          </motion.div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-[#16213E]">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={fadeUp}
          className="max-w-[800px] mx-auto py-[100px] px-6 lg:px-[40px] text-center"
        >
          <h2 className="font-heading text-3xl md:text-[32px] font-bold text-[#FAF7EF] m-0 mb-[14px]">
            Ready to Start Your Next Order?
          </h2>
          <p className="text-[15.5px] text-[#AFB6CC] leading-[1.7] m-0 mb-[34px]">
            Whether you are exporting overseas or supplying local retail, get a competitive quote
            within 24 hours from our team.
          </p>
          <Link
            to="/contact?rfq=true"
            className="btn-fill-gold inline-flex items-center justify-center px-[34px] py-[16px] rounded-[3px] text-[15px] font-bold"
          >
            Request a Quote
          </Link>
        </motion.div>
      </section>
    </>
  );
}

