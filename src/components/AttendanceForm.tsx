import React, { useRef, useState, useEffect } from "react";
import { PenTool, RefreshCw, CheckCircle2, UserCheck, AlertTriangle, Info } from "lucide-react";
import { Registration, Attendance } from "../types";
import { motion, AnimatePresence } from "motion/react";

interface AttendanceFormProps {
  durationDays: number;
  onAttendanceSubmit: (data: Attendance) => Promise<void>;
  registrations: Registration[];
}

export const AttendanceForm: React.FC<AttendanceFormProps> = ({
  durationDays,
  onAttendanceSubmit,
  registrations,
}) => {
  const [inputValue, setInputValue] = useState("");
  const [selectedDay, setSelectedDay] = useState(2); // Starts from Day 2 as requested
  const [participant, setParticipant] = useState<Registration | null>(null);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorText, setErrorText] = useState("");

  // Check if value matches registered NIK OR No. HP/WhatsApp OR Name
  useEffect(() => {
    const cleanVal = inputValue.trim();
    if (cleanVal.length >= 3) {
      const match = registrations.find((reg) => {
        const cleanValDigits = cleanVal.replace(/\D/g, "");
        const matchNik = reg.nik && cleanValDigits !== "" && reg.nik.replace(/\D/g, "").includes(cleanValDigits);
        const matchPhone = reg.phone && cleanValDigits !== "" && reg.phone.replace(/[^0-9]/g, "").includes(cleanValDigits);
        const matchName = reg.name && reg.name.toLowerCase().includes(cleanVal.toLowerCase());
        return matchNik || matchPhone || matchName;
      });
      if (match) {
        setParticipant(match);
        setErrorText("");
      } else {
        setParticipant(null);
      }
    } else {
      setParticipant(null);
      setErrorText("");
    }
  }, [inputValue, registrations]);

  // Handle HTML5 Canvas Drawing operations
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    e.preventDefault();
    setIsDrawing(true);

    const pos = getEventCoords(e, canvas);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    e.preventDefault();
    const pos = getEventCoords(e, canvas);

    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = "#059669"; // Emerald Signature Line
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    setHasDrawn(true);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const getEventCoords = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>,
    canvas: HTMLCanvasElement
  ) => {
    const rect = canvas.getBoundingClientRect();
    
    // Exact touch/mouse position relative to the element on screen
    const clientX = "touches" in e 
      ? (e.touches[0]?.clientX ?? 0)
      : e.clientX;
    const clientY = "touches" in e 
      ? (e.touches[0]?.clientY ?? 0)
      : e.clientY;
      
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    
    // Translate and scale coordinates accurately based on backing store size
    return {
      x: (x * canvas.width) / rect.width,
      y: (y * canvas.height) / rect.height,
    };
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
    setErrorText("");
  };

  const handleResetAll = () => {
    setInputValue("");
    setParticipant(null);
    clearCanvas();
    setErrorText("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorText("");

    if (!participant) {
      setErrorText("Identitas peserta tidak ditemukan. Pastikan Anda mengetik NIK atau No. HP yang sudah terdaftar.");
      return;
    }

    if (!hasDrawn) {
      setErrorText("Silakan berikan tanda tangan digital Anda pada area kanvas.");
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const signatureBase64 = canvas.toDataURL("image/png");

    setSubmitting(true);
    try {
      const recordKey = participant.nik.trim() ? participant.nik.trim() : participant.id;
      const attendanceId = `${recordKey}_day_${selectedDay}`;
      const record: Attendance = {
        id: attendanceId,
        nik: participant.nik.trim(),
        name: participant.name,
        day: selectedDay,
        signatureBase64,
        attendedAt: new Date().toISOString(),
      };

      await onAttendanceSubmit(record);
      setSuccess(true);
      setInputValue("");
      clearCanvas();
      
      setTimeout(() => {
        setSuccess(false);
      }, 5000);
    } catch (err: any) {
      console.error("Attendance submission fail:", err);
      setErrorText("Gagal menyimpan data absensi. Silakan coba sesaat lagi.");
    } finally {
      setSubmitting(false);
    }
  };

  // If duration is set to 1 day only, attendance is not needed since day 1 is represented by register
  const availableDaysCount = Math.max(0, durationDays - 1);

  return (
    <div className="w-full max-w-md mx-auto bg-white rounded-2xl border border-slate-100 p-6 shadow-xl animate-fade-in">
      <div className="flex items-center space-x-3 mb-4">
        <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
          <UserCheck className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-gray-900">Absen Harian Bimtek</h2>
          <p className="text-xs text-gray-500">Isi paraf kehadiran Anda untuk Hari Ke-2 dan seterusnya</p>
        </div>
      </div>

      {/* Info note: Day 1 attendance */}
      <div className="mb-6 flex items-start space-x-2 bg-slate-50 p-3 rounded-xl border border-slate-100">
        <Info className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
        <p className="text-[11px] text-gray-600 leading-normal">
          <strong>Catatan:</strong> Kehadiran Anda untuk <strong>Hari Ke-1</strong> sudah terwakili secara otomatis oleh lembar registrasi pendaftaran pertama kali.
        </p>
      </div>

      <AnimatePresence mode="wait">
        {success ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="flex flex-col items-center text-center justify-center py-10 space-y-4"
          >
            <div className="p-4 bg-emerald-100 text-emerald-600 rounded-full">
              <CheckCircle2 className="w-12 h-12" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">Kehadiran Berhasil Tercatat</h3>
              <p className="text-sm text-gray-500 mt-2 max-w-xs leading-relaxed">
                Tanda tangan dan kehadiran Anda untuk <strong>Hari ke-{selectedDay}</strong> telah tersimpan di sistem data.
              </p>
            </div>
          </motion.div>
        ) : availableDaysCount === 0 ? (
          <div className="text-center py-8 text-gray-400 space-y-2">
            <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto" />
            <p className="text-xs font-semibold text-gray-700">Kegiatan Berlangsung 1 Hari Saja</p>
            <p className="text-[11px] text-gray-500 max-w-xs mx-auto">Tidak memerlukan menu absensi susulan karena kegiatan ini diset selesai dalam satu hari penuh.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* SEARCH PANEL */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-700 uppercase tracking-wider block">
                NIK atau No. HP / WhatsApp
              </label>
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Masukkan NIK atau No. HP terdaftar..."
                className="w-full px-4 py-3 rounded-xl border border-gray-200 text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm font-semibold"
                required
              />

              {/* DYNAMIC REGISTERED PESERTA PREVIEW */}
              <AnimatePresence mode="wait">
                {participant ? (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    className="flex items-center space-x-2 bg-emerald-50 border border-emerald-100 p-3 rounded-xl"
                  >
                    <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-ping" />
                    <div className="flex-1 truncate">
                      <p className="text-[10px] uppercase font-bold text-emerald-800">Peserta Teridentifikasi</p>
                      <p className="text-xs font-bold text-emerald-950 truncate">{participant.name}</p>
                      <p className="text-[10px] text-slate-500 truncate">{participant.kabKota}</p>
                    </div>
                  </motion.div>
                ) : inputValue.length >= 8 ? (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    key="not-found"
                    className="flex items-center space-x-2 bg-amber-50 border border-amber-100 p-3 rounded-xl"
                  >
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <p className="text-xs text-amber-900 leading-tight">
                      Data tidak ditemukan. Pastikan NIK atau No. HP Anda sudah melakukan pendaftaran peserta terlebih dahulu.
                    </p>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>

            {/* DAY CHECKPOINTS */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-700 uppercase tracking-wider block">
                Hari Absensi Bimtek
              </label>
              <div className="grid grid-cols-5 gap-2">
                {Array.from({ length: availableDaysCount }).map((_, idx) => {
                  const dayNum = idx + 2;
                  return (
                    <button
                      key={dayNum}
                      type="button"
                      onClick={() => setSelectedDay(dayNum)}
                      className={`py-2 px-1 rounded-lg text-xs font-bold border transition-all ${
                        selectedDay === dayNum
                          ? "bg-emerald-600 border-emerald-600 text-white shadow-md shadow-emerald-600/10"
                          : "bg-slate-50 border-gray-100 text-gray-700 hover:bg-slate-100 hover:border-gray-200"
                      }`}
                    >
                      H-{dayNum}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* SIGNATURE PAD */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center space-x-1.5">
                <PenTool className="w-4 h-4 text-emerald-600 animate-pulse" />
                <span>Tanda Tangan Digital Peserta</span>
              </label>

              <div className="border-2 border-slate-200 rounded-2xl overflow-hidden bg-slate-50/60 shadow-inner relative transition-colors focus-within:border-emerald-500">
                <canvas
                  ref={canvasRef}
                  width={500}
                  height={220}
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={stopDrawing}
                  className="w-full bg-white block h-[180px] sm:h-[220px] cursor-crosshair touch-none duration-300 border-b border-slate-100"
                />
                {!hasDrawn && (
                  <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center text-gray-400 space-y-2">
                    <PenTool className="w-6 h-6 animate-pulse text-emerald-500" />
                    <p className="text-xs font-bold text-slate-400">Silakan gambar/paraf tanda tangan Anda di sini</p>
                    <p className="text-[10px] text-slate-400/80">Gunakan jari di smartphone atau mouse di laptop/PC</p>
                  </div>
                )}
              </div>

              {/* Enhanced Action Buttons: Clear Signature and Reset Form */}
              <div className="flex items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={clearCanvas}
                  className="flex-1 py-2 px-3 border border-red-200 text-red-600 hover:bg-red-50 active:scale-[0.98] transition-all rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5"
                  title="Hapus coretan tanda tangan saat ini"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Hapus Tanda Tangan</span>
                </button>
                <button
                  type="button"
                  onClick={handleResetAll}
                  className="flex-1 py-1.5 px-3 border border-slate-200 text-slate-600 hover:bg-slate-50 active:scale-[0.98] transition-all rounded-xl text-xs font-semibold flex items-center justify-center space-x-1.5"
                  title="Mengosongkan pencarian identitas dan coretan tanda tangan"
                >
                  <RefreshCw className="w-3.5 h-3.5 rotate-180 text-slate-500" />
                  <span>Atur Ulang Form</span>
                </button>
              </div>
            </div>

            {/* SUBMIT BUTTON & ERROR */}
            {errorText && (
              <div className="text-xs text-red-600 bg-red-50 p-3 rounded-lg border border-red-100">
                {errorText}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className={`w-full py-3 px-6 rounded-xl font-bold text-white transition-all text-sm flex items-center justify-center space-x-2 shadow-lg ${
                submitting
                  ? "bg-slate-400 cursor-not-allowed"
                  : "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/10"
              }`}
            >
              {submitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Menyimpan Kehadiran...</span>
                </>
              ) : (
                <span>Kirim Kehadiran (Masuk Absen)</span>
              )}
            </button>
          </form>
        )}
      </AnimatePresence>
    </div>
  );
};
