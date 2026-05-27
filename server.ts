import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";

dotenv.config();

const app = express();
const PORT = 3000;

// Set body parser limits for KTP image base64 uploads
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Initialize the official Google Gen AI Client on the server side
// API Key is read from process.env.GEMINI_API_KEY (handled securely on server)
const initGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("⚠️ Warning: GEMINI_API_KEY is not defined in environment variables. Gemini OCR feature will operate in mock mode.");
    return null;
  }
  return new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
};

const ai = initGeminiClient();

// API endpoint for KTP scanning
app.post("/api/scan-ktp", async (req, res) => {
  try {
    const { base64, mimeType } = req.body;

    if (!base64) {
      return res.status(400).json({ error: "Missing image data (base64) in request body" });
    }

    // Clean base64 string if it contains prefix data (e.g. data:image/png;base64,)
    const cleanBase64 = base64.replace(/^data:image\/[a-z]+;base64,/, "");
    const cleanMimeType = mimeType || "image/jpeg";

    if (!ai) {
      // In case GEMINI_API_KEY is missing, gracefully act as fallback mock helper with realistic Sumatra Barat simulation data
      console.log("Operating in mock mode because no GEMINI_API_KEY was found.");
      // Simulated response to ensure frontend developer flow works 100% smoothly
      return res.json({
        nik: "1371012105950002",
        name: "RIDHO SAPUTRA",
        address: "Jl. Khatib Sulaiman No. 22, Kel. Ulak Karang, Kec. Padang Utara",
        kabKota: "Kota Padang",
        color: "#0E6251" // A beautiful dark emerald
      });
    }

    const promptText = `
      You are an expert OCR and identity document processor for Indonesian ID Cards (KTP - Kartu Tanda Penduduk).
      Your task is to analyze the uploaded KTP image and pull out the requested fields:
      1. NIK: Extract the 16-digit National Identity Number. Clean up any obvious OCR noise (ensure it contains exactly 16 numerical digits).
      2. Name: Extract the full name (Nama) in UPPERCASE.
      3. Address: Extract the full address details (Alamat, RT/RW, Kel/Desa, Kecamatan).
      4. Kabupaten/Kota: Extract the Regency or City (Kabupaten or Kota) in Sumatera Barat (e.g., Kota Padang, Kota Bukittinggi, Kabupaten Pesisir Selatan, Kota Pariaman, Kota Payakumbuh, Kabupaten Solok, dll) that corresponds to this person's residency.
      5. HEX Color: Determine an elegant and beautiful teal or emerald green HEX color code (e.g., ranging from dark jade green #0B5345, rich emerald teal #117A65, #16A085, forest pine #0E6251, to elegant deep sea teal #064E3B/#045F5F) that fits nicely as a cohesive colored background for their digital participant card based on Sumatera Barat's lush aesthetic themes.
      Ensure the returned color is high-contrast, professional, and within the custom emerald/teal theme requested.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [
        {
          inlineData: {
            mimeType: cleanMimeType,
            data: cleanBase64,
          },
        },
        { text: promptText }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            nik: { type: Type.STRING, description: "Extract the 16-digit NIK identifier" },
            name: { type: Type.STRING, description: "Extract full name (Nama Lengkap)" },
            address: { type: Type.STRING, description: "Extract full address profile string" },
            kabKota: { type: Type.STRING, description: "Regency or City in West Sumatra (e.g. Kota Padang, Kabupaten Agam)" },
            color: { type: Type.STRING, description: "Custom HEX color starting with # representing an Emerald green/Teal shade" }
          },
          required: ["nik", "name", "address", "kabKota", "color"]
        }
      }
    });

    const parsedData = JSON.parse(response.text || "{}");
    return res.json(parsedData);
  } catch (error: any) {
    console.error("OCR scanning error:", error);
    return res.status(500).json({ error: error?.message || "Failed to parse KTP identity verification data" });
  }
});

// Capture any JSON or middleware parsing failures and return them as JSON (never HTML)
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("Express API error caught:", err);
  if (res.headersSent) {
    return next(err);
  }
  res.status(err.status || err.statusCode || 500).json({
    error: err.message || "Terjadi kesalahan internal pada server kami."
  });
});

// Configure Vite middleware or static serving
const startServer = async () => {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    // Support SPA routing
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[FULL-STACK] Server successfully started and running on http://localhost:${PORT}`);
  });
};

startServer();
