import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Mail, Phone, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";

// Validation schema for the contact / RFQ form
const contactSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100, "Name is too long"),
  email: z.string().trim().email("Invalid email address").max(255),
  company: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(30).optional(),
  // Product type is required only for RFQ submissions
  productType: z.string().trim().max(200).optional(),
  quantity: z.string().trim().max(50).optional(),
  message: z.string().trim().min(1, "Message is required").max(2000, "Message is too long"),
});

type ContactFormData = z.infer<typeof contactSchema>;

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
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
    // Clear error on change
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const result = contactSchema.safeParse(formData);
    if (!result.success) {
      const fieldErrors: typeof errors = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as keyof ContactFormData;
        if (!fieldErrors[field]) {
          fieldErrors[field] = issue.message;
        }
      }
      setErrors(fieldErrors);
      return;
    }

    setSubmitting(true);
    // Simulate submission delay (replace with actual backend call)
    try {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      toast({
        title: isRFQ ? "Quote Request Submitted" : "Message Sent",
        description: "We will get back to you within 24 hours.",
      });
      setFormData({ name: "", email: "", company: "", phone: "", productType: "", quantity: "", message: "" });
    } catch {
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
    <>
      {/* Header */}
      <section className="section-padding bg-primary text-primary-foreground text-center">
        <div className="container-narrow">
          <div className="divider-gold mx-auto mb-4" />
          <h1 className="font-heading text-4xl md:text-5xl font-bold">
            {isRFQ ? "Request a Quote" : "Contact Us"}
          </h1>
          <p className="mt-4 text-primary-foreground/70 max-w-lg mx-auto">
            {isRFQ
              ? "Fill out the form below and our team will respond with a detailed quote within 24 hours."
              : "Have questions? Reach out and our team will be happy to help."}
          </p>
        </div>
      </section>

      {/* Form + Contact Info */}
      <section className="section-padding bg-background">
        <div className="container-wide grid grid-cols-1 lg:grid-cols-3 gap-12">
          {/* Form */}
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
                  <label className="text-sm font-medium text-foreground">Name *</label>
                  <Input
                    value={formData.name}
                    onChange={(e) => handleChange("name", e.target.value)}
                    placeholder="Your full name"
                    className="mt-1"
                  />
                  {errors.name && <p className="text-xs text-destructive mt-1">{errors.name}</p>}
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">Email *</label>
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleChange("email", e.target.value)}
                    placeholder="you@company.com"
                    className="mt-1"
                  />
                  {errors.email && <p className="text-xs text-destructive mt-1">{errors.email}</p>}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="text-sm font-medium text-foreground">Company</label>
                  <Input
                    value={formData.company}
                    onChange={(e) => handleChange("company", e.target.value)}
                    placeholder="Company name"
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">Phone</label>
                  <Input
                    value={formData.phone}
                    onChange={(e) => handleChange("phone", e.target.value)}
                    placeholder="+92 300 1234567"
                    className="mt-1"
                  />
                </div>
              </div>

              {/* RFQ-specific fields */}
              {isRFQ && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label className="text-sm font-medium text-foreground">Product Type</label>
                    <Input
                      value={formData.productType}
                      onChange={(e) => handleChange("productType", e.target.value)}
                      placeholder="e.g., Polo Shirts, Chinos"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground">Estimated Quantity</label>
                    <Input
                      value={formData.quantity}
                      onChange={(e) => handleChange("quantity", e.target.value)}
                      placeholder="e.g., 1,000 pcs"
                      className="mt-1"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="text-sm font-medium text-foreground">Message *</label>
                <Textarea
                  value={formData.message}
                  onChange={(e) => handleChange("message", e.target.value)}
                  placeholder={
                    isRFQ
                      ? "Describe your requirements: fabric type, colors, sizes, target delivery date..."
                      : "How can we help?"
                  }
                  rows={5}
                  className="mt-1"
                />
                {errors.message && <p className="text-xs text-destructive mt-1">{errors.message}</p>}
              </div>

              <Button type="submit" size="lg" disabled={submitting}>
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
              <h3 className="font-heading text-lg font-semibold text-foreground mb-4">Get In Touch</h3>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <Mail className="w-5 h-5 text-accent mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Email</p>
                    <p className="text-sm text-muted-foreground">info@garmentco.com</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Phone className="w-5 h-5 text-accent mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Phone</p>
                    <p className="text-sm text-muted-foreground">+92 42 1234 5678</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <MapPin className="w-5 h-5 text-accent mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Address</p>
                    <p className="text-sm text-muted-foreground">
                      Industrial Area, Kot Lakhpat, Lahore, Pakistan
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-5 rounded-lg bg-secondary/60 border border-border">
              <h4 className="font-heading font-semibold text-foreground text-sm">Response Time</h4>
              <p className="mt-1 text-sm text-muted-foreground">
                We respond to all inquiries within 24 business hours. For urgent orders, reach us on WhatsApp.
              </p>
            </div>
          </motion.div>
        </div>
      </section>
    </>
  );
}
