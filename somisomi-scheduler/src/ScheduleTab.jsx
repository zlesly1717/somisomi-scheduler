import { useState } from "react";
import { DAYS, fmtTime } from "./constants";

const font = "'DM Sans',sans-serif";
const si = { padding: "8px 12px", border: "1px solid #D1D5DB", borderRadius: 8, fontSize: 13, outline: "none", fontFamily: font, boxSizing: "border-box", width: "100%" };
const sl = { fontSize: 10.5, fontWeight: 700, color: "#6B7280", marginBottom: 4, display: "block", textTransform: "uppercase", letterSpacing: 0.5 };

function getWeekDates(startDate) {
  const d = new Date(startDate + "T12:00:00");
  const day = d.getDay();
  const mon = new Date(d);
  mon.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return Array.from({ length: 7 }, (_, i) => {
    const dd = new Date(mon); dd.setDate(mon.getDate() + i); return dd.toISOString().split("T")[0];
  });
}

function getDayType(dateStr, schoolDates) {
  const d = new Date(dateStr + "T12:00:00");
  const dow = d.getDay();
  const isOff = schoolDates.some(s => s.date === dateStr && (s.type === "holiday" || s.type === "summer"));
  if (dow === 0) return "sunday";
  if (dow === 6) return "saturday";
  if (dow === 5) return isOff ? "fridayHoliday" : "friday";
  return isOff ? "weekdayHoliday" : "weekday";
}

function tm(t) { if (!t) return 0; const [h, m] = t.split(":"); return +h * 60 + +m; }

function isAvail(emp, dateStr, s, e, weeklyTimeOffs) {
  const d = new Date(dateStr + "T12:00:00");
  const dk = DAYS[d.getDay() === 0 ? 6 : d.getDay() - 1];
  const u = emp.unavailability[dk];
  if (u.allDay) return false;
  if (u.start && u.end && tm(s) < tm(u.end) && tm(u.start) < tm(e)) return false;
  // Check weekly time-offs
  const to = weeklyTimeOffs.filter(t => t.empId === emp.id && t.date === dateStr);
  for (const t of to) {
    if (t.allDay) return false;
    if (t.start && t.end && tm(s) < tm(t.end) && tm(t.start) < tm(e)) return false;
  }
  return true;
}

// ── Parse natural language time-offs ──
function parseTimeOffs(text, employees, weekDates) {
  const results = [];
  if (!text.trim()) return results;

  const dayMap = {
    monday: 0, mon: 0, tuesday: 1, tue: 1, tues: 1, wednesday: 2, wed: 2,
    thursday: 3, thu: 3, thurs: 3, friday: 4, fri: 4, saturday: 5, sat: 5, sunday: 6, sun: 6,
  };

  // Split by commas, "and", semicolons, or periods
  const parts = text.split(/[,;.]|\band\b/i).map(s => s.trim()).filter(Boolean);

  let lastEmp = null;

  for (const part of parts) {
    const lower = part.toLowerCase();

    // Find employee name
    let foundEmp = null;
    for (const emp of employees) {
      const first = emp.name.split(" ")[0].toLowerCase();
      const last = emp.name.split(" ").slice(1).join(" ").toLowerCase();
      const full = emp.name.toLowerCase();
      if (lower.includes(full) || lower.includes(first)) {
        foundEmp = emp;
        break;
      }
    }

    if (foundEmp) lastEmp = foundEmp;
    const emp = foundEmp || lastEmp;
    if (!emp) continue;

    // Find day
    let foundDay = null;
    for (const [name, idx] of Object.entries(dayMap)) {
      if (lower.includes(name)) { foundDay = idx; break; }
    }
    if (foundDay === null) continue;

    const date = weekDates[foundDay];

    // Check for "all day" or no time specified
    const allDay = lower.includes("all day") || lower.includes("whole day") || lower.includes("off " + Object.keys(dayMap).find(k => dayMap[k] === foundDay));

    // Try to find time range like "12pm-6pm" or "12-6" or "9am to 3pm"
    const timeMatch = part.match(/(\d{1,2})\s*(?::(\d{2}))?\s*(am|pm)?\s*[-–to]+\s*(\d{1,2})\s*(?::(\d{2}))?\s*(am|pm)?/i);

    if (timeMatch && !allDay) {
      let [, h1, m1, ap1, h2, m2, ap2] = timeMatch;
      h1 = +h1; m1 = m1 ? +m1 : 0; h2 = +h2; m2 = m2 ? +m2 : 0;
      ap1 = (ap1 || "").toLowerCase(); ap2 = (ap2 || "").toLowerCase();

      // Infer am/pm if missing
      if (!ap1 && !ap2) { if (h1 < 8) { ap1 = "pm"; ap2 = "pm"; } else { ap1 = h1 >= 12 ? "pm" : "am"; ap2 = h2 >= 12 ? "pm" : "am"; } }
      if (!ap1) ap1 = ap2;
      if (!ap2) ap2 = h2 < h1 ? "pm" : ap1;

      if (ap1 === "pm" && h1 < 12) h1 += 12;
      if (ap1 === "am" && h1 === 12) h1 = 0;
      if (ap2 === "pm" && h2 < 12) h2 += 12;
      if (ap2 === "am" && h2 === 12) h2 = 0;

      results.push({
        empId: emp.id, empName: emp.name, date, allDay: false,
        start: `${String(h1).padStart(2, "0")}:${String(m1).padStart(2, "0")}`,
        end: `${String(h2).padStart(2, "0")}:${String(m2).padStart(2, "0")}`,
      });
    } else {
      results.push({ empId: emp.id, empName: emp.name, date, allDay: true, start: "", end: "" });
    }
  }

  return results;
}

