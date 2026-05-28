import React, { useState, useEffect } from "react";
import {
  Lock,
  Unlock,
  Compass,
  Users,
  CheckSquare,
  Sliders,
  Settings,
  FileSpreadsheet,
  Printer,
  Trash2,
  Calendar,
  Search,
  CheckCircle,
  Database,
  Phone,
  Eye,
  X,
  Download,
  Upload,
  Image,
  LogOut,
  Sparkles,
  MapPin,
  Award
} from "lucide-react";
import { Registration, Attendance, AppSettings } from "../types";
import { ParticipantCard } from "./ParticipantCard";
import { BarcodeGenerator } from "./BarcodeGenerator";
import { motion, AnimatePresence } from "motion/react";
import { dbService } from "../services/dbService";
import { generateCertificateImage } from "../utils/certHelper";

interface AdminPanelProps {
  settings: AppSettings;
  registrations: Registration[];
  attendance: Attendance[];
  onSaveSettings: (settings: AppSettings) => Promise<void>;
  onDeleteRegistration: (id: string) => Promise<void>;
  onDeleteAttendance: (id: string) => Promise<void>;
  onResetAllData: () => Promise<void>;
  onClose: () => void;
  activeAdminTab?: "stats" | "registrants" | "attendance" | "settings" | "allowance" | "certificates";
  setActiveAdminTab?: (tab: "stats" | "registrants" | "attendance" | "settings" | "allowance" | "certificates") => void;
  isAuthorizedOuter?: boolean;
  onAuthorizedChange?: (auth: boolean) => void;
}

const compressTemplateImage = (
  base64Str: string,
  maxWidth = 1200,
  maxHeight = 800,
  quality = 0.75
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => {
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        if (base64Str.length > 800000) {
          reject(new Error("Perangkat kehabisan memori untuk mengompresi gambar ini."));
        } else {
          resolve(base64Str);
        }
        return;
      }

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      let compressedBase64 = canvas.toDataURL("image/jpeg", quality);

      // Iteratively scale down if the size is still too large (> 600,000 characters / ~450KB)
      let currentQuality = quality;
      let currentWidth = width;
      let currentHeight = height;

      while (compressedBase64.length > 600000 && currentQuality > 0.15) {
        currentQuality -= 0.15;
        currentWidth = Math.round(currentWidth * 0.85);
        currentHeight = Math.round(currentHeight * 0.85);

        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = currentWidth;
        tempCanvas.height = currentHeight;
        const tempCtx = tempCanvas.getContext("2d");
        if (tempCtx) {
          tempCtx.fillStyle = "#ffffff";
          tempCtx.fillRect(0, 0, currentWidth, currentHeight);
          tempCtx.drawImage(img, 0, 0, currentWidth, currentHeight);
          compressedBase64 = tempCanvas.toDataURL("image/jpeg", currentQuality);
        } else {
          break;
        }
      }

      resolve(compressedBase64);
    };
    img.onerror = () => {
      reject(new Error("Gagal memproses gambar untuk kompresi."));
    };
    img.src = base64Str;
  });
};

interface StatPieChartProps {
  title: string;
  value: number;
  total: number;
  strokeColor: string;
  label: string;
}

const StatPieChart: React.FC<StatPieChartProps> = ({ title, value, total, strokeColor, label }) => {
  const percentage = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
  const strokeDash = `${percentage * 2.512} ${251.2 - percentage * 2.512}`;

  return (
    <div className="bg-slate-800/40 border border-white/5 p-6 rounded-3xl flex flex-col items-center justify-center text-center space-y-4 hover:bg-slate-800/60 transition-all">
      <h4 className="text-[11px] font-mono uppercase tracking-wider text-slate-400 font-bold">{title}</h4>
      
      <div className="relative w-32 h-32 flex items-center justify-center">
        <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-90">
          <circle
            cx="50"
            cy="50"
            r="40"
            fill="transparent"
            stroke="#1e293b"
            strokeWidth="10"
          />
          {percentage > 0 && (
            <circle
              cx="50"
              cy="50"
              r="40"
              fill="transparent"
              stroke={strokeColor || "#10b981"}
              strokeWidth="10"
              strokeDasharray={strokeDash}
              strokeLinecap="round"
              className="transition-all duration-1000 ease-out"
            />
          )}
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center space-y-0.5">
          <span className="text-xl font-black text-white leading-none font-sans">
            {percentage}%
          </span>
          <span className="text-[9px] text-slate-400 font-bold tracking-wider uppercase font-mono mt-0.5">
            {value} / {total}
          </span>
        </div>
      </div>

      <p className="text-[10px] text-slate-300 font-bold bg-slate-900/45 px-3 py-1.5 rounded-full border border-white/5 uppercase tracking-wide">
        {label}
      </p>
    </div>
  );
};

