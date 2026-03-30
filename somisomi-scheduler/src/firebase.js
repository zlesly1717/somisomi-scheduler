import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDJF13LjocjNqDjzUdFdq8WSYgygEC6MCI",
  authDomain: "scheduler-92c8a.firebaseapp.com",
  projectId: "scheduler-92c8a",
  storageBucket: "scheduler-92c8a.firebasestorage.app",
  messagingSenderId: "170409990211",
  appId: "1:170409990211:web:7805ca6772c5ade0ab9cf6",
  measurementId: "G-8QN24B9Q7D"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
