import React, { useState, useRef } from "react";
import { UploadCloud, CheckCircle, FileUp, Loader2, Camera, FolderOpen } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface KtpUploaderProps {
  onScanComplete: (data: {
    nik: string;
    name: string;
    address: string;
    kabKota: string;
    color: string;
    ktpBase64: string;
  }) => void;
  onError: (msg: string) => void;
}

const compressImage = (
  base64Str: string,
  maxWidth = 800,
  maxHeight = 800,
  quality = 0.6
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => {
      let width = img.width;
      let height = img.height;

      // Calculate new dimensions preserving aspect ratio
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
          reject(new Error("Perangkat kehabisan memori untuk mengompresi gambar ini. Silakan gunakan gambar dengan ukuran/resolusi lebih kecil (di bawah 1MB)."));
        } else {
          resolve(base64Str);
        }
        return;
      }

      // Draw white background
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      // Compress to jpeg format with chosen quality
      let compressedBase64 = canvas.toDataURL("image/jpeg", quality);

      // If the compressed image is still too big (e.g. > 550,050 chars / ~400KB binary), let's reduce quality and scale iteratively
      let currentQuality = quality;
      let currentWidth = width;
      let currentHeight = height;

      while (compressedBase64.length > 550000 && currentQuality > 0.15) {
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
    img.onerror = (err) => {
      reject(new Error("Gagal memproses gambar untuk kompresi."));
    };
    img.src = base64Str;
  });
};

