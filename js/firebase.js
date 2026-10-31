import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  initializeFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { firebaseConfig } from "./config.js";

export const configured = !String(firebaseConfig.projectId).startsWith("TODO");

const app = initializeApp(firebaseConfig);
// Telefon brauzerlarida (Safari, Instagram/Telegram ichidagi brauzer) ulanish qotib qolmasligi uchun long-polling
export const db = initializeFirestore(app, { experimentalForceLongPolling: true });
export const auth = getAuth(app);

export {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  writeBatch,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
};
