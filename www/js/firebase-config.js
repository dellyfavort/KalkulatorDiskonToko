import { initializeApp } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCfsuWWfw2Jv1DDyFoOdHpcJM6OhW-1e0I",
  authDomain: "kalkulator-diskon-toko.firebaseapp.com",
  projectId: "kalkulator-diskon-toko",
  storageBucket: "kalkulator-diskon-toko.firebasestorage.app",
  messagingSenderId: "287252511214",
  appId: "1:287252511214:web:dd9f547be59f41e7f976ff"
};

// Jembatan untuk firebase-history.js (memperbaiki error baris 27)
window.KALKULATOR_FIREBASE_CONFIG = firebaseConfig;

// Inisialisasi Firebase & Export db hanya SATU KALI (memperbaiki error Duplicate export)
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);