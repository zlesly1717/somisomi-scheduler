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
function genSchedule(weekDates, employees, rules, schoolDates, weeklyTimeOffs) {
  const schedule = {};
  const sc = {}, sh = {}, sd = {};
  const warnings = [];
  const active = employees.filter(e => e.status === "active");
  active.forEach(e => { sc[e.id] = 0; sh[e.id] = 0; sd[e.id] = new Set(); });
  weekDates.forEach(d => { schedule[d] = []; });

  const con = id => { const c = rules.constraints.find(x => x.id === id); return c ? c.enabled : true; };
  const T = rules.shiftTimes;
  const nightMap = {};

  // ── FRI→SUN FIRST, THEN MON→THU ──
  const schedOrder = [4, 5, 6, 0, 1, 2, 3];

  schedOrder.forEach(dayIndex => {
    const dateStr = weekDates[dayIndex];
    const dayType = getDayType(dateStr, schoolDates);
    const staffing = rules.staffing[dayType] || rules.staffing.weekday;
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
      if (isWE && !slot.isMC) {
        const f = cands.filter(e => (rules.goodWeekendPeople || []).includes(e.name));
        if (f.length > 0) cands = f;
      }

      // For non-MC non-SL slots: prefer regulars, but include trainees if they need shifts
      if (!slot.slOnly && !slot.isMC) {
        const nonTr = cands.filter(e => e.role !== "trainee");
        const trainees = cands.filter(e => e.role === "trainee");
        const traineesBelowMin = trainees.filter(e => sc[e.id] < e.minShifts);

        // If all regulars are at or above their min, let trainees who need shifts in
        const regsAboveMin = nonTr.every(e => sc[e.id] >= e.minShifts);
        if (regsAboveMin && traineesBelowMin.length > 0) {
          cands = [...traineesBelowMin, ...nonTr];
        } else if (nonTr.length > 0) {
          cands = nonTr;
        }
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
        if (tm(slot.start) >= 1020 || slot.isMC) { if (!nightMap[dateStr]) nightMap[dateStr] = new Set(); nightMap[dateStr].add(ch.id); }
      } else {
        schedule[dateStr].push({ ...slot, empId: null, empName: "⚠ UNFILLED", empRole: null });
        warnings.push({ date: dateStr, msg: `No available employee for ${slot.label}` });
      }
    };

    slots.filter(s => s.slOnly).forEach(assign);
    slots.filter(s => !s.slOnly).forEach(assign);
  });

  // Check minimums
  active.forEach(e => {
    if (sc[e.id] < e.minShifts) {
      warnings.push({ date: "", msg: `${e.name} has ${sc[e.id]} shifts (minimum: ${e.minShifts})` });
    }
  });

  return { schedule, empShiftCount: sc, empHours: sh, warnings };
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

  const weekDates = getWeekDates(weekStart);
  const weekKey = weekDates[0];
  const saved = savedSchedules?.[weekKey] || null;
  const result = saved || draft;
  const isSaved = !!saved;
  const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  const handleParseTimeOffs = () => {
    const parsed = parseTimeOffs(toText, employees.filter(e => e.status === "active"), weekDates);
    setWeeklyTOs(parsed);
    setStep("review");
  };

  const handleGenerate = () => {
    setGenerating(true);
    setStep("result");
    setTimeout(() => {
      // Combine stored timeOffs + weekly parsed ones
      const allTOs = [...(timeOffs || []), ...weeklyTOs];
      const r = genSchedule(weekDates, employees, rules, schoolDates, allTOs);
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
    setWeeklyTOs([]); setToText(""); setStep("timeoff");
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

          {/* Grid */}
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
                        return (
                          <td key={d} style={{ padding: "5px 4px", textAlign: "center" }}>
                            <div style={{ padding: "5px 4px", borderRadius: 6, fontSize: 11, fontWeight: 600, color: un ? "#DC2626" : isTr ? "#7C3AED" : isSL ? "#B45309" : "#374151", background: un ? "#FEE2E2" : isTr ? "#EDE9FE" : isSL ? "#FEF3C7" : "#F9FAFB", border: un ? "1px dashed #FCA5A5" : "1px solid #E5E7EB" }}>{match.empName.split(" ")[0]}</div>
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