export const AdminPanel: React.FC<AdminPanelProps> = ({
  settings,
  registrations,
  attendance,
  onSaveSettings,
  onDeleteRegistration,
  onDeleteAttendance,
  onResetAllData,
  onClose,
  activeAdminTab,
  setActiveAdminTab,
  isAuthorizedOuter,
  onAuthorizedChange,
}) => {
  const [password, setPassword] = useState("");
  const [isAuthorizedLocal, setIsAuthorizedLocal] = useState(false);
  const isAuthorized = isAuthorizedOuter !== undefined ? isAuthorizedOuter : isAuthorizedLocal;
  const setIsAuthorized = (auth: boolean) => {
    setIsAuthorizedLocal(auth);
    if (onAuthorizedChange) {
      onAuthorizedChange(auth);
    }
  };

  const [authError, setAuthError] = useState("");

  const [activeTabLocal, setActiveTabLocal] = useState<"stats" | "registrants" | "attendance" | "settings" | "allowance" | "certificates">("stats");
  const activeTab = activeAdminTab !== undefined ? activeAdminTab : activeTabLocal;
  const setActiveTab = (tab: "stats" | "registrants" | "attendance" | "settings" | "allowance" | "certificates") => {
    if (setActiveAdminTab) {
      setActiveAdminTab(tab);
    } else {
      setActiveTabLocal(tab);
    }
  };
  const [modalCertPreviewUrl, setModalCertPreviewUrl] = useState<string>("");
  const [isReleasingCerts, setIsReleasingCerts] = useState(false);
  const [isRevokingCerts, setIsRevokingCerts] = useState(false);
  const [showCertReleaseConfirm, setShowCertReleaseConfirm] = useState(false);
  const [showCertReleaseSuccess, setShowCertReleaseSuccess] = useState(false);
  const [showCertRevokeConfirm, setShowCertRevokeConfirm] = useState(false);
  const [showCertRevokeSuccess, setShowCertRevokeSuccess] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Edit states for settings
  const [eventTitle, setEventTitle] = useState(settings.eventTitle);
  const [durationDays, setDurationDays] = useState(settings.durationDays);
  const [startDate, setStartDate] = useState(settings.startDate || "2026-05-21");
  const [eventLocation, setEventLocation] = useState(settings.eventLocation || "");
  const [cardTemplateBase64, setCardTemplateBase64] = useState(settings.cardTemplateBase64 || "");
  const [cardTemplateTextColor, setCardTemplateTextColor] = useState<"white" | "black">(settings.cardTemplateTextColor || "black");
  const [certificateTemplateBase64, setCertificateTemplateBase64] = useState(settings.certificateTemplateBase64 || "");
  const [kepalaBidangName, setKepalaBidangName] = useState(settings.kepalaBidangName || "");
  const [kepalaBidangNip, setKepalaBidangNip] = useState(settings.kepalaBidangNip || "");
  const [allowanceAmount, setAllowanceAmount] = useState<number | "">(settings.allowanceAmount !== undefined && settings.allowanceAmount !== 0 ? settings.allowanceAmount : "");
  const [targetParticipants, setTargetParticipants] = useState(settings.targetParticipants !== undefined ? settings.targetParticipants : 50);
  const [isDragging, setIsDragging] = useState(false);
  const [isDraggingGlobalCert, setIsDraggingGlobalCert] = useState(false);
  const [templateUploadError, setTemplateUploadError] = useState("");
  const [globalCertUploadError, setGlobalCertUploadError] = useState("");
  const [saveStatus, setSaveStatus] = useState("");

  // States for custom certificate layout positions
  const [certNoX, setCertNoX] = useState<number>(settings.certNoX !== undefined ? settings.certNoX : 960);
  const [certNoY, setCertNoY] = useState<number>(settings.certNoY !== undefined ? settings.certNoY : 310);
  const [certNoSize, setCertNoSize] = useState<number>(settings.certNoSize !== undefined ? settings.certNoSize : 16);
  const [certNoColor, setCertNoColor] = useState<string>(settings.certNoColor || "#4f46e5");

  const [certNameX, setCertNameX] = useState<number>(settings.certNameX !== undefined ? settings.certNameX : 960);
  const [certNameY, setCertNameY] = useState<number>(settings.certNameY !== undefined ? settings.certNameY : 560);
  const [certNameSize, setCertNameSize] = useState<number>(settings.certNameSize !== undefined ? settings.certNameSize : 45);
  const [certNameColor, setCertNameColor] = useState<string>(settings.certNameColor || "#1e293b");

  const [certDateX, setCertDateX] = useState<number>(settings.certDateX !== undefined ? settings.certDateX : 960);
  const [certDateY, setCertDateY] = useState<number>(settings.certDateY !== undefined ? settings.certDateY : 720);
  const [certDateSize, setCertDateSize] = useState<number>(settings.certDateSize !== undefined ? settings.certDateSize : 18);
  const [certDateColor, setCertDateColor] = useState<string>(settings.certDateColor || "#475569");

  // States for verification QR code on certificate
  const [certQrX, setCertQrX] = useState<number>(settings.certQrX !== undefined ? settings.certQrX : 150);
  const [certQrY, setCertQrY] = useState<number>(settings.certQrY !== undefined ? settings.certQrY : 830);
  const [certQrSize, setCertQrSize] = useState<number>(settings.certQrSize !== undefined ? settings.certQrSize : 130);
  const [isCertQrEnabled, setIsCertQrEnabled] = useState<boolean>(settings.isCertQrEnabled !== undefined ? settings.isCertQrEnabled : true);
  
  const [saveCertLayoutStatus, setSaveCertLayoutStatus] = useState("");
  const [isCertLayoutLocked, setIsCertLayoutLocked] = useState<boolean>(true);

  // Multiple Bimtek Events states
  const [bimtekEvents, setBimtekEvents] = useState<AppSettings[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>("default");
  const [showAddEventForm, setShowAddEventForm] = useState(false);
  const [eventActionStatus, setEventActionStatus] = useState("");
  
  // Exit Confirmation state
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  // New Event Form states
  const [newEventTitle, setNewEventTitle] = useState("");
  const [newEventDurationDays, setNewEventDurationDays] = useState(3);
  const [newEventStartDate, setNewEventStartDate] = useState("2026-05-21");
  const [newEventLocation, setNewEventLocation] = useState("");
  const [newEventKepalaBidangName, setNewEventKepalaBidangName] = useState("");
  const [newEventKepalaBidangNip, setNewEventKepalaBidangNip] = useState("");
  const [newEventTargetParticipants, setNewEventTargetParticipants] = useState(50);

  const fetchBimtekEvents = async () => {
    try {
      const list = await dbService.getAllBimtekEvents();
      setBimtekEvents(list);
      if (settings.originalEventId) {
        setSelectedEventId(settings.originalEventId);
      } else if (settings.id) {
        setSelectedEventId(settings.id);
      }
    } catch (err) {
      console.error("Gagal memuat daftar Bimtek", err);
    }
  };

  useEffect(() => {
    if (isAuthorized) {
      fetchBimtekEvents();
    }
  }, [isAuthorized, settings.id, settings.originalEventId]);

  useEffect(() => {
    if (settings) {
      setEventTitle(settings.eventTitle);
      setDurationDays(settings.durationDays);
      setStartDate(settings.startDate || "2026-05-21");
      setEventLocation(settings.eventLocation || "");
      setCardTemplateBase64(settings.cardTemplateBase64 || "");
      setCardTemplateTextColor(settings.cardTemplateTextColor || "black");
      setCertificateTemplateBase64(settings.certificateTemplateBase64 || "");
      setKepalaBidangName(settings.kepalaBidangName || "");
      setKepalaBidangNip(settings.kepalaBidangNip || "");
      setAllowanceAmount(settings.allowanceAmount !== undefined && settings.allowanceAmount !== 0 ? settings.allowanceAmount : "");
      setTargetParticipants(settings.targetParticipants !== undefined ? settings.targetParticipants : 50);
      
      // Update custom layout variables
      setCertNoX(settings.certNoX !== undefined ? settings.certNoX : 960);
      setCertNoY(settings.certNoY !== undefined ? settings.certNoY : 310);
      setCertNoSize(settings.certNoSize !== undefined ? settings.certNoSize : 16);
      setCertNoColor(settings.certNoColor || "#4f46e5");

      setCertNameX(settings.certNameX !== undefined ? settings.certNameX : 960);
      setCertNameY(settings.certNameY !== undefined ? settings.certNameY : 560);
      setCertNameSize(settings.certNameSize !== undefined ? settings.certNameSize : 45);
      setCertNameColor(settings.certNameColor || "#1e293b");

      setCertDateX(settings.certDateX !== undefined ? settings.certDateX : 960);
      setCertDateY(settings.certDateY !== undefined ? settings.certDateY : 720);
      setCertDateSize(settings.certDateSize !== undefined ? settings.certDateSize : 18);
      setCertDateColor(settings.certDateColor || "#475569");

      setCertQrX(settings.certQrX !== undefined ? settings.certQrX : 150);
      setCertQrY(settings.certQrY !== undefined ? settings.certQrY : 830);
      setCertQrSize(settings.certQrSize !== undefined ? settings.certQrSize : 130);
      setIsCertQrEnabled(settings.isCertQrEnabled !== undefined ? settings.isCertQrEnabled : true);
    }
  }, [
    settings.eventTitle,
    settings.durationDays,
    settings.startDate,
    settings.eventLocation,
    settings.cardTemplateBase64,
    settings.cardTemplateTextColor,
    settings.certificateTemplateBase64,
    settings.kepalaBidangName,
    settings.kepalaBidangNip,
    settings.allowanceAmount,
    settings.targetParticipants,
    settings.certNoX,
    settings.certNoY,
    settings.certNoSize,
    settings.certNoColor,
    settings.certNameX,
    settings.certNameY,
    settings.certNameSize,
    settings.certNameColor,
    settings.certDateX,
    settings.certDateY,
    settings.certDateSize,
    settings.certDateColor,
    settings.certQrX,
    settings.certQrY,
    settings.certQrSize,
    settings.isCertQrEnabled
  ]);

  const handleActivateEvent = async (event: AppSettings) => {
    try {
      setEventActionStatus("Sedang mengaktifkan event...");
      await dbService.activateBimtekEvent(event);
      // Update local edit form parameters to match new active event
      setEventTitle(event.eventTitle);
      setDurationDays(event.durationDays);
      setStartDate(event.startDate || "2026-05-21");
      setEventLocation(event.eventLocation || "");
      setCardTemplateBase64(event.cardTemplateBase64 || "");
      setCardTemplateTextColor(event.cardTemplateTextColor || "black");
      setCertificateTemplateBase64(event.certificateTemplateBase64 || "");
      setKepalaBidangName(event.kepalaBidangName || "");
      setKepalaBidangNip(event.kepalaBidangNip || "");
      setAllowanceAmount(event.allowanceAmount !== undefined && event.allowanceAmount !== 0 ? event.allowanceAmount : "");
      setTargetParticipants(event.targetParticipants !== undefined ? event.targetParticipants : 50);
      
      const origId = event.originalEventId || event.id;
      // Force reload active event
      await onSaveSettings({
        ...event,
        id: "default",
        originalEventId: origId
      });
      setSelectedEventId(origId);
      setEventActionStatus("Event Bimtek berhasil diaktifkan!");
      setTimeout(() => setEventActionStatus(""), 3000);
      fetchBimtekEvents();
    } catch (err) {
      console.error(err);
      setEventActionStatus("Gagal mengaktifkan event.");
    }
  };

  const handleCreateNewEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEventTitle) return;

    // Prevent duplicate event creation by matching titles
    const isDuplicate = bimtekEvents.some(
      (ev) => ev.eventTitle.toLowerCase().trim() === newEventTitle.toLowerCase().trim()
    );
    if (isDuplicate) {
      setEventActionStatus("Gagal: Sesi Bimtek dengan judul tersebut sudah terdaftar.");
      setTimeout(() => setEventActionStatus(""), 4000);
      return;
    }

    try {
      setEventActionStatus("Sedang membuat event baru...");
      const id = "bimtek_" + Date.now();
      const newEvent: AppSettings = {
        id,
        eventTitle: newEventTitle,
        durationDays: newEventDurationDays,
        startDate: newEventStartDate,
        eventLocation: newEventLocation,
        cardTemplateBase64: settings.cardTemplateBase64 || "",
        cardTemplateTextColor: settings.cardTemplateTextColor || "black",
        certificateTemplateBase64: settings.certificateTemplateBase64 || "",
        kepalaBidangName: newEventKepalaBidangName || kepalaBidangName,
        kepalaBidangNip: newEventKepalaBidangNip || kepalaBidangNip,
        gasLink: settings.gasLink || "",
        targetParticipants: newEventTargetParticipants,
        // Inherit certificate customization coordinates and settings
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
      };

      await dbService.addBimtekEvent(newEvent);
      
      // Auto-activate this newly created event!
      await handleActivateEvent(newEvent);

      // Reset form fields
      setNewEventTitle("");
      setNewEventDurationDays(3);
      setNewEventStartDate("2026-05-21");
      setNewEventLocation("");
      setNewEventKepalaBidangName("");
      setNewEventKepalaBidangNip("");
      setNewEventTargetParticipants(50);
      setShowAddEventForm(false);
      
      setEventActionStatus("Sesi Bimtek Baru berhasil dibuat dan diaktifkan!");
      setTimeout(() => setEventActionStatus(""), 4000);
    } catch (err) {
      console.error(err);
      setEventActionStatus("Gagal menambahkan event baru.");
    }
  };

  const [deleteEventConfirmId, setDeleteEventConfirmId] = useState<string | null>(null);

  const handleDeleteBimtekEvent = async (id: string) => {
    try {
      setEventActionStatus("Sedang menghapus event...");
      await dbService.deleteBimtekEvent(id);
      setEventActionStatus("Sesi Bimtek berhasil dihapus dari daftar!");
      setTimeout(() => setEventActionStatus(""), 3000);
      setDeleteEventConfirmId(null);
      fetchBimtekEvents();
    } catch (err) {
      console.error(err);
      setEventActionStatus("Gagal menghapus event.");
    }
  };

  // Certificate management functions
  const openCertificateModal = async (participant: Registration) => {
    setCertModalParticipant(participant);
    setModalCertPreviewUrl("");
    
    // Sort registrations consistently to determine serial index
    const sorted = [...registrations].sort((a, b) => {
      return new Date(a.registeredAt).getTime() - new Date(b.registeredAt).getTime();
    });
    const idx = sorted.findIndex(r => r.id === participant.id);
    const numStr = idx !== -1 ? String(idx + 1).padStart(3, "0") : "001";
    const computedCertNo = `Nomor: 556/BIMTEK-DP3AP2KB/SDK/${numStr}/2026`;

    try {
      const url = await generateCertificateImage({
        participantName: participant.name,
        participantNik: participant.nik,
        kabKota: participant.kabKota,
        eventTitle: settings.eventTitle,
        eventLocation: settings.eventLocation,
        startDate: settings.startDate,
        durationDays: settings.durationDays,
        kabidName: settings.kepalaBidangName,
        kabidNip: settings.kepalaBidangNip,
        customTemplateBase64: participant.certificateBase64 || settings.certificateTemplateBase64 || undefined,
        participantId: participant.id,
        
        // Pass style positions
        certificateNo: computedCertNo,
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
      setModalCertPreviewUrl(url);
    } catch (err) {
      console.error("Gagal pratinjau sertifikat:", err);
      setModalCertPreviewUrl(participant.certificateBase64 || settings.certificateTemplateBase64 || "");
    }
  };

  // Printing State
  const [isPrintLayoutActive, setIsPrintLayoutActive] = useState(false);
  const [printType, setPrintType] = useState<"registrants" | "attendance" | "single-card" | "allowance">("registrants");
  const [selectedParticipantForCard, setSelectedParticipantForCard] = useState<Registration | null>(null);
  const [selectedAttendanceForDetail, setSelectedAttendanceForDetail] = useState<Attendance | null>(null);

  // Certificate View States
  const [certModalParticipant, setCertModalParticipant] = useState<Registration | null>(null);

  // Custom states for confirmations and PDF generators
  const [deleteRegConfirmId, setDeleteRegConfirmId] = useState<string | null>(null);
  const [deleteAttConfirmId, setDeleteAttConfirmId] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showResetSuccess, setShowResetSuccess] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [pdfStatus, setPdfStatus] = useState("");
  const [singlePdfStatus, setSinglePdfStatus] = useState("");

  const formatIndonesianDate = (dateStr: string, offsetDays: number = 0) => {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return "";
      if (offsetDays !== 0) {
        d.setDate(d.getDate() + offsetDays);
      }
      return d.toLocaleDateString("id-ID", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    } catch {
      return "";
    }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === "minangrancak") {
      setIsAuthorized(true);
      setAuthError("");
    } else {
      setAuthError("Sandi Salah! Silakan hubungi koordinator pelaksana.");
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveStatus("Menyimpan...");
    try {
      await onSaveSettings({
        ...settings,
        eventTitle,
        durationDays,
        startDate,
        eventLocation,
        cardTemplateBase64,
        cardTemplateTextColor,
        certificateTemplateBase64,
        kepalaBidangName,
        kepalaBidangNip,
        allowanceAmount: allowanceAmount === "" ? 0 : allowanceAmount,
        targetParticipants: targetParticipants === "" ? 0 : targetParticipants,
      });
      setSaveStatus("Pengaturan Berhasil Disimpan!");
      setTimeout(() => setSaveStatus(""), 3000);
      fetchBimtekEvents();
    } catch {
      setSaveStatus("Gagal menyimpan.");
    }
  };

  const handleTemplateFileChange = (file: File) => {
    setTemplateUploadError("");

    // Validate type
    if (!file.type.startsWith("image/")) {
      setTemplateUploadError("Format berkas harus berupa gambar (PNG, JPG, JPEG, WebP).");
      return;
    }

    // Limit to 5MB
    if (file.size > 5 * 1024 * 1024) {
      setTemplateUploadError("Ukuran terlalu besar. Maksimal adalah 5MB untuk kecepatan performa.");
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target?.result as string;
      try {
        const compressed = await compressTemplateImage(base64);
        setCardTemplateBase64(compressed);
      } catch (err) {
        setTemplateUploadError("Gagal mengompresi gambar template.");
      }
    };
    reader.onerror = () => {
      setTemplateUploadError("Gagal membaca gambar.");
    };
    reader.readAsDataURL(file);
  };

  const handleTemplateDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleTemplateDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleTemplateDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      handleTemplateFileChange(file);
    }
  };

  const handleGlobalCertFileChange = (file: File) => {
    setGlobalCertUploadError("");

    // Validate type
    if (!file.type.startsWith("image/")) {
      setGlobalCertUploadError("Format berkas harus berupa gambar (PNG, JPG, JPEG, WebP).");
      return;
    }

    // Limit to 5MB
    if (file.size > 5 * 1024 * 1024) {
      setGlobalCertUploadError("Ukuran terlalu besar. Maksimal adalah 5MB untuk kecepatan performa.");
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target?.result as string;
      try {
        const compressed = await compressTemplateImage(base64);
        setCertificateTemplateBase64(compressed);
      } catch (err) {
        setGlobalCertUploadError("Gagal mengompresi gambar template.");
      }
    };
    reader.onerror = () => {
      setGlobalCertUploadError("Gagal membaca gambar.");
    };
    reader.readAsDataURL(file);
  };

  const handleGlobalCertDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingGlobalCert(true);
  };

  const handleGlobalCertDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingGlobalCert(false);
  };

  const handleGlobalCertDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingGlobalCert(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      handleGlobalCertFileChange(file);
    }
  };

  // Group registrations by West Sumatra regencies for statistics
  const getKabKotaStats = () => {
    const counts: { [key: string]: number } = {};
    registrations.forEach((reg) => {
      const kab = reg.kabKota || "Lainnya";
      counts[kab] = (counts[kab] || 0) + 1;
    });

    const total = registrations.length || 1;
    return Object.entries(counts)
      .map(([name, count]) => ({
        name,
        count,
        percentage: Math.round((count / total) * 100),
      }))
      .sort((a, b) => b.count - a.count);
  };

  const triggerPrintReport = (type: "registrants" | "attendance") => {
    setPrintType(type);
    setIsPrintLayoutActive(true);
  };

  const handleDownloadPDF = async () => {
    const element = document.getElementById("print-content-area");
    if (!element) return;
    
    setPdfStatus("Menyiapkan berkas PDF...");
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

      const { default: html2canvas } = await import("html2canvas");
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#ffffff",
        logging: false
      });
      
      const imgData = canvas.toDataURL("image/png");
      const { jsPDF } = await import("jspdf");
      
      const pdf = new jsPDF("p", "mm", "a4");
      const imgWidth = 190; // margin left/right is 10mm (210 - 20)
      const pageHeight = 295;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 10;
      
      pdf.addImage(imgData, "PNG", 10, position, imgWidth, imgHeight, undefined, 'FAST');
      heightLeft -= (pageHeight - 20);
      
      while (heightLeft > 0) {
        position = heightLeft - imgHeight + 10;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 10, position, imgWidth, imgHeight, undefined, 'FAST');
        heightLeft -= (pageHeight - 20);
      }
      
      pdf.save(`LAPORAN_BIMTEK_${printType.toUpperCase()}_SUMBAR.pdf`);
      setPdfStatus("Unduh PDF Berhasil!");
      setTimeout(() => setPdfStatus(""), 3000);
    } catch (err) {
      console.error(err);
      setPdfStatus("Gagal Mengunduh PDF.");
      setTimeout(() => setPdfStatus(""), 4000);
    } finally {
      window.getComputedStyle = originalGetComputedStyle;
    }
  };

  const handleDownloadSingleParticipantPDF = async (participant: Registration) => {
    const originalCard = document.getElementById("digital-participant-card");
    if (!originalCard) {
      setSinglePdfStatus("Elemen kartu tidak ditemukan.");
      return;
    }

    setSinglePdfStatus("Menyiapkan berkas PDF...");
    const originalGetComputedStyle = window.getComputedStyle;
    
    try {
      // Override getComputedStyle to filter out oklch and oklab colors for html2canvas compatibility
      window.getComputedStyle = function (elt, pseudoElt) {
        const style = originalGetComputedStyle.call(window, elt, pseudoElt);
        
        const safeColor = (value: string): string => {
          if (typeof value === "string" && (value.includes("oklch") || value.includes("oklab"))) {
            if (value.includes("/")) {
              const parts = value.split("/");
              const alphaAttr = parts[parts.length - 1].replace(")", "").trim();
              const alpha = parseFloat(alphaAttr);
              return isNaN(alpha) ? "rgba(0,0,0,0)" : `rgba(71, 85, 105, ${alpha})`;
            }
            return "#475569";
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

      // 1. Create outer wrapper container representing an off-screen A4 sheet
      const wrapper = document.createElement("div");
      wrapper.id = "temp-pdf-a4-sheet";
      wrapper.style.position = "absolute";
      wrapper.style.left = "-9999px";
      wrapper.style.top = "-9999px";
      wrapper.style.width = "820px";
      wrapper.style.height = "1160px";
      wrapper.style.backgroundColor = "#ffffff";
      wrapper.style.color = "#000000";
      wrapper.style.fontFamily = "system-ui, -apple-system, sans-serif";
      wrapper.style.padding = "45px";
      wrapper.style.boxSizing = "border-box";
      wrapper.style.display = "flex";
      wrapper.style.flexDirection = "column";

      // 2. Add Kop Surat, details, signature column, card column, and KTP section
      wrapper.innerHTML = `
        <!-- HEADER LETTERHEAD -->
        <div style="text-align: center; border-bottom: 3px double #000000; padding-bottom: 12px; margin-bottom: 24px; font-family: sans-serif;">
          <h1 style="font-size: 16px; font-weight: 850; text-transform: uppercase; margin: 0; letter-spacing: 0.5px; color: #000000;">PEMERINTAH PROVINSI SUMATERA BARAT</h1>
          <h2 style="font-size: 19px; font-weight: 900; text-transform: uppercase; margin: 4px 0 0 0; letter-spacing: 1px; color: #000000;">DINAS PEMBERDAYAAN PEREMPUAN DAN PERLINDUNGAN ANAK</h2>
          <p style="font-size: 11px; margin: 4px 0 0 0; font-weight: 500; color: #334155;">Jl. Rasuna Said no.74 Padang - Sumatera Barat</p>
        </div>

        <!-- DOCUMENT TITLE -->
        <div style="text-align: center; margin-bottom: 24px;">
          <h3 style="font-size: 14px; font-weight: 800; text-transform: uppercase; margin: 0; letter-spacing: 0.5px; text-decoration: underline; color: #0f172a;">LEMBAR REKAPITULASI DATA PESERTA</h3>
          <p style="font-size: 11px; font-weight: 600; margin: 4px 0 0 0; color: #475569; text-transform: uppercase;">
            EVENT RESMI
          </p>
        </div>

        <!-- MAIN LAYOUT: TWO-COLUMN CONTENT GRID -->
        <div style="display: flex; gap: 24px; align-items: stretch; margin-bottom: 20px;">
          <!-- LEFT: Registration Info & Signature -->
          <div style="flex: 1.25; display: flex; flex-direction: column; gap: 16px;">
            <!-- Info Details Block -->
            <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px; box-sizing: border-box;">
              <span style="font-size: 10px; background-color: #f1f5f9; color: #0f172a; font-weight: bold; padding: 4px 10px; border-radius: 9999px; text-transform: uppercase; display: inline-block; margin-bottom: 14px;">
                Data KTP & Kontak Peserta Pasca Verifikasi
              </span>
              
              <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
                <tbody>
                  <tr style="border-bottom: 1px solid #e2e8f0;">
                    <td style="padding: 8px 0; font-weight: bold; color: #64748b; width: 33%;">NAMA AJUAN</td>
                    <td style="padding: 8px 0; font-weight: 950; color: #0f172a; text-transform: uppercase;">${participant.name}</td>
                  </tr>
                  <tr style="border-bottom: 1px solid #e2e8f0;">
                    <td style="padding: 8px 0; font-weight: bold; color: #64748b;">NIK KTP</td>
                    <td style="padding: 8px 0; font-weight: bold; font-family: monospace; color: #0f172a; font-size: 12px;">${participant.nik}</td>
                  </tr>
                  <tr style="border-bottom: 1px solid #e2e8f0;">
                    <td style="padding: 8px 0; font-weight: bold; color: #64748b;">NO. HANDPHONE</td>
                    <td style="padding: 8px 0; font-weight: bold; color: #059669;">${participant.phone || "-"}</td>
                  </tr>
                  <tr style="border-bottom: 1px solid #e2e8f0;">
                    <td style="padding: 8px 0; font-weight: bold; color: #64748b;">DOMISILI</td>
                    <td style="padding: 8px 0; font-weight: bold; color: #0f172a;">${participant.kabKota}</td>
                  </tr>
                  <tr style="border-bottom: 1px solid #e2e8f0;">
                    <td style="padding: 8px 0; font-weight: bold; color: #64748b;">ALAMAT LENGKAP</td>
                    <td style="padding: 8px 0; color: #334155; line-height: 1.4;">${participant.address || "-"}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; font-weight: bold; color: #64748b; vertical-align: top;">KEGIATAN</td>
                    <td style="padding: 8px 0; font-weight: bold; color: #0f172a; line-height: 1.3;">${eventTitle}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- Signature block -->
            <div style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px; box-sizing: border-box;">
              <span style="font-size: 10px; color: #64748b; font-weight: bold; text-transform: uppercase; display: block; margin-bottom: 8px;">
                Tanda Tangan Peserta (Digital)
              </span>
              <div style="display: flex; justify-content: center; align-items: center; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 8px; background-color: #f8fafc; height: 105px; box-sizing: border-box;">
                ${participant.signatureBase64 ? `
                  <img src="${participant.signatureBase64}" style="max-height: 90px; max-width: 100%; object-fit: contain;" />
                ` : `
                  <span style="font-size: 11px; color: #94a3b8; font-style: italic;">Tidak ada tanda tangan.</span>
                `}
              </div>
            </div>
          </div>

          <!-- RIGHT: Digital Card Placement -->
          <div style="flex: 0.85; display: flex; flex-direction: column; align-items: center; justify-content: start;">
            <div style="font-size: 10px; font-weight: bold; color: #64748b; text-transform: uppercase; margin-bottom: 8px; text-align: center;">
              Pratinjau Kartu Digital (Tampak Depan)
            </div>
            <div id="cloned-card-pdf-placeholder" style="width: 270px; display: flex; justify-content: center; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.08);">
              <!-- Cloned card will be inserted here -->
            </div>
          </div>
        </div>

        <!-- UPLOADED KTP PORTION -->
        <div style="border-top: 1px dashed #cbd5e1; padding-top: 18px; margin-top: auto; box-sizing: border-box;">
          <span style="font-size: 10px; color: #64748b; font-weight: bold; text-transform: uppercase; display: block; margin-bottom: 10px;">
            Unggahan Berkas Identitas KTP Resmi
          </span>
          <div style="border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px; background-color: #f8fafc; display: flex; justify-content: center; align-items: center; max-height: 250px; overflow: hidden; box-sizing: border-box;">
            ${participant.ktpBase64 ? `
              <img src="${participant.ktpBase64}" style="max-height: 220px; max-width: 100%; object-fit: contain; border-radius: 6px;" />
            ` : `
              <span style="font-size: 11px; color: #94a3b8; font-style: italic; padding: 30px 0;">Peserta mendaftar mandiri tanpa mengunggah berkas/foto KTP.</span>
            `}
          </div>
        </div>

        <!-- FOOTER INFO -->
        <div style="margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 12px; display: flex; justify-content: space-between; align-items: center; font-size: 10px; color: #94a3b8; box-sizing: border-box; font-family: sans-serif;">
          <div>Dinas Pemberdayaan Perempuan, Perlindungan Anak, Pengendalian Penduduk, dan Keluarga Berencana (DP3AP2KB) Provinsi Sumatera Barat &copy; 2026</div>
        </div>
      `;

      // 3. Clone and insert the participant card beautifully inside the right placeholder
      const placeholder = wrapper.querySelector("#cloned-card-pdf-placeholder");
      if (placeholder) {
        const cardClone = originalCard.cloneNode(true) as HTMLDivElement;
        
        // Remove interactive helper styles or dynamic classes if any
        cardClone.classList.remove("w-full");
        cardClone.style.width = "270px";
        cardClone.style.height = "432px"; // keep the rigorous 5:8 ratio (270 * 1.6)
        cardClone.style.aspectRatio = "auto";
        cardClone.style.boxSizing = "border-box";
        cardClone.style.margin = "0";

        placeholder.appendChild(cardClone);
      }

      // Append to body temporarily so html2canvas can measure layout perfectly
      document.body.appendChild(wrapper);

      const { default: html2canvas } = await import("html2canvas");
      const canvas = await html2canvas(wrapper, {
        scale: 3, // Premium quality text and lines
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#ffffff",
        logging: false
      });
      
      // Clean up body
      document.body.removeChild(wrapper);
      
      const imgData = canvas.toDataURL("image/png");
      const { jsPDF } = await import("jspdf");
      
      const pdf = new jsPDF("p", "mm", "a4");
      // A4 dimensions are 210mm x 297mm
      pdf.addImage(imgData, "PNG", 0, 0, 210, 297, undefined, 'FAST');
      
      const safeName = participant.name.toUpperCase().replace(/[^A-Za-z0-9]/g, "_");
      pdf.save(`KARTU_DOKUMEN_PESERTA_${safeName}.pdf`);
      setSinglePdfStatus("Unduh PDF Berhasil!");
      setTimeout(() => setSinglePdfStatus(""), 3000);
    } catch (err) {
      console.error(err);
      setSinglePdfStatus("Gagal Mengunduh PDF.");
      setTimeout(() => setSinglePdfStatus(""), 4000);
    } finally {
      window.getComputedStyle = originalGetComputedStyle;
    }
  };

  const filteredRegistrants = registrations.filter(
    (r) =>
      r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.nik.includes(searchQuery) ||
      r.phone?.includes(searchQuery) ||
      r.kabKota.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredAttendance = attendance.filter((a) => {
    const regMatch = registrations.find((r) => r.nik === a.nik);
    const phone = regMatch ? (regMatch.phone || "") : "";
    return (
      a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.nik.includes(searchQuery) ||
      phone.includes(searchQuery)
    );
  });

  if (!isAuthorized) {
    return (
      <div className="w-full max-w-sm mx-auto bg-white rounded-2xl border border-slate-100 p-6 shadow-xl my-6 animate-fade-in">
        <div className="flex flex-col items-center text-center space-y-4 mb-6">
          <div className="p-3 bg-slate-100 text-emerald-800 rounded-xl">
            <Lock className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">Keamanan Panel Admin</h2>
            <p className="text-xs text-gray-500">Silakan masukkan kata sandi pemantau resmi Dinas</p>
          </div>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-700 uppercase tracking-widest block">
              Sandi Kunci Admin (Password)
            </label>
            <input
              type="password"
              placeholder="Masukkan Sandi Admin..."
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500"
              required
            />
            {authError && <p className="text-xs text-red-600 font-medium">{authError}</p>}
          </div>

          <button
            type="submit"
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-lg transition-all text-sm"
          >
            Masuk Panel Admin
          </button>
        </form>
      </div>
    );
  }

  const selectedRegDetail = selectedAttendanceForDetail
    ? registrations.find((r) => r.nik === selectedAttendanceForDetail.nik)
    : null;

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6">
      {/* EXPLICIT BLACK-AND-WHITE PRINT LAYOUT & PRINTER PREVIEW WITH EXCELLENT CONTROL PANEL */}
      {isPrintLayoutActive && (
        <div className="fixed inset-0 bg-white z-[99999] overflow-y-auto pt-24 pb-12 px-4 sm:px-12 text-black print:p-0 print:pt-0">
          
          {/* STICKY TOP CONTROL PANEL FOR USER EXPERIENCE (Hidden during real printing via no-print class) */}
          <div className="no-print fixed top-0 left-0 right-0 h-20 bg-slate-900 border-b border-slate-800 text-white flex flex-col sm:flex-row items-center justify-between px-6 z-[999999] shadow-2xl gap-3">
            <div className="text-left py-1 sm:py-0">
              <span className="text-[9px] bg-emerald-600 font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider">
                PRATINJAU DOKUMEN CETAK SUMBAR ({printType === "registrants" ? "PENDAFTAR" : printType === "allowance" ? "UANG SAKU" : "ABSENSI"})
              </span>
              <h3 className="text-xs sm:text-sm font-black tracking-tight text-white mt-1 uppercase">
                Arah: Portrait (Tegak) | Sesuaikan Di Dialog Printer
              </h3>
            </div>
            
            <div className="flex items-center gap-2 mb-2 sm:mb-0">
              {pdfStatus && (
                <span className="text-xs text-amber-300 font-bold animate-pulse mr-2 bg-amber-500/10 px-3 py-1.5 rounded-xl border border-amber-500/20">
                  {pdfStatus}
                </span>
              )}
              <button
                onClick={() => window.print()}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-extrabold rounded-xl shadow-md flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Cetak Printer</span>
              </button>
              
              <button
                onClick={handleDownloadPDF}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold rounded-xl shadow-md flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Simpan PDF</span>
              </button>
              
              <button
                onClick={() => setIsPrintLayoutActive(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-extrabold rounded-xl flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                <span>Tutup</span>
              </button>
            </div>
          </div>

          {/* PRINTABLE DOKUMEN CONTAINER FOR PDF GENERATION */}
          <div id="print-content-area" className="bg-white text-black font-sans max-w-4xl mx-auto p-4 md:p-8 print:p-0">
            {/* Header */}
            <div className="border-b-4 border-double border-black pb-4 text-center mb-6">
              <h1 className="text-xs sm:text-sm font-bold tracking-wide uppercase text-black">
                Pemerintah Provinsi Sumatera Barat
              </h1>
              <h2 className="text-base sm:text-lg font-extrabold tracking-wider uppercase text-black mt-0.5">
                Dinas Pemberdayaan Perempuan, Perlindungan Anak, Pengendalian Penduduk, dan Keluarga Berencana (DP3AP2KB)
              </h2>
              <p className="text-[10px] sm:text-xs font-semibold text-black mt-1">
                Jl. Rasuna Said no.74 Padang - Sumatera Barat
              </p>
            </div>

            {printType === "single-card" && selectedParticipantForCard ? (
              /* PRINT TYPE: SINGLE CARD */
              <div className="flex flex-col items-center justify-center min-h-[50vh] p-8 bg-white text-black">
                <div className="my-6 text-center">
                  <span className="text-xs font-mono uppercase tracking-widest border border-black px-3 py-1 font-bold">
                    DOKUMEN RESMI: KARTU PESERTA DIGITAL
                  </span>
                  <p className="text-xs font-bold mt-3 font-sans uppercase">
                    Kegiatan: {settings.eventTitle}
                  </p>
                  {settings.eventLocation && (
                    <p className="text-[10px] font-bold mt-1 font-sans uppercase text-gray-700">
                      Lokasi Kegiatan: {settings.eventLocation}
                    </p>
                  )}
                </div>

                {/* Card wrapper centered */}
                <div className="border border-black rounded-3xl p-6 shadow-sm bg-white inline-block max-w-sm w-full mx-auto text-black">
                  {/* Visual Header */}
                  <div 
                    className="p-6 rounded-t-2xl text-white relative overflow-hidden text-center"
                    style={{
                      backgroundColor: selectedParticipantForCard.color || "#0F6251",
                    }}
                  >
                    <div className="text-[10px] tracking-widest font-bold uppercase text-white/80">KARTU PESERTA DIGITAL</div>
                    <h3 className="text-sm font-extrabold mt-1 tracking-tight uppercase leading-tight">{settings.eventTitle}</h3>
                    <div className="text-[9px] uppercase mt-1 tracking-wider opacity-90">DP3AP2KB SUMBAR</div>
                  </div>

                  {/* Content body */}
                  <div className="p-6 bg-slate-50 border-x border-b border-slate-200 rounded-b-2xl space-y-4">
                    <div className="space-y-1.5">
                      <div className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">NAMA AJUAN</div>
                      <div className="text-sm font-black text-gray-950 uppercase">{selectedParticipantForCard.name}</div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">NIK KTP</div>
                        <div className="text-xs font-mono font-bold text-gray-850">{selectedParticipantForCard.nik}</div>
                      </div>
                      <div>
                        <div className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">NO. TELP / WA</div>
                        <div className="text-xs font-bold text-gray-850">{selectedParticipantForCard.phone || "-"}</div>
                      </div>
                    </div>

                    <div>
                      <div className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">DOMISILI DAERAH</div>
                      <div className="text-xs font-bold text-gray-850">{selectedParticipantForCard.kabKota}</div>
                    </div>

                    {/* Barcode representation */}
                    <div className="bg-white rounded-xl p-3 border border-slate-200 flex flex-col items-center justify-center">
                      <BarcodeGenerator value={selectedParticipantForCard.nik} height={38} />
                    </div>
                  </div>
                </div>

                {/* Instructions bottom */}
                <p className="text-[10px] text-gray-400 text-center uppercase tracking-wider mt-12">
                  Kartu ini merupakan tanda pengenal resmi selama acara berlangsung.
                </p>
              </div>
            ) : (
              <>
                <div className="my-6 text-center">
                  <span className="text-xs font-mono uppercase tracking-widest border border-black px-3 py-1 font-bold">
                    {printType === "registrants" ? "DOKUMEN RESMI: CETAK TABEL PENDAFTAR" : printType === "allowance" ? "DOKUMEN RESMI: TABEL PENERIMAAN UANG SAKU" : "DOKUMEN RESMI: CETAK TABEL ABSENSI"}
                  </span>
                  <p className="text-xs font-bold mt-3 font-sans uppercase">
                    Kegiatan: {settings.eventTitle}
                  </p>
                  <p className="text-[10px] font-bold font-sans uppercase mt-1">
                    Tanggal Kegiatan: {formatIndonesianDate(settings.startDate || "2026-05-21")} s/d {formatIndonesianDate(settings.startDate || "2026-05-21", (settings.durationDays || 3) - 1)}
                  </p>
                  {settings.eventLocation && (
                    <p className="text-[10px] font-bold font-sans uppercase mt-1">
                      Lokasi Kegiatan: {settings.eventLocation}
                    </p>
                  )}
                </div>

                {printType === "registrants" ? (
                  /* PRINT TYPE: REGISTRANTS TABLE */
                  <table className="w-full text-left border-collapse border border-black text-[10px]">
                    <thead>
                      <tr className="border-b border-black bg-slate-100 font-bold">
                        <th className="p-2 border border-black w-8">No</th>
                        <th className="p-2 border border-black">Nama Lengkap</th>
                        <th className="p-2 border border-black">NIK</th>
                        <th className="p-2 border border-black">No. Telp / WhatsApp</th>
                        <th className="p-2 border border-black">Domisili</th>
                        <th className="p-2 border border-black text-center font-bold">Jenis Kelamin</th>
                        <th className="p-2 border border-black w-48 text-center">Tanda Tangan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {registrations.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="p-4 text-center border border-black">Tidak ada data pendaftar.</td>
                        </tr>
                      ) : (
                        registrations.map((reg, idx) => (
                          <tr key={reg.id} className="border-b border-black">
                            <td className="p-2 border border-black text-center">{idx + 1}</td>
                            <td className="p-2 border border-black font-extrabold">{reg.name.toUpperCase()}</td>
                            <td className="p-2 border border-black font-mono">{reg.nik}</td>
                            <td className="p-2 border border-black">{reg.phone || "-"}</td>
                            <td className="p-2 border border-black">{reg.kabKota}</td>
                            <td className="p-2 border border-black text-center font-semibold align-middle">
                              {reg.gender || "Laki-laki"}
                            </td>
                            <td className="p-1 border border-black h-14 relative text-center">
                              <span className="text-[7.5px] text-gray-500 absolute top-1 left-1.5 font-bold">{idx + 1}.</span>
                              {reg.signatureBase64 ? (
                                <img
                                  src={reg.signatureBase64}
                                  alt="Tanda Tangan"
                                  className="max-h-11 max-w-full object-contain mx-auto mix-blend-multiply"
                                  referrerPolicy="no-referrer"
                                />
                              ) : null}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    {registrations.length > 0 && (
                      <tfoot>
                        <tr className="bg-slate-50 font-bold border-t border-black text-[10px]">
                          <td colSpan={6} className="p-2 border border-black text-right uppercase tracking-wider">Total Peserta Terdaftar:</td>
                          <td className="p-2 border border-black text-center font-black">{registrations.length} Orang</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                ) : printType === "allowance" ? (
                  /* PRINT TYPE: ALLOWANCE TABLE WITH BLANK SIGNATURE COLS FOR MANUAL SIGNING */
                  <table className="w-full text-left border-collapse border border-black text-[10px]">
                    <thead>
                      <tr className="border-b border-black bg-slate-100 font-bold">
                        <th className="p-2 border border-black w-8">No</th>
                        <th className="p-2 border border-black">Nama Lengkap</th>
                        <th className="p-2 border border-black">NIK</th>
                        <th className="p-2 border border-black">Instansi / Kabupaten / Kota</th>
                        <th className="p-2 border border-black text-center w-36">Jumlah Penerimaan</th>
                        <th className="p-2 border border-black w-48 text-center">Tanda Tangan Manual</th>
                      </tr>
                    </thead>
                    <tbody>
                      {registrations.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-4 text-center border border-black">Tidak ada data pendaftar.</td>
                        </tr>
                      ) : (
                        registrations.map((reg, idx) => {
                          const currentAllowance = settings.allowanceAmount !== undefined ? settings.allowanceAmount : 350000;
                          return (
                            <tr key={reg.id} className="border-b border-black">
                              <td className="p-2 border border-black text-center">{idx + 1}</td>
                              <td className="p-2 border border-black font-extrabold">{reg.name.toUpperCase()}</td>
                              <td className="p-2 border border-black font-mono">{reg.nik}</td>
                              <td className="p-2 border border-black">{reg.kabKota}</td>
                              <td className="p-2 border border-black text-center font-bold">
                                {currentAllowance !== 0 && currentAllowance !== undefined
                                  ? `Rp ${currentAllowance.toLocaleString("id-ID")},-`
                                  : "Rp ............................. ,-"}
                              </td>
                              {/* Signature boxes stacked staggered for manual signing - completely empty as requested */}
                              <td className="p-2 border border-black h-16 relative text-left align-top">
                                <span className="text-[8px] text-gray-500 font-bold">{idx + 1}.</span>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                    {registrations.length > 0 && (
                      <tfoot>
                        <tr className="bg-slate-50 font-bold border-t border-black text-[10px]">
                          <td colSpan={4} className="p-2 border border-black text-right uppercase tracking-wider">Total Penerima:</td>
                          <td className="p-2 border border-black text-center font-black">{registrations.length} Orang</td>
                          <td className="p-2 border border-black text-center font-black">
                            {settings.allowanceAmount !== undefined && settings.allowanceAmount !== 0
                              ? `Rp ${(registrations.length * settings.allowanceAmount).toLocaleString("id-ID")} ,-`
                              : "Rp ............................. ,-"}
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                ) : (
                  /* PRINT TYPE: ATTENDANCE TABLE WITH SIGNATURE PREVIEWS CONSIDERING ALL DAYS AND PRE-EXISTING REGISTERED LIST */
                  <table className="w-full text-left border-collapse border border-black text-[10px]">
                    <thead>
                      <tr className="border-b border-black bg-slate-100 font-bold">
                        <th className="p-2 border border-black w-8">No</th>
                        <th className="p-2 border border-black">Nama Lengkap</th>
                        <th className="p-2 border border-black">NIK</th>
                        <th className="p-2 border border-black">No. HP / WA</th>
                        <th className="p-2 border border-black">Kabupaten/Kota/Instansi</th>
                        {/* Dynamic columns for Day 1 to Day durationDays */}
                        {Array.from({ length: settings.durationDays || 3 }).map((_, i) => (
                          <th key={i} className="p-2 border border-black text-center w-32">
                            Hari {i + 1}
                            <span className="block text-[8px] font-normal leading-tight font-mono">
                              ({formatIndonesianDate(settings.startDate || "2026-05-21", i)})
                            </span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {registrations.length === 0 ? (
                        <tr>
                          <td colSpan={5 + (settings.durationDays || 3)} className="p-4 text-center border border-black text-gray-500 italic">
                            Tidak ada data pendaftar.
                          </td>
                        </tr>
                      ) : (
                        registrations.map((reg, idx) => {
                          return (
                            <tr key={reg.id} className="border-b border-black">
                              <td className="p-2 border border-black text-center font-mono">{idx + 1}</td>
                              <td className="p-2 border border-black font-extrabold">{reg.name.toUpperCase()}</td>
                              <td className="p-2 border border-black font-mono text-[9px]">{reg.nik}</td>
                              <td className="p-2 border border-black font-mono text-[9px]">{reg.phone || "-"}</td>
                              <td className="p-2 border border-black text-slate-800">{reg.kabKota}</td>
                              {/* Display status or signature for each day */}
                              {Array.from({ length: settings.durationDays || 3 }).map((_, i) => {
                                const dayNum = i + 1;
                                // Find attendance matching this registration's NIK and current day
                                const attMatch = attendance.find(
                                  (att) => att.nik.trim().replace(/\D/g, "") === reg.nik.trim().replace(/\D/g, "") && att.day === dayNum
                                );

                                return (
                                  <td key={i} className="p-1 border border-black h-16 text-center relative align-middle w-32 bg-white">
                                    {attMatch ? (
                                      <div className="flex flex-col items-center justify-center h-full">
                                        {attMatch.signatureBase64 ? (
                                          <img
                                            src={attMatch.signatureBase64}
                                            alt={`Paraf Hari ${dayNum}`}
                                            className="max-h-12 max-w-[110px] object-contain mx-auto mix-blend-multiply"
                                            referrerPolicy="no-referrer"
                                          />
                                        ) : (
                                          <span className="text-emerald-700 font-bold text-[8px] uppercase">Hadir</span>
                                        )}
                                      </div>
                                    ) : (
                                      <span className="text-red-500 font-semibold text-[8px] uppercase block leading-tight">
                                        Belum Absen
                                      </span>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                    {registrations.length > 0 && (
                      <tfoot>
                        <tr className="bg-slate-50 font-bold border-t border-black text-[10px]">
                          <td colSpan={5} className="p-2 border border-black text-right uppercase tracking-wider">Total Peserta Terdaftar:</td>
                          <td colSpan={settings.durationDays || 3} className="p-2 border border-black text-center font-black">{registrations.length} Orang</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                )}

                {/* BLOK TANDA TANGAN KEPALA BIDANG / PPTK */}
                <div className="mt-12 flex justify-end text-black text-xs print:break-inside-avoid">
                  <div className="w-80 text-center space-y-1">
                    <p className="font-sans">
                      Padang, {(() => {
                        const eventStartDate = settings.startDate || "2026-05-21";
                        if (printType === "registrants") {
                          return formatIndonesianDate(eventStartDate);
                        } else {
                          const duration = settings.durationDays || 3;
                          return formatIndonesianDate(eventStartDate, duration - 1);
                        }
                      })()}
                    </p>
                    <p className="font-bold font-sans">
                      Kepala Bidang/PPTK
                    </p>
                    <div className="h-24"></div> {/* Area Space for Stamp and Signature */}
                    <p className="font-extrabold font-sans underline uppercase tracking-wide">
                      {settings.kepalaBidangName || "..................................................."}
                    </p>
                    <p className="font-semibold font-sans text-[11px] text-gray-800">
                      NIP. {settings.kepalaBidangNip || "..................................................."}
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* DASHBOARD CONTAINER SYSTEM (NON-PRINT VIEW) */}
      <div className="bg-slate-900 text-white rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
        {/* Background mesh glow */}
        <div className="absolute top-[-20%] right-[-10%] w-96 h-96 bg-gradient-to-br from-emerald-500/20 to-teal-500/10 blur-[100px] pointer-events-none rounded-full" />

        {/* Unified Clean Content Dashboard Workspace */}
        <div className="space-y-6 relative z-10 w-full">
            
            {/* Header section inside the workspace */}
            <div className="pb-4 border-b border-white/10 flex items-center justify-between">
              <div>
                <span className="text-[9px] uppercase font-bold tracking-widest text-emerald-400">Panel Manajemen</span>
                <h1 className="text-base sm:text-lg font-black tracking-tight text-white mt-0.5 capitalize">
                  {activeTab === "stats" && "Statistik & Visualisasi Grafik Real-time"}
                  {activeTab === "registrants" && "Daftar Administrasi Pendaftar Bimtek"}
                  {activeTab === "attendance" && "Daftar Absensi & Kehadiran Peserta Harian"}
                  {activeTab === "allowance" && "Rekapitulasi Penerimaan Uang Saku Digital"}
                  {activeTab === "certificates" && "Sertifikasi Digital & Distribusi Mandiri"}
                  {activeTab === "settings" && "Konfigurasi Program Kegiatan & Informasi Bimtek"}
                </h1>
              </div>
            </div>

            {/* Tab contents transition container */}
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.18 }}
              >
            {activeTab === "stats" && (
              <div className="space-y-8 animate-fade-in">
                {/* 3-Col numerical stats */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-slate-800/50 hover:bg-slate-800 border border-white/5 p-6 rounded-2xl flex items-center space-x-4 transition-all">
                    <div className="p-4 bg-emerald-500/10 text-emerald-400 rounded-xl">
                      <Users className="w-7 h-7" />
                    </div>
                    <div>
                      <h4 className="text-xs font-mono uppercase tracking-wider text-slate-400">Pendaftar Terverifikasi</h4>
                      <p className="text-3xl font-extrabold text-white mt-1">
                        {registrations.length} <span className="text-xs font-normal text-slate-400">dari {settings.targetParticipants !== undefined ? settings.targetParticipants : 50} target</span>
                      </p>
                    </div>
                  </div>

                  <div className="bg-slate-800/50 hover:bg-slate-800 border border-white/5 p-6 rounded-2xl flex items-center space-x-4 transition-all">
                    <div className="p-4 bg-teal-500/10 text-teal-400 rounded-xl">
                      <CheckSquare className="w-7 h-7" />
                    </div>
                    <div>
                      <h4 className="text-xs font-mono uppercase tracking-wider text-slate-400">Log Absensi Terinput</h4>
                      <p className="text-3xl font-extrabold text-white mt-1">{attendance.length} <span className="text-xs font-normal text-slate-400">kali hadir</span></p>
                    </div>
                  </div>

                  <div className="bg-slate-800/50 hover:bg-slate-800 border border-white/5 p-6 rounded-2xl flex items-center space-x-4 transition-all">
                    <div className="p-4 bg-blue-500/10 text-blue-400 rounded-xl">
                      <Calendar className="w-7 h-7" />
                    </div>
                    <div>
                      <h4 className="text-xs font-mono uppercase tracking-wider text-slate-400">Durasi Event</h4>
                      <p className="text-3xl font-extrabold text-white mt-1">{settings.durationDays} <span className="text-xs font-normal text-slate-400">Hari Bimtek</span></p>
                    </div>
                  </div>
                </div>

                {/* 3-Col SVG Donut/Pie Charts row */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-fade-in">
                  <StatPieChart
                    title="Persentase Target Pendaftaran"
                    value={registrations.length}
                    total={settings.targetParticipants && settings.targetParticipants > 0 ? settings.targetParticipants : 50}
                    strokeColor="#d97706"
                    label={settings.targetParticipants && settings.targetParticipants > 0 ? `Target: ${settings.targetParticipants} Orang` : "Target belum diatur (dianggap 50)"}
                  />
                  <StatPieChart
                    title="Kehadiran Peserta Bimtek"
                    value={new Set(attendance.map(a => a.nik.trim().toLowerCase())).size}
                    total={registrations.length > 0 ? registrations.length : 1}
                    strokeColor="#10b981"
                    label="Telah Melakukan Absensi Kehadiran"
                  />
                  <StatPieChart
                    title="Distribusi Sertifikat Peserta"
                    value={registrations.filter(r => r.isCertificateSent).length}
                    total={registrations.length > 0 ? registrations.length : 1}
                    strokeColor="#3b82f6"
                    label="Sertifikat Sukses Dikirim"
                  />
                </div>

                {/* Map/Regency Origins graph chart widgets */}
                <div className="bg-slate-800/30 border border-white/5 rounded-2xl p-6">
                  <h3 className="text-sm font-bold uppercase tracking-wider mb-6 text-emerald-400 flex items-center space-x-2">
                    <Database className="w-4 h-4" />
                    <span>Persebaran Domisili Peserta Sumatera Barat (Kabupaten / Kota)</span>
                  </h3>

                  {registrations.length === 0 ? (
                    <div className="text-center py-12 text-slate-400 text-xs">
                      Belum ada data pendaftar. Menunggu peserta melengkapi pendaftaran.
                    </div>
                  ) : (
                    <div className="space-y-4 max-w-2xl">
                      {getKabKotaStats().map((item, idx) => (
                        <div key={item.name} className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs font-semibold">
                            <span className="text-slate-200 flex items-center space-x-1.5">
                              <span className="text-slate-500 w-4 font-mono">{idx + 1}.</span>
                              <span>{item.name}</span>
                            </span>
                            <span className="text-emerald-400 font-bold">{item.count} Peserta ({item.percentage}%)</span>
                          </div>
                          <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${item.percentage}%` }}
                              transition={{ duration: 0.6, delay: idx * 0.05 }}
                              className="bg-gradient-to-r from-emerald-600 to-teal-400 h-full rounded-full"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === "registrants" && (
              <div className="space-y-6">
                {/* Header widget */}
                <div className="bg-slate-800/25 border border-white/5 p-6 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 animate-fade-in">
                  <div className="space-y-1 text-center sm:text-left">
                    <h3 className="text-lg font-black text-white flex items-center justify-center sm:justify-start gap-2">
                      <Compass className="w-5 h-5 text-emerald-400" />
                      Tabel Pendaftar Resmi Kegiatan
                    </h3>
                    <p className="text-xs text-slate-400 max-w-xl leading-relaxed">
                      Daftar seluruh pendaftar yang terdaftar secara resmi pada kegiatan Bimtek {settings.eventTitle}. Anda dapat mencetak tabel pendaftar ini untuk arsip fisik maupun verifikasi data dinas.
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center space-x-2">
                    <button
                      onClick={() => triggerPrintReport("registrants")}
                      className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black rounded-xl transition-all shadow-md flex items-center space-x-1.5 active:scale-95 cursor-pointer"
                    >
                      <Printer className="w-4 h-4" />
                      <span>Cetak Tabel Pendaftar</span>
                    </button>
                  </div>
                </div>

                {/* Search query row */}
                <div className="flex items-center bg-slate-800/80 border border-white/5 rounded-xl px-4 py-2">
                  <Search className="w-4 h-4 text-slate-400 mr-2" />
                  <input
                    type="text"
                    placeholder="Saring berdasarkan nama, NIK, No. HP, kabupaten/kota..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="bg-transparent border-none text-white focus:outline-none text-xs sm:text-sm w-full"
                  />
                </div>

                {/* Table */}
                <div className="overflow-x-auto rounded-xl border border-white/5 bg-slate-800/10">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-white/10 bg-slate-800/30 text-xs text-slate-400 uppercase tracking-wider">
                        <th className="p-4 font-bold">No</th>
                        <th className="p-4 font-bold">Peserta</th>
                        <th className="p-4 font-bold">NIK</th>
                        <th className="p-4 font-bold">No. HP / WA</th>
                        <th className="p-4 font-bold">Domisili</th>
                        <th className="p-4 font-bold">Tanggal Daftar</th>
                        <th className="p-4 font-bold text-center">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-xs">
                      {filteredRegistrants.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="text-center p-8 text-slate-400 italic">
                            Data pendaftar kosong atau tidak ditemukan saringan pencarian.
                          </td>
                        </tr>
                      ) : (
                        filteredRegistrants.map((reg, idx) => (
                          <tr key={reg.id} className="hover:bg-slate-800/30 text-white">
                            <td className="p-4 font-mono text-slate-500">{idx + 1}</td>
                            <td className="p-4">
                              <div className="font-bold text-slate-100">{reg.name.toUpperCase()}</div>
                            </td>
                            <td className="p-4 font-mono">{reg.nik}</td>
                            <td className="p-4 flex items-center space-x-1.5 font-semibold text-emerald-400">
                              <Phone className="w-3.5 h-3.5 shrink-0" />
                              <span>{reg.phone || "-"}</span>
                            </td>
                            <td className="p-4 text-slate-300 font-semibold">{reg.kabKota}</td>
                            <td className="p-4 text-slate-400">
                              {new Date(reg.registeredAt).toLocaleDateString("id-ID", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              })}
                            </td>
                            <td className="p-4 text-center flex items-center justify-center">
                              {deleteRegConfirmId === reg.id ? (
                                <div className="flex items-center space-x-1.5 bg-red-500/10 border border-red-500/20 p-1 rounded-lg">
                                  <span className="text-[10px] text-red-400 font-bold px-1 uppercase tracking-wider">Hapus?</span>
                                  <button
                                    onClick={() => {
                                      onDeleteRegistration(reg.id);
                                      setDeleteRegConfirmId(null);
                                    }}
                                    className="bg-red-600 hover:bg-red-500 text-white font-bold text-[10px] px-2 py-0.5 rounded transition-all uppercase animate-pulse"
                                    title="Ya, Hapus Peserta"
                                  >
                                    Ya
                                  </button>
                                  <button
                                    onClick={() => setDeleteRegConfirmId(null)}
                                    className="bg-slate-700 hover:bg-slate-600 text-slate-200 font-bold text-[10px] px-2 py-0.5 rounded transition-all uppercase"
                                    title="Batalkan"
                                  >
                                    Batal
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center space-x-2">
                                  <button
                                    onClick={() => {
                                      setSelectedParticipantForCard(reg);
                                    }}
                                    className="text-emerald-400 hover:text-emerald-300 p-1 bg-emerald-500/10 hover:bg-emerald-500/25 rounded transition-all inline-block"
                                    title="Lihat Kartu"
                                  >
                                    <Eye className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => {
                                      openCertificateModal(reg);
                                    }}
                                    className={`p-1 rounded transition-all inline-block ${
                                      (settings.isCertificateReleased || reg.isCertificateSent || reg.certificateBase64)
                                        ? "text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/25 animate-pulse"
                                        : "text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/25"
                                    }`}
                                    title={(settings.isCertificateReleased || reg.isCertificateSent || reg.certificateBase64) ? "Unduh / Cetak Sertifikat Resmi" : "View / Pratinjau Sertifikat Peserta (Draft)"}
                                  >
                                    <Award className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => {
                                      setDeleteRegConfirmId(reg.id);
                                    }}
                                    className="text-red-400 hover:text-red-300 p-1 bg-red-500/10 hover:bg-red-500/25 rounded transition-all inline-block"
                                    title="Hapus"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Total participants info at the bottom of the table */}
                <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-800/20 border border-white/5 p-4 rounded-xl text-xs text-slate-300 font-medium">
                  <div className="flex items-center space-x-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span>Menampilkan <strong>{filteredRegistrants.length}</strong> dari <strong>{registrations.length}</strong> peserta terdaftar</span>
                  </div>
                  <div className="text-sm font-bold text-slate-200">
                    Saat ini Terdaftar: <span className="text-emerald-400 font-black text-base mx-1">{registrations.length} Orang Peserta</span> dari <span className="text-slate-400 font-bold ml-1">{settings.targetParticipants !== undefined ? settings.targetParticipants : 50} orang peserta</span>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "attendance" && (
              <div className="space-y-6">
                {/* Header widget */}
                <div className="bg-slate-800/25 border border-white/5 p-6 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 animate-fade-in">
                  <div className="space-y-1 text-center sm:text-left">
                    <h3 className="text-lg font-black text-white flex items-center justify-center sm:justify-start gap-2">
                      <CheckSquare className="w-5 h-5 text-teal-400" />
                      Tabel Kehadiran (Absensi) Peserta
                    </h3>
                    <p className="text-xs text-slate-400 max-w-xl leading-relaxed">
                      Daftar rekaman absensi dan paraf digital kehadiran peserta Bimtek {settings.eventTitle}. Anda dapat mencetak tabel absensi ini untuk pelaporan pertanggungjawaban kegiatan.
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center space-x-2">
                    <button
                      onClick={() => triggerPrintReport("attendance")}
                      className="px-4 py-2.5 bg-teal-600 hover:bg-teal-500 text-white text-xs font-black rounded-xl transition-all shadow-md flex items-center space-x-1.5 active:scale-95 cursor-pointer"
                    >
                      <Printer className="w-4 h-4" />
                      <span>Cetak Tabel Absensi</span>
                    </button>
                  </div>
                </div>

                {/* Search query row */}
                <div className="flex items-center bg-slate-800/80 border border-white/5 rounded-xl px-4 py-2">
                  <Search className="w-4 h-4 text-slate-400 mr-2" />
                  <input
                    type="text"
                    placeholder="Saring berdasarkan nama, NIK, No. HP, dll..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="bg-transparent border-none text-white focus:outline-none text-xs sm:text-sm w-full"
                  />
                </div>

                {/* Table */}
                <div className="overflow-x-auto rounded-xl border border-white/5 bg-slate-800/10">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-white/10 bg-slate-800/30 text-xs text-slate-400 uppercase tracking-wider">
                        <th className="p-4 font-bold">No</th>
                        <th className="p-4 font-bold">Peserta</th>
                        <th className="p-4 font-bold">Hari Ke</th>
                        <th className="p-4 font-bold">Tanda Tangan Digital</th>
                        <th className="p-4 font-bold">Tanggal Absen</th>
                        <th className="p-4 font-bold text-center">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-xs">
                      {filteredAttendance.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="text-center p-8 text-slate-400 italic">
                            Data absensi kosong atau tidak ditemukan saringan pencarian.
                          </td>
                        </tr>
                      ) : (
                        filteredAttendance.map((att, idx) => {
                          const rMatch = registrations.find((r) => r.nik === att.nik);
                          return (
                            <tr key={att.id} className="hover:bg-slate-800/30 text-white">
                              <td className="p-4 font-mono text-slate-500">{idx + 1}</td>
                              <td className="p-4">
                                <div className="font-bold text-slate-100">{att.name.toUpperCase()}</div>
                                <div className="text-[10px] text-slate-400 font-mono">NIK: {att.nik} | Telp: {rMatch ? rMatch.phone || "-" : "-"}</div>
                              </td>
                              <td className="p-4 font-mono">
                                <span className="bg-teal-500/10 text-teal-300 font-bold px-2 py-1 rounded">
                                  Hari {att.day}
                                </span>
                              </td>
                              <td className="p-4">
                                <div className="bg-white rounded-lg p-1 w-24 border border-white/10 h-10 flex items-center justify-center">
                                  {att.signatureBase64 && (
                                    <img
                                      src={att.signatureBase64}
                                      alt="Sign preview"
                                      className="max-w-full max-h-full object-contain mix-blend-multiply"
                                    />
                                  )}
                                </div>
                              </td>
                              <td className="p-4 text-slate-400 font-medium">
                                {formatIndonesianDate(settings.startDate || "2026-05-21", att.day - 1)}
                              </td>
                              <td className="p-4 text-center flex items-center justify-center">
                                {deleteAttConfirmId === att.id ? (
                                  <div className="flex items-center space-x-1.5 bg-red-500/10 border border-red-500/20 p-1 rounded-lg">
                                    <span className="text-[10px] text-red-400 font-bold px-1 uppercase tracking-wider">Hapus?</span>
                                    <button
                                      onClick={() => {
                                        onDeleteAttendance(att.id);
                                        setDeleteAttConfirmId(null);
                                      }}
                                      className="bg-red-650 hover:bg-red-600 text-white font-bold text-[10px] px-2 py-0.5 rounded transition-all uppercase animate-pulse"
                                      title="Ya, Hapus Absensi"
                                    >
                                      Ya
                                    </button>
                                    <button
                                      onClick={() => setDeleteAttConfirmId(null)}
                                      className="bg-slate-700 hover:bg-slate-600 text-slate-200 font-bold text-[10px] px-2 py-0.5 rounded transition-all uppercase"
                                      title="Batalkan"
                                    >
                                      Batal
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center space-x-2">
                                    <button
                                      onClick={() => {
                                        setSelectedAttendanceForDetail(att);
                                      }}
                                      className="text-emerald-400 hover:text-emerald-300 p-1 bg-emerald-500/10 hover:bg-emerald-500/25 rounded transition-all inline-block"
                                      title="Lihat Detail Absensi"
                                    >
                                      <Eye className="w-4 h-4" />
                                    </button>
                                    <button
                                      onClick={() => {
                                        setDeleteAttConfirmId(att.id);
                                      }}
                                      className="text-red-400 hover:text-red-300 p-1 bg-red-500/10 hover:bg-red-500/25 rounded transition-all inline-block"
                                      title="Hapus"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Total attendance info at the bottom of the table */}
                <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-800/20 border border-white/5 p-4 rounded-xl text-xs text-slate-300 font-medium">
                  <div className="flex items-center space-x-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-teal-500 animate-pulse"></span>
                    <span>Menampilkan <strong>{filteredAttendance.length}</strong> dari <strong>{attendance.length}</strong> log kehadiran</span>
                  </div>
                  <div className="text-sm font-bold text-slate-200">
                    Total Kehadiran: <span className="text-teal-400 font-black text-base ml-1">{attendance.length}</span> kali hadir
                  </div>
                </div>
              </div>
            )}

            {activeTab === "allowance" && (
              <div className="space-y-6 animate-fade-in text-slate-200">
                {/* Header widget */}
                <div className="bg-slate-800/25 border border-white/5 p-6 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="space-y-1 text-center sm:text-left">
                    <h3 className="text-lg font-black text-white flex items-center justify-center sm:justify-start gap-2">
                      <Award className="w-5 h-5 text-yellow-400" />
                      Tabel Penerimaan Uang Saku Peserta
                    </h3>
                    <p className="text-xs text-slate-400 max-w-xl leading-relaxed">
                      Daftar penerimaan uang saku untuk seluruh peserta yang terdaftar secara resmi pada kegiatan Bimtek {settings.eventTitle}. Anda dapat mencetak tabel ini untuk ditandatangani secara manual oleh peserta.
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center space-x-2">
                    <button
                      onClick={() => {
                        setPrintType("allowance");
                        setIsPrintLayoutActive(true);
                      }}
                      className="px-4 py-2.5 bg-yellow-600 hover:bg-yellow-500 text-white text-xs font-black rounded-xl transition-all shadow-md flex items-center space-x-1.5 active:scale-95 cursor-pointer"
                    >
                      <Printer className="w-4 h-4" />
                      <span>Cetak Tabel Uang Saku</span>
                    </button>
                  </div>
                </div>

                {/* Search query field representing current active list filtering */}
                <div className="bg-slate-800/15 border border-white/5 p-4 rounded-xl flex flex-col sm:flex-row items-center gap-4">
                  <div className="w-full sm:w-80 relative shrink-0">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      type="text"
                      placeholder="Cari penerima berdasarkan nama/NIK..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-xs text-white"
                    />
                  </div>
                  <div className="text-xs text-slate-400">
                    Menampilkan <strong className="text-white">{(registrations.filter(r => r.name.toLowerCase().includes(searchQuery.toLowerCase()) || r.nik.includes(searchQuery))).length}</strong> dari <strong className="text-white">{registrations.length}</strong> peserta terdaftar
                  </div>
                </div>

                {/* Active Table with amount description */}
                <div className="bg-slate-900/45 border border-white/5 rounded-2xl overflow-hidden shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-800/40 border-b border-slate-700/50 text-slate-350 font-bold uppercase tracking-wider">
                          <th className="p-4 w-12 text-center">No</th>
                          <th className="p-4">Nama Lengkap</th>
                          <th className="p-4">NIK (KTP)</th>
                          <th className="p-4">Instansi / Kabupaten / Kota</th>
                          <th className="p-4 text-center">Estimasi Penerimaan</th>
                          <th className="p-4 text-center">Kolom Tanda Tangan</th>
                        </tr>
                      </thead>
                      <tbody>
                        {registrations.filter(r => r.name.toLowerCase().includes(searchQuery.toLowerCase()) || r.nik.includes(searchQuery)).length === 0 ? (
                          <tr>
                            <td colSpan={6} className="p-12 text-center text-slate-500 font-medium italic">Tidak ada data pendaftar yang cocok dengan pencarian.</td>
                          </tr>
                        ) : (
                          registrations.filter(r => r.name.toLowerCase().includes(searchQuery.toLowerCase()) || r.nik.includes(searchQuery)).map((reg, idx) => (
                            <tr key={reg.id} className="border-b border-white/5 hover:bg-white/5 transition-all">
                              <td className="p-4 text-center text-slate-400 font-semibold">{idx + 1}</td>
                              <td className="p-4 font-black text-slate-100">{reg.name.toUpperCase()}</td>
                              <td className="p-4 font-mono font-semibold text-slate-300">{reg.nik}</td>
                              <td className="p-4 font-semibold text-slate-300">{reg.kabKota}</td>
                              <td className="p-4 text-center text-emerald-400 font-extrabold">
                                {settings.allowanceAmount !== undefined && settings.allowanceAmount !== 0 ? (
                                  `Rp ${settings.allowanceAmount.toLocaleString("id-ID")},-`
                                ) : (
                                  <span className="text-slate-500 font-medium italic text-xs">Isi Manual saat Cetak</span>
                                )}
                              </td>
                              <td className="p-4 text-center">
                                <span className="inline-block py-1.5 px-3 rounded-lg border border-slate-700 bg-slate-800/30 text-[10px] text-slate-400 font-medium font-mono select-none">
                                  Manual saat Cetak (Kosong)
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "certificates" && (
              <div className="space-y-6 animate-fade-in text-slate-200">
                {/* Header widget */}
                <div className="bg-slate-800/25 border border-white/5 p-6 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="space-y-1 text-center sm:text-left">
                    <h3 className="text-lg font-black text-white flex items-center justify-center sm:justify-start gap-2">
                      <Award className="w-5 h-5 text-yellow-400 font-bold" />
                      Cetak & Kirim Sertifikat Otomatis
                    </h3>
                    <p className="text-xs text-slate-400 max-w-xl leading-relaxed">
                      Kirim sertifikat secara otomatis kepada seluruh peserta Bimtek {settings.eventTitle}. Ketika sertifikat dirilis, peserta dapat mengunduh sertifikat digital masing-masing.
                    </p>
                  </div>
                </div>

                <>
                    {/* Status & Toggle Controls */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="bg-slate-800/25 border border-white/5 p-6 rounded-2xl space-y-4 flex flex-col justify-between">
                        <div className="space-y-2">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">
                            Status Rilis Sertifikat
                          </span>
                          <div className="flex items-center gap-2.5">
                            <span className={`w-3 h-3 rounded-full ${settings.isCertificateReleased ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`} />
                            <h4 className="text-base font-black text-white">
                              {settings.isCertificateReleased
                                ? "Sertifikat Sudah Dirilis & Aktif"
                                : "Status Draft (Belum Dirilis)"}
                            </h4>
                          </div>
                          <p className="text-xs text-slate-400 leading-relaxed">
                            {settings.isCertificateReleased
                              ? "Seluruh peserta yang terdaftar resmi kini dapat langsung melihat, mencetak, dan mengunduh sertifikat digital mereka secara mandiri pada menu 'Kartu Peserta & Sertifikat'."
                              : "Sertifikat masih disembunyikan. Peserta tidak dapat melihat atau mengunduh sertifikat digital mereka hingga Anda mengklik aktifkan rilis sertifikat di bawah."}
                          </p>
                        </div>

                        <div className="pt-2">
                          {settings.isCertificateReleased ? (
                            <button
                              disabled={isRevokingCerts}
                              onClick={() => setShowCertRevokeConfirm(true)}
                              className="w-full sm:w-auto px-5 py-3 bg-red-600 hover:bg-red-500 hover:shadow-lg hover:shadow-red-900/10 active:scale-95 text-white text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                            >
                              <X className="w-4 h-4" />
                              <span>Batalkan Rilis (Kunci / Tarik Sertifikat)</span>
                            </button>
                          ) : (
                            <button
                              disabled={isReleasingCerts}
                              onClick={() => setShowCertReleaseConfirm(true)}
                              className="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-700 hover:shadow-lg active:scale-95 text-white text-xs font-black rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                            >
                              <CheckCircle className="w-4 h-4 text-emerald-200 shrink-0" />
                              <span>🚀 Kirim Sertifikat Otomatis ke Seluruh Peserta</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* General overview box - replaced with custom progress indicator */}
                      <div className="bg-slate-800/25 border border-white/5 p-6 rounded-2xl flex flex-col justify-between">
                        <div className="space-y-4">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">
                            Informasi Pengiriman Sertifikat
                          </span>
                          
                          <div className="space-y-4">
                            <div className="flex justify-between items-end">
                              <div>
                                <p className="text-[10px] text-slate-400 uppercase font-bold">Status Pendistribusian</p>
                                <p className="text-2xl font-black text-white mt-1">
                                  {registrations.filter((reg) => settings.isCertificateReleased || reg.isCertificateSent || reg.certificateBase64).length} <span className="text-xs font-semibold text-slate-450">dari</span> {registrations.length} <span className="text-xs font-semibold text-slate-450">peserta</span>
                                </p>
                              </div>
                              <span className="text-xs font-extrabold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/25">
                                {registrations.length > 0 
                                  ? Math.round((registrations.filter((reg) => settings.isCertificateReleased || reg.isCertificateSent || reg.certificateBase64).length / registrations.length) * 100) 
                                  : 0}% Dikirim
                              </span>
                            </div>

                            {/* Beautiful visual progress indicator bar */}
                            <div className="w-full bg-slate-950/40 border border-white/5 h-3 rounded-full overflow-hidden p-0.5">
                              <div
                                className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full rounded-full transition-all duration-500"
                                style={{
                                  width: `${registrations.length > 0 
                                    ? (registrations.filter((reg) => settings.isCertificateReleased || reg.isCertificateSent || reg.certificateBase64).length / registrations.length) * 100 
                                    : 0}%`
                                }}
                              />
                            </div>

                            <p className="text-[11px] text-slate-400 leading-relaxed pt-3 border-t border-white/5">
                              {settings.isCertificateReleased
                                ? "✨ Pengiriman otomatis aktif: Seluruh pendaftar mandiri dapat mengunduh sertifikat resmi langsung pada halaman beranda."
                                : registrations.filter((reg) => reg.isCertificateSent || reg.certificateBase64).length > 0
                                  ? `Draf Rilis: Sebanyak ${registrations.filter((reg) => reg.isCertificateSent || reg.certificateBase64).length} peserta telah dikirim secara manual. Klik tombol kirim otomatis di samping kiri untuk merilis semua sekaligus.`
                                  : "Draft Rilis: Belum ada sertifikat digital yang dipublikasikan/dikirim kepada pendaftar."
                              }
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* CONFIGURATION PANEL FOR CERTIFICATE TEXT POSITIONING */}
                    <div className="bg-slate-800/25 border border-white/5 p-6 rounded-2xl space-y-6">
                      <div className="border-b border-white/5 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div>
                          <h4 className="text-sm font-black text-white flex items-center gap-2">
                            <Sliders className="w-4 h-4 text-amber-500" />
                            Pengaturan Posisi Teks pada Sertifikat
                          </h4>
                          <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
                            Tentukan tata letak koordinat penulisan Nomor Sertifikat, Nama Peserta, dan Tanggal Kegiatan pada template sertifikat. Koordinat didasarkan pada dimensi standar kanvas sertifikat <strong>1920 x 1080 piksel</strong>.
                          </p>
                        </div>
                        <div className="shrink-0">
                          <button
                            type="button"
                            onClick={() => setIsCertLayoutLocked(!isCertLayoutLocked)}
                            className={`flex items-center space-x-2 py-2 px-4 rounded-xl text-xs font-bold border transition-all cursor-pointer select-none active:scale-95 ${
                              isCertLayoutLocked
                                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20"
                                : "bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20 animate-pulse"
                            }`}
                            title={isCertLayoutLocked ? "Klik untuk mengaktifkan perubahan posisi" : "Klik untuk mengunci agar tidak bergeser secara tidak sengaja"}
                          >
                            {isCertLayoutLocked ? (
                              <>
                                <Lock className="w-3.5 h-3.5 shrink-0" />
                                <span>🔒 Geser Terkunci (Aman)</span>
                              </>
                            ) : (
                              <>
                                <Unlock className="w-3.5 h-3.5 shrink-0" />
                                <span>🔓 Geser Aktif (Bisa Diedit)</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        {/* 1. NOMOR SERTIFIKAT */}
                        <div className={`space-y-4 p-4 rounded-xl border transition-all ${
                          isCertLayoutLocked ? "bg-slate-950/20 border-slate-900 opacity-70" : "bg-slate-900/35 border-white/5"
                        }`}>
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1">
                              1. Nomor Sertifikat {isCertLayoutLocked && <Lock className="w-3 h-3 text-slate-500 shrink-0" />}
                            </span>
                          </div>
                          
                          <div className="space-y-3">
                            <div>
                              <div className="flex justify-between text-xs mb-1">
                                <span className="text-slate-400">Posisi Horizontal (X)</span>
                                <span className={`font-semibold font-mono ${isCertLayoutLocked ? "text-slate-500" : "text-white"}`}>{certNoX} px</span>
                              </div>
                              <input
                                type="range"
                                min="0"
                                max="1920"
                                step="10"
                                value={certNoX}
                                onChange={(e) => setCertNoX(parseInt(e.target.value))}
                                disabled={isCertLayoutLocked}
                                className={`w-full h-1.5 rounded-lg appearance-none transition-all ${
                                  isCertLayoutLocked
                                    ? "bg-slate-800/40 opacity-40 cursor-not-allowed accent-slate-600"
                                    : "bg-slate-800 cursor-pointer accent-emerald-500"
                                }`}
                              />
                            </div>
 
                            <div>
                              <div className="flex justify-between text-xs mb-1">
                                <span className="text-slate-400">Posisi Vertikal (Y)</span>
                                <span className={`font-semibold font-mono ${isCertLayoutLocked ? "text-slate-500" : "text-white"}`}>{certNoY} px</span>
                              </div>
                              <input
                                type="range"
                                min="0"
                                max="1080"
                                step="10"
                                value={certNoY}
                                onChange={(e) => setCertNoY(parseInt(e.target.value))}
                                disabled={isCertLayoutLocked}
                                className={`w-full h-1.5 rounded-lg appearance-none transition-all ${
                                  isCertLayoutLocked
                                    ? "bg-slate-800/40 opacity-40 cursor-not-allowed accent-slate-600"
                                    : "bg-slate-800 cursor-pointer accent-emerald-500"
                                }`}
                              />
                            </div>
 
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-[10px] text-slate-400 block mb-1">Ukuran Font (px)</label>
                                <input
                                  type="number"
                                  value={certNoSize}
                                  onChange={(e) => setCertNoSize(parseInt(e.target.value) || 12)}
                                  disabled={isCertLayoutLocked}
                                  className={`w-full px-2.5 py-1.5 border rounded-lg text-xs font-mono text-white focus:outline-none focus:border-amber-500 transition-all ${
                                    isCertLayoutLocked
                                      ? "bg-slate-950/25 border-slate-800 text-slate-500 cursor-not-allowed"
                                      : "bg-slate-900 border-slate-700 hover:border-slate-600"
                                  }`}
                                />
                              </div>
                              <div>
                                <label className="text-[10px] text-slate-400 block mb-1">Warna Teks</label>
                                <div className="flex gap-1.5">
                                  <input
                                    type="color"
                                    value={certNoColor}
                                    onChange={(e) => setCertNoColor(e.target.value)}
                                    disabled={isCertLayoutLocked}
                                    className={`w-8 h-8 rounded-lg bg-transparent border cursor-pointer overflow-hidden transition-all ${
                                      isCertLayoutLocked ? "opacity-30 border-slate-800 cursor-not-allowed" : "border-white/10"
                                    }`}
                                  />
                                  <input
                                    type="text"
                                    value={certNoColor}
                                    onChange={(e) => setCertNoColor(e.target.value)}
                                    disabled={isCertLayoutLocked}
                                    className={`w-full px-1.5 py-1 text-center border rounded-lg text-[10px] font-mono text-white focus:outline-none transition-all ${
                                      isCertLayoutLocked
                                        ? "bg-slate-950/25 border-slate-800 text-slate-500 cursor-not-allowed"
                                        : "bg-slate-900 border-slate-700"
                                    }`}
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* 2. NAMA PESERTA */}
                        <div className={`space-y-4 p-4 rounded-xl border transition-all ${
                          isCertLayoutLocked ? "bg-slate-950/20 border-slate-900 opacity-70" : "bg-slate-900/35 border-white/5"
                        }`}>
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1">
                              2. Nama Peserta {isCertLayoutLocked && <Lock className="w-3 h-3 text-slate-500 shrink-0" />}
                            </span>
                          </div>
                          
                          <div className="space-y-3">
                            <div>
                              <div className="flex justify-between text-xs mb-1">
                                <span className="text-slate-400">Posisi Horizontal (X)</span>
                                <span className={`font-semibold font-mono ${isCertLayoutLocked ? "text-slate-500" : "text-white"}`}>{certNameX} px</span>
                              </div>
                              <input
                                type="range"
                                min="0"
                                max="1920"
                                step="10"
                                value={certNameX}
                                onChange={(e) => setCertNameX(parseInt(e.target.value))}
                                disabled={isCertLayoutLocked}
                                className={`w-full h-1.5 rounded-lg appearance-none transition-all ${
                                  isCertLayoutLocked
                                    ? "bg-slate-800/40 opacity-40 cursor-not-allowed accent-slate-600"
                                    : "bg-slate-800 cursor-pointer accent-emerald-500"
                                }`}
                              />
                            </div>

                            <div>
                              <div className="flex justify-between text-xs mb-1">
                                <span className="text-slate-400">Posisi Vertikal (Y)</span>
                                <span className={`font-semibold font-mono ${isCertLayoutLocked ? "text-slate-500" : "text-white"}`}>{certNameY} px</span>
                              </div>
                              <input
                                type="range"
                                min="0"
                                max="1080"
                                step="10"
                                value={certNameY}
                                onChange={(e) => setCertNameY(parseInt(e.target.value))}
                                disabled={isCertLayoutLocked}
                                className={`w-full h-1.5 rounded-lg appearance-none transition-all ${
                                  isCertLayoutLocked
                                    ? "bg-slate-800/40 opacity-40 cursor-not-allowed accent-slate-600"
                                    : "bg-slate-800 cursor-pointer accent-emerald-500"
                                }`}
                              />
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-[10px] text-slate-400 block mb-1">Ukuran Font (px)</label>
                                <input
                                  type="number"
                                  value={certNameSize}
                                  onChange={(e) => setCertNameSize(parseInt(e.target.value) || 20)}
                                  disabled={isCertLayoutLocked}
                                  className={`w-full px-2.5 py-1.5 border rounded-lg text-xs font-mono text-white focus:outline-none focus:border-amber-500 transition-all ${
                                    isCertLayoutLocked
                                      ? "bg-slate-950/25 border-slate-800 text-slate-500 cursor-not-allowed"
                                      : "bg-slate-900 border-slate-700 hover:border-slate-600"
                                  }`}
                                />
                              </div>
                              <div>
                                <label className="text-[10px] text-slate-400 block mb-1">Warna Teks</label>
                                <div className="flex gap-1.5">
                                  <input
                                    type="color"
                                    value={certNameColor}
                                    onChange={(e) => setCertNameColor(e.target.value)}
                                    disabled={isCertLayoutLocked}
                                    className={`w-8 h-8 rounded-lg bg-transparent border cursor-pointer overflow-hidden transition-all ${
                                      isCertLayoutLocked ? "opacity-30 border-slate-800 cursor-not-allowed" : "border-white/10"
                                    }`}
                                  />
                                  <input
                                    type="text"
                                    value={certNameColor}
                                    onChange={(e) => setCertNameColor(e.target.value)}
                                    disabled={isCertLayoutLocked}
                                    className={`w-full px-1.5 py-1 text-center border rounded-lg text-[10px] font-mono text-white focus:outline-none transition-all ${
                                      isCertLayoutLocked
                                        ? "bg-slate-950/25 border-slate-800 text-slate-500 cursor-not-allowed"
                                        : "bg-slate-900 border-slate-700"
                                    }`}
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* 3. KEGIATAN DAN TANGGAL */}
                        <div className={`space-y-4 p-4 rounded-xl border transition-all ${
                          isCertLayoutLocked ? "bg-slate-950/20 border-slate-900 opacity-70" : "bg-slate-900/35 border-white/5"
                        }`}>
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1">
                              3. Kegiatan dan Tanggal {isCertLayoutLocked && <Lock className="w-3 h-3 text-slate-500 shrink-0" />}
                            </span>
                          </div>
                          
                          <div className="space-y-3">
                            <div>
                              <div className="flex justify-between text-xs mb-1">
                                <span className="text-slate-400">Posisi Horizontal (X)</span>
                                <span className={`font-semibold font-mono ${isCertLayoutLocked ? "text-slate-500" : "text-white"}`}>{certDateX} px</span>
                              </div>
                              <input
                                type="range"
                                min="0"
                                max="1920"
                                step="10"
                                value={certDateX}
                                onChange={(e) => setCertDateX(parseInt(e.target.value))}
                                disabled={isCertLayoutLocked}
                                className={`w-full h-1.5 rounded-lg appearance-none transition-all ${
                                  isCertLayoutLocked
                                    ? "bg-slate-800/40 opacity-40 cursor-not-allowed accent-slate-600"
                                    : "bg-slate-800 cursor-pointer accent-emerald-500"
                                }`}
                              />
                            </div>

                            <div>
                              <div className="flex justify-between text-xs mb-1">
                                <span className="text-slate-400">Posisi Vertikal (Y)</span>
                                <span className={`font-semibold font-mono ${isCertLayoutLocked ? "text-slate-500" : "text-white"}`}>{certDateY} px</span>
                              </div>
                              <input
                                type="range"
                                min="0"
                                max="1080"
                                step="10"
                                value={certDateY}
                                onChange={(e) => setCertDateY(parseInt(e.target.value))}
                                disabled={isCertLayoutLocked}
                                className={`w-full h-1.5 rounded-lg appearance-none transition-all ${
                                  isCertLayoutLocked
                                    ? "bg-slate-800/40 opacity-40 cursor-not-allowed accent-slate-600"
                                    : "bg-slate-800 cursor-pointer accent-emerald-500"
                                }`}
                              />
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-[10px] text-slate-400 block mb-1">Ukuran Font (px)</label>
                                <input
                                  type="number"
                                  value={certDateSize}
                                  onChange={(e) => setCertDateSize(parseInt(e.target.value) || 12)}
                                  disabled={isCertLayoutLocked}
                                  className={`w-full px-2.5 py-1.5 border rounded-lg text-xs font-mono text-white focus:outline-none focus:border-amber-500 transition-all ${
                                    isCertLayoutLocked
                                      ? "bg-slate-950/25 border-slate-800 text-slate-500 cursor-not-allowed"
                                      : "bg-slate-900 border-slate-700 hover:border-slate-600"
                                  }`}
                                />
                              </div>
                              <div>
                                <label className="text-[10px] text-slate-400 block mb-1">Warna Teks</label>
                                <div className="flex gap-1.5">
                                  <input
                                    type="color"
                                    value={certDateColor}
                                    onChange={(e) => setCertDateColor(e.target.value)}
                                    disabled={isCertLayoutLocked}
                                    className={`w-8 h-8 rounded-lg bg-transparent border cursor-pointer overflow-hidden transition-all ${
                                      isCertLayoutLocked ? "opacity-30 border-slate-800 cursor-not-allowed" : "border-white/10"
                                    }`}
                                  />
                                  <input
                                    type="text"
                                    value={certDateColor}
                                    onChange={(e) => setCertDateColor(e.target.value)}
                                    disabled={isCertLayoutLocked}
                                    className={`w-full px-1.5 py-1 text-center border rounded-lg text-[10px] font-mono text-white focus:outline-none transition-all ${
                                      isCertLayoutLocked
                                        ? "bg-slate-950/25 border-slate-800 text-slate-500 cursor-not-allowed"
                                        : "bg-slate-900 border-slate-700"
                                    }`}
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* 4. BARCODE TANDA TANGAN */}
                        <div className={`space-y-4 p-4 rounded-xl border transition-all ${
                          isCertLayoutLocked ? "bg-slate-950/20 border-slate-900 opacity-70" : "bg-slate-900/35 border-white/5"
                        }`}>
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1 font-sans">
                              4. Barcode Tanda Tangan {isCertLayoutLocked && <Lock className="w-3 h-3 text-slate-500 shrink-0" />}
                            </span>
                            <label className="relative inline-flex items-center cursor-pointer">
                              <input
                                type="checkbox"
                                checked={isCertQrEnabled}
                                onChange={(e) => setIsCertQrEnabled(e.target.checked)}
                                disabled={isCertLayoutLocked}
                                className="sr-only peer"
                              />
                              <div className="w-8 h-4.5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[3px] after:left-[3px] after:bg-slate-400 after:border-slate-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-emerald-500 peer-checked:after:bg-white peer-checked:after:border-white"></div>
                            </label>
                          </div>
                          
                          <div className="space-y-3">
                            <div>
                              <div className="flex justify-between text-xs mb-1">
                                <span className="text-slate-400">Posisi Horizontal (X)</span>
                                <span className={`font-semibold font-mono ${isCertLayoutLocked || !isCertQrEnabled ? "text-slate-500" : "text-white"}`}>{certQrX} px</span>
                              </div>
                              <input
                                type="range"
                                min="0"
                                max="1920"
                                step="10"
                                value={certQrX}
                                onChange={(e) => setCertQrX(parseInt(e.target.value))}
                                disabled={isCertLayoutLocked || !isCertQrEnabled}
                                className={`w-full h-1.5 rounded-lg appearance-none transition-all ${
                                  isCertLayoutLocked || !isCertQrEnabled
                                    ? "bg-slate-800/40 opacity-40 cursor-not-allowed accent-slate-600"
                                    : "bg-slate-800 cursor-pointer accent-emerald-500"
                                }`}
                              />
                            </div>

                            <div>
                              <div className="flex justify-between text-xs mb-1">
                                <span className="text-slate-400">Posisi Vertikal (Y)</span>
                                <span className={`font-semibold font-mono ${isCertLayoutLocked || !isCertQrEnabled ? "text-slate-500" : "text-white"}`}>{certQrY} px</span>
                              </div>
                              <input
                                type="range"
                                min="0"
                                max="1080"
                                step="10"
                                value={certQrY}
                                onChange={(e) => setCertQrY(parseInt(e.target.value))}
                                disabled={isCertLayoutLocked || !isCertQrEnabled}
                                className={`w-full h-1.5 rounded-lg appearance-none transition-all ${
                                  isCertLayoutLocked || !isCertQrEnabled
                                    ? "bg-slate-800/40 opacity-40 cursor-not-allowed accent-slate-600"
                                    : "bg-slate-800 cursor-pointer accent-emerald-500"
                                }`}
                              />
                            </div>

                            <div>
                              <label className="text-[10px] text-slate-400 block mb-1">Ukuran Lebar/Tinggi (px)</label>
                              <input
                                type="number"
                                value={certQrSize}
                                onChange={(e) => setCertQrSize(parseInt(e.target.value) || 120)}
                                disabled={isCertLayoutLocked || !isCertQrEnabled}
                                className={`w-full px-2.5 py-1.5 border rounded-lg text-xs font-mono text-white focus:outline-none focus:border-amber-500 transition-all ${
                                  isCertLayoutLocked || !isCertQrEnabled
                                    ? "bg-slate-950/25 border-slate-800 text-slate-500 cursor-not-allowed"
                                    : "bg-slate-900 border-slate-700 hover:border-slate-600"
                                }`}
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between border-t border-white/5 pt-4">
                        <span className="text-xs text-slate-400">
                          {saveCertLayoutStatus ? (
                            <span className="text-emerald-400 font-bold animate-pulse">{saveCertLayoutStatus}</span>
                          ) : (
                            "💡 Tip: Geser horizontal (X) default 960 untuk rata tengah (center)"
                          )}
                        </span>
                        
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              // Reset to defaults
                              setCertNoX(960);
                              setCertNoY(310);
                              setCertNoSize(16);
                              setCertNoColor("#4f46e5");

                              setCertNameX(960);
                              setCertNameY(560);
                              setCertNameSize(45);
                              setCertNameColor("#1e293b");

                              setCertDateX(960);
                              setCertDateY(720);
                              setCertDateSize(18);
                              setCertDateColor("#475569");

                              setCertQrX(150);
                              setCertQrY(830);
                              setCertQrSize(130);
                              setIsCertQrEnabled(true);
                            }}
                            className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-slate-400 font-bold rounded-xl text-xs transition-all cursor-pointer"
                          >
                            Reset Default
                          </button>
                          
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                setSaveCertLayoutStatus("Menyimpan tata letak...");
                                await onSaveSettings({
                                  ...settings,
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
                                });
                                setSaveCertLayoutStatus("Tata letak sertifikat sukses disimpan!");
                                setTimeout(() => setSaveCertLayoutStatus(""), 3500);
                              } catch (e) {
                                setSaveCertLayoutStatus("Gagal menyimpan tata letak.");
                                setTimeout(() => setSaveCertLayoutStatus(""), 3000);
                              }
                            }}
                            className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 active:scale-95 text-slate-950 font-black rounded-xl text-xs transition-all flex items-center gap-1.5 shadow-lg shadow-amber-500/10 cursor-pointer"
                          >
                            <Settings className="w-3.5 h-3.5 shrink-0" />
                            Simpan Letak Sertifikat
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Table list of individual participants and their digital release status */}
                    <div className="space-y-3">
                      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                        <h4 className="text-sm font-black text-white flex items-center gap-1.5">
                          <Users className="w-4 h-4 text-emerald-400" />
                          Daftar Status Pengambilan Sertifikat Peserta
                        </h4>
                        <div className="w-full sm:w-72 relative shrink-0">
                          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                          <input
                            type="text"
                            placeholder="Cari peserta berdasarkan nama..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-8.5 pr-4 py-1.5 bg-slate-900 border border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-xs text-white"
                          />
                        </div>
                      </div>

                      <div className="bg-slate-900/40 border border-white/5 rounded-2xl overflow-hidden shadow-sm">
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse text-xs">
                            <thead>
                              <tr className="bg-slate-800/40 border-b border-slate-700/50 text-slate-350 font-bold uppercase tracking-wider">
                                <th className="p-3.5 w-12 text-center">No</th>
                                <th className="p-3.5">Nama Lengkap</th>
                                <th className="p-3.5">Instansi / Kabupaten / Kota</th>
                                <th className="p-3.5 text-center">Status Unduh</th>
                                <th className="p-3.5 text-center">Aksi / Cetak</th>
                              </tr>
                            </thead>
                            <tbody>
                              {registrations.filter(r => r.name.toLowerCase().includes(searchQuery.toLowerCase()) || r.nik.includes(searchQuery)).length === 0 ? (
                                <tr>
                                  <td colSpan={5} className="p-10 text-center text-slate-500 font-medium italic">Tidak ada data pendaftar yang cocok dengan pencarian.</td>
                                </tr>
                              ) : (
                                registrations.filter(r => r.name.toLowerCase().includes(searchQuery.toLowerCase()) || r.nik.includes(searchQuery)).map((reg, idx) => {
                                  const isSent = settings.isCertificateReleased || reg.isCertificateSent || reg.certificateBase64;
                                  return (
                                    <tr key={reg.id} className="border-b border-white/5 hover:bg-white/5 transition-all text-[11px] sm:text-xs">
                                      <td className="p-3.5 text-center text-slate-400 font-semibold">{idx + 1}</td>
                                      <td className="p-3.5">
                                        <p className="font-extrabold text-slate-100 uppercase">{reg.name}</p>
                                        <p className="text-[10px] text-slate-500 font-mono">NIK: {reg.nik}</p>
                                      </td>
                                      <td className="p-3.5 font-semibold text-slate-300">{reg.kabKota}</td>
                                      <td className="p-3.5 text-center">
                                        {isSent ? (
                                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-450 font-black text-[10px] uppercase tracking-wider animate-pulse">
                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                            Sudah Dikirim
                                          </span>
                                        ) : (
                                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-400 font-bold text-[10px] uppercase tracking-wider">
                                            Status Draft
                                          </span>
                                        )}
                                      </td>
                                      <td className="p-3.5 text-center">
                                        {isSent ? (
                                          <button
                                            onClick={() => openCertificateModal(reg)}
                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-amber-500 via-orange-500 to-yellow-600 hover:from-amber-600 hover:via-orange-650 hover:to-yellow-700 active:scale-95 text-white font-black rounded-lg text-[10px] transition-all uppercase tracking-wider shadow-md hover:shadow-lg shadow-amber-500/10 cursor-pointer"
                                          >
                                            <Award className="w-3.5 h-3.5 text-yellow-300 animate-pulse" />
                                            <span>Lihat / Cetak Resmi</span>
                                          </button>
                                        ) : (
                                          <button
                                            onClick={() => openCertificateModal(reg)}
                                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-600/85 hover:bg-indigo-650 active:scale-95 text-slate-100 font-extrabold rounded-lg text-[10px] transition-all uppercase tracking-wider shadow-sm cursor-pointer"
                                          >
                                            <Eye className="w-3.5 h-3.5" />
                                            <span>Pratinjau / View</span>
                                          </button>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </>
                </div>
              )}

            {activeTab === "settings" && (
              <div className="space-y-8 animate-fade-in">
                {/* DYNAMIC LIST OF BIMTEK EVENTS - CREATE AND CHOOSE ACTIVE EVENTS */}
                <div className="bg-slate-800/20 border border-white/5 p-6 rounded-2xl space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
                    <div>
                      <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-emerald-400" />
                        Kelola & Ganti Sesi Bimtek Sektor Aktif
                      </h3>
                      <p className="text-xs text-slate-400 mt-1">
                        Pilih bimbingan teknis yang sedang berjalan, atau buat sesi kegiatan baru dari formulir di bawah.
                      </p>
                    </div>
                    
                    <button
                      type="button"
                      onClick={() => setShowAddEventForm(!showAddEventForm)}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition-all self-start sm:self-center cursor-pointer"
                    >
                      {showAddEventForm ? "Tutup Formulir Baru" : "➕ Tambah Sesi Bimtek Baru"}
                    </button>
                  </div>

                  {eventActionStatus && (
                    <div className="bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 rounded-xl text-xs text-emerald-300 font-bold animate-pulse">
                      {eventActionStatus}
                    </div>
                  )}

                  {/* COLLAPSIBLE ADD NEW EVENT FORM */}
                  {showAddEventForm && (
                    <form onSubmit={handleCreateNewEvent} className="bg-slate-900/60 border border-white/10 p-5 rounded-2xl space-y-4">
                      <h4 className="text-xs font-black text-white uppercase tracking-wider">
                        Buat Sesi Kegiatan Bimtek Baru
                      </h4>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        Formulir ini mempersiapkan sebuah event bimbingan teknis yang baru. Ketika berhasil disimpan, sistem akan langsung menetapkannya sebagai event yang aktif.
                      </p>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-350 uppercase tracking-wide block">Nama / Judul Bimtek Baru</label>
                          <input
                            type="text"
                            value={newEventTitle}
                            onChange={(e) => setNewEventTitle(e.target.value)}
                            className="w-full px-3 py-2 text-xs rounded-lg bg-slate-800 border border-white/10 text-white focus:outline-none"
                            placeholder="Contoh: Bimbingan Teknis Standarisasi Layanan..."
                            required
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-350 uppercase tracking-wide block">Tanggal Mulai</label>
                          <input
                            type="date"
                            value={newEventStartDate}
                            onChange={(e) => setNewEventStartDate(e.target.value)}
                            className="w-full px-3 py-2 text-xs rounded-lg bg-slate-800 border border-white/10 text-white focus:outline-none"
                            required
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-350 uppercase tracking-wide block">Durasi Kegiatan</label>
                          <select
                            value={newEventDurationDays}
                            onChange={(e) => setNewEventDurationDays(parseInt(e.target.value))}
                            className="w-full px-3 py-2 text-xs rounded-lg bg-slate-800 border border-white/10 text-white focus:outline-none"
                          >
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((d) => (
                              <option key={d} value={d}>{d} Hari</option>
                            ))}
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-350 uppercase tracking-wide block">Lokasi Kegiatan</label>
                          <input
                            type="text"
                            value={newEventLocation}
                            onChange={(e) => setNewEventLocation(e.target.value)}
                            className="w-full px-3 py-2 text-xs rounded-lg bg-slate-800 border border-white/10 text-white focus:outline-none"
                            placeholder="Contoh: Hotel Mercure, Padang..."
                            required
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-350 tracking-wide uppercase block">Nama Kepala Bidang / PPTK</label>
                          <input
                            type="text"
                            value={newEventKepalaBidangName}
                            onChange={(e) => setNewEventKepalaBidangName(e.target.value)}
                            className="w-full px-3 py-2 text-xs rounded-lg bg-slate-800 border border-white/10 text-white focus:outline-none"
                            placeholder={kepalaBidangName || "Nama kepala..."}
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-350 tracking-wide uppercase block">NIP Kepala Bidang / PPTK</label>
                          <input
                            type="text"
                            value={newEventKepalaBidangNip}
                            onChange={(e) => setNewEventKepalaBidangNip(e.target.value)}
                            className="w-full px-3 py-2 text-xs rounded-lg bg-slate-800 border border-white/10 text-white focus:outline-none"
                            placeholder={kepalaBidangNip || "NIP..."}
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-350 tracking-wide uppercase block">Jumlah Target Peserta</label>
                          <input
                            type="number"
                            value={newEventTargetParticipants || ""}
                            onChange={(e) => setNewEventTargetParticipants(e.target.value === "" ? "" as any : parseInt(e.target.value))}
                            className="w-full px-3 py-2 text-xs rounded-lg bg-slate-800 border border-white/10 text-white focus:outline-none font-semibold"
                            placeholder="Contoh: 50"
                            required
                            min={1}
                          />
                        </div>
                      </div>

                      <div className="flex justify-end gap-2 pt-2">
                        <button
                          type="button"
                          onClick={() => setShowAddEventForm(false)}
                          className="bg-slate-800 hover:bg-slate-700 text-slate-350 font-bold text-xs px-3.5 py-2 rounded-xl transition-all cursor-pointer"
                        >
                          Batal
                        </button>
                        <button
                          type="submit"
                          className="bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs px-4 py-2 rounded-xl transition-all cursor-pointer shadow-md"
                        >
                          Simpan & Aktifkan Sesi Bimtek
                        </button>
                      </div>
                    </form>
                  )}

                  {/* GRID LIST OF ALL CONFIGURED BIMTEK EVENTS */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {bimtekEvents
                      .filter((ev) => {
                        // Completely hide the "default" sample session as the user wants to input themselves
                        return ev.id !== "default";
                      })
                      .map((ev) => {
                        const isActive = 
                          (settings.originalEventId && ev.id === settings.originalEventId) ||
                          (!settings.originalEventId && ev.eventTitle === settings.eventTitle);
                        return (
                        <div
                          key={ev.id}
                          className={`p-4 rounded-2xl border transition-all flex flex-col justify-between ${
                            isActive
                              ? "bg-emerald-950/20 border-emerald-500/60 shadow-lg shadow-emerald-500/5 text-slate-100"
                              : "bg-slate-800/10 hover:bg-slate-800/25 border-white/5 text-slate-400"
                          }`}
                        >
                          <div>
                            <div className="flex items-center justify-between gap-1.5 mb-2 pb-2 border-b border-white/5">
                              <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider ${
                                isActive ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-slate-800 text-slate-500 font-bold"
                              }`}>
                                {isActive ? "🟢 Sesi Aktif" : "Sesi Terdaftar"}
                              </span>
                              <span className="text-[9px] text-slate-400 font-extrabold font-mono uppercase">
                                {ev.durationDays} Hari
                              </span>
                            </div>
                            
                            <h5 className="text-xs sm:text-sm font-extrabold uppercase tracking-tight text-slate-100 line-clamp-2">
                              {ev.eventTitle}
                            </h5>
                            
                            <div className="mt-3.5 space-y-1 text-[10.5px] text-slate-400 font-medium">
                              <p className="flex items-center gap-1.5">
                                <Calendar className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                                <span>Mulai: {formatIndonesianDate(ev.startDate || "2026-05-21")}</span>
                              </p>
                              <p className="flex items-start gap-1.5">
                                <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
                                <span className="line-clamp-1">{ev.eventLocation || "Padang, Sumatera Barat"}</span>
                              </p>
                            </div>
                          </div>

                          <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between gap-1.5">
                            <span className="text-[9px] text-slate-600 font-mono tracking-wide">ID: {ev.id.substring(0, 10)}</span>
                            {!isActive && (
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setDeleteEventConfirmId(ev.id)}
                                  className="bg-red-500/10 hover:bg-red-600 hover:text-white text-red-400 border border-red-500/15 font-bold text-[10px] px-2 py-1 rounded-lg transition-all cursor-pointer shadow-sm flex items-center gap-1"
                                  title="Hapus Sesi Kegiatan Ini"
                                >
                                  <Trash2 className="w-3 h-3" />
                                  <span>Hapus</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleActivateEvent(ev)}
                                  className="bg-emerald-500/10 hover:bg-emerald-550 hover:text-white text-emerald-400 border border-emerald-500/20 font-bold text-[10px] px-3 py-1 rounded-lg transition-all cursor-pointer shadow-sm"
                                >
                                  Aktifkan Sesi Ini
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* SESI CONFIGURATION DETAILS */}
                <div className="space-y-4 pt-2">
                  <div className="border-b border-white/5 pb-2">
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-400">
                      Konfigurasi Detail Parameter Sesi Aktif
                    </h4>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Mengedit formulir di bawah ini akan memperbarui konten data spesifik untuk Sesi Bimtek Aktif Anda saat ini.
                    </p>
                  </div>

                  <form onSubmit={handleSaveSettings} className="space-y-6 max-w-xl bg-slate-800/10 border border-white/5 p-6 rounded-2xl animate-fade-in">
                  {/* Judul acara */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
                      Nama / Judul Kegiatan Bimtek Official
                    </label>
                    <textarea
                      value={eventTitle}
                      onChange={(e) => setEventTitle(e.target.value)}
                      rows={2}
                      className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                      required
                    />
                  </div>

                  {/* Duration */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-300 uppercase tracking-wider">
                      <span>Durasi Kegiatan (Hari)</span>
                      <span className="text-emerald-400 text-sm font-semibold">{durationDays} Hari</span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={10}
                      value={durationDays}
                      onChange={(e) => setDurationDays(parseInt(e.target.value))}
                      className="w-full accent-emerald-500 bg-slate-800 rounded-lg h-2"
                    />
                    <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                      <span>1 HARI (Absen Disembunyikan)</span>
                      <span>10 HARI MAX</span>
                    </div>
                  </div>

                  {/* Tanggal Mulai Bimtek */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
                      Tanggal Mulai Kegiatan Bimtek
                    </label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm"
                      required
                    />
                  </div>

                  {/* Lokasi Kegiatan Bimtek */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
                      Lokasi Kegiatan Bimtek
                    </label>
                    <input
                      type="text"
                      value={eventLocation}
                      onChange={(e) => setEventLocation(e.target.value)}
                      placeholder="Contoh: Pangeran Beach Hotel, Padang, Sumatera Barat"
                      className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm"
                      required
                    />
                  </div>

                  {/* Nama Kepala Bidang / PPTK */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
                      Nama Kepala Bidang / PPTK (Untuk Tanda Tangan Cetak)
                    </label>
                    <input
                      type="text"
                      value={kepalaBidangName}
                      onChange={(e) => setKepalaBidangName(e.target.value)}
                      placeholder="Contoh: Haris, S.Kom, M.Si"
                      className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm"
                      required
                    />
                  </div>

                  {/* NIP Kepala Bidang */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
                      NIP Kepala Bidang
                    </label>
                    <input
                      type="text"
                      value={kepalaBidangNip}
                      onChange={(e) => setKepalaBidangNip(e.target.value)}
                      placeholder="Contoh: 19781215 200501 1 004"
                      className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm"
                      required
                    />
                  </div>

                  {/* Nominal Uang Saku Peserta */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
                      Nominal Uang Saku Peserta (Format Angka Murni)
                    </label>
                    <div className="relative">
                      <span className="absolute left-4 top-3 text-slate-400 font-bold text-sm">Rp</span>
                      <input
                        type="number"
                        value={allowanceAmount === 0 || allowanceAmount === "" ? "" : allowanceAmount}
                        onChange={(e) => {
                          const val = e.target.value;
                          setAllowanceAmount(val === "" ? "" : parseInt(val) || 0);
                        }}
                        placeholder="isi nominal uang saku"
                        className="w-full pl-11 pr-4 py-3 rounded-xl bg-slate-800 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm font-semibold"
                      />
                    </div>
                    <p className="text-[11px] text-slate-400 font-semibold leading-relaxed">
                      Sistem akan mendistribusikan nominal ini ke seluruh daftar cetakan uang saku. Pratinjau:{" "}
                      <span className="text-emerald-400 font-black">
                        {allowanceAmount !== "" && allowanceAmount !== 0 
                          ? `Rp ${allowanceAmount.toLocaleString("id-ID")} ,-` 
                          : "Isi Manual saat Cetak"}
                      </span>
                    </p>
                  </div>

                  {/* Jumlah Target Peserta */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
                      Jumlah Target Peserta (Orang)
                    </label>
                    <input
                      type="number"
                      value={targetParticipants || ""}
                      onChange={(e) => setTargetParticipants(e.target.value === "" ? "" as any : parseInt(e.target.value))}
                      placeholder="Contoh: 50"
                      className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm font-semibold"
                      required
                      min={1}
                    />
                    <p className="text-[11px] text-slate-400 font-semibold leading-relaxed">
                      Menentukan kapasitas target peserta kegiatan Bimtek.
                    </p>
                  </div>

                  {/* Upload Sandi / Background Template Kartu */}
                  <div className="space-y-3 pt-2">
                    <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
                      Background Template Kartu Peserta Digital
                    </label>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Anda dapat mengunggah gambar latar belakang kartu kustom untuk menggantikan warna standar dinamis yang dihasilkan sistem saat pendaftaran.
                    </p>

                    <div
                      onDragOver={handleTemplateDragOver}
                      onDragLeave={handleTemplateDragLeave}
                      onDrop={handleTemplateDrop}
                      className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all ${
                        isDragging
                          ? "border-emerald-500 bg-emerald-500/10 text-emerald-400"
                          : "border-slate-700 bg-slate-800/40 hover:border-slate-500 text-slate-400"
                      }`}
                    >
                      <div className="space-y-3">
                        <div className="mx-auto w-10 h-10 bg-slate-850 rounded-xl flex items-center justify-center text-slate-300">
                          <Upload className="w-5 h-5" />
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-bold text-slate-200">
                            Seret & jatuhkan berkas gambar di sini, atau{" "}
                            <label className="text-emerald-400 hover:text-emerald-300 cursor-pointer underline">
                              pilih berkas
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) handleTemplateFileChange(file);
                                }}
                                className="hidden"
                              />
                            </label>
                          </p>
                          <p className="text-[10px] text-slate-500">PNG, JPG, JPEG, atau WebP (Maks. 5MB)</p>
                        </div>
                      </div>
                    </div>

                    {templateUploadError && (
                      <p className="text-xs text-red-400 mt-1 font-medium bg-red-500/10 p-2.5 rounded-xl border border-red-500/10">
                        {templateUploadError}
                      </p>
                    )}

                    {/* Dimensi & Preview */}
                    <div className="bg-slate-800/10 border border-white/5 p-4 rounded-xl space-y-3 text-[11px] text-slate-300">
                      <div className="flex items-start space-x-2">
                        <Image className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        <div>
                          <strong className="text-slate-200 block mb-0.5">Rekomendasi Dimensi Gambar:</strong>
                          <span className="leading-relaxed block">
                            Ukuran ideal adalah <strong className="text-emerald-300 font-bold">800 &times; 1280 piksel</strong> (atau kelipatannya dengan rasio vertikal portrait <strong className="text-emerald-300 font-bold">5:8 / 1:1.6</strong>). Rasio ini memastikan kartu tercetak dengan sempurna, tajam, dan tidak terdistorsi.
                          </span>
                        </div>
                      </div>

                      {cardTemplateBase64 ? (
                        <div className="pt-2 border-t border-slate-700/40 flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <div className="w-12 h-16 rounded border border-slate-700 bg-slate-900 overflow-hidden shrink-0 relative flex items-center justify-center">
                              <img
                                src={cardTemplateBase64}
                                alt="Template Background Preview"
                                className="w-full h-full object-cover"
                                referrerPolicy="no-referrer"
                              />
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-slate-200">Template Kustom Aktif</p>
                              <p className="text-[10px] text-slate-500">Akan diterapkan ke semua kartu peserta baru & lama</p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setCardTemplateBase64("")}
                            className="text-xs text-red-400 hover:text-red-350 hover:bg-red-500/10 py-1 px-2.5 rounded-lg border border-red-500/20 active:scale-95 transition-all text-[11px]"
                          >
                            Hapus Template
                          </button>
                        </div>
                      ) : (
                        <div className="pt-2 border-t border-slate-700/40">
                          <span className="text-slate-500 italic">Menggunakan background dasar dinamis dengan warna otomatis yang diproses oleh Gemini AI saat melakukan pendaftaran.</span>
                        </div>
                      )}
                    </div>

                    {/* Pilihan Warna Teks untuk Template Kartu */}
                    {cardTemplateBase64 && (
                      <div className="bg-slate-900/30 border border-white/5 p-4 rounded-xl space-y-3 mt-3 animate-fade-in text-left">
                        <label className="text-[11px] font-black text-slate-300 uppercase tracking-wider block">
                          Warna Teks Template Kartu Digital
                        </label>
                        <p className="text-[10px] text-slate-400 leading-normal">
                          Pilih warna teks ("Putih" atau "Hitam") yang cocok dengan template latar belakang kartu digital Anda agar data nama & NIK peserta tetap terbaca dengan jelas.
                        </p>
                        <div className="flex items-center space-x-3 pt-1">
                          <button
                            type="button"
                            onClick={() => setCardTemplateTextColor("white")}
                            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold border transition-all flex items-center justify-center space-x-2 cursor-pointer ${
                              cardTemplateTextColor === "white"
                                ? "bg-white text-slate-900 border-white shadow-md font-extrabold"
                                : "bg-slate-900/40 text-slate-400 border-white/10 hover:bg-slate-800/60 hover:text-slate-200"
                            }`}
                          >
                            <span className="w-2.5 h-2.5 rounded-full bg-white border border-slate-300" />
                            <span>Teks Putih</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setCardTemplateTextColor("black")}
                            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold border transition-all flex items-center justify-center space-x-2 cursor-pointer ${
                              cardTemplateTextColor === "black"
                                ? "bg-slate-950 text-white border-white/35 shadow-md font-extrabold"
                                : "bg-slate-900/40 text-slate-400 border-white/10 hover:bg-slate-800/60 hover:text-slate-200"
                            }`}
                          >
                            <span className="w-2.5 h-2.5 rounded-full bg-black border border-slate-700" />
                            <span>Teks Hitam</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Upload Template Sertifikat */}
                  <div className="space-y-3 pt-4 border-t border-slate-800">
                    <label className="text-xs font-bold text-slate-350 uppercase tracking-wider block">
                      Template Gambar Sertifikat Bimtek (Global)
                    </label>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Unggah 1 gambar template sertifikat kosong saja di sini. Sistem akan otomatis mendistribusikan berkas sertifikat ini dan menuliskan Nama Peserta serta NIK secara dinamis ketika peserta mengklik tombol "Cari & Ambil Sertifikat".
                    </p>

                    <div
                      onDragOver={handleGlobalCertDragOver}
                      onDragLeave={handleGlobalCertDragLeave}
                      onDrop={handleGlobalCertDrop}
                      className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all ${
                        isDraggingGlobalCert
                          ? "border-emerald-500 bg-emerald-500/10 text-emerald-400"
                          : "border-slate-700 bg-slate-800/40 hover:border-slate-500 text-slate-400"
                      }`}
                    >
                      <div className="space-y-3">
                        <div className="mx-auto w-10 h-10 bg-slate-850 rounded-xl flex items-center justify-center text-slate-300">
                          <Upload className="w-5 h-5" />
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-bold text-slate-200">
                            Seret & jatuhkan berkas gambar template di sini, atau{" "}
                            <label className="text-emerald-400 hover:text-emerald-300 cursor-pointer underline">
                              pilih berkas
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) handleGlobalCertFileChange(file);
                                }}
                                className="hidden"
                              />
                            </label>
                          </p>
                          <p className="text-[10px] text-slate-500">PNG, JPG, JPEG, atau WebP (Maks. 5MB)</p>
                        </div>
                      </div>
                    </div>

                    {globalCertUploadError && (
                      <p className="text-xs text-red-400 mt-1 font-medium bg-red-500/10 p-2.5 rounded-xl border border-red-500/10">
                        {globalCertUploadError}
                      </p>
                    )}

                    {/* Preview Sertifikat */}
                    <div className="bg-slate-800/10 border border-white/5 p-4 rounded-xl space-y-3 text-[11px] text-slate-300">
                      <div className="flex items-start space-x-2">
                        <Award className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
                        <div>
                          <strong className="text-slate-200 block mb-0.5">Template Sertifikat Kustom:</strong>
                          <span className="leading-relaxed block">
                            Gunakan template landscape kosong (misal: rasio <strong className="text-yellow-400 font-bold">16:10 atau A4</strong>). Nama Lengkap peserta akan diposisikan di area tengah-vertikal (sekitar 52% tinggi gambar) secara otomatis saat diunduh.
                          </span>
                        </div>
                      </div>

                      {certificateTemplateBase64 ? (
                        <div className="pt-2 border-t border-slate-700/40 flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <div className="w-20 h-12 rounded border border-slate-700 bg-slate-900 overflow-hidden shrink-0 relative flex items-center justify-center">
                              <img
                                src={certificateTemplateBase64}
                                alt="Sertifikat Template Preview"
                                className="w-full h-full object-cover"
                                referrerPolicy="no-referrer"
                              />
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-slate-200">Template Sertifikat Global Sukses Diunggah</p>
                              <p className="text-[10px] text-slate-500">Akan didistribusikan secara otomatis ke semua peserta terdaftar</p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setCertificateTemplateBase64("")}
                            className="text-xs text-red-400 hover:text-red-350 hover:bg-red-500/10 py-1 px-2.5 rounded-lg border border-red-500/20 active:scale-95 transition-all text-[11px]"
                          >
                            Hapus Template
                          </button>
                        </div>
                      ) : (
                        <div className="pt-2 border-t border-slate-700/40">
                          <span className="text-slate-500 italic">Belum ada template sertifikat kosong yang diunggah oleh admin.</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {saveStatus && (
                    <div className="text-xs font-semibold text-emerald-400 bg-emerald-500/10 p-3 rounded-xl border border-emerald-500/20">
                      {saveStatus}
                    </div>
                  )}

                  <button
                    type="submit"
                    className="py-3 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-all text-xs sm:text-sm flex items-center justify-center space-x-2 shadow-lg"
                  >
                    <CheckCircle className="w-4 h-4" />
                    <span>Simpan Konfigurasi Bimtek</span>
                  </button>
                </form>
                </div>

                {/* Reset Data Section */}
                <div className="max-w-xl bg-red-950/20 border border-red-500/20 p-6 rounded-2xl animate-fade-in space-y-4 text-slate-200">
                  <div className="flex items-start space-x-3">
                    <Database className="w-5 h-5 text-red-400 mt-0.5 shrink-0" />
                    <div>
                      <h4 className="text-sm font-bold text-red-400 uppercase tracking-wider">
                        Atur Ulang Data (Reset untuk Bimtek Baru)
                      </h4>
                      <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                        Aksi ini akan menghapus secara permanen semua data pendaftar peserta, foto kartu identitas (KTP), tanda tangan digital, dan seluruh berkas kehadiran saat ini. Pengaturan nama dan waktu kegiatan dapat disesuaikan kembali di atas.
                      </p>
                    </div>
                  </div>

                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => setShowResetConfirm(true)}
                      className="py-3 px-5 rounded-xl bg-red-600 hover:bg-red-500 active:scale-95 text-white font-extrabold transition-all text-xs uppercase tracking-wider flex items-center justify-center space-x-2 shadow-md w-full sm:w-auto cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Kosongkan Semua Data & Mulai Bimtek Baru</span>
                    </button>
                    <p className="text-[10px] text-red-400/90 mt-2 font-medium italic">
                      *...perintah ini mereset semua bimtek dan database secara permanen.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        </div> {/* End Unified Clean Content Dashboard Workspace */}

      </div> {/* End DASHBOARD CONTAINER SYSTEM (NON-PRINT VIEW) */}

      {/* Participant Card Viewer Modal */}
      {selectedParticipantForCard && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-lg p-6 relative shadow-2xl border border-slate-100 flex flex-col max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setSelectedParticipantForCard(null)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors bg-slate-100 hover:bg-slate-200 p-2 rounded-full"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="text-center mb-6">
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900 uppercase tracking-wide">
                Pratinjau Kartu Digital
              </h2>
              <p className="text-xs text-slate-500 font-sans">
                Kartu peserta resmi milik {selectedParticipantForCard.name}
              </p>
            </div>

            {/* Rendering the ParticipantCard inside */}
            <div className="flex-1 flex flex-col items-center space-y-6 py-2" id="single-participant-card-preview">
              <div className="no-print w-full flex justify-center">
                <ParticipantCard
                  registration={selectedParticipantForCard}
                  eventTitle={settings.eventTitle}
                  eventLocation={settings.eventLocation}
                  cardTemplateBase64={settings.cardTemplateBase64}
                  cardTemplateTextColor={settings.cardTemplateTextColor}
                />
              </div>

              {/* Detail KTP Section displayed large on screen inside this modal */}
              <div className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-slate-800 space-y-4">
                <span className="text-[10px] bg-indigo-100 text-indigo-800 font-bold px-2.5 py-1 rounded-full uppercase tracking-wider block w-fit">
                  Data KTP & Kontak Peserta
                </span>
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider block">Nama Lengkap</span>
                    <span className="font-extrabold text-slate-900 uppercase block">{selectedParticipantForCard.name}</span>
                  </div>
                  <div>
                    <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider block">NIK KTP</span>
                    <span className="font-mono font-bold text-slate-950 block">{selectedParticipantForCard.nik}</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider block">No. HP / WhatsApp</span>
                    <span className="font-bold text-emerald-600 block">{selectedParticipantForCard.phone || "-"}</span>
                  </div>
                  <div>
                    <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider block">Domisili</span>
                    <span className="font-bold text-slate-900 block">{selectedParticipantForCard.kabKota}</span>
                  </div>
                </div>
                {selectedParticipantForCard.address && (
                  <div className="text-xs border-t border-slate-200/50 pt-2">
                    <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider block">Alamat Lengkap</span>
                    <span className="font-medium text-slate-700 block mt-0.5">{selectedParticipantForCard.address}</span>
                  </div>
                )}
                {selectedParticipantForCard.ktpBase64 ? (
                  <div className="border-t border-slate-200/50 pt-3">
                    <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider block mb-2">Foto KTP Peserta (Resolusi Tinggi)</span>
                    <div className="bg-white border border-slate-200/55 rounded-xl p-2.5 flex justify-center">
                      <img
                        src={selectedParticipantForCard.ktpBase64}
                        alt="Foto KTP Original"
                        className="max-h-60 max-w-full object-contain rounded-lg shadow-sm"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="border-t border-slate-200/50 pt-3 text-center text-xs text-gray-400 italic">
                    Peserta mendaftar tanpa mengunggah berkas/foto KTP.
                  </div>
                )}
                {selectedParticipantForCard.signatureBase64 && (
                  <div className="border-t border-slate-200/50 pt-3 animate-fade-in">
                    <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider block mb-2">Tanda Tangan Registrasi</span>
                    <div className="bg-white border border-slate-200/55 rounded-xl p-2.5 flex justify-center">
                      <img
                        src={selectedParticipantForCard.signatureBase64}
                        alt="Tanda Tangan Registrasi"
                        className="max-h-24 max-w-full object-contain rounded-lg"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {singlePdfStatus && (
              <div className="mt-4 text-xs font-semibold text-center py-2 bg-emerald-50 text-emerald-700 rounded-xl animate-pulse border border-emerald-100">
                {singlePdfStatus}
              </div>
            )}

            {/* Print button at the bottom */}
            <div className="mt-6 pt-4 border-t border-slate-100 flex gap-3">
              <button
                onClick={() => setSelectedParticipantForCard(null)}
                className="flex-1 py-3 border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-50 active:scale-95 transition-all text-xs sm:text-sm"
              >
                Tutup
              </button>
              <button
                onClick={() => handleDownloadSingleParticipantPDF(selectedParticipantForCard)}
                className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-lg active:scale-95 transition-all text-sm flex items-center justify-center space-x-2"
              >
                <Download className="w-4 h-4" />
                <span>Simpan PDF</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Attendance Detail Viewer Modal */}
      {selectedAttendanceForDetail && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 relative shadow-2xl border border-slate-100 flex flex-col max-h-[90vh] overflow-y-auto text-slate-800">
            <button
              onClick={() => setSelectedAttendanceForDetail(null)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors bg-slate-100 hover:bg-slate-200 p-2 rounded-full"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="text-center mb-6">
              <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">
                Sesi Absensi Luring
              </span>
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900 mt-2.5 uppercase tracking-wide">
                Hari Ke-{selectedAttendanceForDetail.day}
              </h2>
              <p className="text-xs text-slate-500 font-sans font-medium">
                {formatIndonesianDate(settings.startDate || "2026-05-21", selectedAttendanceForDetail.day - 1)}
              </p>
            </div>

            <div className="space-y-4 text-slate-700">
              <div className="border-b border-slate-100 pb-3">
                <div className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Nama Lengkap</div>
                <div className="text-sm font-extrabold text-slate-900 uppercase">
                  {selectedAttendanceForDetail.name}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 border-b border-slate-100 pb-3">
                <div>
                  <div className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">NIK KTP</div>
                  <div className="text-xs font-mono font-bold text-slate-900">
                    {selectedAttendanceForDetail.nik}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">WhatsApp / HP</div>
                  <div className="text-xs font-bold text-emerald-600">
                    {selectedRegDetail?.phone || "-"}
                  </div>
                </div>
              </div>

              <div className="border-b border-slate-100 pb-3">
                <div className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Domisili Daerah</div>
                <div className="text-xs font-bold text-slate-900">
                  {selectedRegDetail?.kabKota || "-"}
                </div>
              </div>

              {selectedRegDetail?.address && (
                <div className="border-b border-slate-100 pb-3">
                  <div className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Alamat Lengkap</div>
                  <div className="text-xs text-slate-600 font-medium leading-relaxed">
                    {selectedRegDetail.address}
                  </div>
                </div>
              )}

              {selectedRegDetail?.ktpBase64 && (
                <div className="border-b border-slate-100 pb-3">
                  <div className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-2">Unggahan Foto KTP</div>
                  <div className="bg-slate-50 border border-slate-100 rounded-2xl p-2 flex justify-center">
                    <img
                      src={selectedRegDetail.ktpBase64}
                      alt="Pratinjau KTP"
                      className="max-h-28 max-w-full object-contain rounded-xl border border-slate-200/50"
                    />
                  </div>
                </div>
              )}

              <div>
                <div className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-2">Tanda Tangan Digital</div>
                <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 flex items-center justify-center h-28 relative">
                  {selectedAttendanceForDetail.signatureBase64 ? (
                    <img
                      src={selectedAttendanceForDetail.signatureBase64}
                      alt="Pratinjau TTD"
                      className="max-h-full max-w-full object-contain mix-blend-multiply"
                    />
                  ) : (
                    <span className="text-xs text-gray-400 italic">Tidak ada pratinjau tanda tangan</span>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100">
              <button
                onClick={() => setSelectedAttendanceForDetail(null)}
                className="w-full py-3 bg-semibold bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl active:scale-95 transition-all text-sm shadow-md cursor-pointer"
              >
                Tutup Detail Absensi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Reset Confirm Modal Dialog */}
      {showResetConfirm && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[9999] flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-red-500/30 rounded-3xl w-full max-w-md p-6 relative shadow-2xl text-slate-100 animate-fade-in">
            <div className="text-center mb-6">
              <div className="w-12 h-12 bg-red-950 text-red-500 rounded-full flex items-center justify-center mx-auto mb-3">
                <Trash2 className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-black text-white uppercase tracking-wide">
                Konfirmasi Kosongkan Sistem
              </h3>
              <p className="text-xs text-slate-400 mt-2 font-medium leading-relaxed">
                Apakah Anda benar-benar yakin ingin menghapus seluruh data pendaftar dan daftar kehadiran untuk memulai Bimtek Baru?
              </p>
            </div>

            <div className="bg-slate-950/50 rounded-2xl p-4 border border-white/5 space-y-2.5 text-xs text-slate-300">
              <p className="flex items-start gap-2">
                <span className="text-red-500">⮚</span>
                <span>Seluruh daftar peserta pendaftar ({registrations.length} orang) akan di-wipe secara permanen di server & database lokal.</span>
              </p>
              <p className="flex items-start gap-2">
                <span className="text-red-500">⮚</span>
                <span>Seluruh log dokumen absensi ({attendance.length} baris) akan ditiadakan.</span>
              </p>
              <p className="flex items-start gap-2">
                <span className="text-red-500">⮚</span>
                <span>Seluruh berkas unggahan KTP dan tanda tangan digital akan dibersihkan.</span>
              </p>
            </div>

            <div className="mt-6 flex flex-col gap-2">
              <button
                disabled={isResetting}
                onClick={async () => {
                  setIsResetting(true);
                  try {
                    await onResetAllData();
                    setShowResetConfirm(false);
                    setShowResetSuccess(true);
                  } catch (err) {
                    console.error(err);
                  } finally {
                    setIsResetting(false);
                  }
                }}
                className="w-full py-3 bg-red-600 hover:bg-red-500 disabled:bg-red-850 text-white font-extrabold rounded-xl transition-all text-sm shadow-md uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer"
              >
                {isResetting ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Database className="w-4 h-4" />
                )}
                <span>Ya, Hapus Permanen & Mulai Baru</span>
              </button>
              
              <button
                disabled={isResetting}
                onClick={() => setShowResetConfirm(false)}
                className="w-full py-3 bg-slate-800 hover:bg-slate-750 text-slate-300 font-bold rounded-xl transition-all text-sm outline-none cursor-pointer"
              >
                Batalkan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Reset Success Modal */}
      {showResetSuccess && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 text-center relative shadow-2xl border border-slate-100 text-slate-800 animate-fade-in">
            <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-extrabold text-slate-900">
              Sistem Berhasil Dikosongkan!
            </h3>
            <p className="text-xs text-slate-500 mt-2 leading-relaxed">
              Seluruh data pendaftaran dan log absensi mandiri telah dikosongkan total di database server (Firebase Firestore) dan cache lokal browser. Sistem sekarang siap dipergunakan untuk kegiatan Bimtek selanjutnya!
            </p>
            <div className="mt-6">
              <button
                onClick={() => setShowResetSuccess(false)}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-md text-sm active:scale-95 transition-all outline-none cursor-pointer"
              >
                Selesai & Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Exit Panel Confirm Modal */}
      {showExitConfirm && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 text-center relative shadow-2xl border border-slate-100 text-slate-800 animate-fade-in">
            <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <LogOut className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-extrabold text-slate-900">
              Konfirmasi Keluar Admin
            </h3>
            <p className="text-xs text-slate-500 mt-2 leading-relaxed">
              Apakah Anda yakin ingin keluar dari Menu Admin dan kembali ke halaman pendaftaran/absensi peserta?
            </p>
            <div className="mt-6 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowExitConfirm(false);
                  onClose();
                }}
                className="flex-1 py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl shadow-md text-sm active:scale-95 transition-all outline-none cursor-pointer"
              >
                Ya, Keluar
              </button>
              <button
                type="button"
                onClick={() => setShowExitConfirm(false)}
                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-sm active:scale-95 transition-all outline-none cursor-pointer"
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom delete event confirmation modal */}
      {deleteEventConfirmId && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 text-center relative shadow-2xl border border-slate-100 text-slate-800 animate-fade-in">
            <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-extrabold text-slate-900">
              Hapus Sesi Bimtek
            </h3>
            <p className="text-xs text-slate-500 mt-2 leading-relaxed">
              Apakah Anda yakin ingin menghapus sesi kegiatan Bimbingan Teknis ini dari database secara permanen? Tindakan ini tidak dapat dibatalkan.
            </p>
            <div className="mt-6 flex gap-2">
              <button
                type="button"
                onClick={() => handleDeleteBimtekEvent(deleteEventConfirmId)}
                className="flex-1 py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl shadow-md text-sm active:scale-95 transition-all outline-none cursor-pointer"
              >
                Ya, Hapus
              </button>
              <button
                type="button"
                onClick={() => setDeleteEventConfirmId(null)}
                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-sm active:scale-95 transition-all outline-none cursor-pointer"
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Certificate View Modal */}
      {certModalParticipant && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/10 text-white rounded-3xl w-full max-w-2xl p-6 relative shadow-2xl animate-fade-in text-left">
            <button
              onClick={() => setCertModalParticipant(null)}
              className="absolute right-4 top-4 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center space-x-3 mb-4">
              <div className="p-2.5 bg-emerald-500/10 rounded-2xl border border-emerald-500/20 text-emerald-400">
                <Award className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-white">
                  Pratinjau Sertifikat Bimtek Resmi
                </h3>
                <p className="text-xs text-slate-400">
                  Lihat sertifikat digital resmi untuk peserta kegiatan.
                </p>
              </div>
            </div>

            <div className="p-4 bg-slate-800/40 rounded-2xl border border-white/5 space-y-1.5 mb-4 text-xs font-semibold">
              <div className="flex justify-between">
                <span className="text-slate-400">Nama Peserta:</span>
                <span className="font-extrabold text-white uppercase">{certModalParticipant.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">NIK (KTP):</span>
                <span className="font-mono text-slate-300 font-bold">{certModalParticipant.nik}</span>
              </div>
            </div>

            <div className="space-y-4">
              <div className="bg-slate-950/40 border border-slate-800 rounded-2xl p-2 flex items-center justify-center min-h-[240px] relative overflow-hidden">
                {modalCertPreviewUrl ? (
                  <img
                    src={modalCertPreviewUrl}
                    alt={`Sertifikat ${certModalParticipant.name}`}
                    className="max-h-[350px] w-auto rounded-xl object-contain shadow-lg border border-white/5 select-none"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center space-y-3 py-16">
                    <div className="w-10 h-10 border-4 border-slate-800 border-t-emerald-400 rounded-full animate-spin" />
                    <p className="text-xs text-slate-400 font-medium">Pratinjau sertifikat sedang diproses...</p>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 flex flex-col sm:flex-row gap-2.5">
              <button
                type="button"
                disabled={!modalCertPreviewUrl}
                onClick={() => {
                  if (!certModalParticipant || !modalCertPreviewUrl) return;
                  const link = document.createElement("a");
                  link.href = modalCertPreviewUrl;
                  const safeName = certModalParticipant.name.trim().toUpperCase().replace(/[^A-Z0-9]/g, "_");
                  link.download = `SERTIFIKAT_BIMTEK_${safeName}.png`;
                  link.click();
                }}
                className="flex-1 py-3 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500 text-slate-950 font-black rounded-xl text-sm transition-all flex items-center justify-center space-x-2 shadow-lg shadow-amber-500/10 outline-none cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Unduh Gambar Sertifikat (PNG)</span>
              </button>
              <button
                type="button"
                onClick={() => setCertModalParticipant(null)}
                className="py-3 px-5 bg-slate-800 hover:bg-slate-750 text-slate-350 font-bold rounded-xl text-sm transition-all outline-none cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 1. CUSTOM POPUP MODAL: CONFIRM RELEASE CERTIFICATE */}
      {showCertReleaseConfirm && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-[99999] flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-emerald-500/30 text-white rounded-3xl w-full max-w-md p-6 relative shadow-2xl animate-fade-in text-center space-y-5">
            <button
              onClick={() => setShowCertReleaseConfirm(false)}
              className="absolute right-4 top-4 text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="mx-auto w-16 h-16 bg-emerald-500/10 rounded-full border border-emerald-500/20 text-emerald-400 flex items-center justify-center animate-pulse">
              <Award className="w-8 h-8 text-emerald-400" />
            </div>

            <div className="space-y-2 text-center">
              <h3 className="text-lg font-black text-white">🚀 Rilis & Kirim Sertifikat?</h3>
              <p className="text-xs text-slate-450 leading-relaxed">
                Tindakan ini akan mengaktifkan rilis sertifikat digital secara otomatis untuk seluruh <strong className="text-emerald-400">{registrations.length} peserta</strong> yang terdaftar di Bimtek ini.
              </p>
              <div className="p-3 bg-slate-950/40 rounded-xl text-[11px] text-amber-400 border border-amber-500/10 text-left space-y-1">
                <p>💡 <strong>Yang Akan Terjadi:</strong></p>
                <ol className="list-decimal pl-4 space-y-0.5 text-slate-300">
                  <li>Status unduh semua peserta diperbarui menjadi <strong className="text-emerald-400">"Sudah Dikirim"</strong>.</li>
                  <li>Sertifikasi status dikunci, tanda tangan & nomor surat resmi diterbitkan.</li>
                  <li>Peserta dapat langsung mencari nama / NIK mereka dan mengunduh sertifikat digital mandiri di halaman beranda.</li>
                </ol>
              </div>
            </div>

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowCertReleaseConfirm(false)}
                className="flex-1 py-3 bg-slate-800 hover:bg-slate-750 text-slate-350 font-bold rounded-xl text-xs transition-all cursor-pointer outline-none"
              >
                Batal (Draft)
              </button>
              <button
                type="button"
                disabled={isReleasingCerts}
                onClick={async () => {
                  try {
                    setIsReleasingCerts(true);
                    await onSaveSettings({
                      ...settings,
                      isCertificateReleased: true
                    });
                    setShowCertReleaseConfirm(false);
                    setShowCertReleaseSuccess(true);
                  } catch (e) {
                    alert("Gagal merilis sertifikat. Silakan periksa jaringan.");
                  } finally {
                    setIsReleasingCerts(false);
                  }
                }}
                className="flex-1 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-slate-950 font-black rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-500/10 cursor-pointer outline-none"
              >
                {isReleasingCerts ? (
                  <span className="w-4 h-4 border-2 border-slate-950 border-t-white rounded-full animate-spin" />
                ) : (
                  <span>Ya, Kirim Sekarang!</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. CUSTOM POPUP MODAL: SUCCESS RELEASE CERTIFICATE */}
      {showCertReleaseSuccess && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-[99999] flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-amber-500/30 text-white rounded-3xl w-full max-w-md p-6 relative shadow-2xl animate-fade-in text-center space-y-5">
            <div className="mx-auto w-16 h-16 bg-amber-500/10 rounded-full border border-amber-500/30 text-amber-400 flex items-center justify-center">
              <Sparkles className="w-8 h-8 text-yellow-500" />
            </div>

            <div className="space-y-2">
              <h3 className="text-xl font-black text-amber-400">🎉 Sertifikat Sukses Dirilis!</h3>
              <p className="text-xs text-slate-350 leading-relaxed font-semibold">
                Sistem sukses mendistribusikan berkas digital resmi ke seluruh <span className="text-emerald-400 font-bold">{registrations.length} peserta</span>.
              </p>
              <p className="text-[11px] text-slate-450 leading-relaxed">
                Seluruh tombol pratinjau administrasi telah bertransisi menjadi <strong className="text-amber-300">"Lihat / Cetak Resmi"</strong>. Peserta saat ini dapat mengunduh berkas dengan aman.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowCertReleaseSuccess(false)}
              className="w-full py-3 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black rounded-xl text-xs transition-all tracking-wider shadow-lg shadow-amber-500/10 cursor-pointer outline-none"
            >
              Mantap, Selesai! 👍
            </button>
          </div>
        </div>
      )}

      {/* 3. CUSTOM POPUP MODAL: CONFIRM REVOKE CERTIFICATE */}
      {showCertRevokeConfirm && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-[99999] flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-red-500/30 text-white rounded-3xl w-full max-w-md p-6 relative shadow-2xl animate-fade-in text-center space-y-5">
            <button
              onClick={() => setShowCertRevokeConfirm(false)}
              className="absolute right-4 top-4 text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="mx-auto w-16 h-16 bg-red-500/10 rounded-full border border-red-500/20 text-red-400 flex items-center justify-center">
              <X className="w-8 h-8 text-red-500" />
            </div>

            <div className="space-y-2 text-center">
              <h3 className="text-lg font-black text-white">⚠️ Tarik Kembali Sertifikat?</h3>
              <p className="text-xs text-slate-450 leading-relaxed">
                Apakah Anda yakin ingin menarik kembali sertifikat dan mengembalikan status ke <strong className="text-red-400">Draft</strong>?
              </p>
              <p className="text-[11px] bg-red-500/5 text-red-400 border border-red-500/10 p-2.5 rounded-xl text-left">
                🚨 <strong>Catatan:</strong> Seluruh akses unduh online untuk mandiri milik peserta akan langsung dikunci/dinonaktifkan sementara.
              </p>
            </div>

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowCertRevokeConfirm(false)}
                className="flex-1 py-3 bg-slate-800 hover:bg-slate-750 text-slate-350 font-bold rounded-xl text-xs transition-all cursor-pointer outline-none"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isRevokingCerts}
                onClick={async () => {
                  try {
                    setIsRevokingCerts(true);
                    await onSaveSettings({
                      ...settings,
                      isCertificateReleased: false
                    });
                    setShowCertRevokeConfirm(false);
                    setShowCertRevokeSuccess(true);
                  } catch (e) {
                    alert("Gagal mengembalikan sertifikat ke draft.");
                  } finally {
                    setIsRevokingCerts(false);
                  }
                }}
                className="flex-1 py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl text-xs transition-all cursor-pointer outline-none"
              >
                {isRevokingCerts ? (
                  <span className="w-4 h-4 border-2 border-white border-t-red-500 rounded-full animate-spin" />
                ) : (
                  <span>Ya, Kunci & Tarik</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. CUSTOM POPUP MODAL: SUCCESS REVOKE CERTIFICATE */}
      {showCertRevokeSuccess && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-[99999] flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 text-white rounded-3xl w-full max-w-md p-6 relative shadow-2xl animate-fade-in text-center space-y-5">
            <div className="mx-auto w-16 h-16 bg-slate-800 rounded-full text-slate-400 flex items-center justify-center">
              <Eye className="w-8 h-8 text-slate-400" />
            </div>

            <div className="space-y-2">
              <h3 className="text-lg font-black text-white">Sertifikat Dikembalikan ke Draft</h3>
              <p className="text-xs text-slate-450 leading-relaxed">
                Seluruh sertifikat peserta berhasil ditarik dan dikembalikan statusnya ke <strong>Draft (Disembunyikan)</strong>.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowCertRevokeSuccess(false)}
              className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl text-xs transition-all cursor-pointer outline-none"
            >
              Selesai
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
