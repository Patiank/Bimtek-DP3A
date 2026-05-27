import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import firebaseConfig from "../firebase-applet-config.json";

let app;
let db: any = null;
let auth: any = null;
let isFirebaseConfigured = false;

try {
  // Check if configuration has been updated from the placeholder values
  if (
    firebaseConfig.apiKey &&
    !firebaseConfig.apiKey.includes("INITIAL_MOCK_KEY_REPLACE_ME") &&
    firebaseConfig.apiKey !== "MOCK_KEY"
  ) {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app, firebaseConfig.firestoreDatabaseId || "(default)");
    auth = getAuth(app);
    isFirebaseConfigured = true;
    console.log("🔥 Firebase successfully initialized and connected!");
  } else {
    console.log("ℹ️ Firebase is in Offline/Local Storage fallback mode (use Firebase Setup in the AI Studio sidebar to activate live cloud auto-sync).");
  }
} catch (error) {
  console.warn("⚠️ Firebase failed to initialize, running in Offline/Local Storage fallback mode.", error);
}

export { db, auth, isFirebaseConfigured };
