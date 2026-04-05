import { Link } from "react-router-dom";

const footerLinks = {
  company: [
    { label: "About Us", path: "/about" },
    { label: "Capabilities", path: "/capabilities" },
    { label: "Catalog", path: "/catalog" },
  ],
  support: [
    { label: "Contact", path: "/contact" },
    { label: "Request a Quote", path: "/contact?rfq=true" },
  ],
};

export default function Footer() {
  return (
    <footer className="bg-primary text-primary-foreground">
      <div className="container-wide section-padding">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
          {/* Brand column */}
          <div>
            <h3 className="font-heading text-xl font-bold mb-3">GarmentCo</h3>
            <p className="text-sm opacity-70 leading-relaxed max-w-xs">
              Premium garment manufacturing for global B2B clients. Quality craftsmanship, reliable delivery, competitive pricing.
            </p>
          </div>

          {/* Company links */}
          <div>
            <h4 className="text-sm font-semibold uppercase tracking-widest mb-4 opacity-60">
              Company
            </h4>
            <ul className="space-y-2">
              {footerLinks.company.map((link) => (
                <li key={link.path}>
                  <Link
                    to={link.path}
                    className="text-sm opacity-70 hover:opacity-100 transition-opacity"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Support links */}
          <div>
            <h4 className="text-sm font-semibold uppercase tracking-widest mb-4 opacity-60">
              Support
            </h4>
            <ul className="space-y-2">
              {footerLinks.support.map((link) => (
                <li key={link.path}>
                  <Link
                    to={link.path}
                    className="text-sm opacity-70 hover:opacity-100 transition-opacity"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="divider-gold mt-12 mb-6 opacity-40" />
        <p className="text-xs opacity-50 text-center">
          {new Date().getFullYear()} GarmentCo Manufacturing. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
