import { MessageCircle } from "lucide-react";

// Floating WhatsApp contact button for the En En Garments owner line.
// Number is stored in international format without the leading plus or zero.
const WHATSAPP_NUMBER = "923008408936";
const WHATSAPP_MESSAGE = encodeURIComponent(
  "Hello En En Garments, I am interested in your manufacturing services. Could you share more details?"
);

export default function WhatsAppWidget() {
  const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${WHATSAPP_MESSAGE}`;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Contact En En Garments on WhatsApp"
      className="fixed bottom-6 right-6 z-50 flex items-center justify-center w-14 h-14 rounded-full bg-[#25D366] text-white shadow-lg hover:scale-105 transition-transform"
    >
      <MessageCircle size={26} />
    </a>
  );
}
