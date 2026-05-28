import React, { useState, useEffect, useRef } from "react";
import {
  Compass,
  FileText,
  Smartphone,
  UserCheck,
  LayoutDashboard,
  ShieldCheck,
  AlertCircle,
  Sparkles,
  CheckCircle,
  HelpCircle,
  Info,
  Calendar,
  MapPin,
  PenTool,
  RefreshCw,
  LogOut,
  Users,
  CheckSquare,
  Award,
  Sliders,
  Database
} from "lucide-react";
import { Registration, Attendance, AppSettings, ActiveTab } from "./types";
import { dbService } from "./services/dbService";
import { KtpUploader } from "./components/KtpUploader";
import { ParticipantCard } from "./components/ParticipantCard";
import { AttendanceForm } from "./components/AttendanceForm";
import { AdminPanel } from "./components/AdminPanel";
import { motion, AnimatePresence } from "motion/react";
import { generateCertificateImage } from "./utils/certHelper";

export default function App() {
  // State variables backed by database service
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);

  // Scoped to active bimtek session
  const activeRegistrations = registrations.filter((r) => {
    if (!settings) return false;
    const currentActiveId = settings.originalEventId || settings.id || "default";
    if (r.bimtekId) {
      return r.bimtekId === currentActiveId;
    }
    // Map legacy / blank registrations to the original default event title so they do not leak into new events
    const itemTitle = r.bimtekTitle || "Bimbingan Teknis Digitalisasi Destinasi Wisata Sumatera Barat";
    return itemTitle.trim() === settings.eventTitle.trim();
  });

  const activeAttendance = attendance.filter((a) => {
    if (!settings) return false;
    const currentActiveId = settings.originalEventId || settings.id || "default";
    if (a.bimtekId) {
      return a.bimtekId === currentActiveId;
    }
    // Map legacy / blank attendance to the original default event title so they do not leak into new events
    const itemTitle = a.bimtekTitle || "Bimbingan Teknis Digitalisasi Destinasi Wisata Sumatera Barat";
    return itemTitle.trim() === settings.eventTitle.trim();
  });
  
  const [activeTab, setActiveTab] = useState<ActiveTab>("home");
  const [pendingTabChange, setPendingTabChange] = useState<ActiveTab | null>(null);
  const [isAdminAuthorized, setIsAdminAuthorized] = useState(false);
  const [activeAdminTab, setActiveAdminTab] = useState<"stats" | "registrants" | "attendance" | "settings" | "allowance" | "certificates">("stats");

  const handleTabChange = (tab: ActiveTab) => {
    if (activeTab === "admin" && tab !== "admin") {
      setPendingTabChange(tab);
    } else {
      setActiveTab(tab);
    }
  };

  const [recentRegistration, setRecentRegistration] = useState<Registration | null>(null);

  // States for verification QR code rendering modal
  const [registrationsLoaded, setRegistrationsLoaded] = useState(false);
  const [verifiedCertParticipant, setVerifiedCertParticipant] = useState<Registration | null>(null);
  const [verificationChecked, setVerificationChecked] = useState(false);
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [renderedCertImg, setRenderedCertImg] = useState<string | null>(null);
  const [isRenderingCertImg, setIsRenderingCertImg] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const verifyId = params.get("verifyCert");
    if (verifyId) {
      setVerificationId(verifyId);
      if (registrationsLoaded) {
        const match = registrations.find(r => r.id === verifyId || r.nik === verifyId);
        if (match) {
          setVerifiedCertParticipant(match);
        }
        setVerificationChecked(true);
      }
    }
  }, [registrations, registrationsLoaded]);

  useEffect(() => {
    if (verifiedCertParticipant && settings) {
      const renderCert = async () => {
        setIsRenderingCertImg(true);
        try {
          const sorted = [...registrations].sort((a, b) => new Date(a.registeredAt).getTime() - new Date(b.registeredAt).getTime());
          const idx = sorted.findIndex(r => r.id === verifiedCertParticipant.id);
          const numStr = idx !== -1 ? String(idx + 1).padStart(3, "0") : "001";
          const computedNo = `Nomor: 556/BIMTEK-DP3AP2KB/SDK/${numStr}/2026`;

          const url = await generateCertificateImage({
            participantName: verifiedCertParticipant.name,
            participantNik: verifiedCertParticipant.nik,
            kabKota: verifiedCertParticipant.kabKota,
            eventTitle: settings.eventTitle,
            eventLocation: settings.eventLocation,
            startDate: settings.startDate,
            durationDays: settings.durationDays,
            customTemplateBase64: verifiedCertParticipant.certificateBase64 || settings.certificateTemplateBase64 || undefined,
            participantId: verifiedCertParticipant.id,
            certificateNo: computedNo,
            certNoX: settings.certNoX,
            certNoY: settings.certNoY,
            certNoSize: settings.certNoSize,
            certNoColor: settings.certNoColor,
            certNameX: settings.certNameX,
            certNameY: settings.certNameY,
            certNameSize: settings.certNameSize,
            certNameColor: settings.certNameColor,
            certDateX: settings.certDateX,
            certDateY: settings.certDateY,
            certDateSize: settings.certDateSize,
            certDateColor: settings.certDateColor,
            certQrX: settings.certQrX,
            certQrY: settings.certQrY,
            certQrSize: settings.certQrSize,
            isCertQrEnabled: settings.isCertQrEnabled,
          });
          setRenderedCertImg(url);
        } catch (err) {
          console.error("Gagal merender gambar sertifikat untuk validasi:", err);
        } finally {
          setIsRenderingCertImg(false);
        }
      };
      renderCert();
    } else {
      setRenderedCertImg(null);
    }
  }, [verifiedCertParticipant, settings, registrations]);

  // Digital Card Search States
  const [cardSearchQuery, setCardSearchQuery] = useState("");
  const [searchedParticipant, setSearchedParticipant] = useState<Registration | null>(null);
  const [searchConducted, setSearchConducted] = useState(false);
  const [searchError, setSearchError] = useState("");

  const runCardSearch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSearchError("");
    const cleanQuery = cardSearchQuery.trim();
    if (!cleanQuery) return;
    
    const match = activeRegistrations.find((r) => {
      const matchNik = r.nik.replace(/\D/g, "") === cleanQuery.replace(/\D/g, "");
      const matchPhone = r.phone && r.phone.replace(/[^0-9]/g, "") === cleanQuery.replace(/[^0-9]/g, "");
      const matchRawNik = r.nik.toLowerCase().trim() === cleanQuery.toLowerCase().trim();
      const matchRawPhone = r.phone && r.phone.toLowerCase().trim() === cleanQuery.toLowerCase().trim();
      return matchNik || matchPhone || matchRawNik || matchRawPhone;
    });
    
    if (match) {
      setSearchedParticipant(match);
      setSearchConducted(true);
    } else {
      setSearchedParticipant(null);
      setSearchConducted(true);
      setSearchError("Data peserta tidak ditemukan. Pastikan NIK atau No. HP/WhatsApp Anda sudah terdaftar dengan benar.");
    }
  };

  // Manual Input & Background OCR States (Form is ALWAYS visible)
  const [formNik, setFormNik] = useState("");
  const [formName, setFormName] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formAddress, setFormAddress] = useState("");
  const [formKabKota, setFormKabKota] = useState("");
  const [formColor, setFormColor] = useState("#0F6251"); // Default Emerald/Teal
  const [formKtp, setFormKtp] = useState("");
  const [formGender, setFormGender] = useState("Laki-laki");
  const [isSelfieMode, setIsSelfieMode] = useState(false);

  // Signature states and refs for registration form
  const regCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isRegDrawing, setIsRegDrawing] = useState(false);
  const [hasRegDrawn, setHasRegDrawn] = useState(false);

  const startRegDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = regCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    e.preventDefault();
    setIsRegDrawing(true);

    const pos = getRegEventCoords(e, canvas);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  };

  const drawReg = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isRegDrawing) return;
    const canvas = regCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    e.preventDefault();
    const pos = getRegEventCoords(e, canvas);

    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = "#059669"; // Emerald Signature Line
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    setHasRegDrawn(true);
  };

  const stopRegDrawing = () => {
    setIsRegDrawing(false);
  };

  const getRegEventCoords = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>,
    canvas: HTMLCanvasElement
  ) => {
    const rect = canvas.getBoundingClientRect();
    const clientX = "touches" in e 
      ? (e.touches[0]?.clientX ?? 0)
      : e.clientX;
    const clientY = "touches" in e 
      ? (e.touches[0]?.clientY ?? 0)
      : e.clientY;
      
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    
    return {
      x: (x * canvas.width) / rect.width,
      y: (y * canvas.height) / rect.height,
    };
  };

  const clearRegCanvas = () => {
    const canvas = regCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasRegDrawn(false);
  };

  const handleResetForm = () => {
    setFormNik("");
    setFormName("");
    setFormPhone("");
    setFormAddress("");
    setFormKabKota("");
    setFormColor("#0F6251");
    setFormKtp("");
    setIsSelfieMode(false);
    clearRegCanvas();
    setGlobalError("");
    setGlobalSuccess("");
  };

  const [globalError, setGlobalError] = useState("");
  const [globalSuccess, setGlobalSuccess] = useState("");

  // Real-time live synchronization listeners backed by Firebase onSnapshot
  useEffect(() => {
    const unsubscribeSettings = dbService.subscribeSettings((updatedSettings) => {
      setSettings(updatedSettings);
    });

    const unsubscribeRegistrations = dbService.subscribeRegistrations((updatedRegs) => {
      setRegistrations(updatedRegs);
      setRegistrationsLoaded(true);
    });

    const unsubscribeAttendance = dbService.subscribeAttendance((updatedAtts) => {
      setAttendance(updatedAtts);
    });

    return () => {
      unsubscribeSettings();
      unsubscribeRegistrations();
      unsubscribeAttendance();
    };
  }, []);

  // Redundant data synchronizer (now handled fully in real-time)
  const reloadData = async () => {};

  const handleKtpScanned = (data: {
    nik: string;
    name: string;
    address: string;
    kabKota: string;
    color: string;
    ktpBase64: string;
    isSelfie?: boolean;
    gender?: string;
  }) => {
    if (data.isSelfie) {
      setIsSelfieMode(true);
      setFormKtp(data.ktpBase64);
      setFormNik(""); // Clear NIK for selfie/profile registration
      setGlobalError("");
      setGlobalSuccess("Foto Selfie berhasil disimpan! Silakan lengkapi data diri Anda pada formulir di samping secara manual.");
    } else {
      setIsSelfieMode(false);
      setFormNik(data.nik);
      setFormName(data.name);
      setFormAddress(data.address);
      setFormKabKota(data.kabKota);
      setFormColor(data.color);
      setFormKtp(data.ktpBase64);
      if (data.gender) {
        setFormGender(data.gender);
      }
      setGlobalError("");
      setGlobalSuccess("Data KTP berhasil diekstraksi ke formulir secara otomatis!");
    }
    setTimeout(() => {
      setGlobalSuccess("");
    }, 5000);
  };

  const handleManualRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const needsNik = !isSelfieMode;
    if ((needsNik && !formNik) || !formName || !formPhone) {
      if (needsNik) {
        setGlobalError("Harap lengkapi NIK, Nama Lengkap, dan No. HP / WhatsApp.");
      } else {
        setGlobalError("Harap lengkapi Nama Lengkap dan No. HP / WhatsApp.");
      }
      return;
    }

    if (!hasRegDrawn) {
      setGlobalError("Harap berikan tanda tangan digital Anda terlebih dahulu.");
      return;
    }

    const normalizedNikInput = formNik.trim().replace(/\D/g, "");
    const normalizedPhoneInput = formPhone.trim().replace(/\D/g, "");

    // Normalization helper for Indonesian telephone formats
    const normalizePhoneForComparison = (p: string) => {
      const digits = p.replace(/\D/g, "");
      if (digits.startsWith("62")) {
        return "0" + digits.substring(2);
      }
      return digits;
    };

    const cleanPhoneInput = normalizePhoneForComparison(normalizedPhoneInput);

    // 1. Check duplicate NIK (only if NIK is provided)
    if (normalizedNikInput !== "") {
      const isNikDuplicate = activeRegistrations.some((reg) => {
        const existingNik = reg.nik.trim().replace(/\D/g, "");
        return existingNik === normalizedNikInput;
      });

      if (isNikDuplicate) {
        setGlobalError(`Gagal Mendaftar: NIK ${formNik.trim()} sudah terdaftar sebelumnya pada kegiatan Bimtek ini.`);
        return;
      }
    }

    // 2. Check duplicate Phone / WhatsApp (except for empty inputs)
    if (cleanPhoneInput !== "") {
      const isPhoneDuplicate = activeRegistrations.some((reg) => {
        const existingPhone = normalizePhoneForComparison(reg.phone || "");
        return existingPhone === cleanPhoneInput;
      });

      if (isPhoneDuplicate) {
        setGlobalError(`Gagal Mendaftar: Nomor HP / WhatsApp ${formPhone.trim()} sudah terdaftar sebelumnya pada kegiatan Bimtek ini.`);
        return;
      }
    }

    try {
      const dbKabKota = formKabKota.trim() || "Kota Padang"; 
      const dbAddress = formAddress.trim() || "Sumatera Barat";

      let signatureBase64: string | undefined = undefined;
      if (hasRegDrawn && regCanvasRef.current) {
        signatureBase64 = regCanvasRef.current.toDataURL("image/png");
      }

      const activeEventId = settings?.originalEventId || settings?.id || "default";
      const activeEventTitle = settings?.eventTitle || "default";

      const newReg: Registration = {
        id: `reg_${Date.now()}`,
        nik: formNik.trim(),
        name: formName.trim().toUpperCase(),
        phone: formPhone.trim(),
        address: dbAddress,
        kabKota: dbKabKota,
        color: formColor.trim() || "#0F6251", 
        ktpBase64: formKtp,
        registeredAt: new Date().toISOString(),
        signatureBase64,
        bimtekTitle: activeEventTitle,
        bimtekId: activeEventId,
        gender: formGender,
      };

      await dbService.addRegistration(newReg);

      // Automatically add attendance for Day 1
      const firstDayAttendance: Attendance = {
        id: `att_day1_${Date.now()}`,
        nik: formNik.trim(),
        name: formName.trim().toUpperCase(),
        day: 1,
        signatureBase64: signatureBase64 || "",
        attendedAt: new Date().toISOString(),
        bimtekTitle: activeEventTitle,
        bimtekId: activeEventId,
      };
      await dbService.addAttendance(firstDayAttendance);

      setRecentRegistration(newReg);
      setSearchedParticipant(newReg);
      setCardSearchQuery(newReg.nik ? newReg.nik : newReg.phone);
      setSearchConducted(true);
      
      // Update state listings
      await reloadData();
      
      // Clear manual fields
      setFormNik("");
      setFormName("");
      setFormPhone("");
      setFormAddress("");
      setFormKabKota("");
      setFormColor("#0F6251");
      setFormKtp("");
      setFormGender("Laki-laki");
      setIsSelfieMode(false);
      clearRegCanvas();
      
      setGlobalSuccess("Pendaftaran sukses! Kartu Peserta Anda berhasil dibuat.");
      
      // Navigate to the newly created participant digital card
      setActiveTab("card");

      setTimeout(() => {
        setGlobalSuccess("");
      }, 5000);
    } catch (err: any) {
      console.error("Failure submitting registration:", err);
      let errMsg = err.message || "";
      if (typeof errMsg === "string" && errMsg.includes('{"error":')) {
        try {
          const parsed = JSON.parse(errMsg);
          errMsg = parsed.error || errMsg;
        } catch (_) {}
      }
      setGlobalError(`Gagal menyelesaikan pendaftaran: ${errMsg || "Periksa koneksi Firestore Anda."}`);
    }
  };

  const handleAttendanceSubmit = async (record: Attendance) => {
    const activeEventId = settings?.originalEventId || settings?.id || "default";
    const updatedRecord: Attendance = {
      ...record,
      bimtekTitle: settings?.eventTitle || "default",
      bimtekId: activeEventId,
    };
    await dbService.addAttendance(updatedRecord);
    await reloadData();
  };

  const handleSaveSettings = async (updatedSettings: AppSettings) => {
    // Determine if the event title is being renamed
    const oldTitle = settings?.eventTitle;
    const newTitle = updatedSettings.eventTitle;
    const isRename = oldTitle && oldTitle.trim() !== newTitle.trim();

    // 1. Update active settings (stored centrally as "default")
    await dbService.saveSettings(updatedSettings);

    // 2. Also update the corresponding Bimtek standalone event in the list
    const origId = updatedSettings.originalEventId;
    if (origId && origId !== "default") {
      const originalBimtek: AppSettings = {
        ...updatedSettings,
        id: origId, // Restore its original event ID
      };
      await dbService.addBimtekEvent(originalBimtek);
    } else {
      // If it is indeed default/unset, also update the default/unset entry in events list
      const originalBimtek: AppSettings = {
        ...updatedSettings,
        id: "default",
      };
      await dbService.addBimtekEvent(originalBimtek);
    }

    // 3. Migrate registered participants and attendance records if event title changes!
    if (isRename) {
      try {
        const currentActiveId = settings?.originalEventId || settings?.id || "default";
        // Migrate registrations
        const regsToMigrate = registrations.filter((r) => {
          if (r.bimtekId) {
            return r.bimtekId === currentActiveId;
          }
          const itemTitle = r.bimtekTitle || "Bimbingan Teknis Digitalisasi Destinasi Wisata Sumatera Barat";
          return itemTitle.trim() === oldTitle.trim();
        });
        
        for (const r of regsToMigrate) {
          await dbService.addRegistration({
            ...r,
            bimtekTitle: newTitle,
            bimtekId: currentActiveId,
          });
        }

        // Migrate attendance records
        const attsToMigrate = attendance.filter((a) => {
          if (a.bimtekId) {
            return a.bimtekId === currentActiveId;
          }
          const itemTitle = a.bimtekTitle || "Bimbingan Teknis Digitalisasi Destinasi Wisata Sumatera Barat";
          return itemTitle.trim() === oldTitle.trim();
        });

        for (const a of attsToMigrate) {
          await dbService.addAttendance({
            ...a,
            bimtekTitle: newTitle,
            bimtekId: currentActiveId,
          });
        }
      } catch (err) {
        console.error("Gagal bermigrasi nama event bimtek untuk pendaftar & absensi:", err);
      }
    }

    setSettings(updatedSettings);
    setGlobalSuccess("Konfigurasi Acara Berhasil Diperbarui!");
    setTimeout(() => {
      setGlobalSuccess("");
    }, 3000);
  };

  const handleDeleteRegistration = async (id: string) => {
    await dbService.deleteRegistration(id);
    if (recentRegistration && recentRegistration.id === id) {
      setRecentRegistration(null);
    }
    if (searchedParticipant && searchedParticipant.id === id) {
      setSearchedParticipant(null);
      setCardSearchQuery("");
      setSearchConducted(false);
    }
    await reloadData();
  };

  const handleDeleteAttendance = async (id: string) => {
    await dbService.deleteAttendance(id);
    await reloadData();
  };

  const handleResetAllData = async () => {
    await dbService.clearAllData();
    setRecentRegistration(null);
    setSearchedParticipant(null);
    setCardSearchQuery("");
    setSearchConducted(false);
    await reloadData();
  };

  if (!settings) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-12 h-12 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-semibold text-emerald-800 animate-pulse font-mono">
            Menginisiasi Panel DP3AP2KB Prov. Sumbar...
          </p>
        </div>
      </div>
    );
  }

  const getEventDateString = () => {
    if (!settings.startDate) return "";
    const start = new Date(settings.startDate);
    const formattedStart = start.toLocaleDateString("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric"
    });

    if (settings.durationDays && settings.durationDays > 1) {
      const end = new Date(start);
      end.setDate(start.getDate() + (settings.durationDays - 1));
      const formattedEnd = end.toLocaleDateString("id-ID", {
        day: "numeric",
        month: "long",
        year: "numeric"
      });
      return `${formattedStart} - ${formattedEnd} (${settings.durationDays} Hari)`;
    }
    return formattedStart;
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans selection:bg-emerald-500 selection:text-white pb-20 relative">
      {/* HEADER BAR FOR SUMATRA BARAT TOURISM MINISTRY */}
      <header className="bg-gradient-to-r from-emerald-800 via-emerald-900 to-teal-950 py-7 px-4 sm:px-8 text-white relative shadow-md">
        {/* Abstract design elements */}
        <div className="absolute right-0 top-0 bottom-0 overflow-hidden opacity-10 pointer-events-none w-1/2">
          <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
            <polygon points="100,0 80,0 100,100" fill="white" />
            <polygon points="100,0 70,0 90,100" fill="white" />
          </svg>
        </div>

        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div className="flex items-center space-x-3.5 cursor-pointer group" onClick={() => handleTabChange("home")} title="Klik untuk kembali ke Halaman Awal">
            <div className="p-2.5 bg-white/10 rounded-2xl border border-white/10 group-hover:bg-white/20 transition-all duration-300">
              <Compass className="w-7 h-7 text-yellow-300" />
            </div>
            <div>
              <span className="text-[10px] sm:text-xs uppercase font-extrabold tracking-widest text-emerald-300">
                Sistem Pendaftaran & Absensi Mandiri Digital
              </span>
              <h1 className="text-lg sm:text-xl font-black tracking-tight text-white leading-tight mt-1 uppercase max-w-2xl group-hover:text-yellow-100 transition-all duration-300">
                {settings.eventTitle}
              </h1>
              
              {/* Event Location and Schedule badges */}
              <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2.5 text-xs text-emerald-100/90 font-semibold tracking-wide">
                {settings.startDate && (
                  <div className="flex items-center space-x-1.5 bg-white/10 backdrop-blur-sm px-2.5 py-1 rounded-lg border border-white/5">
                    <Calendar className="w-3.5 h-3.5 text-yellow-300 shrink-0" />
                    <span>{getEventDateString()}</span>
                  </div>
                )}
                {settings.eventLocation && (
                  <div className="flex items-center space-x-1.5 bg-white/10 backdrop-blur-sm px-2.5 py-1 rounded-lg border border-white/5">
                    <MapPin className="w-3.5 h-3.5 text-red-300 shrink-0 animate-bounce-slow" />
                    <span className="break-all">{settings.eventLocation}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* CORE GRID LAYOUT */}
      <main className="max-w-7xl mx-auto px-4 sm:px-8 mt-8">
        {/* Top Information Success/Error banners */}
        <AnimatePresence>
          {globalError && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-2xl flex items-start space-x-3 text-sm mb-6 overflow-hidden"
            >
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-extrabold">Ada hambatan dalam proses:</p>
                <p className="text-xs mt-0.5 text-red-700">{globalError}</p>
              </div>
            </motion.div>
          )}

          {globalSuccess && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-2xl flex items-start space-x-3 text-sm mb-6 overflow-hidden"
            >
              <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Aktivitas Berhasil:</p>
                <p className="text-xs mt-0.5 text-emerald-700">{globalSuccess}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* SECTION 1: TAB NAVIGATION & CONTENT GRID */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* NAVIGATION BAR - FIXED COLUMN ON WIDE SCREEN */}
          {activeTab !== "home" && (
            <div className="lg:col-span-3 space-y-4">
              <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm space-y-1.5">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest pl-3 block mb-2">
                  Navigasi Menu
                </span>

                <button
                  onClick={() => handleTabChange("home")}
                  className="w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-xs sm:text-sm font-bold text-slate-600 hover:bg-slate-50 hover:text-emerald-700 transition-all font-semibold border border-transparent hover:border-slate-100"
                >
                  <Compass className="w-4 h-4 text-emerald-600" />
                  <span>Halaman Utama (Beranda)</span>
                </button>

                <div className="h-px bg-slate-100 my-1 bg-slate-100/70" />
                
                <button
                  onClick={() => handleTabChange("register")}
                  className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                    activeTab === "register"
                      ? "bg-emerald-600 text-white shadow-xl shadow-emerald-600/10"
                      : "text-gray-700 hover:bg-slate-50 hover:text-emerald-700"
                  }`}
                >
                  <FileText className="w-4 h-4" />
                  <span>Pendaftaran Peserta</span>
                </button>

                <button
                  onClick={() => handleTabChange("card")}
                  className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                    activeTab === "card"
                      ? "bg-emerald-600 text-white shadow-xl shadow-emerald-600/10"
                      : "text-gray-700 hover:bg-slate-50 hover:text-emerald-700"
                  }`}
                >
                  <Smartphone className="w-4 h-4" />
                  <span>Kartu Peserta & Sertifikat</span>
                  {recentRegistration && (
                    <span className="w-2 h-2 bg-yellow-400 rounded-full animate-ping ml-auto" />
                  )}
                </button>

                {/* DYNAMIC ATTENDANCE MENU CHECKPOINT */}
                {settings.durationDays > 1 && (
                  <button
                    onClick={() => handleTabChange("absent")}
                    className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                      activeTab === "absent"
                        ? "bg-emerald-600 text-white shadow-xl shadow-emerald-600/10"
                        : "text-gray-700 hover:bg-slate-50 hover:text-emerald-700"
                    }`}
                  >
                    <UserCheck className="w-4 h-4" />
                    <span>Absen Harian</span>
                  </button>
                )}
              </div>

              {/* NEW PANEL FOR ADMIN MENU - DISPLAYED ONLY WHEN ON ADMIN TAB & AUTHORIZED */}
              {activeTab === "admin" && isAdminAuthorized && (
                <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm space-y-1.5 animate-fade-in">
                  <span className="text-[10px] font-extrabold text-gray-400 p-3 py-0 block uppercase tracking-widest pl-3 mb-2">
                    Menu Panel Admin
                  </span>

                  {[
                    { id: "stats", label: "Statistik & Grafik", icon: Users },
                    { id: "registrants", label: "Tabel Pendaftar", icon: Compass },
                    { id: "attendance", label: "Tabel Kehadiran (Absensi)", icon: CheckSquare },
                    { id: "allowance", label: "Penerimaan Uang Saku", icon: Award },
                    { id: "certificates", label: "Cetak & Kirim Sertifikat", icon: CheckCircle },
                    { id: "settings", label: "Pengaturan Bimtek", icon: Sliders },
                  ].map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeAdminTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => setActiveAdminTab(tab.id as any)}
                        className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-xs sm:text-sm font-bold transition-all text-left ${
                          isActive
                            ? "bg-slate-900 text-emerald-400 font-extrabold shadow-md"
                            : "text-slate-600 hover:bg-slate-50 hover:text-emerald-700"
                        }`}
                      >
                        <Icon className={`w-4 h-4 ${isActive ? "text-emerald-450" : "text-slate-400"}`} />
                        <span className="truncate">{tab.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB CONTENTS RENDER BLOCK (GRID CONTAINER) */}
          <div className={activeTab === "home" ? "col-span-12" : "lg:col-span-9"}>
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, x: 15 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -15 }}
                transition={{ duration: 0.15 }}
              >
                {/* TAB: HOME / LANDING PAGE */}
                {activeTab === "home" && (
                  <div className="space-y-10 py-4 max-w-6xl mx-auto">
                    {/* Welcome Text block */}
                    <div className="text-center space-y-3 max-w-2xl mx-auto">
                      <div className="inline-flex items-center space-x-2 bg-emerald-100/80 px-3.5 py-1.5 rounded-full border border-emerald-200">
                        <Sparkles className="w-4 h-4 text-emerald-700 animate-pulse" />
                        <span className="text-[11px] sm:text-xs font-black text-emerald-800 uppercase tracking-widest">Aplikasi Mandiri Digital</span>
                      </div>
                      <h2 className="text-2xl sm:text-4xl font-extrabold text-slate-900 tracking-tight leading-tight">
                        Layanan Mandiri Peserta
                      </h2>
                      <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
                        Silakan pilih panel menu di bawah ini untuk memulai registrasi, mengakses kartu pengenal digital Anda, atau mengisi lembar kehadiran harian kegiatan.
                      </p>
                    </div>

                    {/* Massive functional card grid */}
                    <div className={`grid grid-cols-1 ${settings.durationDays > 1 ? "md:grid-cols-3" : "md:grid-cols-2"} gap-6 max-w-5xl mx-auto`}>
                      {/* Card 1: Pendaftaran */}
                      <div 
                        onClick={() => handleTabChange("register")}
                        className="bg-white border-2 border-slate-100 hover:border-emerald-500 rounded-3xl p-6 sm:p-8 cursor-pointer shadow-sm hover:shadow-2xl hover:-translate-y-1.5 transition-all duration-300 flex flex-col justify-between group text-center"
                      >
                        <div className="space-y-4">
                          <div className="w-14 h-14 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto text-emerald-600 group-hover:scale-110 transition-transform duration-300">
                            <FileText className="w-7 h-7" />
                          </div>
                          <div className="space-y-1.5">
                            <h3 className="text-base sm:text-lg font-black text-slate-900 group-hover:text-emerald-700 transition-colors">
                              Pendaftaran Peserta
                            </h3>
                            <p className="text-xs text-slate-500 leading-relaxed">
                              Pindai KTP Anda secara instan dengan teknologi scan AI pintar atau isikan data diri lengkap untuk menerbitkan kartu identitas Anda.
                            </p>
                          </div>
                        </div>
                        <div className="mt-8">
                          <span className="inline-block px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-2xl group-hover:shadow-lg shadow-emerald-600/10 transition-all">
                            Mulai Mendaftar &rsaquo;
                          </span>
                        </div>
                      </div>

                      {/* Card 2: Kartu Digital */}
                      <div 
                        onClick={() => handleTabChange("card")}
                        className="bg-white border-2 border-slate-100 hover:border-indigo-500 rounded-3xl p-6 sm:p-8 cursor-pointer shadow-sm hover:shadow-2xl hover:-translate-y-1.5 transition-all duration-300 flex flex-col justify-between group text-center"
                      >
                        <div className="space-y-4">
                          <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto text-indigo-600 group-hover:scale-110 transition-transform duration-300">
                            <Smartphone className="w-7 h-7" />
                          </div>
                          <div className="space-y-1.5">
                            <h3 className="text-base sm:text-lg font-black text-slate-900 group-hover:text-indigo-700 transition-colors">
                              Kartu Peserta dan Sertifikat
                            </h3>
                            <p className="text-xs text-slate-500 leading-relaxed">
                              Silakan Cari / Ambil Sertifikat Anda di sini! Cari menggunakan NIK atau No. WhatsApp Anda. Unduh kartu pengenal fisik atau dapatkan berkas Sertifikat Bimtek resmi jika sudah dirilis Admin.
                            </p>
                          </div>
                        </div>
                        <div className="mt-8">
                          <span className="inline-block px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-2xl group-hover:shadow-lg shadow-indigo-600/10 transition-all">
                            Silakan Cari / Ambil Sertifikat &rsaquo;
                          </span>
                        </div>
                      </div>

                      {/* Card 3 (Conditional): Absensi */}
                      {settings.durationDays > 1 && (
                        <div 
                          onClick={() => handleTabChange("absent")}
                          className="bg-white border-2 border-slate-100 hover:border-amber-500 rounded-3xl p-6 sm:p-8 cursor-pointer shadow-sm hover:shadow-2xl hover:-translate-y-1.5 transition-all duration-300 flex flex-col justify-between group text-center"
                        >
                          <div className="space-y-4">
                            <div className="w-14 h-14 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto text-amber-600 group-hover:scale-110 transition-transform duration-300">
                              <UserCheck className="w-7 h-7" />
                            </div>
                            <div className="space-y-1.5">
                              <h3 className="text-base sm:text-lg font-black text-slate-900 group-hover:text-amber-700 transition-colors">
                                Absen Harian
                              </h3>
                              <p className="text-xs text-slate-500 leading-relaxed">
                                Catat daftar kehadiran wajib harian Anda selama rangkaian acara Bimtek berlangsung secara mandiri menggunakan paraf digital.
                              </p>
                            </div>
                          </div>
                          <div className="mt-8">
                            <span className="inline-block px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-2xl group-hover:shadow-lg shadow-amber-500/10 transition-all">
                              Mulai Absen Masuk &rsaquo;
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Informasi total peserta terdaftar yang ada pada halaman awal pindahkan ke bagian paling bawah */}
                    <div className="pt-6 sm:pt-10 flex flex-col items-center justify-center space-y-2.5 border-t border-slate-200/60 max-w-md mx-auto">
                      <div className="flex items-center space-x-2.5 bg-emerald-50 border border-emerald-100/80 px-4 py-2.5 rounded-2xl">
                        <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-[11px] sm:text-xs font-bold text-emerald-800 uppercase tracking-widest leading-relaxed text-center">
                          Saat ini Terdaftar: <span className="text-sm font-black text-emerald-950">{activeRegistrations.length} Orang Peserta</span> dari <span className="text-sm font-black text-emerald-950">{settings?.targetParticipants !== undefined ? settings.targetParticipants : 50} orang peserta</span>
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB: REGISTER FORM */}
                {activeTab === "register" && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                      
                      {/* Left Block: Image OCR Area */}
                      <div className="space-y-6">
                        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-4">
                          <div>
                            <h2 className="text-base sm:text-lg font-extrabold text-gray-900">Identitas Visual</h2>
                            <p className="text-xs text-slate-500">Scan KTP secara otomatis atau gunakan Foto Selfie jika tidak membawa KTP</p>
                          </div>
                          
                          <KtpUploader
                            onScanComplete={handleKtpScanned}
                            onError={(msg) => setGlobalError(msg)}
                          />
                        </div>
                      </div>

                      {/* Right Block: Direct Registration Form View */}
                      <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                        <div className="mb-6">
                          <h2 className="text-base sm:text-lg font-extrabold text-gray-900">Formulir Pendaftaran</h2>
                        </div>

                        <form onSubmit={handleManualRegisterSubmit} className="space-y-4">
                          {/* NIK Input */}
                          {!isSelfieMode && (
                            <div className="space-y-1">
                              <label className="text-xs font-bold text-gray-700 uppercase flex items-center justify-between">
                                <span>NIK (Wajib)</span>
                              </label>
                              <input
                                type="text"
                                maxLength={16}
                                value={formNik}
                                onChange={(e) => setFormNik(e.target.value.replace(/\D/g, ""))}
                                placeholder="Masukkan 16 digit nomor NIK..."
                                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-slate-900 focus:outline-none focus:border-emerald-500 font-mono tracking-wider text-sm"
                                required={!isSelfieMode}
                              />
                            </div>
                          )}

                          {/* Name Input */}
                          <div className="space-y-1">
                            <label className="text-xs font-bold text-gray-700 uppercase">Nama Lengkap</label>
                            <input
                              type="text"
                              value={formName}
                              onChange={(e) => setFormName(e.target.value)}
                              placeholder="Ketik nama lengkap sesuai KTP..."
                              className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-slate-900 focus:outline-none focus:border-emerald-500 text-sm font-semibold"
                              required
                            />
                          </div>

                          {/* Phone / Whatsapp Input */}
                          <div className="space-y-1">
                            <label className="text-xs font-bold text-gray-700 uppercase">No. HP / WhatsApp</label>
                            <input
                              type="tel"
                              value={formPhone}
                              onChange={(e) => setFormPhone(e.target.value.replace(/[^0-9+]/g, ""))}
                              placeholder="Contoh: 081234567890..."
                              className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-slate-900 focus:outline-none focus:border-emerald-500 text-sm font-semibold"
                              required
                            />
                          </div>

                          {/* Jenis Kelamin Input */}
                          <div className="space-y-1.5 bg-slate-50/50 p-2.5 rounded-lg border border-gray-100">
                            <label className="text-xs font-bold text-gray-700 uppercase tracking-wide block">Jenis Kelamin</label>
                            <div className="flex items-center space-x-6 pt-1">
                              <label className="flex items-center space-x-2 text-sm text-slate-800 font-bold cursor-pointer select-none">
                                <input
                                  type="radio"
                                  name="gender"
                                  value="Laki-laki"
                                  checked={formGender === "Laki-laki"}
                                  onChange={(e) => setFormGender(e.target.value)}
                                  className="w-4.5 h-4.5 text-emerald-600 focus:ring-emerald-505 border-gray-300 bg-white"
                                />
                                <span>Laki-Laki</span>
                              </label>
                              <label className="flex items-center space-x-2 text-sm text-slate-800 font-bold cursor-pointer select-none">
                                <input
                                  type="radio"
                                  name="gender"
                                  value="Perempuan"
                                  checked={formGender === "Perempuan"}
                                  onChange={(e) => setFormGender(e.target.value)}
                                  className="w-4.5 h-4.5 text-emerald-600 focus:ring-emerald-505 border-gray-300 bg-white"
                                />
                                <span>Perempuan</span>
                              </label>
                            </div>
                          </div>

                          {/* Kabupaten/Kota/Instansi Input */}
                          <div className="space-y-1">
                            <label className="text-xs font-bold text-gray-700 uppercase flex items-center justify-between">
                              <span>Kabupaten/Kota/Instansi</span>
                              <span className="text-[10px] text-gray-400 font-normal normal-case">Prefill otomatis via KTP</span>
                            </label>
                            <input
                              type="text"
                              value={formKabKota}
                              onChange={(e) => setFormKabKota(e.target.value)}
                              placeholder="Contoh: Kota Padang, DP3AP2KB Sumbar..."
                              className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-slate-900 focus:outline-none focus:border-emerald-500 text-sm font-semibold"
                            />
                          </div>

                          {/* Alamat Lengkap Input */}
                          <div className="space-y-1">
                            <label className="text-xs font-bold text-gray-700 uppercase">Alamat Lengkap (Asal)</label>
                            <textarea
                              value={formAddress}
                              onChange={(e) => setFormAddress(e.target.value)}
                              placeholder="Contoh: Jl. Diponegoro No. 25, Kel. Belakang Tangsi..."
                              rows={2}
                              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-slate-900 focus:outline-none focus:border-emerald-500 text-sm font-semibold resize-none"
                            />
                          </div>

                          {/* Signature Pad */}
                          <div className="space-y-2 pt-1">
                            <label className="text-xs font-bold text-gray-700 uppercase flex items-center space-x-1.5">
                              <PenTool className="w-4 h-4 text-emerald-600 animate-pulse" />
                              <span>Tanda Tangan Peserta (Digital)</span>
                            </label>

                            <div className="border border-gray-200 rounded-2xl overflow-hidden bg-slate-50/60 shadow-inner relative transition-colors focus-within:border-emerald-500">
                              <canvas
                                ref={regCanvasRef}
                                width={500}
                                height={220}
                                onMouseDown={startRegDrawing}
                                onMouseMove={drawReg}
                                onMouseUp={stopRegDrawing}
                                onMouseLeave={stopRegDrawing}
                                onTouchStart={startRegDrawing}
                                onTouchMove={drawReg}
                                onTouchEnd={stopRegDrawing}
                                className="w-full bg-white block h-[180px] sm:h-[220px] cursor-crosshair touch-none duration-300 border-b border-slate-100"
                              />
                              {!hasRegDrawn && (
                                <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center text-gray-400 space-y-2">
                                  <PenTool className="w-6 h-6 animate-pulse text-emerald-500" />
                                  <p className="text-xs font-bold text-slate-400">Silakan gambar/paraf tanda tangan Anda di sini</p>
                                  <p className="text-[10px] text-slate-400/80">Gunakan jari di smartphone atau mouse di laptop/PC</p>
                                </div>
                              )}
                            </div>

                            {/* Action Buttons: Clear Signature and Reset Form */}
                            <div className="flex items-center gap-3 pt-1">
                              <button
                                type="button"
                                onClick={clearRegCanvas}
                                className="flex-1 py-2 px-3 border border-red-200 text-red-650 hover:bg-red-50 active:scale-[0.98] transition-all rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5"
                                title="Hapus coretan tanda tangan saat ini"
                              >
                                <RefreshCw className="w-3.5 h-3.5" />
                                <span>Hapus Tanda Tangan</span>
                              </button>
                              <button
                                type="button"
                                onClick={handleResetForm}
                                className="flex-1 py-1.5 px-3 border border-slate-200 text-slate-650 hover:bg-slate-50 active:scale-[0.98] transition-all rounded-xl text-xs font-semibold flex items-center justify-center space-x-1.5"
                                title="Hapus seluruh input formulir pendaftaran dan tanda tangan"
                              >
                                <RefreshCw className="w-3.5 h-3.5 rotate-180 text-slate-500" />
                                <span>Atur Ulang Form</span>
                              </button>
                            </div>
                          </div>

                          <button
                            type="submit"
                            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-6 rounded-xl shadow-lg shadow-emerald-600/10 active:scale-95 transition-all text-sm mt-4"
                          >
                            Simpan & Terbitkan Kartu Peserta
                          </button>
                        </form>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB: CARD VIEW */}
                {activeTab === "card" && (
                  <div className="w-full space-y-6">
                    {/* Search Panel Card */}
                    <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm space-y-4">
                      <div>
                        <h2 className="text-base sm:text-lg font-black text-slate-900">Silakan Cari / Ambil Sertifikat & Kartu Peserta</h2>
                        <p className="text-xs text-slate-500">
                          Masukkan 16 digit nomor NIK (KTP) atau nomor handphone/WhatsApp Anda yang sudah didaftarkan untuk menampilkan kartu peserta dan mengunduh Sertifikat Resmi kegiatan Anda.
                        </p>
                      </div>
 
                      <form onSubmit={runCardSearch} className="flex flex-col sm:flex-row gap-3">
                        <div className="flex-1 relative">
                          <input
                            type="text"
                            value={cardSearchQuery}
                            onChange={(e) => setCardSearchQuery(e.target.value)}
                            placeholder="Ketik NIK KTP atau No. Telp/WhatsApp..."
                            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/15 focus:border-indigo-500 text-xs sm:text-sm font-semibold shadow-inner"
                          />
                        </div>
                        <button
                          type="submit"
                          className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-505 active:scale-95 text-white text-xs sm:text-sm font-bold rounded-xl transition-all shadow-md flex items-center justify-center space-x-1.5 shrink-0"
                        >
                          <Smartphone className="w-4 h-4" />
                          <span>Cari Kartu & Sertifikat</span>
                        </button>
                      </form>

                      {searchError && (
                        <p className="text-xs text-red-650 font-semibold bg-red-50 border border-red-100/70 p-3 rounded-xl animate-fade-in flex items-center space-x-1.5">
                          <span>⚠️ {searchError}</span>
                        </p>
                      )}
                    </div>

                    {/* Digital Card Render View */}
                    {searchedParticipant ? (
                      <div className="bg-white rounded-2xl border border-slate-100 p-6 sm:p-8 shadow-sm animate-fade-in">
                        <div className="text-center mb-6 space-y-1.5">
                          <h2 className="text-lg sm:text-xl font-extrabold text-slate-900">Kartu Peserta dan Sertifikat</h2>
                          <p className="text-xs sm:text-sm text-slate-500">
                            Berikut adalah kartu identitas resmi dan opsi unduh sertifikat bimtek Anda. Simpan gambar kartu atau unduh berkas sertifikat di bawah ini.
                          </p>
                        </div>
                        {(() => {
                          const sorted = [...registrations].sort((a, b) => new Date(a.registeredAt).getTime() - new Date(b.registeredAt).getTime());
                          const idx = sorted.findIndex(r => r.id === searchedParticipant.id);
                          const numStr = idx !== -1 ? String(idx + 1).padStart(3, "0") : "001";
                          const computedNo = `Nomor: 556/BIMTEK-DP3AP2KB/SDK/${numStr}/2026`;
                          return (
                            <ParticipantCard
                              registration={searchedParticipant}
                              eventTitle={settings.eventTitle}
                              eventLocation={settings.eventLocation}
                              cardTemplateBase64={settings.cardTemplateBase64}
                              cardTemplateTextColor={settings.cardTemplateTextColor}
                              certificateTemplateBase64={settings.certificateTemplateBase64}
                              eventStartDate={settings.startDate}
                              durationDays={settings.durationDays}
                              isCertificateReleased={settings.isCertificateReleased}
                              certificateNo={computedNo}
                              certNoX={settings.certNoX}
                              certNoY={settings.certNoY}
                              certNoSize={settings.certNoSize}
                              certNoColor={settings.certNoColor}
                              certNameX={settings.certNameX}
                              certNameY={settings.certNameY}
                              certNameSize={settings.certNameSize}
                              certNameColor={settings.certNameColor}
                              certDateX={settings.certDateX}
                              certDateY={settings.certDateY}
                              certDateSize={settings.certDateSize}
                              certDateColor={settings.certDateColor}
                              certQrX={settings.certQrX}
                              certQrY={settings.certQrY}
                              certQrSize={settings.certQrSize}
                              isCertQrEnabled={settings.isCertQrEnabled}
                            />
                          );
                        })()}
                      </div>
                    ) : recentRegistration ? (
                      <div className="bg-white rounded-2xl border border-slate-100 p-6 sm:p-8 shadow-sm animate-fade-in">
                        <div className="text-center mb-6 space-y-1.5">
                          <h2 className="text-lg sm:text-xl font-extrabold text-slate-900">Kartu Peserta Baru Terbit</h2>
                          <p className="text-xs sm:text-sm text-slate-500">Pendaftaran sukses! Berikut adalah kartu identitas digital resmi Anda.</p>
                        </div>
                        {(() => {
                          const sorted = [...registrations].sort((a, b) => new Date(a.registeredAt).getTime() - new Date(b.registeredAt).getTime());
                          const idx = sorted.findIndex(r => r.id === recentRegistration.id);
                          const numStr = idx !== -1 ? String(idx + 1).padStart(3, "0") : "001";
                          const computedNo = `Nomor: 556/BIMTEK-DP3AP2KB/SDK/${numStr}/2026`;
                          return (
                            <ParticipantCard
                              registration={recentRegistration}
                              eventTitle={settings.eventTitle}
                              eventLocation={settings.eventLocation}
                              cardTemplateBase64={settings.cardTemplateBase64}
                              cardTemplateTextColor={settings.cardTemplateTextColor}
                              certificateTemplateBase64={settings.certificateTemplateBase64}
                              eventStartDate={settings.startDate}
                              durationDays={settings.durationDays}
                              isCertificateReleased={settings.isCertificateReleased}
                              certificateNo={computedNo}
                              certNoX={settings.certNoX}
                              certNoY={settings.certNoY}
                              certNoSize={settings.certNoSize}
                              certNoColor={settings.certNoColor}
                              certNameX={settings.certNameX}
                              certNameY={settings.certNameY}
                              certNameSize={settings.certNameSize}
                              certNameColor={settings.certNameColor}
                              certDateX={settings.certDateX}
                              certDateY={settings.certDateY}
                              certDateSize={settings.certDateSize}
                              certDateColor={settings.certDateColor}
                              certQrX={settings.certQrX}
                              certQrY={settings.certQrY}
                              certQrSize={settings.certQrSize}
                              isCertQrEnabled={settings.isCertQrEnabled}
                            />
                          );
                        })()}
                      </div>
                    ) : (
                      <div className="bg-white rounded-2xl border border-slate-100 p-8 shadow-sm flex flex-col items-center justify-center text-center space-y-4">
                        <Smartphone className="w-12 h-12 text-indigo-300 animate-pulse" />
                        <h3 className="text-base font-bold text-slate-800">Silakan Cari / Ambil Kartu</h3>
                        <p className="text-xs sm:text-sm text-slate-500 max-w-sm leading-relaxed">
                          Masukkan identitas Anda ke kolom pencarian di atas untuk memanggil kembali kartu digital Anda. Belum mendaftar? Klik tombol di bawah.
                        </p>
                        <button
                          onClick={() => handleTabChange("register")}
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all"
                        >
                          Daftar Sekarang
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* TAB: DAILY ATTENDANCE (Conditional rendering checkpoint) */}
                {activeTab === "absent" && settings.durationDays > 1 && (
                  <AttendanceForm
                    durationDays={settings.durationDays}
                    onAttendanceSubmit={handleAttendanceSubmit}
                    registrations={activeRegistrations}
                  />
                )}

                {/* TAB: PANEL MONITOR ADMIN */}
                {activeTab === "admin" && (
                  <AdminPanel
                    settings={settings}
                    registrations={activeRegistrations}
                    attendance={activeAttendance}
                    onSaveSettings={handleSaveSettings}
                    onDeleteRegistration={handleDeleteRegistration}
                    onDeleteAttendance={handleDeleteAttendance}
                    onResetAllData={handleResetAllData}
                    onClose={() => setActiveTab("home")}
                    activeAdminTab={activeAdminTab}
                    setActiveAdminTab={setActiveAdminTab}
                    isAuthorizedOuter={isAdminAuthorized}
                    onAuthorizedChange={setIsAdminAuthorized}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </div>

        </div>
      </main>

      {/* DISCRETE ADMIN BAR AT THE VERY BOTTOM OF THE SCREEN */}
      <footer className="mt-16 border-t border-slate-200 bg-white py-4 px-6 text-center text-xs">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-center gap-3 text-slate-500">
          <button
            onClick={() => {
              setActiveTab("admin");
              window.scrollTo({ top: 300, behavior: "smooth" });
            }}
            type="button"
            className="text-slate-400 hover:text-slate-500 cursor-default focus:outline-none transition-colors"
          >
            Develop by Aldo
          </button>
        </div>
      </footer>

      {/* Transition Confirm Out of Admin Modal */}
      {pendingTabChange && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 text-center relative shadow-2xl border border-slate-100 text-slate-800">
            <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <LogOut className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-extrabold text-slate-900">
              Konfirmasi Keluar Admin
            </h3>
            <p className="text-xs text-slate-500 mt-2 leading-relaxed">
              Apakah Anda yakin ingin keluar dari Menu Admin dan beralih ke halaman menu yang Anda pilih?
            </p>
            <div className="mt-6 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setActiveTab(pendingTabChange);
                  setPendingTabChange(null);
                }}
                className="flex-1 py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl shadow-md text-sm active:scale-95 transition-all outline-none cursor-pointer"
              >
                Ya, Keluar
              </button>
              <button
                type="button"
                onClick={() => setPendingTabChange(null)}
                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-sm active:scale-95 transition-all outline-none cursor-pointer"
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VERIFIKASI SERTIFIKAT MODAL OVERLAY */}
      {verificationId && (
        <div className="fixed inset-0 bg-slate-900/95 z-[999999] overflow-y-auto flex items-center justify-center p-4 backdrop-blur-md">
          <div className="bg-white rounded-3xl border border-slate-100 shadow-2xl max-w-2xl w-full p-6 sm:p-8 relative overflow-hidden animate-fade-in text-slate-900">
            {/* Ambient official watermark green splash */}
            <div className="absolute top-[-20%] right-[-10%] w-60 h-60 bg-emerald-500/10 blur-[60px] pointer-events-none rounded-full" />
            
            <div className="flex flex-col items-center text-center space-y-4 w-full">
              {!verificationChecked ? (
                <div className="py-12 flex flex-col items-center justify-center space-y-4 w-full">
                  <RefreshCw className="w-12 h-12 text-emerald-600 animate-spin" />
                  <h3 className="text-sm font-bold text-slate-800">Menghubungkan ke Sistem Validasi DP3AP2KB...</h3>
                  <p className="text-xs text-slate-500">Mencari data sertifikat dalam database pelatihan.</p>
                </div>
              ) : (
                <>
                  <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center border border-emerald-100 shadow-inner">
                    <CheckCircle className="w-10 h-10 text-emerald-600 animate-pulse" />
                  </div>

                  <div>
                    <span className="text-[10px] bg-emerald-600 text-white font-extrabold px-3 py-1 rounded-full uppercase tracking-wider">
                      Sertifikat Terverifikasi Resmi
                    </span>
                    <h2 className="text-xl sm:text-2xl font-black mt-3 text-slate-900 tracking-tight">
                      VALIDASI SERTIFIKAT DIGITAL
                    </h2>
                    <p className="text-xs text-slate-500 font-medium">
                      DP3AP2KB Provinsi Sumatera Barat
                    </p>
                  </div>

                  {verifiedCertParticipant ? (
                    <div className="w-full space-y-4 pt-2">
                      <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 text-left text-xs space-y-2.5 font-medium text-slate-700">
                        <div className="grid grid-cols-3 gap-1">
                          <span className="text-slate-400 font-bold uppercase tracking-wide">Nama Peserta</span>
                          <span className="col-span-2 text-slate-900 font-black">{verifiedCertParticipant.name.toUpperCase()}</span>
                        </div>
                        <div className="grid grid-cols-3 gap-1">
                          <span className="text-slate-400 font-bold uppercase tracking-wide">NIK</span>
                          <span className="col-span-2 text-slate-900 font-mono font-bold">{verifiedCertParticipant.nik}</span>
                        </div>
                        <div className="grid grid-cols-3 gap-1">
                          <span className="text-slate-400 font-bold uppercase tracking-wide">Instansi / Kota</span>
                          <span className="col-span-2 text-slate-900 font-bold">{verifiedCertParticipant.kabKota || "Provinsi Sumatera Barat"}</span>
                        </div>
                        <div className="grid grid-cols-3 gap-1">
                          <span className="text-slate-400 font-bold uppercase tracking-wide">Kegiatan</span>
                          <span className="col-span-2 text-slate-900 font-extrabold leading-tight text-emerald-800">{settings ? settings.eventTitle : ""}</span>
                        </div>
                        <div className="grid grid-cols-3 gap-1">
                          <span className="text-slate-400 font-bold uppercase tracking-wide">Tanggal</span>
                          <span className="col-span-2 text-slate-950 font-bold">{settings ? `${settings.startDate} (Durasi ${settings.durationDays} hari)` : ""}</span>
                        </div>
                      </div>

                      {/* DYNAMIC HIGH-FIDELITY CERTIFICATE PREVIEW IMAGE */}
                      <div className="border border-slate-150 rounded-2xl overflow-hidden shadow-md bg-slate-50 p-4 w-full">
                        <p className="text-[10px] text-emerald-700 uppercase tracking-widest font-black text-center mb-3">
                          🖼️ PRATINJAU SERTIFIKAT ASLI (TERVERIFIKASI)
                        </p>
                        
                        {isRenderingCertImg ? (
                          <div className="h-48 flex flex-col items-center justify-center space-y-3 bg-slate-100 rounded-xl border border-dashed border-slate-200">
                            <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin" />
                            <span className="text-xs text-slate-500 font-bold font-mono">Menghubungkan ke secure server DP3AP2KB...</span>
                          </div>
                        ) : renderedCertImg ? (
                          <div className="space-y-3">
                            <div className="relative group overflow-hidden rounded-xl border border-slate-200 shadow-sm bg-white aspect-[16/9] flex items-center justify-center">
                              <img
                                src={renderedCertImg}
                                alt="Pratinjau Sertifikat Resmi"
                                className="w-full h-full object-contain transition-transform duration-300 group-hover:scale-[1.02]"
                              />
                            </div>
                            <div className="flex gap-2">
                              <a
                                href={renderedCertImg}
                                download={`SERTIFIKAT_VERIFIED_${verifiedCertParticipant.name.toUpperCase().replace(/[^A-Z0-9]/g, "_")}.png`}
                                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition-all text-center cursor-pointer font-sans"
                              >
                                <Award className="w-4 h-4 text-emerald-200" />
                                Unduh Dokumen Sertifikat Asli (PNG)
                              </a>
                            </div>
                          </div>
                        ) : (
                          <div className="h-48 flex items-center justify-center bg-slate-100 rounded-xl text-xs text-slate-500 font-bold">
                            Gagal memuat pratinjau sertifikat.
                          </div>
                        )}
                      </div>

                      {/* COLLAPSIBLE KARTU PESERTA SECTION */}
                      <div className="border border-slate-100 rounded-2xl overflow-hidden bg-slate-50/50 w-full">
                        <details className="group">
                          <summary className="flex items-center justify-between p-4 cursor-pointer text-xs font-bold text-slate-600 hover:text-slate-900 select-none">
                            <span className="flex items-center gap-2 font-mono uppercase tracking-wider text-[10px]">
                              💳 Tampilkan Kartu Tanda Anggota Kegiatan (KTA)
                            </span>
                            <span className="transition-transform group-open:rotate-180">▼</span>
                          </summary>
                          <div className="p-4 border-t border-slate-100 bg-white">
                            {(() => {
                              const sorted = [...registrations].sort((a, b) => new Date(a.registeredAt).getTime() - new Date(b.registeredAt).getTime());
                              const idx = sorted.findIndex(r => r.id === verifiedCertParticipant.id);
                              const numStr = idx !== -1 ? String(idx + 1).padStart(3, "0") : "001";
                              const computedNo = `Nomor: 556/BIMTEK-DP3AP2KB/SDK/${numStr}/2026`;
                              return (
                                <ParticipantCard
                                  registration={verifiedCertParticipant}
                                  eventTitle={settings ? settings.eventTitle : ""}
                                  eventLocation={settings?.eventLocation}
                                  cardTemplateBase64={settings?.cardTemplateBase64}
                                  cardTemplateTextColor={settings?.cardTemplateTextColor}
                                  certificateTemplateBase64={settings?.certificateTemplateBase64}
                                  eventStartDate={settings?.startDate}
                                  durationDays={settings?.durationDays}
                                  isCertificateReleased={settings?.isCertificateReleased}
                                  certificateNo={computedNo}
                                  certNoX={settings?.certNoX}
                                  certNoY={settings?.certNoY}
                                  certNoSize={settings?.certNoSize}
                                  certNoColor={settings?.certNoColor}
                                  certNameX={settings?.certNameX}
                                  certNameY={settings?.certNameY}
                                  certNameSize={settings?.certNameSize}
                                  certNameColor={settings?.certNameColor}
                                  certDateX={settings?.certDateX}
                                  certDateY={settings?.certDateY}
                                  certDateSize={settings?.certDateSize}
                                  certDateColor={settings?.certDateColor}
                                  certQrX={settings?.certQrX}
                                  certQrY={settings?.certQrY}
                                  certQrSize={settings?.certQrSize}
                                  isCertQrEnabled={settings?.isCertQrEnabled}
                                />
                              );
                            })()}
                          </div>
                        </details>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-red-50 text-red-700 p-4 border border-red-100 rounded-2xl text-xs font-semibold leading-relaxed text-center w-full my-4">
                      ⚠️ Dokumen Tidak Valid atau Tidak Terdaftar pada Sistem Database Pelatihan DP3AP2KB Sumatera Barat. Hubungi Administrator untuk informasi lebih lanjut.
                    </div>
                  )}
                </>
              )}

              <div className="w-full pt-2">
                <button
                  type="button"
                  onClick={() => {
                    const url = new URL(window.location.href);
                    url.searchParams.delete("verifyCert");
                    window.history.replaceState({}, document.title, url.pathname);
                    setVerificationId(null);
                    setVerifiedCertParticipant(null);
                    setVerificationChecked(false);
                  }}
                  className="w-full py-3.5 bg-slate-900 hover:bg-slate-800 text-white font-black rounded-2xl text-xs sm:text-sm active:scale-95 transition-all shadow-xl outline-none cursor-pointer tracking-wider uppercase"
                >
                  Tutup Validasi & Menuju Aplikasi
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
