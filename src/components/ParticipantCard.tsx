import React, { useRef } from "react";
import { Download, Sparkles, MapPin, Calendar, Award, Compass } from "lucide-react";
import html2canvas from "html2canvas";
import { BarcodeGenerator } from "./BarcodeGenerator";
import { Registration } from "../types";
import { motion } from "motion/react";
import { generateCertificateImage } from "../utils/certHelper";

interface ParticipantCardProps {
  registration: Registration;
  eventTitle: string;
  eventLocation?: string;
  cardTemplateBase64?: string;
  cardTemplateTextColor?: "white" | "black";
  certificateTemplateBase64?: string;
  eventStartDate?: string;
  durationDays?: number;
  isCertificateReleased?: boolean;
  
  // Custom certificate text positions
  certificateNo?: string;
  certNoX?: number;
  certNoY?: number;
  certNoSize?: number;
  certNoColor?: string;
  certNameX?: number;
  certNameY?: number;
  certNameSize?: number;
  certNameColor?: string;
  certDateX?: number;
  certDateY?: number;
  certDateSize?: number;
  certDateColor?: string;
  // QR validation settings
  certQrX?: number;
  certQrY?: number;
  certQrSize?: number;
  isCertQrEnabled?: boolean;
}

export const ParticipantCard: React.FC<ParticipantCardProps> = ({
  registration,
  eventTitle,
  eventLocation,
  cardTemplateBase64,
  certificateTemplateBase64,
  eventStartDate,
  durationDays,
  isCertificateReleased,
  cardTemplateTextColor,
  certificateNo,
  certNoX,
  certNoY,
  certNoSize,
  certNoColor,
  certNameX,
  certNameY,
  certNameSize,
  certNameColor,
  certDateX,
  certDateY,
  certDateSize,
  certDateColor,
  certQrX,
  certQrY,
  certQrSize,
  isCertQrEnabled,
}) => {
  const cardRef = useRef<HTMLDivElement>(null);

  const handleDownloadCertificate = async () => {
    try {
      const base64withName = await generateCertificateImage({
        participantName: registration.name,
        participantNik: registration.nik,
        kabKota: registration.kabKota,
        eventTitle: eventTitle,
        eventLocation: eventLocation,
        startDate: eventStartDate,
        durationDays: durationDays,
        customTemplateBase64: registration.certificateBase64 || certificateTemplateBase64 || undefined,
        participantId: registration.id,
        
        // Pass style orientations
        certificateNo: certificateNo,
        certNoX: certNoX,
        certNoY: certNoY,
        certNoSize: certNoSize,
        certNoColor: certNoColor,
        certNameX: certNameX,
        certNameY: certNameY,
        certNameSize: certNameSize,
        certNameColor: certNameColor,
        certDateX: certDateX,
        certDateY: certDateY,
        certDateSize: certDateSize,
        certDateColor: certDateColor,
        certQrX: certQrX,
        certQrY: certQrY,
        certQrSize: certQrSize,
        isCertQrEnabled: isCertQrEnabled,
      });
      const link = document.createElement("a");
      link.href = base64withName;
      const safeName = registration.name.trim().toUpperCase().replace(/[^A-Z0-9]/g, "_");
      link.download = `SERTIFIKAT_BIMTEK_${safeName}.png`;
      link.click();
    } catch (e) {
      console.error("Gagal mengunduh sertifikat:", e);
      alert("Gagal mengunduh sertifikat digital.");
    }
  };

  const handleDownload = async () => {
    if (!cardRef.current) return;

    const originalGetComputedStyle = window.getComputedStyle;

    try {
      // Override getComputedStyle to filter out oklch and oklab colors for html2canvas compatibility
      window.getComputedStyle = function (elt, pseudoElt) {
        const style = originalGetComputedStyle.call(window, elt, pseudoElt);
        
        const safeColor = (value: string): string => {
          if (typeof value === "string" && (value.includes("oklch") || value.includes("oklab"))) {
            // Tailwind v4 uses oklch/oklab (L C H / alpha) or similar
            if (value.includes("/")) {
              const parts = value.split("/");
              const alphaAttr = parts[parts.length - 1].replace(")", "").trim();
              const alpha = parseFloat(alphaAttr);
              return isNaN(alpha) ? "rgba(0,0,0,0)" : `rgba(71, 85, 105, ${alpha})`;
            }
            return "#475569"; // fallback neutral slate color
          }
          return value;
        };

        return new Proxy(style, {
          get(target, prop) {
            const val = Reflect.get(target, prop);
            if (typeof val === "function") {
              return function (...args: any[]) {
                const result = val.apply(target, args);
                if (prop === "getPropertyValue" && typeof result === "string" && (result.includes("oklch") || result.includes("oklab"))) {
                  return safeColor(result);
                }
                return result;
              };
            }
            if (typeof prop === "string" && typeof val === "string" && (val.includes("oklch") || val.includes("oklab"))) {
              return safeColor(val);
            }
            return val;
          },
        });
      };

      // Create a temporary clone with fixed dimensions to guarantee perfect capture on mobile layout viewports
      const clone = cardRef.current.cloneNode(true) as HTMLDivElement;
      clone.classList.remove("w-full", "aspect-[5/8]", "sm:aspect-[4.8/8]");
      clone.style.width = "400px";
      clone.style.height = "640px";
      clone.style.aspectRatio = "auto";
      clone.style.position = "absolute";
      clone.style.left = "-9999px";
      clone.style.top = "-9999px";
      clone.style.zIndex = "-9999";
      document.body.appendChild(clone);

      const canvas = await html2canvas(clone, {
        scale: 3, // Ultra-high resolution output
        useCORS: true,
        allowTaint: true,
        logging: false,
        backgroundColor: null,
      });

      document.body.removeChild(clone);

      const dataUrl = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      const safeName = registration.name.trim().toUpperCase().replace(/[^A-Z0-9]/g, "_");
      link.download = `BIMTEK_CARD_${safeName}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("Gagal mengekspor kartu:", err);
      alert("Gagal menyimpan gambar kartu. Silakan screenshot sebagai alternatif.");
    } finally {
      // Restore standard getComputedStyle immediately
      window.getComputedStyle = originalGetComputedStyle;
    }
  };

  const formattedDate = new Date(registration.registeredAt).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  // Calculate contrast color for typography on top of AI generated backgrounds
  // Simple heuristic: if background is very light, use dark text. For emerald green, white text is gorgeous.
  const getsDarkBackground = (hex: string) => {
    const color = hex.replace("#", "");
    const r = parseInt(color.substring(0, 2), 16);
    const g = parseInt(color.substring(2, 4), 16);
    const b = parseInt(color.substring(4, 6), 16);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness < 155; // true if dark
  };

  const isBgDark = cardTemplateBase64
    ? (cardTemplateTextColor !== "black")
    : getsDarkBackground(registration.color || "#0F6251");
  const textColor = isBgDark ? "#ffffff" : "#0f172a";
  const subTextColor = isBgDark ? "rgba(255,255,255,0.85)" : "#334155";
  const labelColor = isBgDark ? "rgba(255,255,255,0.65)" : "#64748b";

  return (
    <div className="flex flex-col items-center space-y-6">
      {/* CARD CONTAINER FOR DOWNLOAD - FIXED RATIO FOR EXCELLENT BADGE OUTPUT */}
      <div className="w-full max-w-sm overflow-hidden p-1 bg-white rounded-3xl shadow-2xl shadow-emerald-950/10">
        <div
          ref={cardRef}
          id="digital-participant-card"
          className="relative w-full aspect-[5/8] sm:aspect-[4.8/8] select-none rounded-[22px] overflow-hidden p-6 flex flex-col justify-between"
          style={{
            backgroundColor: cardTemplateBase64 ? "transparent" : (registration.color || "#0F6251"),
            backgroundImage: cardTemplateBase64 ? `url(${cardTemplateBase64})` : "none",
            backgroundSize: "cover",
            backgroundPosition: "center",
            boxShadow: cardTemplateBase64 ? "none" : "inset 0 0 80px rgba(0,0,0,0.15)",
          }}
        >
          {/* MINANGKABAU EMBOSSED STYLE HEADERS */}
          {!cardTemplateBase64 && (
            <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-10">
              <svg width="100%" height="100%">
                <pattern
                  id="minangkabau-pattern-mesh"
                  x="0"
                  y="0"
                  width="20"
                  height="20"
                  patternUnits="userSpaceOnUse"
                >
                  <path d="M 10 0 L 20 10 L 10 20 L 0 10 Z" fill="none" stroke={isBgDark ? "#ffffff" : "#000000"} strokeWidth="1" />
                </pattern>
                <rect width="100%" height="100%" fill="url(#minangkabau-pattern-mesh)" />
              </svg>
            </div>
          )}

          {/* WATERMARK EMBLEM background */}
          {!cardTemplateBase64 && (
            <div className="absolute right-[-10%] top-[30%] opacity-15 pointer-events-none">
              <Compass className="w-80 h-80" style={{ color: isBgDark ? "#ffffff" : "#000000" }} />
            </div>
          )}

          {/* CARD TOP SECTION: LOGO & META */}
          <div className="relative z-10">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="p-1.5 rounded-xl" style={{ backgroundColor: isBgDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)" }}>
                  <Award className="w-6 h-6" style={{ color: isBgDark ? "#fde047" : "#047857" }} />
                </div>
                <div>
                  <h4 className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: labelColor }}>
                    PESERTA
                  </h4>
                  <p className="text-xs font-bold font-sans" style={{ color: textColor }}>
                    DP3AP2KB SUMBAR
                  </p>
                </div>
              </div>
              <Compass className="w-6 h-6 animate-spin-slow" style={{ color: isBgDark ? "rgba(255,255,255,0.4)" : "rgba(4, 120, 87, 0.4)" }} />
            </div>

            {/* EVENT TITLE & LOCATION */}
            <div className="mt-5 space-y-1">
              <h3 className="text-[11px] font-mono tracking-wider uppercase" style={{ color: isBgDark ? "#6ee7b7" : "#065f46" }}>
                BIMTEK / TRAINING
              </h3>
              <p className="text-sm sm:text-base font-black leading-snug font-sans tracking-tight break-words" style={{ color: textColor }}>
                {eventTitle}
              </p>
              {eventLocation && (
                <div className="flex items-start space-x-1 pt-0.5 opacity-90">
                  <MapPin className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-[11px] font-bold leading-normal break-words" style={{ color: subTextColor }}>
                    {eventLocation}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* CARD MID SECTION: PARTICIPANT DATA */}
          <div className="relative z-10 my-3 space-y-3.5">
            <div className="space-y-1">
              <span className="text-[10px] uppercase font-mono tracking-wider" style={{ color: labelColor }}>
                Nama Lengkap
              </span>
              <h2 className="text-xl sm:text-2xl font-black tracking-tight font-sans break-words leading-tight" style={{ color: textColor }}>
                {registration.name.toUpperCase()}
              </h2>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="space-y-1">
                <span className="text-[10px] uppercase font-mono tracking-wider" style={{ color: labelColor }}>
                  Domisili / Asal
                </span>
                <div className="flex items-center space-x-1">
                  <MapPin className="w-4 h-4" style={{ color: "#ef4444" }} />
                  <p className="text-sm font-extrabold break-words" style={{ color: textColor }}>
                    {registration.kabKota}
                  </p>
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] uppercase font-mono tracking-wider" style={{ color: labelColor }}>
                  Pelaksanaan Kegiatan
                </span>
                <div className="flex items-center space-x-1">
                  <Calendar className="w-4 h-4" style={{ color: "#f59e0b" }} />
                  <p className="text-[11px] sm:text-xs font-black break-words leading-tight" style={{ color: subTextColor }}>
                    {(() => {
                      const start = eventStartDate ? new Date(eventStartDate) : new Date("2026-05-21");
                      const days = durationDays || 3;
                      const end = new Date(start);
                      end.setDate(end.getDate() + (days - 1));
                      
                      const startStr = start.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
                      const endStr = end.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
                      return `${startStr} s/d ${endStr}`;
                    })()}
                  </p>
                </div>
              </div>
            </div>

            {/* EXPANDED ADDRESS DESCRIPTOR */}
            <p
              className="text-[11px] font-medium leading-relaxed p-2.5 rounded-lg break-words"
              style={{
                backgroundColor: isBgDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)",
                color: isBgDark ? "#e2e8f0" : "#334155",
                borderColor: isBgDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)",
                borderWidth: "1px",
                borderStyle: "solid",
              }}
            >
              {registration.address}
            </p>
          </div>

           {/* CARD BOTTOM SECTION: BARCODE & FOOTER STAMP */}
          <div
            className="relative z-10 pt-4 rounded-2xl p-4"
            style={{
              backgroundColor: "rgba(255, 255, 255, 0.95)",
              boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
              border: "1px solid rgba(255, 255, 255, 0.2)",
            }}
          >
            <BarcodeGenerator value={registration.nik || registration.phone} height={38} />
            <div
              className="text-center mt-2 pt-2 flex items-center justify-end text-[9px] uppercase tracking-widest font-semibold font-mono"
              style={{
                borderTop: "1px solid #f3f4f6",
                color: "#6b7280",
              }}
            >
              <span className="font-bold" style={{ color: "#047857" }}>★ LULUS VERIFIKASI</span>
            </div>
          </div>
        </div>
      </div>

      {/* COMPACT CONTROL ACTIONS */}
      <div className="w-full max-w-sm flex flex-col space-y-3">
        <button
          onClick={handleDownload}
          id="btn-download-card"
          className="w-full flex items-center justify-center space-x-2 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-850 text-white font-semibold py-3 px-6 rounded-2xl shadow-xl shadow-emerald-700/10 hover:shadow-emerald-700/20 active:scale-95 transition-all text-sm cursor-pointer"
        >
          <Download className="w-4 h-4 animate-bounce" />
          <span>Simpan Gambar Kartu (PNG)</span>
        </button>

        {(registration.certificateBase64 || registration.isCertificateSent || isCertificateReleased) ? (
          <button
            onClick={handleDownloadCertificate}
            id="btn-download-cert"
            className="w-full flex items-center justify-center space-x-2 bg-gradient-to-r from-amber-500 via-orange-500 to-yellow-600 hover:from-amber-600 hover:via-orange-600 hover:to-yellow-700 text-white font-black py-3 px-6 rounded-2xl shadow-xl shadow-amber-500/20 active:scale-95 transition-all text-sm cursor-pointer animate-pulse-slow"
          >
            <Award className="w-5 h-5 text-yellow-300 shrink-0" />
            <span>Unduh Sertifikat Bimtek (Resmi)</span>
          </button>
        ) : (
          <div className="w-full py-3 px-4 rounded-2xl bg-amber-500/5 border border-amber-500/10 text-center text-[11px] sm:text-xs text-amber-550 font-semibold leading-relaxed">
            🔒 Sertifikat Bimtek digital Anda masih diproses / belum diterbitkan oleh Admin. Silakan ikuti seluruh rangkaian materi kegiatan.
          </div>
        )}

        <div className="flex items-center justify-center space-x-1 text-xs text-slate-500">
          <Sparkles className="w-3.5 h-3.5 text-yellow-500" />
          <span>Warna latar belakang kartu ditentukan secara otomatis oleh Gemini AI</span>
        </div>
      </div>
    </div>
  );
};
