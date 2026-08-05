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
    { label: "Client / Worker Portal", path: "/auth" },
  ],
};

export default function Footer() {
  return (
    <footer className="bg-[#121B33]">
      <div className="max-w-[1360px] mx-auto px-6 lg:px-[40px] pt-[80px] pb-[30px] grid grid-cols-1 md:grid-cols-[1.4fr_1fr_1fr] gap-10 md:gap-[60px]">
        {/* Brand column */}
        <div>
          <h3 className="font-heading text-[20px] font-bold text-[#FAF7EF] mb-3.5">
            En En Garments
          </h3>
          <p className="text-[13.5px] text-[#8B93AC] leading-[1.7] max-w-[320px]">
            30+ years of garment manufacturing heritage. Trusted partner for global exports and local
            vendors, built on craftsmanship, scale, and reliability.
          </p>
        </div>

        {/* Company links */}
        <div>
          <h4 className="text-[12px] tracking-[0.1em] text-[#6C7593] font-bold mb-[18px] uppercase">
            COMPANY
          </h4>
          <div className="flex flex-col gap-3">
            {footerLinks.company.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                className="text-[14px] text-[#C8CDE0] hover:text-white transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>

        {/* Support links */}
        <div>
          <h4 className="text-[12px] tracking-[0.1em] text-[#6C7593] font-bold mb-[18px] uppercase">
            SUPPORT
          </h4>
          <div className="flex flex-col gap-3">
            {footerLinks.support.map((link) => (
              <Link
                key={link.label}
                to={link.path}
                className="text-[14px] text-[#C8CDE0] hover:text-white transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="border-t border-white/[0.08] py-[22px] px-6 text-center">
        <span className="text-[12.5px] text-[#6C7593]">
          2026 En En Garments. All rights reserved.
        </span>
      </div>
    </footer>
  );
}

