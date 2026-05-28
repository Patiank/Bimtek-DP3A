import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  where,
  onSnapshot
} from "firebase/firestore";
import { db, isFirebaseConfigured } from "../firebase";

enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
  };
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: null,
      email: null,
      emailVerified: false,
    },
    operationType,
    path,
  };
  console.error("Firestore Error Detailed: ", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

function cleanUndefined<T extends Record<string, any>>(obj: T): T {
  const clean: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      if (value !== null && typeof value === "object" && !Array.isArray(value)) {
        clean[key] = cleanUndefined(value);
      } else {
        clean[key] = value;
      }
    }
  }
  return clean as T;
}

// Interfaces
export interface Registration {
  id: string;
  nik: string;
  name: string;
  phone: string;
  address: string;
  kabKota: string;
  color: string;
  ktpBase64?: string;
  registeredAt: string;
  signatureBase64?: string;
  bimtekTitle?: string;
  bimtekId?: string;
  certificateBase64?: string;
  certificateFileName?: string;
  certificateFileType?: string;
  gender?: string;
  isCertificateSent?: boolean;
}

export interface Attendance {
  id: string;
  nik: string;
  name: string;
  day: number;
  signatureBase64: string;
  attendedAt: string;
}

export interface AppSettings {
  id: string;
  eventTitle: string;
  durationDays: number;
  gasLink: string;
  startDate?: string;
  eventLocation?: string;
  cardTemplateBase64?: string;
  certificateTemplateBase64?: string;
  kepalaBidangName?: string;
  kepalaBidangNip?: string;
  originalEventId?: string;
  allowanceAmount?: number;
  targetParticipants?: number;
  isCertificateReleased?: boolean;
  cardTemplateTextColor?: "white" | "black";
  // Custom certificate text positions
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
  certQrX?: number;
  certQrY?: number;
  certQrSize?: number;
  isCertQrEnabled?: boolean;
}

const DEFAULT_SETTINGS: AppSettings = {
  id: "default",
  eventTitle: "Bimbingan Teknis Digitalisasi Destinasi Wisata Sumatera Barat",
  durationDays: 3,
  gasLink: "",
  startDate: "2026-05-21",
  eventLocation: "Pangeran Beach Hotel, Padang, Sumatera Barat",
  kepalaBidangName: "Haris, S.Kom, M.Si",
  kepalaBidangNip: "19781215 200501 1 004",
  allowanceAmount: 350000,
  targetParticipants: 50,
  certNoX: 960,
  certNoY: 310,
  certNoSize: 16,
  certNoColor: "#4f46e5",
  certNameX: 960,
  certNameY: 560,
  certNameSize: 45,
  certNameColor: "#1e293b",
  certDateX: 960,
  certDateY: 720,
  certDateSize: 18,
  certDateColor: "#475569",
  certQrX: 150,
  certQrY: 830,
  certQrSize: 130,
  isCertQrEnabled: true,
  cardTemplateTextColor: "black",
};

export function getDynamicDefaultSettings(): AppSettings {
  const localDefault = localStorage.getItem("bimtek_persistent_custom_defaults");
  if (localDefault) {
    try {
      const parsedDef = JSON.parse(localDefault);
      return {
        ...DEFAULT_SETTINGS,
        ...parsedDef,
      };
    } catch {
      return DEFAULT_SETTINGS;
    }
  }
  return DEFAULT_SETTINGS;
}

// Local storage fallback helper keys
const LS_KEYS = {
  REGISTRATIONS: "bimtek_registrations",
  ATTENDANCE: "bimtek_attendance",
  SETTINGS: "bimtek_settings",
};

