import { db } from "./firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";

const LOCAL_KEY = "somisomi-sched-v3";

// ── localStorage helpers ──────────────────────────────────────────
function localLoad() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error("Local load failed:", e);
  }
  return null;
}

function localSave(data) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
  } catch (e) {
    console.error("Local save failed:", e);
  }
}

// ── Firestore helpers ─────────────────────────────────────────────
// Split into two docs to stay under Firestore's 1MB per-document limit:
//   somisomi/data      → employees, rules, schoolDates, timeOffs
//   somisomi/schedules → savedSchedules (can be large)

async function firestoreLoad() {
  try {
    const [dataSnap, schedSnap] = await Promise.all([
      getDoc(doc(db, "somisomi", "data")),
      getDoc(doc(db, "somisomi", "schedules")),
    ]);
    if (!dataSnap.exists() && !schedSnap.exists()) return null;
    const data = dataSnap.exists() ? dataSnap.data() : {};
    const schedules = schedSnap.exists() ? schedSnap.data().savedSchedules : {};
    return { ...data, savedSchedules: schedules || {} };
  } catch (e) {
    console.error("Firestore load failed:", e);
    return null;
  }
}

async function firestoreSave(data) {
  try {
    const { savedSchedules, ...rest } = data;
    await Promise.all([
      setDoc(doc(db, "somisomi", "data"), rest),
      setDoc(doc(db, "somisomi", "schedules"), { savedSchedules: savedSchedules || {} }),
    ]);
  } catch (e) {
    console.error("Firestore save failed:", e);
  }
}

// ── Public API ────────────────────────────────────────────────────
// loadData: tries Firestore first, falls back to localStorage
export async function loadData() {
  const remote = await firestoreLoad();
  if (remote) {
    localSave(remote); // keep local in sync
    return remote;
  }
  return localLoad(); // fallback if offline
}

// saveData: saves to both localStorage (instant) and Firestore (cloud sync)
export function saveData(data) {
  localSave(data);     // immediate local save
  firestoreSave(data); // async cloud save — fire and forget
}
