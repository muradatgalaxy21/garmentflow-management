import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Mail, Phone, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import contactHero from "@/assets/contact-hero.jpg";

// Validation schema for the contact / RFQ form
const contactSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100, "Name is too long"),
  email: z.string().trim().email("Invalid email address").max(255),
  company: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(30).optional(),
  productType: z.string().trim().max(200).optional(),
  quantity: z.string().trim().max(50).optional(),
  message: z.string().trim().min(1, "Message is required").max(2000, "Message is too long"),
});

type ContactFormData = z.infer<typeof contactSchema>;

const fadeUp = {
  hidden: { opacity: 0, y: 25 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } },
};

export default function ContactPage() {
  const [searchParams] = useSearchParams();
  const isRFQ = searchParams.get("rfq") === "true";
  const { toast } = useToast();

  const [formData, setFormData] = useState<ContactFormData>({
    name: "",
    email: "",
    company: "",
    phone: "",
    productType: "",
    quantity: "",
    message: "",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof ContactFormData, string>>>({});
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (field: keyof ContactFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const result = contactSchema.safeParse(formData);
    if (!result.success) {
      const fieldErrors: typeof errors = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as keyof ContactFormData;
        if (!fieldErrors[field]) fieldErrors[field] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.from("rfqs").insert({
        name: result.data.name,
        email: result.data.email,
        company: result.data.company || null,
        phone: result.data.phone || null,
        product_type: result.data.productType || null,
        quantity: result.data.quantity || null,
        message: result.data.message,
        status: "new",
      });

      if (error) throw error;

      toast({
        title: isRFQ ? "Quote Request Submitted" : "Message Sent",
        description: "We will get back to you within 24 hours.",
      });
      setFormData({ name: "", email: "", company: "", phone: "", productType: "", quantity: "", message: "" });
    } catch (err) {
      console.error("RFQ submit failed", err);
      toast({
        title: "Submission Failed",
        description: "Please try again or contact us via WhatsApp.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-[#F5F2EA] min-h-screen text-[#1E293B]">
      {/* Header with preserved contactHero image and dark slate overlay */}
      <section className="relative h-[450px] md:h-[480px] flex items-center overflow-hidden text-white">
        <div className="absolute inset-0">
          <img
            src={contactHero}
            alt="En En Garments facility"
            className="w-full h-full object-cover"
            width={1600}
            height={900}
          />
          <div className="absolute inset-0 bg-[#3C404B]/80 backdrop-brightness-75" />
        </div>
        <div className="relative z-10 container-narrow text-center px-6 mx-auto">
          <div className="h-[2px] w-12 bg-[#B88E28] mx-auto mb-4" />
          <h1 className="font-heading text-4xl md:text-5xl font-bold tracking-tight">
            {isRFQ ? "Request a Quote" : "Contact Us"}
          </h1>
          <p className="mt-4 text-gray-200 max-w-xl mx-auto text-base md:text-lg font-light leading-relaxed">
            {isRFQ
              ? "Fill out the form below and our team will respond with a detailed quote within 24 hours."
              : "Have questions? Reach out and our team will be happy to help."}
          </p>
        </div>
      </section>

      {/* Form + Contact Info */}
      <section className="section-padding">
        <div className="container-wide grid grid-cols-1 lg:grid-cols-3 gap-12">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeUp}
            className="lg:col-span-2"
          >
            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="text-xs font-bold text-[#1E293B]">Name *</label>
                  <Input
                    value={formData.name}
                    onChange={(e) => handleChange("name", e.target.value)}
                    placeholder="Your full name"
                    className="mt-1 bg-[#FAF8F3] border-[#E5DFD3] text-sm focus:border-[#B88E28]"
                  />
                  {errors.name && <p className="text-xs text-destructive mt-1">{errors.name}</p>}
                </div>
                <div>
                  <label className="text-xs font-bold text-[#1E293B]">Email *</label>
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleChange("email", e.target.value)}
                    placeholder="you@company.com"
                    className="mt-1 bg-[#FAF8F3] border-[#E5DFD3] text-sm focus:border-[#B88E28]"
                  />
                  {errors.email && <p className="text-xs text-destructive mt-1">{errors.email}</p>}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="text-xs font-bold text-[#1E293B]">Company</label>
                  <Input
                    value={formData.company}
                    onChange={(e) => handleChange("company", e.target.value)}
                    placeholder="Company name"
                    className="mt-1 bg-[#FAF8F3] border-[#E5DFD3] text-sm focus:border-[#B88E28]"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-[#1E293B]">Phone</label>
                  <Input
                    value={formData.phone}
                    onChange={(e) => handleChange("phone", e.target.value)}
                    placeholder="+92 300 8408936"
                    className="mt-1 bg-[#FAF8F3] border-[#E5DFD3] text-sm focus:border-[#B88E28]"
                  />
                </div>
              </div>

              {isRFQ && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label className="text-xs font-bold text-[#1E293B]">Product Type</label>
                    <Input
                      value={formData.productType}
                      onChange={(e) => handleChange("productType", e.target.value)}
                      placeholder="e.g., Polo Shirts, Chinos"
                      className="mt-1 bg-[#FAF8F3] border-[#E5DFD3] text-sm focus:border-[#B88E28]"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-[#1E293B]">Estimated Quantity</label>
                    <Input
                      value={formData.quantity}
                      onChange={(e) => handleChange("quantity", e.target.value)}
                      placeholder="e.g., 1,000 pcs"
                      className="mt-1 bg-[#FAF8F3] border-[#E5DFD3] text-sm focus:border-[#B88E28]"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="text-xs font-bold text-[#1E293B]">Message *</label>
                <Textarea
                  value={formData.message}
                  onChange={(e) => handleChange("message", e.target.value)}
                  placeholder={
                    isRFQ
                      ? "Describe your requirements: fabric type, colors, sizes, target delivery date..."
                      : "How can we help?"
                  }
                  rows={5}
                  className="mt-1 bg-[#FAF8F3] border-[#E5DFD3] text-sm focus:border-[#B88E28]"
                />
                {errors.message && <p className="text-xs text-destructive mt-1">{errors.message}</p>}
              </div>

              <Button
                type="submit"
                disabled={submitting}
                className="bg-[#1B2A4A] text-white hover:bg-[#121B33] font-semibold py-3 px-7 rounded-md transition-colors"
              >
                {submitting ? "Sending..." : isRFQ ? "Submit Quote Request" : "Send Message"}
              </Button>
            </form>
          </motion.div>

          {/* Contact Info Sidebar */}
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeUp}
            className="space-y-8"
          >
            <div>
              <h3 className="font-heading text-xl font-bold text-[#1E293B] mb-5">Get In Touch</h3>
              <div className="space-y-5">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full border border-[#B88E28]/40 bg-[#FAF7F0] text-[#B88E28] flex items-center justify-center shrink-0 mt-0.5">
                    <Mail className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-[#1E293B]">Email</p>
                    <a
                      href="mailto:zubair.nazim@accounts.ffclothings.com"
                      className="text-sm text-gray-600 hover:text-[#B88E28] break-all mt-0.5 inline-block"
                    >
                      zubair.nazim@accounts.ffclothings.com
                    </a>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full border border-[#B88E28]/40 bg-[#FAF7F0] text-[#B88E28] flex items-center justify-center shrink-0 mt-0.5">
                    <Phone className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-[#1E293B]">Phone (Owner)</p>
                    <a href="tel:+923008408936" className="text-sm text-gray-600 hover:text-[#B88E28] mt-0.5 inline-block">
                      0300 8408936
                    </a>
                    <p className="text-xs text-gray-500 mt-0.5">Zubair Nazim — Owner & CEO</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full border border-[#B88E28]/40 bg-[#FAF7F0] text-[#B88E28] flex items-center justify-center shrink-0 mt-0.5">
                    <MapPin className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-[#1E293B]">Location</p>
                    <p className="text-sm text-gray-600 mt-0.5">Pakistan — Shipping worldwide</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-5 rounded-lg bg-[#EFE8D9] border border-[#E4DDD0]">
              <h4 className="font-heading font-bold text-[#1E293B] text-sm">Response Time</h4>
              <p className="mt-1.5 text-sm text-gray-600 leading-relaxed">
                We respond to all inquiries within 24 business hours. For urgent orders, reach us
                on WhatsApp.
              </p>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
