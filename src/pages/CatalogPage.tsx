import { motion } from "framer-motion";
import catalogHero from "@/assets/catalog-hero.jpg";
import catTshirts from "@/assets/cat-tshirts.jpg";
import catShirts from "@/assets/cat-shirts.jpg";
import catTrousers from "@/assets/cat-trousers.jpg";
import catJackets from "@/assets/cat-jackets.jpg";
import catActivewear from "@/assets/cat-activewear.jpg";
import catWorkwear from "@/assets/cat-workwear.jpg";

// Product categories paired with their own background image for richer cards
const categories = [
  { name: "T-Shirts & Polos", types: "Round neck, V-neck, Polo, Henley", moq: "500 pcs", bg: catTshirts },
  { name: "Shirts & Blouses", types: "Formal, Casual, Linen, Oxford", moq: "300 pcs", bg: catShirts },
  { name: "Trousers & Chinos", types: "Formal, Casual, Cargo, Joggers", moq: "300 pcs", bg: catTrousers },
  { name: "Jackets & Outerwear", types: "Bomber, Windbreaker, Puffer, Blazer", moq: "200 pcs", bg: catJackets },
  { name: "Activewear", types: "Leggings, Sports Bra, Shorts, Hoodies", moq: "500 pcs", bg: catActivewear },
  { name: "Workwear & Uniforms", types: "Industrial, Corporate, Hospitality", moq: "200 pcs", bg: catWorkwear },
];

export default function CatalogPage() {
  return (
    <>
      {/* Header with image background */}
      <section className="relative py-24 overflow-hidden">
        <div className="absolute inset-0">
          <img
            src={catalogHero}
            alt="Folded garment stacks at En En Garments"
            className="w-full h-full object-cover"
            width={1600}
            height={900}
          />
          <div className="absolute inset-0 bg-primary/80" />
        </div>
        <div className="relative z-10 container-narrow text-center text-primary-foreground px-6">
          <div className="divider-gold mx-auto mb-4" />
          <h1 className="font-heading text-4xl md:text-5xl font-bold">B2B Product Catalog</h1>
          <p className="mt-4 text-primary-foreground/70 max-w-lg mx-auto">
            Browse our product categories. All items are fully customizable for your brand and
            available for export or local vendor supply.
          </p>
        </div>
      </section>

      {/* Category Grid with image-backed cards */}
      <section className="section-padding bg-background">
        <div className="container-wide grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
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
              className="group relative overflow-hidden rounded-lg border border-border bg-card min-h-[260px]"
            >
              {/* Category-specific background image with subtle opacity */}
              <img
                src={cat.bg}
                alt={cat.name}
                className="absolute inset-0 w-full h-full object-cover opacity-30 group-hover:opacity-45 group-hover:scale-105 transition-all duration-500"
                loading="lazy"
                width={800}
                height={600}
              />
              {/* Gradient veil keeps text readable while the image still shows through */}
              <div className="absolute inset-0 bg-gradient-to-br from-card/90 via-card/70 to-card/40" />

              <div className="relative z-10 p-6 flex flex-col justify-end h-full min-h-[260px]">
                <h3 className="font-heading text-xl font-semibold text-card-foreground">{cat.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{cat.types}</p>
                <p className="mt-3 text-xs font-medium text-accent">MOQ: {cat.moq}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </section>
    </>
  );
}