export const dbService = {
  // SETTINGS SUBSCRIBER (REAL-TIME)
  subscribeSettings(callback: (settings: AppSettings) => void): () => void {
    if (isFirebaseConfigured && db) {
      // Sync defaults doc in background
      getDoc(doc(db, "settings", "persistent_defaults")).then((defSnap) => {
        if (defSnap.exists()) {
          localStorage.setItem("bimtek_persistent_custom_defaults", JSON.stringify(defSnap.data()));
        }
      }).catch((err) => console.warn("Failed syncing dynamic default settings:", err));

      try {
        const docRef = doc(db, "settings", "default");
        return onSnapshot(docRef, (docSnap) => {
          if (docSnap.exists()) {
            callback(docSnap.data() as AppSettings);
          } else {
            const initialSet = getDynamicDefaultSettings();
            setDoc(docRef, initialSet).then(() => {
              callback(initialSet);
            });
          }
        }, (error) => {
          console.error("Firestore settings onSnapshot error:", error);
          callback(this.getLocalSettings());
        });
      } catch (err) {
        console.warn("Settings subscription failed:", err);
        callback(this.getLocalSettings());
        return () => {};
      }
    } else {
      callback(this.getLocalSettings());
      return () => {};
    }
  },

  // REGISTRATIONS SUBSCRIBER (REAL-TIME)
  subscribeRegistrations(callback: (registrations: Registration[]) => void): () => void {
    if (isFirebaseConfigured && db) {
      try {
        const colRef = collection(db, "registrations");
        return onSnapshot(colRef, (colSnap) => {
          const data: Registration[] = [];
          colSnap.forEach((docSnap) => {
            data.push(docSnap.data() as Registration);
          });
          const sorted = data.sort((a, b) => new Date(b.registeredAt).getTime() - new Date(a.registeredAt).getTime());
          
          // Sync live data to local cache to ensure exact consistency (important for deleted records)
          localStorage.setItem(LS_KEYS.REGISTRATIONS, JSON.stringify(sorted));
          
          callback(sorted);
        }, (error) => {
          console.error("Firestore registrations onSnapshot error:", error);
          callback(this.getLocalRegistrations());
        });
      } catch (err) {
        console.warn("Registrations subscription failed:", err);
        callback(this.getLocalRegistrations());
        return () => {};
      }
    } else {
      callback(this.getLocalRegistrations());
      return () => {};
    }
  },

  // ATTENDANCE SUBSCRIBER (REAL-TIME)
  subscribeAttendance(callback: (attendance: Attendance[]) => void): () => void {
    if (isFirebaseConfigured && db) {
      try {
        const colRef = collection(db, "attendance");
        return onSnapshot(colRef, (colSnap) => {
          const data: Attendance[] = [];
          colSnap.forEach((docSnap) => {
            data.push(docSnap.data() as Attendance);
          });
          const sorted = data.sort((a, b) => new Date(b.attendedAt).getTime() - new Date(a.attendedAt).getTime());
          
          // Sync live data to local cache
          localStorage.setItem(LS_KEYS.ATTENDANCE, JSON.stringify(sorted));
          
          callback(sorted);
        }, (error) => {
          console.error("Firestore attendance onSnapshot error:", error);
          callback(this.getLocalAttendance());
        });
      } catch (err) {
        console.warn("Attendance subscription failed:", err);
        callback(this.getLocalAttendance());
        return () => {};
      }
    } else {
      callback(this.getLocalAttendance());
      return () => {};
    }
  },

  // SETTINGS
  async getSettings(): Promise<AppSettings> {
    if (isFirebaseConfigured && db) {
      const path = "settings/default";
      try {
        // Sync persistent defaults in background
        try {
          const defDocRef = doc(db, "settings", "persistent_defaults");
          const defSnap = await getDoc(defDocRef);
          if (defSnap.exists()) {
            localStorage.setItem("bimtek_persistent_custom_defaults", JSON.stringify(defSnap.data()));
          }
        } catch (e) {
          console.warn("Could not sync persistent background defaults:", e);
        }

        const docRef = doc(db, "settings", "default");
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          return docSnap.data() as AppSettings;
        } else {
          // Initialize if empty
          const initialSet = getDynamicDefaultSettings();
          await setDoc(docRef, initialSet);
          return initialSet;
        }
      } catch (error) {
        try {
          return handleFirestoreError(error, OperationType.GET, path);
        } catch {
          // If firestore threw an error but we still need settings to let the app run:
          return this.getLocalSettings();
        }
      }
    } else {
      return this.getLocalSettings();
    }
  },

  getLocalSettings(): AppSettings {
    const raw = localStorage.getItem(LS_KEYS.SETTINGS);
    if (raw) {
      try {
        return JSON.parse(raw);
      } catch {
        return getDynamicDefaultSettings();
      }
    }
    const initialSet = getDynamicDefaultSettings();
    localStorage.setItem(LS_KEYS.SETTINGS, JSON.stringify(initialSet));
    return initialSet;
  },

  async saveSettings(settings: AppSettings): Promise<void> {
    // Save template and positioning parameters as custom persistent defaults
    const customDefaults = {
      cardTemplateBase64: settings.cardTemplateBase64 || "",
      cardTemplateTextColor: settings.cardTemplateTextColor || "black",
      certificateTemplateBase64: settings.certificateTemplateBase64 || "",
      certNoX: settings.certNoX !== undefined ? settings.certNoX : 960,
      certNoY: settings.certNoY !== undefined ? settings.certNoY : 310,
      certNoSize: settings.certNoSize !== undefined ? settings.certNoSize : 16,
      certNoColor: settings.certNoColor || "#4f46e5",
      certNameX: settings.certNameX !== undefined ? settings.certNameX : 960,
      certNameY: settings.certNameY !== undefined ? settings.certNameY : 560,
      certNameSize: settings.certNameSize !== undefined ? settings.certNameSize : 45,
      certNameColor: settings.certNameColor || "#1e293b",
      certDateX: settings.certDateX !== undefined ? settings.certDateX : 960,
      certDateY: settings.certDateY !== undefined ? settings.certDateY : 720,
      certDateSize: settings.certDateSize !== undefined ? settings.certDateSize : 18,
      certDateColor: settings.certDateColor || "#475569",
      certQrX: settings.certQrX !== undefined ? settings.certQrX : 150,
      certQrY: settings.certQrY !== undefined ? settings.certQrY : 830,
      certQrSize: settings.certQrSize !== undefined ? settings.certQrSize : 130,
      isCertQrEnabled: settings.isCertQrEnabled !== false,
    };

    localStorage.setItem("bimtek_persistent_custom_defaults", JSON.stringify(customDefaults));

    if (isFirebaseConfigured && db) {
      const path = "settings/default";
      try {
        const docRef = doc(db, "settings", "default");
        const cleanData = cleanUndefined(settings);
         await setDoc(docRef, cleanData);

        const defDocRef = doc(db, "settings", "persistent_defaults");
        await setDoc(defDocRef, customDefaults);
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, path);
      }
    } else {
      localStorage.setItem(LS_KEYS.SETTINGS, JSON.stringify(settings));
    }
    // Also save locally as redundancy/cache
    localStorage.setItem(LS_KEYS.SETTINGS, JSON.stringify(settings));
  },

  // REGISTRATIONS
  async addRegistration(reg: Registration): Promise<void> {
    if (isFirebaseConfigured && db) {
      const path = `registrations/${reg.id}`;
      try {
        const docRef = doc(db, "registrations", reg.id);
        const cleanData = cleanUndefined(reg);
        await setDoc(docRef, cleanData);
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, path);
      }
    }
    
    // Always store or cache in localStorage for instant retrieval / offline resilient flow
    const existing = this.getLocalRegistrations();
    const updated = [reg, ...existing.filter((item) => item.id !== reg.id)];
    localStorage.setItem(LS_KEYS.REGISTRATIONS, JSON.stringify(updated));

    // Async sync in background to Google Sheets if App Settings has a GAS Link
    const settings = await this.getSettings();
    if (settings.gasLink) {
      this.syncToGoogleSheets(settings.gasLink, { type: "registration", data: reg });
    }
  },

  getLocalRegistrations(): Registration[] {
    const raw = localStorage.getItem(LS_KEYS.REGISTRATIONS);
    if (raw) {
      try {
        return JSON.parse(raw);
      } catch {
        return [];
      }
    }
    return [];
  },

  async getRegistrations(): Promise<Registration[]> {
    if (isFirebaseConfigured && db) {
      const path = "registrations";
      try {
        const colSnap = await getDocs(collection(db, "registrations"));
        const data: Registration[] = [];
        colSnap.forEach((doc) => {
          data.push(doc.data() as Registration);
        });
        // Sort newest first
        return data.sort((a, b) => new Date(b.registeredAt).getTime() - new Date(a.registeredAt).getTime());
      } catch (error) {
        try {
          return handleFirestoreError(error, OperationType.LIST, path);
        } catch {
          return this.getLocalRegistrations();
        }
      }
    } else {
      return this.getLocalRegistrations();
    }
  },

  async deleteRegistration(id: string): Promise<void> {
    if (isFirebaseConfigured && db) {
      const path = `registrations/${id}`;
      try {
        await deleteDoc(doc(db, "registrations", id));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, path);
      }
    }
    const existing = this.getLocalRegistrations();
    const updated = existing.filter((doc) => doc.id !== id);
    localStorage.setItem(LS_KEYS.REGISTRATIONS, JSON.stringify(updated));
  },

  // ATTENDANCE
  async addAttendance(att: Attendance): Promise<void> {
    if (isFirebaseConfigured && db) {
      const path = `attendance/${att.id}`;
      try {
        const docRef = doc(db, "attendance", att.id);
        const cleanData = cleanUndefined(att);
        await setDoc(docRef, cleanData);
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, path);
      }
    }

    // Cache locally
    const existing = this.getLocalAttendance();
    const updated = [att, ...existing.filter((item) => item.id !== att.id)];
    localStorage.setItem(LS_KEYS.ATTENDANCE, JSON.stringify(updated));

    // Dynamic external syncing
    const settings = await this.getSettings();
    if (settings.gasLink) {
      this.syncToGoogleSheets(settings.gasLink, { type: "attendance", data: att });
    }
  },

  getLocalAttendance(): Attendance[] {
    const raw = localStorage.getItem(LS_KEYS.ATTENDANCE);
    if (raw) {
      try {
        return JSON.parse(raw);
      } catch {
        return [];
      }
    }
    return [];
  },

  async getAttendanceList(): Promise<Attendance[]> {
    if (isFirebaseConfigured && db) {
      const path = "attendance";
      try {
        const colSnap = await getDocs(collection(db, "attendance"));
        const data: Attendance[] = [];
        colSnap.forEach((doc) => {
          data.push(doc.data() as Attendance);
        });
        return data.sort((a, b) => new Date(b.attendedAt).getTime() - new Date(a.attendedAt).getTime());
      } catch (error) {
        try {
          return handleFirestoreError(error, OperationType.LIST, path);
        } catch {
          return this.getLocalAttendance();
        }
      }
    } else {
      return this.getLocalAttendance();
    }
  },

  async deleteAttendance(id: string): Promise<void> {
    if (isFirebaseConfigured && db) {
      const path = `attendance/${id}`;
      try {
        await deleteDoc(doc(db, "attendance", id));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, path);
      }
    }
    const existing = this.getLocalAttendance();
    const updated = existing.filter((doc) => doc.id !== id);
    localStorage.setItem(LS_KEYS.ATTENDANCE, JSON.stringify(updated));
  },

  async clearAllData(): Promise<void> {
    const currentDefaults = getDynamicDefaultSettings();
    const resetSettings = {
      ...currentDefaults,
      id: "default",
      eventTitle: DEFAULT_SETTINGS.eventTitle,
      durationDays: DEFAULT_SETTINGS.durationDays,
      startDate: DEFAULT_SETTINGS.startDate,
      eventLocation: DEFAULT_SETTINGS.eventLocation,
      kepalaBidangName: DEFAULT_SETTINGS.kepalaBidangName,
      kepalaBidangNip: DEFAULT_SETTINGS.kepalaBidangNip,
      allowanceAmount: DEFAULT_SETTINGS.allowanceAmount,
      targetParticipants: DEFAULT_SETTINGS.targetParticipants,
    };

    // 1. Wipe local cache/storage
    localStorage.removeItem(LS_KEYS.REGISTRATIONS);
    localStorage.removeItem(LS_KEYS.ATTENDANCE);
    localStorage.setItem(LS_KEYS.SETTINGS, JSON.stringify(resetSettings));
    localStorage.setItem("bimtek_events_list", JSON.stringify([{ ...resetSettings, id: "default" }]));

    // 2. Clear Firebase Firestore collections if live
    if (isFirebaseConfigured && db) {
      try {
        const regSnap = await getDocs(collection(db, "registrations"));
        const deleteRegPromises = regSnap.docs.map((doc) => deleteDoc(doc.ref));
        await Promise.all(deleteRegPromises);

        const attSnap = await getDocs(collection(db, "attendance"));
        const deleteAttPromises = attSnap.docs.map((doc) => deleteDoc(doc.ref));
        await Promise.all(deleteAttPromises);

        // Delete all documents in settings collection except persistent_defaults
        const settingsSnap = await getDocs(collection(db, "settings"));
        const deleteSettingsPromises = settingsSnap.docs
          .filter((doc) => doc.id !== "persistent_defaults")
          .map((doc) => deleteDoc(doc.ref));
        await Promise.all(deleteSettingsPromises);

        // Restore default settings
        await setDoc(doc(db, "settings", "default"), { ...resetSettings, id: "default" });
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, "all-registrations-attendance-and-settings");
      }
    }
  },

  // BACKGROUND GOOGLE SHEETS SINK SCRIPT SYNC
  syncToGoogleSheets(gasLink: string, payload: { type: "registration" | "attendance"; data: any }) {
    if (!gasLink || !gasLink.startsWith("http")) return;
    
    // We send via fetch no-cors to bypass sandbox iframe CORS blocks or let GAS receive
    fetch(gasLink, {
      method: "POST",
      mode: "no-cors",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    })
      .then(() => console.log("🔄 Automatic sheets sync sent payload:", payload.type))
      .catch((err) => console.warn("🔄 Sheets sync failed (expected if mock gas server):", err));
  },

  // MULTIPLE BIMTEK EVENTS SERVICES
  async getAllBimtekEvents(): Promise<AppSettings[]> {
    if (isFirebaseConfigured && db) {
      try {
        const q = collection(db, "settings");
        const snap = await getDocs(q);
        const events: AppSettings[] = [];
        snap.forEach((doc) => {
          const data = doc.data() as AppSettings;
          events.push({ ...data, id: doc.id });
        });
        if (events.length === 0) {
          // Add default settings if not exists
          await setDoc(doc(db, "settings", "default"), { ...DEFAULT_SETTINGS, id: "default" });
          return [{ ...DEFAULT_SETTINGS, id: "default" }];
        }
        return events;
      } catch (error) {
        console.warn("Error getting bimtek events, falling back:", error);
        return this.getLocalBimtekEvents();
      }
    } else {
      return this.getLocalBimtekEvents();
    }
  },

  getLocalBimtekEvents(): AppSettings[] {
    const raw = localStorage.getItem("bimtek_events_list");
    if (raw) {
      try {
        return JSON.parse(raw);
      } catch {
        return [{ ...DEFAULT_SETTINGS, id: "default" }];
      }
    }
    const initialList = [{ ...DEFAULT_SETTINGS, id: "default" }];
    localStorage.setItem("bimtek_events_list", JSON.stringify(initialList));
    return initialList;
  },

  async addBimtekEvent(event: AppSettings): Promise<void> {
    if (isFirebaseConfigured && db) {
      try {
        const docRef = doc(db, "settings", event.id);
        const cleanData = cleanUndefined(event);
        await setDoc(docRef, cleanData);
      } catch (error) {
        console.error("Error adding bimtek event:", error);
      }
    } else {
      const list = this.getLocalBimtekEvents();
      const index = list.findIndex((item) => item.id === event.id);
      if (index !== -1) {
        list[index] = event;
      } else {
        list.push(event);
      }
      localStorage.setItem("bimtek_events_list", JSON.stringify(list));
    }
  },

  async activateBimtekEvent(event: AppSettings): Promise<void> {
    const activeSettings: AppSettings = {
      ...event,
      originalEventId: event.originalEventId || event.id,
      id: "default",
    };
    await this.saveSettings(activeSettings);
  },

  async deleteBimtekEvent(id: string): Promise<void> {
    if (isFirebaseConfigured && db) {
      try {
        await deleteDoc(doc(db, "settings", id));
      } catch (error) {
        console.error("Error deleting bimtek event:", error);
      }
    } else {
      const list = this.getLocalBimtekEvents();
      const filtered = list.filter((item) => item.id !== id);
      localStorage.setItem("bimtek_events_list", JSON.stringify(filtered));
    }
  }
};
