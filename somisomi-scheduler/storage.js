const KEY = "somisomi-sched-v3";
export function loadData() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch(e) {
    console.error("Load failed:", e);
  }
  return null;
}
export function saveData(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch(e) {
    console.error("Save failed:", e);
  }
}
