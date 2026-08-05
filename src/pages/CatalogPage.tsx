import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import catalogHero from "@/assets/catalog-hero.jpg";
import catTshirts from "@/assets/cat-tshirts.jpg";
import catShirts from "@/assets/cat-shirts.jpg";
import catTrousers from "@/assets/cat-trousers.jpg";
import catJackets from "@/assets/cat-jackets.jpg";
import catActivewear from "@/assets/cat-activewear.jpg";
import catWorkwear from "@/assets/cat-workwear.jpg";

// Product categories paired with their background images (preserving all articles as requested)
const categories = [
  { name: "T-Shirts & Polos", types: "Round neck, V-neck, Polo, Henley", moq: "500 pcs", bg: catTshirts },
  { name: "Shirts", types: "Formal, Casual, Linen, Oxford", moq: "300 pcs", bg: catShirts },
  { name: "Trousers", types: "Formal, Casual, Cargo, Joggers", moq: "300 pcs", bg: catTrousers },
  { name: "Jackets & Outerwear", types: "Bomber, Windbreaker, Puffer, Blazer", moq: "200 pcs", bg: catJackets },
  { name: "Activewear", types: "Leggings, Sports Bra, Shorts, Hoodies", moq: "500 pcs", bg: catActivewear },
  { name: "Workwear & Uniforms", types: "Industrial, Corporate, Hospitality", moq: "200 pcs", bg: catWorkwear },
];

export default function CatalogPage() {
  return (
    <div className="bg-[#F5F2EA] min-h-screen text-[#1E293B]">
      {/* Header with preserved catalogHero image and dark slate overlay */}
      <section className="relative h-[450px] md:h-[480px] flex items-center overflow-hidden text-white">
        <div className="absolute inset-0">
          <img
            src={catalogHero}
            alt="Folded garment stacks at En En Garments"
            className="w-full h-full object-cover"
            width={1600}
            height={900}
          />
          <div className="absolute inset-0 bg-[#3C404B]/80 backdrop-brightness-75" />
        </div>
        <div className="relative z-10 container-narrow text-center px-6 mx-auto">
          <div className="h-[2px] w-12 bg-[#B88E28] mx-auto mb-4" />
          <h1 className="font-heading text-4xl md:text-5xl font-bold tracking-tight">
            B2B Product Catalog
          </h1>
          <p className="mt-4 text-gray-200 max-w-xl mx-auto text-base md:text-lg font-light leading-relaxed">
            Browse our product categories. All items are fully customizable for your brand and
            available for export or local vendor supply.
          </p>
        </div>
      </section>

      {/* Category Grid — preserved images with styled cards matching Image 4 */}
      <section className="section-padding">
        <div className="container-narrow grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 mx-auto">
          {categories.map((cat, i) => (
            <motion.div
              key={cat.name}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={{
                hidden: { opacity: 0, y: 20 },
                visible: { opacity: 1, y: 0, transition: { delay: i * 0.08, duration: 0.5 } },
              }}
              className="overflow-hidden rounded-lg border border-[#E4DDD0] bg-white shadow-sm flex flex-col justify-between"
            >
              <div>
                <img
                  src={cat.bg}
                  alt={cat.name}
                  className="w-full h-56 object-cover"
                  loading="lazy"
                  width={800}
                  height={600}
                />
                <div className="p-6">
                  <h3 className="font-heading text-lg font-bold text-[#1E293B]">{cat.name}</h3>
                  <p className="mt-1.5 text-sm text-gray-500">{cat.types}</p>
                </div>
              </div>
              <div className="px-6 pb-6 pt-0">
                <span className="inline-block px-3 py-1 rounded bg-[#FAF7F0] border border-[#E5DFD3] text-[#B88E28] text-xs font-bold uppercase tracking-wider">
                  MOQ: {cat.moq}
                </span>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Custom Order Callout matching Image 4 CTA */}
      <section className="bg-[#16213E] text-white py-16 px-6">
        <div className="container-narrow text-center mx-auto">
          <h2 className="font-heading text-2xl md:text-3xl font-bold">
            Need something outside this range?
          </h2>
          <p className="mt-3 text-gray-300 max-w-lg mx-auto text-sm md:text-base leading-relaxed">
            Custom styles and private-label programs are available on request — talk to our team
            about your specification.
          </p>
          <Link
            to="/contact?rfq=true"
            className="mt-6 inline-block bg-[#C69749] text-[#1B2A4A] hover:bg-[#b8863a] font-bold px-7 py-3 rounded-md transition-colors shadow-sm"
          >
            Request a Quote
          </Link>
        </div>
      </section>
    </div>
  );
}

