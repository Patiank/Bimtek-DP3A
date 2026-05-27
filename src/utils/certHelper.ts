/**
 * Utility helper to generate beautiful custom certificates dynamically on HTML5 Canvas.
 * Supports drawing on top of a custom template or generating an elegant default background automatically.
 */

// Helper to format date in Indonesian format
const indonesianMonths = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember"
];

export const formatIndoDate = (dateStr?: string, offsetDays = 0): string => {
  try {
    const d = new Date(dateStr || new Date().toISOString().split("T")[0]);
    if (isNaN(d.getTime())) return "";
    if (offsetDays !== 0) {
      d.setDate(d.getDate() + offsetDays);
    }
    const day = d.getDate();
    const month = indonesianMonths[d.getMonth()];
    const year = d.getFullYear();
    return `${day} ${month} ${year}`;
  } catch (e) {
    return "";
  }
};

interface CertificateData {
  participantName: string;
  participantNik: string;
  kabKota?: string;
  eventTitle: string;
  eventLocation?: string;
  startDate?: string;
  durationDays?: number;
  kabidName?: string;
  kabidNip?: string;
  customTemplateBase64?: string;
  
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
}

export const generateCertificateImage = (data: CertificateData): Promise<string> => {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    canvas.width = 1920;
    canvas.height = 1080;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      reject(new Error("Gagal menginisialisasi modul Canvas pembuat sertifikat."));
      return;
    }

    const drawThreeDynamicTexts = (targetCtx: CanvasRenderingContext2D, width: number, height: number) => {
      targetCtx.textAlign = "center";
      targetCtx.textBaseline = "middle";
      targetCtx.shadowColor = "transparent";
      targetCtx.shadowBlur = 0;
      targetCtx.shadowOffsetX = 0;
      targetCtx.shadowOffsetY = 0;

      // 1. DRAW CERTIFICATE NUMBER
      const noY = data.certNoY !== undefined ? data.certNoY : 310;
      const noX = data.certNoX !== undefined ? data.certNoX : Math.round(width / 2);
      const noSize = data.certNoSize !== undefined ? data.certNoSize : 16;
      const noColor = data.certNoColor || "#4f46e5";

      targetCtx.font = `bold italic ${noSize}px "Inter", "Courier New", monospace`;
      targetCtx.fillStyle = noColor;
      targetCtx.fillText(data.certificateNo || "Nomor: 556/BIMTEK-DP3AP2KB/SDK/001/2026", noX, noY);

      // 2. DRAW PARTICIPANT NAME
      const nameY = data.certNameY !== undefined ? data.certNameY : 560;
      const nameX = data.certNameX !== undefined ? data.certNameX : Math.round(width / 2);
      const nameSize = data.certNameSize !== undefined ? data.certNameSize : 45;
      const nameColor = data.certNameColor || "#1e293b";

      targetCtx.font = `bold ${nameSize}px "Times New Roman", "Playfair Display", "Georgia", "Inter", sans-serif`;
      targetCtx.fillStyle = nameColor;
      
      // Transparent shadow for exclusive aesthetic depth
      targetCtx.shadowColor = "rgba(0, 0, 0, 0.12)";
      targetCtx.shadowBlur = 3;
      targetCtx.shadowOffsetX = 1;
      targetCtx.shadowOffsetY = 1;
      targetCtx.fillText(data.participantName.toUpperCase(), nameX, nameY);
      targetCtx.shadowColor = "transparent";
      targetCtx.shadowBlur = 0;
      targetCtx.shadowOffsetX = 0;
      targetCtx.shadowOffsetY = 0;

      // 3. DRAW EVENT DATE (TANGGAL BIMTEK & JUDUL KEGIATAN SURAT)
      const dateY = data.certDateY !== undefined ? data.certDateY : 720;
      const dateX = data.certDateX !== undefined ? data.certDateX : Math.round(width / 2);
      const dateSize = data.certDateSize !== undefined ? data.certDateSize : 18;
      const dateColor = data.certDateColor || "#475569";

      targetCtx.font = `bold ${dateSize}px "Inter", "Helvetica", sans-serif`;
      targetCtx.fillStyle = dateColor;
      
      // Left alignment requested by user
      targetCtx.textAlign = "left";

      const startFmt = formatIndoDate(data.startDate);
      const endFmt = formatIndoDate(data.startDate, (data.durationDays || 3) - 1);
      
      const spacing = Math.round(dateSize * 1.5);
      let currentY = dateY;

      // 1. Draw "Sebagai Peserta"
      targetCtx.fillText("Sebagai Peserta", dateX, currentY);
      currentY += spacing;

      // 2. Draw "judul kegiatan" with max 8 words wrapping per line
      const eventTitle = data.eventTitle || "Bimbingan Teknis";
      const words = eventTitle.trim().split(/\s+/);
      const titleLines: string[] = [];
      if (words.length > 0 && eventTitle.trim() !== "") {
        for (let i = 0; i < words.length; i += 8) {
          titleLines.push(words.slice(i, i + 8).join(" "));
        }
      } else {
        titleLines.push("Bimbingan Teknis");
      }

      for (const tLine of titleLines) {
        targetCtx.fillText(tLine, dateX, currentY);
        currentY += spacing;
      }

      // 3. Draw "pada tanggal [tanggal pelaksanaan]"
      const dateLine = `pada tanggal ${startFmt} s.d ${endFmt}`;
      targetCtx.fillText(dateLine, dateX, currentY);
      
      // 4. Draw event location on a new line
      if (data.eventLocation && data.eventLocation.trim() !== "") {
        currentY += spacing;
        targetCtx.fillText(`bertempat di ${data.eventLocation}`, dateX, currentY);
      }
    };

    // Case 1: Custom background template uploaded by user
    if (data.customTemplateBase64) {
      const img = new window.Image();
      img.onload = () => {
        try {
          // Sync size or stick to 1920x1080
          const realW = img.naturalWidth || img.width || 1920;
          const realH = img.naturalHeight || img.height || 1080;
          canvas.width = realW;
          canvas.height = realH;
          ctx.drawImage(img, 0, 0, realW, realH);

          // Draw certificate number, name, and date of event only!
          drawThreeDynamicTexts(ctx, realW, realH);
          resolve(canvas.toDataURL("image/png"));
        } catch (e) {
          console.error("Gagal menggambar teks ke template:", e);
          reject(e);
        }
      };
      img.onerror = () => {
        reject(new Error("Gagal membaca template sertifikat custom."));
      };
      img.src = data.customTemplateBase64;
      return;
    }

    // Case 2: SYSTEM DETERMINED AUTOMATIC HIGH-QUALITY FORMAT (BEAUTIFUL STANDALONE TEMPLATE GENERATED IN CODE)
    try {
      const w = 1920;
      const h = 1080;

      // 1. Beautiful luxury background (Soft rich vintage cream ivory)
      const gradBg = ctx.createRadialGradient(w/2, h/2, 100, w/2, h/2, w);
      gradBg.addColorStop(0, "#fefcf9");
      gradBg.addColorStop(1, "#f5ebd6");
      ctx.fillStyle = gradBg;
      ctx.fillRect(0, 0, w, h);

      // Subtle vintage texture lines (pinstripes)
      ctx.strokeStyle = "rgba(194, 120, 3, 0.04)";
      ctx.lineWidth = 1;
      for (let i = 20; i < w; i += 40) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, h);
        ctx.stroke();
      }

      // 2. High-quality Double borders
      // Border 1: Outer Pine Green Border (8px solid)
      ctx.strokeStyle = "#0d5c3a"; // Deep Forest Green
      ctx.lineWidth = 12;
      ctx.strokeRect(30, 30, w - 60, h - 60);

      // Border 2: Inner Luxury Fine Gold Border
      ctx.strokeStyle = "#c5a85c"; // Aged Gold Metallic
      ctx.lineWidth = 3;
      ctx.strokeRect(52, 52, w - 104, h - 104);

      // Draw elegant corner shapes
      const corners = [
        { x: 52, y: 52 },
        { x: w - 52, y: 52 },
        { x: 52, y: h - 52 },
        { x: w - 52, y: h - 52 }
      ];
      corners.forEach(corner => {
        ctx.fillStyle = "#c5a85c";
        ctx.beginPath();
        ctx.arc(corner.x, corner.y, 16, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = "#0d5c3a";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(corner.x, corner.y, 22, 0, Math.PI * 2);
        ctx.stroke();
      });

      // 3. Government Header
      const headerY = 90;
      ctx.textAlign = "center";
      
      // Secondary header (PEMERINTAH PROVINSI SUMATERA BARAT)
      ctx.fillStyle = "#1e3a8a"; // Navy
      ctx.font = `bold 22px "Inter", "Helvetica", sans-serif`;
      ctx.fillText("PEMERINTAH PROVINSI SUMATERA BARAT", w / 2, headerY);

      // Main agency name
      ctx.fillStyle = "#0d5c3a"; // Dinas Green
      ctx.font = `bold 20px "Inter", "Helvetica", sans-serif`;
      ctx.fillText("DINAS PEMBERDAYAAN PEREMPUAN, PERLINDUNGAN ANAK, PENGENDALIAN PENDUDUK, DAN KELUARGA BERENCANA (DP3AP2KB) PROV. SUMBAR", w / 2, headerY + 42);

      // Address
      ctx.fillStyle = "#475569";
      ctx.font = `italic 14px "Inter", sans-serif`;
      ctx.fillText("Jl. Rasuna Said No. 74, Kota Padang, Sumatera Barat", w / 2, headerY + 70);

      // Divider Double Line
      ctx.strokeStyle = "#c5a85c";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(120, headerY + 90);
      ctx.lineTo(w - 120, headerY + 90);
      ctx.stroke();

      ctx.strokeStyle = "#0d5c3a";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(120, headerY + 95);
      ctx.lineTo(w - 120, headerY + 95);
      ctx.stroke();

      // 4. CERTIFICATE TITLE
      ctx.fillStyle = "#1e293b"; 
      ctx.font = `bold 66px "Times New Roman", "Georgia", serif`;
      ctx.fillText("SERTIFIKAT", w / 2, headerY + 180);

      // Diberikan Kepada Label
      ctx.fillStyle = "#5d5c58";
      ctx.font = `italic font-serif 18px "Georgia", serif`;
      ctx.fillText("Diberikan Kepada :", w / 2, headerY + 280);

      // 5. DRAW ENTIRE THREE MAIN DYNAMIC COMPONENT TEXTS
      drawThreeDynamicTexts(ctx, w, h);

      // 6. BODY STATEMENT TEXT
      const statementY = h / 2 + 105;
      ctx.font = `18px "Inter", sans-serif`;
      ctx.fillStyle = "#334155";
      ctx.fillText("Atas partisipasi aktif, integritas, dan kelulusannya sebagai PESERTA pada kegiatan", w / 2, statementY);

      // Active Event Title Banner (High-contrast and centered)
      ctx.font = `bold 28px "Inter", "Helvetica", sans-serif`;
      ctx.fillStyle = "#0c4f30"; // Solid emerald green
      ctx.fillText(`“ ${data.eventTitle.toUpperCase()} ”`, w / 2, statementY + 45);

      // Extra activity details
      const duration = data.durationDays || 3;
      ctx.font = `16px "Inter", sans-serif`;
      ctx.fillStyle = "#475569";
      const startFmt = formatIndoDate(data.startDate);
      const endFmt = formatIndoDate(data.startDate, duration - 1);
      const hostDetail = `Diselenggarakan di ${data.eventLocation || "Padang, Sumatera Barat"} pada tanggal ${startFmt} s.d ${endFmt} (Durasi ${duration} Hari).`;
      ctx.fillText(hostDetail, w / 2, statementY + 84);

      // 7. SIGNATURE SIDE (Right aligned panel)
      const sigX = w - 420;
      const sigY = h - 250;

      ctx.textAlign = "center";
      ctx.fillStyle = "#334155";
      ctx.font = `16px "Inter", sans-serif`;
      ctx.fillText(`Ditetapkan di Padang, ${formatIndoDate()}`, sigX, sigY);
      
      ctx.font = `bold 14px "Inter", sans-serif`;
      ctx.fillText("KEPALA BIDANG", sigX, sigY + 25);
      ctx.font = `bold 9.5px "Inter", sans-serif`;
      ctx.fillText("DINAS PEMBERDAYAAN PEREMPUAN, PERLINDUNGAN ANAK, PENGENDALIAN PENDUDUK,", sigX, sigY + 41);
      ctx.fillText("DAN KELUARGA BERENCANA (DP3AP2KB) PROVINSI SUMATERA BARAT", sigX, sigY + 54);

      // Draw static/electronic signed indicator overlay
      // Standard visual placeholder for security
      ctx.strokeStyle = "rgba(13, 92, 58, 0.12)";
      ctx.lineWidth = 1;
      ctx.strokeRect(sigX - 110, sigY + 72, 220, 68);
      ctx.fillStyle = "rgba(16, 185, 129, 0.05)";
      ctx.fillRect(sigX - 110, sigY + 72, 220, 68);
      
      ctx.fillStyle = "#10b981";
      ctx.font = `bold italic 11px "Inter", sans-serif`;
      ctx.fillText("✓ TANDA TANGAN ELEKTRONIK", sigX, sigY + 100);
      ctx.fillStyle = "#64748b";
      ctx.font = `font-mono 9px "Courier New", monospace`;
      ctx.fillText("DP3AP2KB SUMBAR / CERTIFIED-SECURE", sigX, sigY + 122);

      // Dynamic name of the Authorized Penandatangan
      const authorizedName = (data.kabidName || "Haris, S.Kom, M.Si").toUpperCase();
      ctx.fillStyle = "#1e293b";
      ctx.font = `bold underline 20px "Times New Roman", "Playfair Display", "Georgia", "Inter", sans-serif`;
      ctx.fillText(authorizedName, sigX, sigY + 180);

      const authorizedNip = data.kabidNip || "19781215 200501 1 004";
      ctx.fillStyle = "#475569";
      ctx.font = `14px "Inter", "Courier New", monospace`;
      ctx.fillText(`NIP. ${authorizedNip}`, sigX, sigY + 204);

      // 8. RED SEAL IN THE BOTTOM LEFT CORNER
      const sealX = 350;
      const sealY = h - 180;

      // Draw concentric circular gold stars seal
      ctx.strokeStyle = "rgba(197, 168, 92, 0.65)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(sealX, sealY, 65, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = "rgba(13, 92, 58, 0.5)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(sealX, sealY, 58, 0, Math.PI * 2);
      ctx.stroke();

      // Filled center
      ctx.fillStyle = "rgba(197, 168, 92, 0.08)";
      ctx.beginPath();
      ctx.arc(sealX, sealY, 58, 0, Math.PI * 2);
      ctx.fill();

      // Seal text inside
      ctx.textAlign = "center";
      ctx.fillStyle = "#c5a85c";
      ctx.font = `bold 10px "Inter", sans-serif`;
      ctx.fillText("DP3AP2KB", sealX, sealY - 24);
      ctx.font = `bold font-mono 15px sans-serif`;
      ctx.fillText("★ SUMBAR ★", sealX, sealY + 2);
      ctx.font = `bold 10px "Inter", sans-serif`;
      ctx.fillText("PANITIA BIMTEK", sealX, sealY + 24);

      // Return Base64
      resolve(canvas.toDataURL("image/png"));
    } catch (err) {
      console.error("Gagal mendaur ulang sertifikat visual otomatis:", err);
      reject(err);
    }
  });
};