// ═══════════════════════════════════
// GENERATE ENGINE
// ═══════════════════════════════════
function genSchedule(weekDates, employees, rules, schoolDates, weeklyTimeOffs, dayStaffingOverrides) {
  const schedule = {};
  const sc = {}, sh = {}, sd = {};
  const warnings = [];
  const active = employees.filter(e => e.status === "active");
  active.forEach(e => { sc[e.id] = 0; sh[e.id] = 0; sd[e.id] = new Set(); });
  weekDates.forEach(d => { schedule[d] = []; });

  const con = id => { const c = rules.constraints.find(x => x.id === id); return c ? c.enabled : true; };
  const T = rules.shiftTimes;
  const nightMap = {};
  const mcCount = {}; // track MC assignments per employee
  active.forEach(e => { mcCount[e.id] = 0; });

  // ── FRI→SUN FIRST, THEN MON→THU ──
  const schedOrder = [4, 5, 6, 0, 1, 2, 3];

  schedOrder.forEach(dayIndex => {
    const dateStr = weekDates[dayIndex];
    const dayType = getDayType(dateStr, schoolDates);
    const defaultStaffing = rules.staffing[dayType] || rules.staffing.weekday;
    const staffing = dayStaffingOverrides?.[dateStr] ? { ...defaultStaffing, ...dayStaffingOverrides[dateStr] } : defaultStaffing;
    const d = new Date(dateStr + "T12:00:00");
    const dow = d.getDay();
    const isWE = dow === 0 || dow === 6;
    const isFri = dow === 5; const isSat = dow === 6; const isSun = dow === 0; const isThu = dow === 4;
    const isMC = isThu || isSun;

    let dayS, dayE, eveS, eveE;
    if (isWE) { dayS = T.weekendDay.start; dayE = T.weekendDay.end; eveS = T.weekendEvening.start; eveE = T.weekendEvening.end; }
    else if (isFri) { dayS = T.fridayDay.start; dayE = T.fridayDay.end || T.weekdayDay.end; eveS = T.weekdayEvening.start; eveE = T.weekdayEvening.end; }
    else { dayS = T.weekdayDay.start; dayE = T.weekdayDay.end; eveS = T.weekdayEvening.start; eveE = T.weekdayEvening.end; }

    const mcS = T.mcNight.start, mcE = T.mcNight.end;
    const midS = T.satMid?.start || "15:00", midE = T.satMid?.end || "19:00";
    const hrs = (a, b) => (tm(b) - tm(a)) / 60;

    const slots = [];
    for (let i = 0; i < (staffing.day || 2); i++) {
      slots.push({ type: i === 0 ? "day_lead" : "day", label: i === 0 ? "Day Lead (SL)" : "Day / 2nd Day", start: dayS, end: dayE, hours: hrs(dayS, dayE), slOnly: i === 0, order: i });
    }
    if (staffing.mid > 0) {
      for (let i = 0; i < staffing.mid; i++) {
        slots.push({ type: "mid", label: "Mid Shift", start: midS, end: midE, hours: hrs(midS, midE), slOnly: false, order: 10 + i });
      }
    }
    if (isMC) {
      slots.push({ type: "mc_leader", label: "MC Leader (Eve SL)", start: mcS, end: mcE, hours: hrs(mcS, mcE), slOnly: true, isMC: true, order: 20 });
      slots.push({ type: "mc_sl_helper", label: "MC Helper (SL)", start: mcS, end: mcE, hours: hrs(mcS, mcE), slOnly: true, isMC: true, order: 21 });
      const regHelpers = isSun ? 2 : 1; // Thu=1, Sun=2
      for (let i = 0; i < regHelpers; i++) {
        slots.push({ type: "mc_helper", label: "MC Helper", start: mcS, end: mcE, hours: hrs(mcS, mcE), slOnly: false, isMC: true, order: 22 + i });
      }
    } else {
      for (let i = 0; i < (staffing.evening || 3); i++) {
        slots.push({ type: i === 0 ? "evening_sl" : "evening", label: i === 0 ? "Evening SL" : "Evening", start: eveS, end: eveE, hours: hrs(eveS, eveE), slOnly: i === 0, order: 20 + i });
      }
    }

    slots.sort((a, b) => a.order - b.order);
    const usedToday = new Set();

    const canA = (emp, slot) => {
      if (!isAvail(emp, dateStr, slot.start, slot.end, weeklyTimeOffs)) return false;
      if (slot.slOnly && emp.role !== "shift_lead") return false;
      if (con("no_doubles") && sd[emp.id].has(dateStr)) return false;
      if (sc[emp.id] >= emp.maxShifts) return false;
      if (sh[emp.id] + slot.hours > emp.maxHours) return false;
      if (con("no_trainees_mc") && slot.isMC && emp.role === "trainee") return false;
      // No MC more than once per week
      if (con("no_mc_twice") && slot.isMC && mcCount[emp.id] >= 1) return false;
      // No trainees on weekday day shifts (Mon-Fri)
      if (con("no_trainees_weekday_day") && emp.role === "trainee" && !isWE && (slot.type === "day_lead" || slot.type === "day")) return false;
      // No two trainees on same day
      if (con("no_two_trainees") && emp.role === "trainee") {
        const traineeAlreadyToday = schedule[dateStr].some(a => a.empId && active.find(e => e.id === a.empId)?.role === "trainee");
        if (traineeAlreadyToday) return false;
      }
      if (!isWE && !isFri && emp.tags.includes("no_weekday_nights") && tm(slot.start) >= 1020) return false;
      if (con("no_day_after_mc") && (slot.type === "day_lead" || slot.type === "day" || slot.type === "mid")) {
        const prevIdx = dayIndex - 1;
        if (prevIdx >= 0 && nightMap[weekDates[prevIdx]]?.has(emp.id)) return false;
        if (dayIndex === 0 && nightMap[weekDates[6]]?.has(emp.id)) return false;
      }
      if (con("no_fri_sat_night") && isSat && tm(slot.start) >= 1020 && nightMap[weekDates[4]]?.has(emp.id)) return false;
      if (con("no_sat_sun_night") && isSun && tm(slot.start) >= 1020 && nightMap[weekDates[5]]?.has(emp.id)) return false;
      if (usedToday.has(emp.id)) return false;
      return true;
    };

    const assign = (slot) => {
      let cands = active.filter(e => canA(e, slot));

      if (slot.type === "mc_leader") {
        const pool = isThu ? rules.mcRotation.thursdayLeaders : rules.mcRotation.sundayLeaderPool;
        const f = cands.filter(e => (pool || []).includes(e.name));
        if (f.length > 0) cands = f;
      }
      if (slot.type === "mc_helper") {
        const f = cands.filter(e => (rules.mcRotation.helperPool || []).includes(e.name));
        if (f.length > 0) cands = f;
      }
      if (slot.type === "day") {
        const f = cands.filter(e => (rules.secondDayPriority || []).includes(e.name));
        if (f.length > 0) cands = f;
      }
      if (isWE && !slot.isMC && !slot.slOnly) {
        const f = cands.filter(e => (rules.goodWeekendPeople || []).includes(e.name));
        if (f.length > 0) cands = f;
        // Don't filter here if it would eliminate everyone — keep full cands
      }

      // For non-MC non-SL slots: prefer regulars, but always include trainees as fallback
      if (!slot.slOnly && !slot.isMC) {
        const nonTr = cands.filter(e => e.role !== "trainee");
        const trainees = cands.filter(e => e.role === "trainee");

        if (nonTr.length > 0) {
          // Regulars available: use them first, but append trainees who need shifts at the end
          const traineesBelowMin = trainees.filter(e => sc[e.id] < e.minShifts);
          const regsAllAboveMin = nonTr.every(e => sc[e.id] >= e.minShifts);
          if (regsAllAboveMin && traineesBelowMin.length > 0) {
            // Regulars are satisfied, trainees need shifts — trainees go first
            cands = [...traineesBelowMin, ...nonTr];
          } else {
            // Regulars still need shifts — regulars first, trainees as backup
            cands = [...nonTr, ...trainees];
          }
        }
        // If nonTr is empty, cands stays as-is (trainees only) — don't filter them out
      }

      // Sort: below-min first, then fewest shifts
      cands.sort((a, b) => {
        const aB = sc[a.id] < a.minShifts ? 1 : 0;
        const bB = sc[b.id] < b.minShifts ? 1 : 0;
        if (bB !== aB) return bB - aB;
        return sc[a.id] - sc[b.id];
      });

      if (cands.length > 0) {
        const ch = cands[0];
        schedule[dateStr].push({ ...slot, empId: ch.id, empName: ch.name, empRole: ch.role });
        sc[ch.id]++; sh[ch.id] += slot.hours; sd[ch.id].add(dateStr); usedToday.add(ch.id);
        if (slot.isMC) mcCount[ch.id]++;
        if (tm(slot.start) >= 1020 || slot.isMC) { if (!nightMap[dateStr]) nightMap[dateStr] = new Set(); nightMap[dateStr].add(ch.id); }
      } else {
        schedule[dateStr].push({ ...slot, empId: null, empName: "⚠ UNFILLED", empRole: null });
        warnings.push({ date: dateStr, msg: `No available employee for ${slot.label}` });
      }
    };

    slots.filter(s => s.slOnly).forEach(assign);
    slots.filter(s => !s.slOnly).forEach(assign);
  });

  // ═══ SECOND PASS: Fill unfilled slots ═══
  // Try to fill any ⚠ UNFILLED slots by relaxing preference filters
  weekDates.forEach(dateStr => {
    const dayAssignments = schedule[dateStr];
    dayAssignments.forEach((slot, idx) => {
      if (slot.empId !== null) return; // already filled

      // Find anyone who CAN work this slot (basic availability only)
      const cands = active.filter(emp => {
        if (!isAvail(emp, dateStr, slot.start, slot.end, weeklyTimeOffs)) return false;
        if (slot.slOnly && emp.role !== "shift_lead") return false;
        if (sc[emp.id] >= emp.maxShifts) return false;
        if (sh[emp.id] + slot.hours > emp.maxHours) return false;
        if (slot.isMC && emp.role === "trainee") return false;
        // Allow doubles in second pass if no_doubles was blocking
        const alreadyToday = schedule[dateStr].some(a => a.empId === emp.id);
        if (alreadyToday) return false;
        return true;
      });

      // Prefer those below minimum
      cands.sort((a, b) => {
        const aB = sc[a.id] < a.minShifts ? 1 : 0;
        const bB = sc[b.id] < b.minShifts ? 1 : 0;
        if (bB !== aB) return bB - aB;
        return sc[a.id] - sc[b.id];
      });

      if (cands.length > 0) {
        const ch = cands[0];
        dayAssignments[idx] = { ...slot, empId: ch.id, empName: ch.name, empRole: ch.role };
        sc[ch.id]++; sh[ch.id] += slot.hours; sd[ch.id].add(dateStr);
      }
    });
  });

  // ═══ THIRD PASS: Give shifts to employees below minimum ═══
  // Find employees still below their min and try to add them to days with room
  const belowMin = active.filter(e => sc[e.id] < e.minShifts);
  for (const emp of belowMin) {
    // Try each day (Fri-Sun first, then Mon-Thu)
    const tryOrder = [4, 5, 6, 0, 1, 2, 3];
    for (const di of tryOrder) {
      if (sc[emp.id] >= emp.minShifts) break;
      if (sc[emp.id] >= emp.maxShifts) break;
      const dateStr = weekDates[di];
      // Skip if already working this day
      if (sd[emp.id].has(dateStr)) continue;

      const dayAssignments = schedule[dateStr];
      // Look for any unfilled slot this employee could take
      const unfilledIdx = dayAssignments.findIndex(slot => {
        if (slot.empId !== null) return false;
        if (!isAvail(emp, dateStr, slot.start, slot.end, weeklyTimeOffs)) return false;
        if (slot.slOnly && emp.role !== "shift_lead") return false;
        if (slot.isMC && emp.role === "trainee") return false;
        if (sh[emp.id] + slot.hours > emp.maxHours) return false;
        return true;
      });

      if (unfilledIdx >= 0) {
        const slot = dayAssignments[unfilledIdx];
        dayAssignments[unfilledIdx] = { ...slot, empId: emp.id, empName: emp.name, empRole: emp.role };
        sc[emp.id]++; sh[emp.id] += slot.hours; sd[emp.id].add(dateStr);
      }
    }
  }

  // Rebuild warnings
  const warnings2 = [];
  weekDates.forEach(dateStr => {
    schedule[dateStr].forEach(slot => {
      if (!slot.empId) warnings2.push({ date: dateStr, msg: `No available employee for ${slot.label}` });
    });
  });
  active.forEach(e => {
    if (sc[e.id] < e.minShifts) {
      warnings2.push({ date: "", msg: `${e.name} has ${sc[e.id]} shifts (minimum: ${e.minShifts})` });
    }
  });

  return { schedule, empShiftCount: sc, empHours: sh, warnings: warnings2 };
}

