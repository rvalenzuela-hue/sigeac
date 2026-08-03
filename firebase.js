import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCrz3epxfj33orn3k2oEd5vdudZrI6K5_8",
  authDomain: "sigeac-1fc0c.firebaseapp.com",
  projectId: "sigeac-1fc0c",
  storageBucket: "sigeac-1fc0c.firebasestorage.app",
  messagingSenderId: "518704861037",
  appId: "1:518704861037:web:97bc0e3a94eaf1a9c91464"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