export const KtpUploader: React.FC<KtpUploaderProps> = ({ onScanComplete, onError }) => {
  const [dragActive, setDragActive] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [uploadMode, setUploadMode] = useState<"ktp" | "selfie">("ktp");
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const selfieCameraInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const processFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      onError("Berkas harus berupa gambar (JPEG, PNG, atau WEBP)");
      return;
    }

    // Limit to 10MB
    if (file.size > 10 * 1024 * 1024) {
      onError("Ukuran berkas terlalu besar. Maksimal adalah 10MB.");
      return;
    }

    setLoading(true);
    setStatusMessage("Membaca berkas gambar...");

    const reader = new FileReader();
    reader.onload = async (e) => {
      const originalBase64 = e.target?.result as string;

      try {
        setStatusMessage("Mengoptimalkan ukuran gambar...");
        const compressedBase64 = await compressImage(originalBase64);
        setPreview(compressedBase64);

        if (uploadMode === "selfie") {
          setStatusMessage("Menyimpan foto selfie...");
          // We bypass OCR and call onScanComplete directly as a selfie backup
          onScanComplete({
            nik: "",
            name: "",
            address: "",
            kabKota: "",
            color: "#0F6251", // Classic emerald default
            ktpBase64: compressedBase64,
            isSelfie: true,
          });
        } else {
          setStatusMessage("Mengekstrak data dari KTP...");
          const response = await fetch("/api/scan-ktp", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              base64: compressedBase64,
              mimeType: "image/jpeg",
            }),
          });

          let data: any = {};
          const responseText = await response.text();
          try {
            data = JSON.parse(responseText);
          } catch (jsonErr) {
            console.error("Failed to parse OCR response as JSON:", responseText);
            throw new Error("Gagal memproses gambar KTP. Server mengembalikan format tak valid (HTML). Silakan coba ambil foto ulang dengan resolusi/ukuran gambar yang lebih kecil atau periksa koneksi.");
          }

          if (!response.ok) {
            throw new Error(data.error || "Gagal memproses gambar KTP");
          }

          setStatusMessage("Menganalisis profil data...");

          // Check if OCR yielded results or returned empty
          if (!data.nik || !data.name) {
            throw new Error("Gagal mendeteksi NIK atau Nama secara otomatis. Silakan masukkan data secara manual pada formulir atau unggah foto KTP ulang dengan pencahayaan yang lebih jelas.");
          }

          // Successfully scanned KTP
          onScanComplete({
            nik: data.nik,
            name: data.name,
            address: data.address || "",
            kabKota: data.kabKota || "Tidak Terdeteksi",
            color: data.color || "#0F6251", // Fallback color
            ktpBase64: compressedBase64,
            isSelfie: false,
          });
        }
      } catch (err: any) {
        console.error("OCR parse exception:", err);
        onError(err?.message || "Koneksi terputus saat memproses gambar. Silakan coba kembali.");
        setPreview(null);
      } finally {
        setLoading(false);
        setStatusMessage("");
      }
    };

    reader.onerror = () => {
      onError("Gagal membaca berkas gambar.");
      setLoading(false);
    };

    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const triggerGalleryInput = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const triggerCameraInput = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (uploadMode === "selfie" && selfieCameraInputRef.current) {
      selfieCameraInputRef.current.click();
    } else if (cameraInputRef.current) {
      cameraInputRef.current.click();
    }
  };

  return (
    <div className="w-full">
      {/* Mode Switcher Tabs */}
      <div className="flex border border-gray-100 mb-5 p-1 bg-slate-100 rounded-2xl">
        <button
          type="button"
          onClick={() => { if (!loading) { setUploadMode("ktp"); setPreview(null); } }}
          disabled={loading}
          className={`flex-1 flex items-center justify-center space-x-2 py-2.5 px-3 rounded-xl text-xs font-bold transition-all ${
            uploadMode === "ktp"
              ? "bg-white text-emerald-800 shadow-sm border border-emerald-500/10"
              : "text-gray-500 hover:text-gray-700 hover:bg-slate-200/50"
          } ${loading && "opacity-50 cursor-not-allowed"}`}
        >
          <span>📷 Scan KTP Otomatis</span>
        </button>
        <button
          type="button"
          onClick={() => { if (!loading) { setUploadMode("selfie"); setPreview(null); } }}
          disabled={loading}
          className={`flex-1 flex items-center justify-center space-x-2 py-2.5 px-3 rounded-xl text-xs font-bold transition-all ${
            uploadMode === "selfie"
              ? "bg-white text-emerald-800 shadow-sm border border-emerald-500/10"
              : "text-gray-500 hover:text-gray-700 hover:bg-slate-200/50"
          } ${loading && "opacity-50 cursor-not-allowed"}`}
        >
          <span>🤳 Foto Selfie / Profil</span>
        </button>
      </div>

      {/* Hidden input for regular file upload */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept="image/*"
        onChange={handleChange}
        disabled={loading}
      />

      {/* Hidden input to directly capture photo from device camera (back camera environment for KTP) */}
      <input
        ref={cameraInputRef}
        type="file"
        className="hidden"
        accept="image/*"
        capture="environment"
        onChange={handleChange}
        disabled={loading}
      />

      {/* Hidden input to directly capture photo from device camera (front camera user for Selfie) */}
      <input
        ref={selfieCameraInputRef}
        type="file"
        className="hidden"
        accept="image/*"
        capture="user"
        onChange={handleChange}
        disabled={loading}
      />

      <div
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        className={`relative overflow-hidden w-full border-2 border-dashed rounded-2xl flex flex-col items-center justify-center p-8 transition-all duration-300 ${
          loading
            ? "border-emerald-600/30 bg-emerald-500/5"
            : dragActive
            ? "border-emerald-500 bg-emerald-500/10 scale-[1.01] shadow-lg shadow-emerald-500/10"
            : "border-gray-200 bg-slate-50/20 hover:border-emerald-500 hover:bg-slate-50/50"
        }`}
      >
        <AnimatePresence mode="wait">
          {!preview && !loading ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex flex-col items-center text-center space-y-5"
            >
              <div className="p-4 bg-emerald-50 text-emerald-600 rounded-full shadow-inner">
                {uploadMode === "ktp" ? (
                  <UploadCloud className="w-10 h-10 text-emerald-600" />
                ) : (
                  <Camera className="w-10 h-10 text-emerald-600" />
                )}
              </div>
              <div>
                <p className="text-base font-bold text-gray-800">
                  {uploadMode === "ktp"
                    ? "Ambil Foto atau Unggah KTP Anda"
                    : "Ambil Foto Selfie / Profil Anda"}
                </p>
                <p className="text-xs text-gray-500 mt-1 max-w-sm leading-relaxed">
                  {uploadMode === "ktp"
                    ? "Silakan pilih opsi pengambilan foto KTP di bawah ini untuk memulai pengisian data secara otomatis."
                    : "Peserta tidak membawa KTP? Tidak masalah! Ambil foto selfie atau unggah pasfoto profil sebagai identitas visual Anda."}
                </p>
              </div>

              {/* ACTION CHOICES: CAMERA OR UPLOAD FILE */}
              <div className="flex flex-col sm:flex-row gap-3 pt-2 w-full max-w-md justify-center">
                <button
                  type="button"
                  onClick={triggerCameraInput}
                  className="flex items-center justify-center space-x-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2.5 rounded-xl text-xs transition-all active:scale-95 shadow-md shadow-emerald-600/10"
                >
                  <Camera className="w-4 h-4" />
                  <span>
                    {uploadMode === "ktp"
                      ? "Ambil Foto KTP (Kamera Belakang)"
                      : "Ambil Foto Selfie (Kamera Depan)"}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={triggerGalleryInput}
                  className="flex items-center justify-center space-x-2 bg-white hover:bg-slate-50 text-gray-700 font-bold px-4 py-2.5 rounded-xl text-xs transition-all active:scale-95 border border-gray-200 shadow-sm"
                >
                  <FolderOpen className="w-4 h-4 text-gray-500" />
                  <span>
                    {uploadMode === "ktp"
                      ? "Pilih File KTP (Galeri/File)"
                      : "Pilih Foto Selfie (Galeri/File)"}
                  </span>
                </button>
              </div>
            </motion.div>
          ) : loading ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center text-center space-y-6 py-6"
            >
              <div className="relative flex items-center justify-center">
                <Loader2 className="w-14 h-14 text-emerald-600 animate-spin" />
                <FileUp className="w-6 h-6 text-emerald-700 absolute" />
              </div>
              <div className="space-y-2">
                <p className="text-base font-bold text-emerald-800 animate-pulse">
                  {uploadMode === "ktp" ? "Menganalisis Dokumen..." : "Memproses Foto Anda..."}
                </p>
                <p className="text-xs text-gray-600 max-w-xs">
                  {statusMessage}
                </p>
              </div>

              {preview && (
                <div className="w-44 h-28 overflow-hidden rounded-xl border border-emerald-500/20 shadow-md opacity-40">
                  <img src={preview} alt="Scanning preview" className="w-full h-full object-cover" />
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center text-center space-y-4"
            >
              <div className={`w-52 h-32 rounded-xl overflow-hidden border-2 border-emerald-600 shadow-md relative ${uploadMode === "selfie" && "aspect-square w-32 h-32 rounded-full"}`}>
                <img src={preview!} alt="Preview" className="w-full h-full object-cover" />
                <div className="absolute top-2 right-2 bg-emerald-600 text-white rounded-full p-1 opacity-90 shadow">
                  <CheckCircle className="w-4 h-4" />
                </div>
              </div>
              <div>
                <p className="text-sm font-bold text-gray-800 font-sans">
                  {uploadMode === "ktp" ? "KTP Berhasil Dimuat" : "Foto Selfie Berhasil Dimuat"}
                </p>
                <p className="text-xs text-gray-500 mt-1">Ingin mengulang? Pilih opsi di bawah ini:</p>
              </div>

              <div className="flex gap-2 justify-center">
                <button
                  type="button"
                  onClick={triggerCameraInput}
                  className="flex items-center space-x-1 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg hover:bg-emerald-100"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>Kamera</span>
                </button>
                <button
                  type="button"
                  onClick={triggerGalleryInput}
                  className="flex items-center space-x-1 text-xs text-slate-700 bg-white border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-slate-50"
                >
                  <FolderOpen className="w-3.5 h-3.5 text-gray-500" />
                  <span>Galeri</span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