// ═══════════════════════════════════
// COMPONENT
// ═══════════════════════════════════
export function ScheduleTab({ employees, rules, schoolDates, timeOffs, savedSchedules, setSavedSchedules }) {
  const [weekStart, setWeekStart] = useState(() => {
    const now = new Date(); const day = now.getDay();
    const mon = new Date(now); mon.setDate(now.getDate() - (day === 0 ? 6 : day - 1) + 7);
    return mon.toISOString().split("T")[0];
  });
  const [draft, setDraft] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [notes, setNotes] = useState([]);
  const [toText, setToText] = useState("");
  const [weeklyTOs, setWeeklyTOs] = useState([]);
  const [step, setStep] = useState("timeoff"); // "timeoff" | "review" | "result"
  const [viewMode, setViewMode] = useState("shift"); // "shift" | "employee"
  const [selected, setSelected] = useState(null); // { date, slotKey } - first click
  const [dayStaffing, setDayStaffing] = useState(null); // per-day overrides { date: {day,mid,evening} }

  // ── Click-to-swap handler ──
  const handleCellClick = (date, type, order) => {
    if (!draft || isSaved) return;
    const slotKey = `${type}-${order}`;

    if (!selected) {
      // First click — select this cell
      setSelected({ date, slotKey, type, order });
    } else if (selected.date === date && selected.slotKey === slotKey) {
      // Clicked same cell — deselect
      setSelected(null);
    } else {
      // Second click — swap the two cells
      const newSchedule = {};
      Object.keys(draft.schedule).forEach(d => { newSchedule[d] = [...draft.schedule[d]]; });

      const fromSlotIdx = newSchedule[selected.date].findIndex(a => a.type === selected.type && a.order === selected.order);
      const toSlotIdx = newSchedule[date].findIndex(a => a.type === type && a.order === order);

      if (fromSlotIdx >= 0 && toSlotIdx >= 0) {
        const fromSlot = newSchedule[selected.date][fromSlotIdx];
        const toSlot = newSchedule[date][toSlotIdx];

        // Swap employee assignments (keep slot structure like type/start/end)
        newSchedule[selected.date][fromSlotIdx] = { ...fromSlot, empId: toSlot.empId, empName: toSlot.empName, empRole: toSlot.empRole };
        newSchedule[date][toSlotIdx] = { ...toSlot, empId: fromSlot.empId, empName: fromSlot.empName, empRole: fromSlot.empRole };

        // Recalc counts
        const newSc = {}, newSh = {};
        employees.filter(e => e.status === "active").forEach(e => { newSc[e.id] = 0; newSh[e.id] = 0; });
        Object.values(newSchedule).forEach(daySlots => {
          daySlots.forEach(slot => {
            if (slot.empId) { newSc[slot.empId] = (newSc[slot.empId] || 0) + 1; newSh[slot.empId] = (newSh[slot.empId] || 0) + slot.hours; }
          });
        });

        setDraft({ ...draft, schedule: newSchedule, empShiftCount: newSc, empHours: newSh });
      }
      setSelected(null);
    }
  };

  const weekDates = getWeekDates(weekStart);
  const weekKey = weekDates[0];
  const saved = savedSchedules?.[weekKey] || null;
  const result = saved || draft;
  const isSaved = !!saved;
  const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  const initDayStaffing = (dates) => {
    const ds = {};
    dates.forEach(d => {
      const dt = getDayType(d, schoolDates);
      const s = rules.staffing[dt] || rules.staffing.weekday;
      ds[d] = { day: s.day || 2, mid: s.mid || 0, evening: s.evening || 3 };
    });
    return ds;
  };

  const handleParseTimeOffs = () => {
    const parsed = parseTimeOffs(toText, employees.filter(e => e.status === "active"), weekDates);
    setWeeklyTOs(parsed);
    if (!dayStaffing) setDayStaffing(initDayStaffing(weekDates));
    setStep("review");
  };

  const handleGenerate = () => {
    setGenerating(true);
    setStep("result");
    const ds = dayStaffing || initDayStaffing(weekDates);
    setTimeout(() => {
      const allTOs = [...(timeOffs || []), ...weeklyTOs];
      const r = genSchedule(weekDates, employees, rules, schoolDates, allTOs, ds);
      setDraft(r);
      setGenerating(false);
    }, 200);
  };

  const handleAccept = () => {
    if (draft) {
      setSavedSchedules(prev => ({ ...prev, [weekKey]: { ...draft, notes, weeklyTOs, savedAt: new Date().toISOString() } }));
      setDraft(null); setNotes([]);
    }
  };

  const handleReject = () => {
    if (!prompt.trim()) return;
    setNotes(prev => [...prev, prompt.trim()]);
    setPrompt("");
    handleGenerate();
  };

  const handleUnsave = () => {
    setSavedSchedules(prev => { const n = { ...prev }; delete n[weekKey]; return n; });
    setStep("timeoff");
  };

  const removeTo = (idx) => setWeeklyTOs(prev => prev.filter((_, i) => i !== idx));

  const handleWeekChange = (val) => {
    setWeekStart(val); setDraft(null); setNotes([]);
    setWeeklyTOs([]); setToText(""); setStep("timeoff"); setDayStaffing(null);
  };

  const getRows = () => {
    if (!result) return [];
    const typeOrder = ["day_lead", "day", "mid", "evening_sl", "evening", "mc_leader", "mc_sl_helper", "mc_helper"];
    const all = {};
    weekDates.forEach(d => {
      (result.schedule[d] || []).forEach(a => {
        const k = `${a.type}-${a.order}`;
        if (!all[k]) all[k] = { type: a.type, label: a.label, order: a.order };
      });
    });
    return Object.values(all).sort((a, b) => {
      const ai = typeOrder.indexOf(a.type); const bi = typeOrder.indexOf(b.type);
      return ai !== bi ? ai - bi : a.order - b.order;
    });
  };

  const tc = {
    day_lead: { color: "#B45309", bg: "#FEF3C7" }, day: { color: "#16A34A", bg: "#F0FDF4" },
    mid: { color: "#0891B2", bg: "#ECFEFF" }, evening_sl: { color: "#E11D48", bg: "#FFF1F2" },
    evening: { color: "#2563EB", bg: "#EFF6FF" }, mc_leader: { color: "#7C3AED", bg: "#F5F3FF" },
    mc_sl_helper: { color: "#9333EA", bg: "#FAF5FF" }, mc_helper: { color: "#8B5CF6", bg: "#EDE9FE" },
  };

  const savedCount = Object.keys(savedSchedules || {}).length;

  return (
    <div style={{ padding: "18px 28px" }}>
      {/* Week picker + saved weeks */}
      <div style={{ background: "#fff", borderRadius: 12, padding: 18, boxShadow: "0 1px 3px rgba(0,0,0,0.06)", marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div>
            <label style={sl}>Week Starting (Monday)</label>
            <input type="date" value={weekStart} onChange={e => handleWeekChange(e.target.value)} style={{ ...si, width: 170 }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 11, color: "#6B7280" }}>
              {dayLabels[0]} {new Date(weekDates[0] + "T12:00:00").getMonth() + 1}/{new Date(weekDates[0] + "T12:00:00").getDate()}
              {" → "}{dayLabels[6]} {new Date(weekDates[6] + "T12:00:00").getMonth() + 1}/{new Date(weekDates[6] + "T12:00:00").getDate()}
            </span>
            <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
              {weekDates.map((d, i) => {
                const dt = getDayType(d, schoolDates);
                const isH = dt.includes("Holiday");
                return <span key={d} style={{ padding: "1px 5px", borderRadius: 4, fontSize: 8.5, fontWeight: 600, background: isH ? "#FEE2E2" : "#F0FDF4", color: isH ? "#DC2626" : "#16A34A" }}>{dayLabels[i]}: {dt}</span>;
              })}
            </div>
          </div>
          <div style={{ flex: 1 }} />
          {isSaved && <span style={{ padding: "4px 12px", borderRadius: 8, fontSize: 11, fontWeight: 700, background: "#F0FDF4", color: "#16A34A", border: "1px solid #BBF7D0" }}>✓ Saved</span>}
        </div>
        {savedCount > 0 && (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #F3F4F6" }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: "#6B7280", marginRight: 8 }}>SAVED WEEKS:</span>
            <div style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
              {Object.keys(savedSchedules).sort().map(key => {
                const dt = new Date(key + "T12:00:00");
                const isA = key === weekKey;
                return <button key={key} onClick={() => handleWeekChange(key)} style={{ padding: "3px 10px", borderRadius: 8, fontSize: 10, fontWeight: 600, cursor: "pointer", border: isA ? "2px solid #22C55E" : "1px solid #D1D5DB", background: isA ? "#F0FDF4" : "#fff", color: isA ? "#16A34A" : "#6B7280", fontFamily: font }}>{dt.getMonth() + 1}/{dt.getDate()}</button>;
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── STEP 1: Time-Off Input (only if not saved) ── */}
      {!isSaved && step === "timeoff" && (
        <div style={{ background: "#fff", borderRadius: 12, padding: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.06)", marginBottom: 16, border: "2px solid #3B82F6" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 22 }}>📋</span>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>Step 1: Any time-off this week?</div>
          </div>
          <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 12 }}>
            Check your Homebase and type any time-off requests for this week. Or skip if none.
          </div>
          <textarea
            value={toText}
            onChange={e => setToText(e.target.value)}
            placeholder={"e.g. Kennedy off Saturday all day, Gwen off Monday 12pm-6pm, Sam off Wednesday\n\nOr leave blank if no time-off this week."}
            style={{ ...si, minHeight: 80, resize: "vertical", marginBottom: 12 }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={handleParseTimeOffs} style={{ padding: "10px 24px", borderRadius: 8, border: "none", background: "#111827", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: font }}>
              {toText.trim() ? "Next →" : "Skip — No Time-Off →"}
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 2: Confirm Time-Offs ── */}
      {!isSaved && step === "review" && (
        <div style={{ background: "#fff", borderRadius: 12, padding: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.06)", marginBottom: 16, border: "2px solid #F59E0B" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 22 }}>✅</span>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>Step 2: Confirm time-off</div>
          </div>

          {weeklyTOs.length === 0 ? (
            <div style={{ fontSize: 13, color: "#6B7280", marginBottom: 12 }}>No time-off this week — ready to generate!</div>
          ) : (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 8 }}>Detected {weeklyTOs.length} time-off(s). Remove any that are wrong:</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {weeklyTOs.map((to, i) => {
                  const dt = new Date(to.date + "T12:00:00");
                  const dayName = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dt.getDay()];
                  return (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "#FEF3C7", borderRadius: 8, fontSize: 12 }}>
                      <span style={{ fontWeight: 700, color: "#92400E", minWidth: 100 }}>{to.empName}</span>
                      <span style={{ fontWeight: 600, color: "#374151" }}>{dayName} {dt.getMonth() + 1}/{dt.getDate()}</span>
                      <span style={{ color: "#6B7280" }}>
                        {to.allDay ? "All day" : `${fmtTime(to.start)}–${fmtTime(to.end)}`}
                      </span>
                      <div style={{ flex: 1 }} />
                      <button onClick={() => removeTo(i)} style={{ background: "none", border: "none", cursor: "pointer", color: "#DC2626", fontSize: 11, fontWeight: 600 }}>✕ Remove</button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Per-day staffing inputs */}
          {dayStaffing && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 16 }}>👥</span>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>Staffing per day</div>
                <div style={{ fontSize: 11, color: "#9CA3AF" }}>— adjust before generating</div>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, minWidth: 700 }}>
                  <thead>
                    <tr>
                      <th style={{ padding: "4px 6px", fontSize: 10, fontWeight: 700, color: "#9CA3AF", textAlign: "left", width: 60 }}></th>
                      {weekDates.map((d, i) => {
                        const dt = new Date(d + "T12:00:00");
                        const dayType = getDayType(d, schoolDates);
                        const isH = dayType.includes("Holiday");
                        return (
                          <th key={d} style={{ padding: "4px 4px", textAlign: "center", fontSize: 10, fontWeight: 700, color: isH ? "#DC2626" : "#374151" }}>
                            {dayLabels[i]} {dt.getDate()}
                            {isH && <div style={{ fontSize: 8, color: "#DC2626" }}>HOLIDAY</div>}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { key: "day", label: "Day", color: "#16A34A" },
                      { key: "mid", label: "Mid", color: "#0891B2" },
                      { key: "evening", label: "Eve", color: "#7C3AED" },
                    ].map(row => (
                      <tr key={row.key}>
                        <td style={{ padding: "3px 6px", fontSize: 10, fontWeight: 700, color: row.color }}>{row.label}</td>
                        {weekDates.map(d => {
                          const val = dayStaffing[d]?.[row.key] ?? 0;
                          return (
                            <td key={d} style={{ padding: "2px 2px", textAlign: "center" }}>
                              <div style={{ display: "inline-flex", alignItems: "center", gap: 1 }}>
                                <button onClick={() => setDayStaffing(prev => ({ ...prev, [d]: { ...prev[d], [row.key]: Math.max(0, val - 1) } }))}
                                  style={{ width: 20, height: 20, borderRadius: 4, border: "1px solid #D1D5DB", background: "#fff", cursor: "pointer", fontSize: 11, fontWeight: 700, color: "#374151", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>-</button>
                                <span style={{ width: 18, textAlign: "center", fontSize: 13, fontWeight: 800, color: "#111827" }}>{val}</span>
                                <button onClick={() => setDayStaffing(prev => ({ ...prev, [d]: { ...prev[d], [row.key]: val + 1 } }))}
                                  style={{ width: 20, height: 20, borderRadius: 4, border: "1px solid #D1D5DB", background: "#fff", cursor: "pointer", fontSize: 11, fontWeight: 700, color: "#374151", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>+</button>
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    <tr>
                      <td style={{ padding: "3px 6px", fontSize: 10, fontWeight: 800, color: "#111827" }}>Total</td>
                      {weekDates.map(d => {
                        const s = dayStaffing[d] || {};
                        const total = (s.day || 0) + (s.mid || 0) + (s.evening || 0);
                        return <td key={d} style={{ padding: "2px 2px", textAlign: "center", fontSize: 12, fontWeight: 800, color: "#111827" }}>{total}</td>;
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setStep("timeoff")} style={{ padding: "10px 18px", borderRadius: 8, border: "1px solid #D1D5DB", background: "#fff", color: "#6B7280", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: font }}>← Back</button>
            <button onClick={handleGenerate} style={{ padding: "10px 24px", borderRadius: 8, border: "none", background: "#111827", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: font }}>
              ⚡ Generate Schedule
            </button>
          </div>
        </div>
      )}

      {/* ── RESULT ── */}
      {(result && (step === "result" || isSaved)) && (
        <>
          {/* Warnings */}
          {result.warnings.length > 0 && (
            <div style={{ background: "#FEF3C7", borderRadius: 12, padding: 14, marginBottom: 16, border: "1px solid #FDE68A" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#92400E", marginBottom: 6 }}>⚠ Warnings ({result.warnings.length})</div>
              {result.warnings.map((w, i) => (
                <div key={i} style={{ fontSize: 12, color: "#92400E", marginBottom: 2 }}>
                  {w.date && <span style={{ fontWeight: 600 }}>{new Date(w.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} — </span>}
                  {w.msg}
                </div>
              ))}
            </div>
          )}

          {/* View Toggle + Grid */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            {selected && !isSaved ? (
              <div style={{ fontSize: 12, fontWeight: 600, color: "#2563EB", background: "#DBEAFE", padding: "6px 14px", borderRadius: 8, display: "flex", alignItems: "center", gap: 6 }}>
                🔀 Click another cell to swap, or same cell to cancel
                <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#DC2626", fontWeight: 700, fontSize: 11 }}>✕</button>
              </div>
            ) : !isSaved && draft ? (
              <div style={{ fontSize: 11, color: "#9CA3AF" }}>💡 Click any cell to select, then click another to swap</div>
            ) : <div />}
            <div style={{ display: "flex", background: "#F3F4F6", borderRadius: 8, padding: 2 }}>
              {[["shift", "Shift View"], ["employee", "Employee View"]].map(([k, l]) => (
                <button key={k} onClick={() => setViewMode(k)} style={{
                  padding: "5px 14px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer",
                  border: "none", fontFamily: font,
                  background: viewMode === k ? "#111827" : "transparent",
                  color: viewMode === k ? "#fff" : "#6B7280",
                }}>{l}</button>
              ))}
            </div>
          </div>

          {viewMode === "shift" ? (
          <div style={{ overflowX: "auto", background: "#fff", borderRadius: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.06)", marginBottom: 16 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 900 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #E5E7EB" }}>
                  <th style={{ padding: "10px 10px", textAlign: "left", fontWeight: 700, color: "#6B7280", fontSize: 10, width: 110, position: "sticky", left: 0, background: "#fff", zIndex: 1 }}>SHIFT</th>
                  {weekDates.map((d, i) => {
                    const dt = new Date(d + "T12:00:00");
                    const dayType = getDayType(d, schoolDates);
                    const isH = dayType.includes("Holiday");
                    const isMC = i === 3 || i === 6;
                    return (
                      <th key={d} style={{ padding: "10px 6px", textAlign: "center", fontWeight: 700, fontSize: 10.5, color: isH ? "#DC2626" : "#374151", background: isMC ? "#F5F3FF" : isH ? "#FEF2F2" : "transparent" }}>
                        <div>{dayLabels[i]}</div>
                        <div style={{ fontSize: 9, fontWeight: 500, color: "#9CA3AF" }}>{dt.getMonth() + 1}/{dt.getDate()}</div>
                        {isH && <div style={{ fontSize: 7.5, color: "#DC2626", fontWeight: 700 }}>HOLIDAY</div>}
                        {isMC && <div style={{ fontSize: 7.5, color: "#7C3AED", fontWeight: 700 }}>MC NIGHT</div>}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {getRows().map(row => {
                  const colors = tc[row.type] || { color: "#374151", bg: "transparent" };
                  return (
                    <tr key={`${row.type}-${row.order}`} style={{ borderBottom: "1px solid #F3F4F6" }}>
                      <td style={{ padding: "7px 8px", fontWeight: 700, fontSize: 9.5, color: colors.color, background: colors.bg, whiteSpace: "nowrap", position: "sticky", left: 0, zIndex: 1 }}>{row.label}</td>
                      {weekDates.map(d => {
                        const match = (result.schedule[d] || []).find(a => a.type === row.type && a.order === row.order);
                        if (!match) return <td key={d} style={{ padding: "6px 4px", textAlign: "center", color: "#E5E7EB", fontSize: 10 }}>—</td>;
                        const un = !match.empId; const isTr = match.empRole === "trainee"; const isSL = match.empRole === "shift_lead";
                        const isSel = selected && selected.date === d && selected.type === row.type && selected.order === row.order;
                        const canClick = !isSaved && draft;
                        return (
                          <td key={d}
                            onClick={canClick ? () => handleCellClick(d, row.type, row.order) : undefined}
                            style={{ padding: "5px 4px", textAlign: "center", cursor: canClick ? "pointer" : "default", background: isSel ? "#DBEAFE" : "transparent", transition: "background 0.15s" }}
                          >
                            <div style={{
                              padding: "5px 4px", borderRadius: 6, fontSize: 11, fontWeight: 600,
                              color: un ? "#DC2626" : isTr ? "#7C3AED" : isSL ? "#B45309" : "#374151",
                              background: un ? "#FEE2E2" : isTr ? "#EDE9FE" : isSL ? "#FEF3C7" : "#F9FAFB",
                              border: isSel ? "2px solid #2563EB" : un ? "1px dashed #FCA5A5" : "1px solid #E5E7EB",
                              boxShadow: isSel ? "0 0 0 2px rgba(37,99,235,0.2)" : "none",
                            }}>{match.empName.split(" ")[0]}</div>
                            <div style={{ fontSize: 8, color: "#9CA3AF", marginTop: 1 }}>{fmtTime(match.start)}–{fmtTime(match.end)}</div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          ) : (
          /* ── EMPLOYEE VIEW (Homebase-style) ── */
          <div style={{ overflowX: "auto", background: "#fff", borderRadius: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.06)", marginBottom: 16 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 1000 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #E5E7EB" }}>
                  <th style={{ padding: "12px 10px", textAlign: "left", fontWeight: 700, color: "#6B7280", fontSize: 10, width: 150, position: "sticky", left: 0, background: "#fff", zIndex: 2 }}></th>
                  {weekDates.map((d, i) => {
                    const dt = new Date(d + "T12:00:00");
                    const dayType = getDayType(d, schoolDates);
                    const isH = dayType.includes("Holiday");
                    return (
                      <th key={d} style={{ padding: "12px 6px", textAlign: "center", fontWeight: 700, fontSize: 13, color: isH ? "#DC2626" : "#374151", borderBottom: "none", minWidth: 110 }}>
                        <div>{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][dt.getDay()]}, {dt.getDate()}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const sortedEmps = employees.filter(e => e.status === "active").sort((a, b) => {
                    const o = { shift_lead: 0, regular: 1, trainee: 2 };
                    return (o[a.role] || 3) - (o[b.role] || 3) || a.name.localeCompare(b.name);
                  });

                  // Shift block colors matching Homebase
                  const shiftColors = {
                    day_lead: { bg: "#22C55E", text: "#fff", label: "Day Shift Lead" },
                    day: { bg: "#4ADE80", text: "#fff", label: "Weekday Day" },
                    mid: { bg: "#FB923C", text: "#fff", label: "Mid Shift" },
                    evening_sl: { bg: "#EF4444", text: "#fff", label: "Shift Lead" },
                    evening: { bg: "#A855F7", text: "#fff", label: "Night Shift" },
                    mc_leader: { bg: "#F59E0B", text: "#fff", label: "Shiftlead/Machineclean" },
                    mc_sl_helper: { bg: "#F59E0B", text: "#fff", label: "Machineclean" },
                    mc_helper: { bg: "#F59E0B", text: "#fff", label: "Machineclean" },
                  };
                  // Weekend day gets different color
                  const weekendDayColor = { bg: "#3B82F6", text: "#fff", label: "Weekend Day" };

                  // Role colors for initials circle
                  const roleCircle = { shift_lead: "#EF4444", regular: "#3B82F6", trainee: "#A855F7" };

                  return (
                    <>
                      {sortedEmps.map(emp => {
                        const totalHrs = result.empHours[emp.id] || 0;
                        const initials = emp.name.split(" ").map(w => w[0]).join("").toUpperCase();
                        const below = (result.empShiftCount[emp.id] || 0) < emp.minShifts;

                        return (
                          <tr key={emp.id} style={{ borderBottom: "1px solid #F3F4F6" }}>
                            {/* Employee name cell */}
                            <td style={{ padding: "10px 10px", position: "sticky", left: 0, background: "#fff", zIndex: 1, borderRight: "1px solid #E5E7EB", verticalAlign: "top" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <div style={{
                                  width: 32, height: 32, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                                  background: roleCircle[emp.role] || "#9CA3AF", color: "#fff", fontSize: 11, fontWeight: 800, flexShrink: 0,
                                }}>{initials}</div>
                                <div>
                                  <div style={{ fontWeight: 700, fontSize: 12, color: below ? "#DC2626" : "#374151", lineHeight: 1.2 }}>{emp.name}</div>
                                  <div style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600 }}>{totalHrs.toFixed(2)} hrs</div>
                                </div>
                              </div>
                            </td>
                            {/* Day cells */}
                            {weekDates.map((d, di) => {
                              const shifts = (result.schedule[d] || []).filter(a => a.empId === emp.id);
                              const dt = new Date(d + "T12:00:00");
                              const dow = dt.getDay();
                              const isWE = dow === 0 || dow === 6;
                              const dayKey = DAYS[dow === 0 ? 6 : dow - 1];
                              const u = emp.unavailability[dayKey];

                              // Check for weekly time-offs
                              const weekTO = weeklyTOs.filter(t => t.empId === emp.id && t.date === d);
                              const hasTO = weekTO.length > 0;

                              // Check unavailability
                              const hasUnavail = u.allDay || (u.start && u.end);
                              const showUnavail = hasUnavail && shifts.length === 0;

                              return (
                                <td key={d}
                                  style={{ padding: "6px 4px", verticalAlign: "top", minHeight: 60 }}>
                                  {/* Time-off block */}
                                  {hasTO && weekTO.map((to, ti) => (
                                    <div key={`to-${ti}`} style={{
                                      padding: "6px 8px", borderRadius: 6, marginBottom: 3,
                                      background: "#F3F4F6", border: "1px solid #D1D5DB",
                                    }}>
                                      <div style={{ fontSize: 10, color: "#6B7280", fontWeight: 600 }}>⏰ Time-off</div>
                                      <div style={{ fontSize: 9, color: "#9CA3AF" }}>{to.allDay ? "All Day" : `${fmtTime(to.start)}–${fmtTime(to.end)}`}</div>
                                    </div>
                                  ))}
                                  {/* Unavailability block */}
                                  {showUnavail && !hasTO && (
                                    <div style={{
                                      padding: "6px 8px", borderRadius: 6, marginBottom: 3,
                                      background: "#F9FAFB", border: "1px dashed #D1D5DB",
                                    }}>
                                      <div style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600 }}>Unavailable</div>
                                      <div style={{ fontSize: 9, color: "#D1D5DB" }}>{u.allDay ? "All Day" : `${fmtTime(u.start)}–${fmtTime(u.end)}`}</div>
                                    </div>
                                  )}
                                  {/* Shift blocks */}
                                  {shifts.map((s, si) => {
                                    let sColors = shiftColors[s.type] || { bg: "#6B7280", text: "#fff", label: s.label };
                                    if (isWE && (s.type === "day_lead" || s.type === "day")) sColors = { ...sColors, ...weekendDayColor, label: s.type === "day_lead" ? "Shift Lead" : "Weekend Day" };
                                    if (s.type === "day_lead" && !isWE) sColors = { ...sColors, label: "Day Shift Lead" };

                                    return (
                                      <div key={si}
                                        style={{
                                          padding: "7px 8px", borderRadius: 6, marginBottom: 3,
                                          background: sColors.bg, color: sColors.text, minHeight: 36,
                                        }}>
                                        <div style={{ fontSize: 11, fontWeight: 700 }}>{fmtTime(s.start)}–{fmtTime(s.end)}</div>
                                        <div style={{ fontSize: 9, fontWeight: 600, opacity: 0.9 }}>{sColors.label}</div>
                                      </div>
                                    );
                                  })}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                      {/* Daily totals row */}
                      <tr style={{ borderTop: "2px solid #E5E7EB", background: "#F9FAFB" }}>
                        <td style={{ padding: "10px 10px", fontWeight: 700, fontSize: 11, color: "#374151", position: "sticky", left: 0, background: "#F9FAFB", zIndex: 1, borderRight: "1px solid #E5E7EB" }}>
                          Hours
                        </td>
                        {weekDates.map(d => {
                          const dayAssignments = result.schedule[d] || [];
                          const filled = dayAssignments.filter(a => a.empId);
                          const totalHrs = filled.reduce((sum, a) => sum + a.hours, 0);
                          return (
                            <td key={d} style={{ padding: "8px 6px", textAlign: "center" }}>
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                                <span style={{ fontSize: 11, color: "#6B7280" }}>👤 {filled.length}</span>
                                <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>{totalHrs.toFixed(2)}</span>
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    </>
                  );
                })()}
              </tbody>
            </table>
          </div>
          )}

          {/* Accept / Reject */}
          {!isSaved && draft && (
            <div style={{ background: "#fff", borderRadius: 12, padding: 18, boxShadow: "0 1px 3px rgba(0,0,0,0.06)", marginBottom: 16, border: "2px solid #F59E0B" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#111827", marginBottom: 4 }}>Does this schedule look good?</div>
              <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 12 }}>Accept to save, or describe what needs to change and regenerate.</div>
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <button onClick={handleAccept} style={{ padding: "10px 28px", borderRadius: 8, border: "none", background: "#22C55E", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: font }}>✓ Accept & Save</button>
                <button onClick={() => { setDraft(null); setStep("timeoff"); setNotes([]); }} style={{ padding: "10px 20px", borderRadius: 8, border: "1px solid #D1D5DB", background: "#fff", color: "#6B7280", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: font }}>✕ Start Over</button>
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 6 }}>What needs to change?</div>
              <div style={{ display: "flex", gap: 8 }}>
                <input value={prompt} onChange={e => setPrompt(e.target.value)} onKeyDown={e => { if (e.key === "Enter") handleReject(); }}
                  placeholder="e.g. Swap Kennedy and Gwen on Saturday, move Crystal to Thursday MC..." style={{ ...si, flex: 1 }} />
                <button onClick={handleReject} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#111827", color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: font, whiteSpace: "nowrap" }}>🔄 Regenerate</button>
              </div>
              {notes.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", marginBottom: 4 }}>CHANGE LOG:</div>
                  {notes.map((n, i) => <div key={i} style={{ fontSize: 11, color: "#92400E", padding: "4px 8px", background: "#FEF3C7", borderRadius: 4, marginBottom: 2 }}>💬 {n}</div>)}
                </div>
              )}
            </div>
          )}

          {/* Saved banner */}
          {isSaved && (
            <div style={{ background: "#F0FDF4", borderRadius: 12, padding: 14, marginBottom: 16, border: "1px solid #BBF7D0", display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#16A34A" }}>✓ Schedule saved</span>
              <span style={{ fontSize: 11, color: "#6B7280" }}>{saved.savedAt && `Saved ${new Date(saved.savedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`}</span>
              <div style={{ flex: 1 }} />
              <button onClick={handleUnsave} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #FCA5A5", background: "#FEF2F2", color: "#DC2626", cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: font }}>Unsave & Edit</button>
            </div>
          )}

          {/* Employee Summary */}
          <div style={{ background: "#fff", borderRadius: 12, padding: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#111827", marginBottom: 10 }}>Employee Summary</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 8 }}>
              {employees.filter(e => e.status === "active").sort((a, b) => {
                const o = { shift_lead: 0, regular: 1, trainee: 2 };
                return (o[a.role] || 3) - (o[b.role] || 3);
              }).map(emp => {
                const shifts = result.empShiftCount[emp.id] || 0;
                const hours = result.empHours[emp.id] || 0;
                const below = shifts < emp.minShifts;
                const rc = { shift_lead: "#F59E0B", regular: "#3B82F6", trainee: "#8B5CF6" };
                return (
                  <div key={emp.id} style={{ padding: "9px 11px", borderRadius: 8, background: below ? "#FEF2F2" : "#F9FAFB", border: below ? "2px solid #FCA5A5" : "1px solid #E5E7EB" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>{emp.name}</span>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: rc[emp.role] }} />
                    </div>
                    <div style={{ display: "flex", gap: 10, marginTop: 3, fontSize: 11 }}>
                      <span style={{ color: below ? "#DC2626" : "#6B7280", fontWeight: below ? 700 : 500 }}>{shifts} shifts{below ? ` (min: ${emp.minShifts})` : ""}</span>
                      <span style={{ color: "#9CA3AF" }}>{hours.toFixed(1)}h</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
