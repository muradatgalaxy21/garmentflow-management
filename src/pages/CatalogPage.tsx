import { motion } from "framer-motion";
import fabricImage from "@/assets/fabric-texture.jpg";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } },
};

// Product categories available for B2B clients
const categories = [
  { name: "T-Shirts & Polos", types: "Round neck, V-neck, Polo, Henley", moq: "500 pcs" },
  { name: "Shirts & Blouses", types: "Formal, Casual, Linen, Oxford", moq: "300 pcs" },
  { name: "Trousers & Chinos", types: "Formal, Casual, Cargo, Joggers", moq: "300 pcs" },
  { name: "Jackets & Outerwear", types: "Bomber, Windbreaker, Puffer, Blazer", moq: "200 pcs" },
  { name: "Activewear", types: "Leggings, Sports Bra, Shorts, Hoodies", moq: "500 pcs" },
  { name: "Workwear & Uniforms", types: "Industrial, Corporate, Hospitality", moq: "200 pcs" },
];

export default function CatalogPage() {
  return (
    <>
      {/* Header */}
      <section className="section-padding bg-primary text-primary-foreground text-center">
        <div className="container-narrow">
          <div className="divider-gold mx-auto mb-4" />
          <h1 className="font-heading text-4xl md:text-5xl font-bold">B2B Product Catalog</h1>
          <p className="mt-4 text-primary-foreground/70 max-w-lg mx-auto">
            Browse our product categories. All items are fully customizable for your brand.
          </p>
        </div>
      </section>

      {/* Category Grid */}
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
              className="group relative overflow-hidden rounded-lg border border-border bg-card"
            >
              {/* Decorative image band */}
              <div className="h-32 overflow-hidden">
                <img
                  src={fabricImage}
                  alt={cat.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  loading="lazy"
                  width={800}
                  height={800}
                />
              </div>
              <div className="p-6">
                <h3 className="font-heading text-lg font-semibold text-card-foreground">{cat.name}</h3>
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
