import { useState } from "react";
import { DAYS, fmtTime, ROLE_CONFIG } from "./constants";

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

function isAvail(emp, dateStr, s, e, weeklyTimeOffs, availOverrides) {
  const overrideKey = dateStr + ":" + emp.id;
  const ov = availOverrides?.[overrideKey];
  // Check for explicit override: "all" = all day, "morning" = before 6pm, "evening" = 6pm+
  if (ov) {
    if (ov === "all") return true;
    if (ov === "morning" && tm(e) <= 1080) return true; // shift ends by 6pm
    if (ov === "evening" && tm(s) >= 900) return true; // shift starts 3pm or later
  }

  const d = new Date(dateStr + "T12:00:00");
  const dk = DAYS[d.getDay() === 0 ? 6 : d.getDay() - 1];
  const u = emp.unavailability[dk];
  if (u.allDay) return false;
  if (u.start && u.end && tm(s) < tm(u.end) && tm(u.start) < tm(e)) return false;
  const to = weeklyTimeOffs.filter(t => t.empId === emp.id && t.date === dateStr);
  for (const t of to) {
    if (t.allDay) return false;
    if (t.start && t.end && tm(s) < tm(t.end) && tm(t.start) < tm(e)) return false;
  }
  return true;
}

function parseTimeOffs(text, employees, weekDates) {
  const results = [];
  if (!text.trim()) return results;
  const dayMap = {
    monday: 0, mon: 0, tuesday: 1, tue: 1, tues: 1, wednesday: 2, wed: 2,
    thursday: 3, thu: 3, thurs: 3, friday: 4, fri: 4, saturday: 5, sat: 5, sunday: 6, sun: 6,
  };

  // Build a lookup of date numbers to weekDates indices
  const dateNumMap = {};
  weekDates.forEach((d, i) => {
    const dt = new Date(d + "T12:00:00");
    dateNumMap[dt.getDate()] = i;
  });

  const parts = text.split(/[,;.]|\band\b/i).map(s => s.trim()).filter(Boolean);
  let lastEmp = null;
  for (const part of parts) {
    const lower = part.toLowerCase();
    let foundEmp = null;
    for (const emp of employees) {
      const first = emp.name.split(" ")[0].toLowerCase();
      const full = emp.name.toLowerCase();
      if (lower.includes(full) || lower.includes(first)) { foundEmp = emp; break; }
    }
    if (foundEmp) lastEmp = foundEmp;
    const emp = foundEmp || lastEmp;
    if (!emp) continue;

    const isAllDay = lower.includes("all day") || lower.includes("whole day") || lower.includes("off");

    // Try to match date ranges like "19th-22nd", "19-22", "march 19-22"
    const rangeMatch = lower.match(/(\d{1,2})\s*(?:st|nd|rd|th)?\s*[-\u2013to]+\s*(\d{1,2})\s*(?:st|nd|rd|th)?/);
    if (rangeMatch) {
      const startNum = +rangeMatch[1];
      const endNum = +rangeMatch[2];
      let found = false;
      for (let n = startNum; n <= endNum; n++) {
        if (dateNumMap[n] !== undefined) {
          results.push({ empId: emp.id, empName: emp.name, date: weekDates[dateNumMap[n]], allDay: true, start: "", end: "" });
          found = true;
        }
      }
      if (found) continue;
    }

    // Try to match single date numbers like "the 19th", "on 19"
    const singleDateMatch = lower.match(/\b(\d{1,2})\s*(?:st|nd|rd|th)?\b/);

    // Try day name match
    let foundDay = null;
    for (const [name, idx] of Object.entries(dayMap)) { if (lower.includes(name)) { foundDay = idx; break; } }

    if (foundDay !== null) {
      const date = weekDates[foundDay];
      const timeMatch = part.match(/(\d{1,2})\s*(?::(\d{2}))?\s*(am|pm)?\s*[-\u2013to]+\s*(\d{1,2})\s*(?::(\d{2}))?\s*(am|pm)?/i);
      if (timeMatch && !isAllDay) {
        let [, h1, m1, ap1, h2, m2, ap2] = timeMatch;
        h1 = +h1; m1 = m1 ? +m1 : 0; h2 = +h2; m2 = m2 ? +m2 : 0;
        ap1 = (ap1 || "").toLowerCase(); ap2 = (ap2 || "").toLowerCase();
        if (!ap1 && !ap2) { if (h1 < 8) { ap1 = "pm"; ap2 = "pm"; } else { ap1 = h1 >= 12 ? "pm" : "am"; ap2 = h2 >= 12 ? "pm" : "am"; } }
        if (!ap1) ap1 = ap2; if (!ap2) ap2 = h2 < h1 ? "pm" : ap1;
        if (ap1 === "pm" && h1 < 12) h1 += 12; if (ap1 === "am" && h1 === 12) h1 = 0;
        if (ap2 === "pm" && h2 < 12) h2 += 12; if (ap2 === "am" && h2 === 12) h2 = 0;
        results.push({ empId: emp.id, empName: emp.name, date, allDay: false, start: String(h1).padStart(2,"0")+":"+String(m1).padStart(2,"0"), end: String(h2).padStart(2,"0")+":"+String(m2).padStart(2,"0") });
      } else {
        results.push({ empId: emp.id, empName: emp.name, date, allDay: true, start: "", end: "" });
      }
    } else if (singleDateMatch && dateNumMap[+singleDateMatch[1]] !== undefined) {
      // Match single date number that falls within the week
      const idx = dateNumMap[+singleDateMatch[1]];
      results.push({ empId: emp.id, empName: emp.name, date: weekDates[idx], allDay: true, start: "", end: "" });
    }
  }
  return results;
}

// === GENERATE ENGINE ===
function genSchedule(weekDates, employees, rules, schoolDates, weeklyTimeOffs, dayStaffingOverrides, availOverrides, weeklyMaxOverrides, approvedBreaks, savedSchedules, priorityRanking, importantEvenings) {
  // ─────────────────────────────────────────────────────────────────
  // ENGINE PHILOSOPHY (V4):
  // 1. SLs first — 1 per shift, 15-20h, rotate who gets fewer hours
  // 2. Regulars — split remaining slots equally (everyone ~same hours)
  // 3. Trainees — Mon-Thu evenings only (leave 10:30pm), 10-15h
  //    - Trainees only on weekends if explicitly added (5th slot)
  //    - Thu: SL + 2 reg + 1 trainee evening (trainee leaves before MC)
  //
  // CANNOT BREAK (never relaxed, slot stays empty before breaking):
  //   - No doubles
  //   - No trainees on MC nights
  //   - Employee must be available for shift time
  //   - No day shift after MC night
  //   - No Fri+Sat+Sun all 3 days same person
  //   - No MC more than once per week
  //   - SL-only slots must have SL (Day Lead, Evening SL, MC slots)
  //   - No two trainees on same day
  //   - No trainees on weekday day shifts
  //   - SLs blocked from Mon–Wed evenings
  //   - Mon–Thu day shifts: only 1 SL (the Day Lead slot)
  //   - Thu MC: Crystal leads + 2 regular helpers
  //   - Crystal off Sundays (unless availability override set)
  //   - Equal hours distribution (balance pass always runs)
  //
  // FLEXIBLE (asked before breaking, in priority order):
  //   F1: Good weekend people preferred on weekends
  //   F2: Grae max 1 weekend shift
  //   F3: 2nd day priority list (Lena, Abrar first)
  //   F4: Trainees preferred on Mon-Thu evenings
  //   F5: Regulars preferred over SLs on weekday 2nd day slots
  //   F6: Max shifts cap per employee
  //   F7: No Fri+Sat night same person
  //   F8: No Sat+Sun night same person
  //   F9: Max 3 consecutive days
  //   F10: Min 2 swirlers per weekend shift
  //   F11: Fri/Sat/Sun target 2 SLs per evening
  // ─────────────────────────────────────────────────────────────────
  const schedule = {};
  const active = employees.filter(e => e.status === "active").map(e => ({...e})); // clone to avoid mutating props
  // sc=shift count, sh=hours, sd=days worked set
  const sc = {}, sh = {}, sd = {};
  active.forEach(e => { sc[e.id] = 0; sh[e.id] = 0; sd[e.id] = new Set(); });
  weekDates.forEach(d => { schedule[d] = []; });

  // ── STEP 1: Compute each employee's available shift budget for this week ──
  // Count how many days each person is actually available (ignoring min/max entirely).
  // Budget = number of days they CAN work, capped at their maxShifts.
  // This is what we balance against, not arbitrary min/max numbers.
  active.forEach(e => {
    let availCount = 0;
    weekDates.forEach(d => {
      const overrideKey = d + ":" + e.id;
      if (availOverrides?.[overrideKey] === "all") { availCount++; return; }
      const hasTO = weeklyTimeOffs.some(t => t.empId === e.id && t.date === d && t.allDay);
      const dow = new Date(d + "T12:00:00").getDay();
      const dayKeys = ["sun","mon","tue","wed","thu","fri","sat"];
      const unavail = e.unavailability?.[dayKeys[dow]];
      if (!hasTO && !unavail?.allDay) availCount++;
    });
    // Apply weekly overrides if set (manager explicitly said "give X shifts this week")
    const wmo = weeklyMaxOverrides?.[e.id];
    if (wmo && typeof wmo === "object") {
      e._effMaxShifts = typeof wmo.max === "number" ? wmo.max : e.maxShifts;
      e._effMinShifts = typeof wmo.min === "number" ? wmo.min : 0;
    } else {
      e._effMaxShifts = e.maxShifts;
      e._effMinShifts = 0; // ignore minimums — balance decides
    }
    // Safety: correct stale maxShifts/maxHours if role changed without updating numbers
    // (e.g. trainee promoted to regular but maxShifts still = 1)
    if (!wmo) {
      if (e.role === "regular" && e._effMaxShifts < 3) {
        e._effMaxShifts = 3; e.maxShifts = 3;
      }
      if (e.role === "regular" && e._effMaxHours < 12) {
        e._effMaxHours = 20; e.maxHours = 20;
      }
      if (e.role === "shift_lead" && e._effMaxShifts < 4) {
        e._effMaxShifts = 4; e.maxShifts = 4;
      }
    }
    e._effMaxHours = e.maxHours;
    e._effMinHours = 0;
    // Budget: how many shifts can we give them (availability capped at their max)
    e._budget = Math.min(availCount, e._effMaxShifts);
  });

  // ── Priority ranking & leftover bucket ───────────────────────────
  // Bottom SL gets 3 shifts (MC break week) + tagged so MC slots skip them
  // Leftover bucket people get scheduled LAST
  const breakSLId = (() => {
    if (priorityRanking?.sl?.length >= 1) {
      return priorityRanking.sl[priorityRanking.sl.length - 1];
    }
    // Fall back to weeklyMaxOverrides if set
    const slWithOverride = Object.entries(weeklyMaxOverrides || {}).find(([id, v]) => {
      const emp = active.find(e => e.id === id && e.role === "shift_lead");
      return emp && v?.max === 3;
    });
    return slWithOverride?.[0] || null;
  })();

  if (breakSLId) {
    const emp = active.find(e => e.id === breakSLId);
    if (emp && !weeklyMaxOverrides?.[breakSLId]) {
      emp._effMaxShifts = 3;
      emp._budget = Math.min(emp._budget, 3);
    }
    emp._isBreakSL = true; // flag to skip MC assignment
  }
  // Leftover bucket: identified by isLeftover flag in weeklyMaxOverrides
  // They keep their full max shifts but get scheduled after everyone else
  const leftoverEmpIds = new Set(
    Object.entries(weeklyMaxOverrides || {})
      .filter(([, v]) => v?.isLeftover)
      .map(([k]) => k)
  );

  // GRAE RULE: max 1 weekend shift, prefer to use her other shift on a weekday
  // (unless weekday is unavailable, then allow 2 weekends)
  const graeEmp = active.find(e => e.name === "Grae McKown");
  if (graeEmp) {
    graeEmp._maxWeekendShifts = 1; // soft cap — enforced during assignment
  }

  // ── STEP 1b: Compute target shifts for balancing ──────────────────
  const computeGroupAvg = (group) => {
    const budgets = group.map(e => e._budget);
    return budgets.length > 0 ? budgets.reduce((a, b) => a + b, 0) / budgets.length : 0;
  };
  const con = id => { const c = rules.constraints.find(x => x.id === id); return c ? c.enabled : true; };
  const T = rules.shiftTimes;
  const nightMap = {};
  const mcCount = {};
  const weCount = {};
  active.forEach(e => { mcCount[e.id] = 0; weCount[e.id] = 0; });

  // approvedBreaks: Set of flexible rule IDs the manager has approved breaking
  const approved = new Set(Array.isArray(approvedBreaks) ? approvedBreaks : []);

  // ── MC ROTATION HISTORY — build from saved schedules ──────────────
  // Count how many times each person has done MC and when was their last
  const mcHistoryCount = {}; // name → total MC count
  const mcHistoryLast = {};  // name → last week key
  active.forEach(e => { mcHistoryCount[e.name] = 0; mcHistoryLast[e.name] = null; });
  if (savedSchedules) {
    Object.entries(savedSchedules).sort((a, b) => a[0].localeCompare(b[0])).forEach(([key, data]) => {
      const sched = data.schedule || data;
      Object.values(sched).forEach(slots => {
        if (!Array.isArray(slots)) return;
        slots.forEach(slot => {
          if (!slot.isMC || !slot.empId) return;
          const name = slot.empName || "";
          if (mcHistoryCount[name] !== undefined) { mcHistoryCount[name]++; mcHistoryLast[name] = key; }
        });
      });
    });
  }

  // ── HELPERS ──────────────────────────────────────────────────────
  const slCheck = (slot, emp) => {
    if (!slot.slOnly) return true;
    return emp.role === "shift_lead";
  };

  // CANNOT BREAK: No day shift after MC night
  const dayAfterMCOK = (emp, dateStr, slotStart) => {
    if (tm(slotStart) >= 1020) return true; // evening slot, rule doesn't apply
    const dayIndex = weekDates.indexOf(dateStr);
    if (dayIndex <= 0) return true;
    const prevDate = weekDates[dayIndex - 1];
    return !nightMap[prevDate]?.has(emp.id);
  };

  // FLEXIBLE F7: No Fri+Sat night same person
  // FLEXIBLE F8: No Sat+Sun night same person
  const weekendNightOK = (emp, dateStr, slotStart, isMC) => {
    if (tm(slotStart) < 1020) return true;
    const dow2 = new Date(dateStr + "T12:00:00").getDay();
    if (!approved.has("F7") && con("no_fri_sat_night")) {
      if (dow2 === 5 && nightMap[weekDates[5]]?.has(emp.id)) return false;
      if (dow2 === 6 && nightMap[weekDates[4]]?.has(emp.id)) return false;
    }
    if (!approved.has("F8") && con("no_sat_sun_night")) {
      if (dow2 === 6 && nightMap[weekDates[6]]?.has(emp.id)) return false;
      if (dow2 === 0 && !isMC && nightMap[weekDates[5]]?.has(emp.id)) return false; // MC on Sun exempt
    }
    return true;
  };

  // FLEXIBLE F9: Max 3 consecutive days
  const consecOK = (emp, dayIndex2) => {
    if (approved.has("F9")) return true;
    if (!con("max_consecutive_3")) return true;
    let consec = 1;
    for (let c = 1; c <= 3; c++) { if (dayIndex2 + c > 6) break; if (sd[emp.id].has(weekDates[dayIndex2 + c])) consec++; else break; }
    for (let c = 1; c <= 3; c++) { if (dayIndex2 - c < 0) break; if (sd[emp.id].has(weekDates[dayIndex2 - c])) consec++; else break; }
    return consec <= 3;
  };

  // CANNOT BREAK: No Fri+Sat+Sun all 3 days
  const friSatSunOK = (emp, dateStr, slotSlOnly) => {
    if (!con("no_fri_sat_sun")) return true;
    // SLs may need to cover all 3 weekend days for required shifts — don't block them
    if (emp.role === "shift_lead" && slotSlOnly) return true;
    const d2 = new Date(dateStr + "T12:00:00").getDay();
    // Rule only applies when assigning a weekend day (Fri/Sat/Sun)
    if (d2 !== 5 && d2 !== 6 && d2 !== 0) return true;
    const overrideKey = dateStr + ":" + emp.id;
    if (availOverrides && availOverrides[overrideKey]) return true;
    const hasFri = sd[emp.id].has(weekDates[4]);
    const hasSat = sd[emp.id].has(weekDates[5]);
    const hasSun = sd[emp.id].has(weekDates[6]);
    const wouldHave = (d2 === 5 ? 1 : (hasFri ? 1 : 0)) + (d2 === 6 ? 1 : (hasSat ? 1 : 0)) + (d2 === 0 ? 1 : (hasSun ? 1 : 0));
    return wouldHave < 3;
  };

  // CANNOT BREAK: No two trainees same day
  const traineeOK = (emp, dateStr) => {
    if (!isTrainee(emp)) return true;
    if (!con("no_two_trainees")) return true;
    // Check using isTrainee() so graduated trainees don't count as "trainees"
    return !schedule[dateStr].some(a => {
      if (!a.empId) return false;
      const existing = active.find(e => e.id === a.empId);
      return existing && isTrainee(existing);
    });
  };

  const canSwirl = (emp) => {
    const swirlList = rules.swirl?.swirlers || [];
    if (swirlList.length > 0) return swirlList.includes(emp.name);
    return (emp.tags || []).includes("can_swirl");
  };

  // For rule checking: graduated trainees behave like regulars
  const isEffectivelyGraduated = (e) => e.role === "trainee" && (e.traineeCumulative || 0) >= (rules.trainee?.graduationHours || 30);
  const isTrainee = (emp) => emp.role === "trainee" && !isEffectivelyGraduated(emp);

  // CANNOT BREAK: Crystal off Sundays (unless explicit availability override)
  const crystalSundayOK = (emp, dateStr) => {
    if (emp.name !== "Crystal Guel") return true;
    const dow = new Date(dateStr + "T12:00:00").getDay();
    if (dow !== 0) return true;
    // Allow if manager set an explicit availability override
    const overrideKey = dateStr + ":" + emp.id;
    return !!(availOverrides && availOverrides[overrideKey]);
  };

  const assign = (dateStr, slotIndex, emp, slot) => {
    // Hard cap: never exceed _effMaxShifts regardless of which phase is assigning
    if (sc[emp.id] >= emp._effMaxShifts) return;
    // ABSOLUTE: never assign someone to two shifts on the same day
    if (sd[emp.id].has(dateStr)) return;
    _doAssign(dateStr, slotIndex, emp, slot);
  };
  const forceAssign = (dateStr, slotIndex, emp, slot) => {
    // No hard blocks — used only as absolute last resort to fill empty slots
    _doAssign(dateStr, slotIndex, emp, slot);
  };
  const _doAssign = (dateStr, slotIndex, emp, slot) => {
    // HARD RULE: never assign same person to both Sat night AND Sun night — too exhausting
    // EXCEPTION: MC slots on Sunday are required — SLs must do MC even if they worked Sat night
    const slotDow = new Date(dateStr + "T12:00:00").getDay();
    const isSatNight = slotDow === 6 && tm(slot.start || "18:00") >= 1020;
    const isSunNight = slotDow === 0 && tm(slot.start || "18:00") >= 1020;
    const isMCSlot = slot.isMC;
    if (isSatNight && nightMap[weekDates[6]]?.has(emp.id)) return; // already has Sun night
    if (isSunNight && !isMCSlot && nightMap[weekDates[5]]?.has(emp.id)) return; // already has Sat night (non-MC slots only)
    schedule[dateStr][slotIndex] = { ...slot, empId: emp.id, empName: emp.name, empRole: emp.role };
    sc[emp.id]++; sh[emp.id] += slot.hours; sd[emp.id].add(dateStr);
    if (slot.isMC) mcCount[emp.id]++;
    if (slot._isWE) weCount[emp.id]++;
    if (slot._isFri && tm(slot.start) >= 1020) weCount[emp.id]++;
    if (tm(slot.start) >= 1020 || slot.isMC) {
      if (!nightMap[dateStr]) nightMap[dateStr] = new Set();
      nightMap[dateStr].add(emp.id);
    }
  };

  // ── CORE CANDIDATE FILTER ────────────────────────────────────────
  // Applies all CANNOT BREAK rules always.
  // Applies FLEXIBLE rules only if NOT yet approved to break.
  const getCandidates = (slot, extraFilter) => {
    const dateStr = slot._dateStr;
    const dayIndex = slot._dayIndex;
    const isWE = slot._isWE;
    const isFri = slot._isFri;
    const dow = slot._dow;

    let cands = active.filter(emp => {
      // ── CANNOT BREAK rules ──
      if (!isAvail(emp, dateStr, slot.start, slot.end, weeklyTimeOffs, availOverrides)) return false;
      if (sd[emp.id].has(dateStr)) return false; // no doubles
      if (!slCheck(slot, emp)) return false; // SL-only slots need SL
      if (slot.noTrainee && !slot.isTraineeSlot && isTrainee(emp)) return false; // no trainees on weekend nights (except dedicated trainee slots like mid shift)
      if (slot.isImportant && emp.role === "trainee") return false; // block ALL trainees (incl. recently graduated) on important evenings
      if (slot.isMC && isTrainee(emp)) return false; // no trainees on MC
      if (slot.isMC && (emp.tags || []).includes("mc_exempt")) return false; // mc_exempt employees never MC
      if (slot.isMC && emp._isBreakSL) return false; // break SL skips MC this week
      if (con("no_mc_twice") && slot.isMC && mcCount[emp.id] >= 1) return false; // no MC twice
      if (isTrainee(emp) && (slot.type === "day_lead" || slot.type === "day")) return false; // no trainees on any day shift
      if (isTrainee(emp) && slot.type === "evening_sl") return false; // no trainees on SL-only evening slots
      if (isTrainee(emp) && slot.type === "evening_sl2") return false; // no trainees on 2nd SL slot
      if (!traineeOK(emp, dateStr)) return false; // no two trainees same day
      if (!friSatSunOK(emp, dateStr, slot.slOnly)) return false; // no all 3 weekend days
      if (!dayAfterMCOK(emp, dateStr, slot.start)) return false; // no day after MC night
      if (!crystalSundayOK(emp, dateStr)) return false; // Crystal off Sundays
      // SLs can only be on Mon-Wed evening via the slOnly evening_sl slot
      // Regular "evening" type slots on Mon-Wed are for regulars only
      // Thu: SLs allowed on evening slots ONLY if they're not already doing MC that night
      if (emp.role === "shift_lead" && slot.type === "evening" && !isWE && !isFri && dow >= 1 && dow <= 3) return false;
      if (emp.role === "shift_lead" && slot.type === "evening" && dow === 4 && mcCount[emp.id] >= 1) return false;
      // CANNOT BREAK: Only 1 SL on day shifts (the Day Lead slot)
      // The "day" type (2nd day slot) should never have an SL — regulars only
      if (emp.role === "shift_lead" && slot.type === "day") return false;
      if (schedule[dateStr].some(a => a.empId === emp.id)) return false;

      // ── FLEXIBLE rules (blocked unless approved) ──
      if (emp._effMaxShifts === 0) return false; // CANNOT BREAK: manual 0-shift override
      if (!approved.has("F6") && sc[emp.id] >= emp._effMaxShifts) return false;
      if (sh[emp.id] + slot.hours > emp._effMaxHours * (approved.has("F6") ? 1.5 : 1)) return false;
      if (!weekendNightOK(emp, dateStr, slot.start, slot.isMC)) return false; // F7/F8
      if (!consecOK(emp, dayIndex)) return false; // F9

      // FLEXIBLE F2: Grae max 1 weekend shift
      if (!approved.has("F2") && emp._maxWeekendShifts !== undefined) {
        const isWeekendSlot = dow === 0 || dow === 6 || (dow === 5 && tm(slot.start) >= 1020);
        if (isWeekendSlot) {
          const wkndSoFar = [4,5,6].reduce((c, wi) => c + (sd[emp.id].has(weekDates[wi]) ? 1 : 0), 0);
          if (wkndSoFar >= emp._maxWeekendShifts) {
            const hasWeekdayAvail = [0,1,2,3].some(wi =>
              !sd[emp.id].has(weekDates[wi]) &&
              isAvail(emp, weekDates[wi], "18:00", "22:30", weeklyTimeOffs, availOverrides)
            );
            if (hasWeekdayAvail) return false;
          }
        }
      }
      return true;
    });

    if (extraFilter) {
      // Deprioritize leftover bucket — move them to end so they fill last
      const filtered = extraFilter(cands).sort((a, b) => {
        const aL = leftoverEmpIds.has(a.id) ? 1 : 0;
        const bL = leftoverEmpIds.has(b.id) ? 1 : 0;
        return aL - bL;
      });
      if (filtered.length > 0) cands = filtered;
    }
    return cands;
  };

  const assignSlotInSchedule = (slot, emp) => {
    const dateStr = slot._dateStr;
    const idx = schedule[dateStr].findIndex(s =>
      s.type === slot.type && s.order === slot.order && !s.empId
    );
    if (idx >= 0) assign(dateStr, idx, emp, slot);
  };

  const needsSwirler = (slot) => {
    if (approved.has("F10")) return false; // swirl rule broken, don't force
    if (!con("min_swirlers_weekend")) return false;
    const isWeekendPeriod = slot._isWE || (slot._isFri && tm(slot.start) >= 1020);
    if (!isWeekendPeriod) return false;
    const minSwirl = rules.swirl?.minPerShift || 2;
    const dateStr = slot._dateStr;
    const isEve = tm(slot.start) >= 1020;
    const swirlersNow = schedule[dateStr].filter(a => {
      if (!a.empId) return false;
      const sameEve = tm(a.start) >= 1020 && isEve;
      const sameDay = tm(a.start) < 1020 && !isEve;
      if (!sameEve && !sameDay) return false;
      return canSwirl(active.find(e => e.id === a.empId));
    }).length;
    return swirlersNow < minSwirl;
  };
  const schedOrder = [3, 6, 5, 4, 0, 1, 2]; // Thu, Sun, Sat, Fri, Mon, Tue, Wed
  const allSlots = [];

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
    const dayKey = DAYS[dow === 0 ? 6 : dow - 1];
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
    if (staffing.mid > 0) { for (let i = 0; i < staffing.mid; i++) { slots.push({ type: "mid", label: "Mid Shift", start: midS, end: midE, hours: hrs(midS, midE), slOnly: false, isTraineeSlot: true, preferTrainee: true, order: 10 + i }); } }
    if (isMC) {
      // MC slots for the cleaning crew
      // Thu MC: 1 SL leader + 2 reg helpers = 3 total (owner helps in person)
      // Sun MC: 1 SL leader + 1 SL helper + 2 reg helpers = 4 total (no outside help)
      slots.push({ type: "mc_leader", label: "MC Lead", start: mcS, end: mcE, hours: hrs(mcS, mcE), slOnly: true, isMC: true, order: 20 });
      if (isSun) {
        slots.push({ type: "mc_sl_helper", label: "MC Crew (SL)", start: mcS, end: mcE, hours: hrs(mcS, mcE), slOnly: true, isMC: true, order: 21 });
      }
      for (let i = 0; i < 2; i++) { slots.push({ type: "mc_helper", label: "MC Helper", start: mcS, end: mcE, hours: hrs(mcS, mcE), slOnly: false, isMC: true, order: 22 + i }); }

      // Floor evening slots (non-MC crew working the register/serving)
      // Thu: SL already covered by MC leader (Crystal). Extra floor slots = evening count - 3 MC slots.
      // Sun: 2 SL evening slots + regular evening slots for floor workers.
      if (isSun) {
        // Sunday: MC crew = 4 fixed (mc_leader + mc_sl_helper + 2 mc_helpers)
        // staffing.evening = total including MC crew
        // Floor slots = total - 4, all regular (no SL required — SLs are on MC crew)
        const MC_CREW_SIZE = 4;
        const floorTotal = Math.max(0, (staffing.evening || 5) - MC_CREW_SIZE);
        for (let i = 0; i < floorTotal; i++) {
          slots.push({ type: "evening", label: "Evening", start: eveS, end: eveE, hours: hrs(eveS, eveE), slOnly: false, noTrainee: false, isMC: false, order: 30 + i });
        }
      } else {
        // Thu: MC crew = Crystal + 2 reg helpers. Floor slots = extra beyond MC crew.
        const baseEvening = 3;
        const extraEvening = (staffing.evening || baseEvening) - baseEvening;
        for (let i = 0; i < extraEvening; i++) {
          slots.push({ type: "evening", label: "Evening", start: eveS, end: eveE, hours: hrs(eveS, eveE), slOnly: false, isMC: false, isTraineeSlot: true, order: 30 + i });
        }
      }
    } else {
      // Important evening: flag set by manager for days needing top workers
      const isImportant = importantEvenings instanceof Set && importantEvenings.has(dateStr);
      // Holiday weekdays and important evenings get 2 SL evening slots
      const isHolidayWeekday = dayType === "weekdayHoliday";
      const needsExtraSL = isFri || isSat || isHolidayWeekday || isImportant;
      for (let i = 0; i < (staffing.evening || 3); i++) {
        const needsSL = i === 0 || (i === 1 && needsExtraSL);
        const slotType = i === 0 ? "evening_sl" : (needsSL ? "evening_sl2" : "evening");
        const slotLabel = i === 0 ? "Evening SL" : (needsSL ? "Evening SL" : "Evening");
        // No trainees on Fri/Sat/holidays/important evenings
        const blockTrainee = isFri || isSat || isHolidayWeekday || isImportant;
        slots.push({
          type: slotType, label: slotLabel,
          start: eveS, end: eveE, hours: hrs(eveS, eveE),
          slOnly: needsSL, noTrainee: blockTrainee && i < 4,
          isImportant, order: 20 + i
        });
      }
    }
    slots.sort((a, b) => a.order - b.order);
    slots.forEach(s => { s._dateStr = dateStr; s._dayIndex = dayIndex; s._isWE = isWE; s._isFri = isFri; s._isSat = isSat; s._isSun = isSun; s._isMC = isMC; s._dayKey = dayKey; s._dow = dow; });
    schedule[dateStr] = slots.map(s => ({ ...s, empId: null, empName: "⚠ UNFILLED", empRole: null }));
    allSlots.push(...slots.map(s => ({ ...s })));
  });

  // ══════════════════════════════════════════════════════════════════
  // V4 ENGINE: PEOPLE-FIRST DISTRIBUTION (Corrected)
  // ══════════════════════════════════════════════════════════════════
  //
  // ORDER OF OPERATIONS:
  //   1. Build all slots
  //   2. Place SLs on SL-REQUIRED slots only (DL, Eve SL, MC Leader/Helper)
  //   3. Place trainees on Mon-Thu evenings (1 per day, before regulars)
  //   4. Place regulars on everything else (equal hours)
  //   5. SL overflow: give SLs who need a 4th shift a WEEKEND regular slot
  //   6. Balance pass: equalize hours among regulars
  //   7. Gap fill: any remaining empty slots
  //
  // KEY RULES:
  //   - SLs NEVER on Mon-Wed evening regular slots (only the Eve SL slot)
  //   - SL overflow ONLY goes to Fri/Sat/Sun slots (never weekday evening)
  //   - Trainees ONLY on Mon-Thu evenings (never weekends)
  //   - Regulars get equal hours — person with fewest hours picks first
  // ══════════════════════════════════════════════════════════════════

  const gradHours = rules.trainee?.graduationHours || 30;
  // isEffectivelyGraduated and isTrainee defined earlier in helpers section
  const sls = active.filter(e => e.role === "shift_lead");
  const regs = active.filter(e => e.role === "regular" || isEffectivelyGraduated(e));
  const traineeEmps = active.filter(e => e.role === "trainee" && !isEffectivelyGraduated(e));

  // ── STEP 2: Place SLs on SL-REQUIRED slots ────────────────────────
  // Only fills slots marked slOnly=true. No overflow yet.
  // Order: Thu MC (Crystal) → Sun MC SLs → Fri/Sat/Sun Eve SL → Sat/Sun DL → Mon-Fri DL → Thu Eve SL

  const slSlots = allSlots.filter(s => s.slOnly);
  slSlots.sort((a, b) => {
    const pri = (s) => {
      if (s.isMC && s._dow === 4) return 0;  // Thu MC Leader (Crystal) — must be first
      if (s.isMC && s._dow === 0) return 1;  // Sun MC SLs — FIRST so MC SLs aren't taken by Day Lead
      if (s.type === "day_lead" && s._isSun) return 2;  // Sun Day Lead — AFTER Sun MC picks SLs
      if (s.type === "day_lead" && s._isSat) return 3; // Sat DL
      if ((s.type === "evening_sl" || s.type === "evening_sl2") && s._isFri) return 4; // Fri Eve SLs
      if ((s.type === "evening_sl" || s.type === "evening_sl2") && s._isSat) return 5; // Sat Eve SLs
      if (s.type === "day_lead") return 6;    // Weekday DL
      if (s.type === "evening_sl" && s._dow === 4) return 7; // Thu Eve SL
      if (s.type === "evening_sl") return 8;  // Mon/Tue/Wed Eve SL
      return 9;
    };
    return pri(a) - pri(b);
  });

  for (const slot of slSlots) {
    const dateStr = slot._dateStr;
    const slotInSched = schedule[dateStr].find(s =>
      s.type === slot.type && s.start === slot.start && s.order === slot.order
    );
    if (slotInSched?.empId) continue;

    // Thu MC Leader: Crystal always
    if (slot.isMC && slot._dow === 4 && slot.type === "mc_leader") {
      const crystal = sls.find(e => e.name === "Crystal Guel");
      if (crystal && getCandidates(slot).find(e => e.id === crystal.id)) {
        assignSlotInSchedule(slot, crystal); continue;
      }
    }

    // Sun MC SLs: pick SL who hasn't led MC longest (rotation fairness)
    if (slot.isMC && slot._dow === 0) {
      const prevWeekKeyMC = weekDates[0] ? (() => {
        const d = new Date(weekDates[0] + "T12:00:00"); d.setDate(d.getDate() - 7);
        return d.toISOString().split("T")[0];
      })() : "";
      const mcSortFn = (a, b) => {
        const aLastMC = mcHistoryLast[a.name] || "";
        const bLastMC = mcHistoryLast[b.name] || "";
        // Penalize SLs who led MC last week
        const aRecent = aLastMC >= prevWeekKeyMC ? 1 : 0;
        const bRecent = bLastMC >= prevWeekKeyMC ? 1 : 0;
        if (aRecent !== bRecent) return aRecent - bRecent;
        // Oldest last MC date first (most overdue), count as tiebreaker
        if (!aLastMC && !bLastMC) return (mcHistoryCount[a.name] || 0) - (mcHistoryCount[b.name] || 0);
        if (!aLastMC) return -1;
        if (!bLastMC) return 1;
        if (aLastMC !== bLastMC) return aLastMC.localeCompare(bLastMC);
        return (mcHistoryCount[a.name] || 0) - (mcHistoryCount[b.name] || 0);
      };
      let cands = getCandidates(slot, c => c.filter(e => e.role === "shift_lead"));
      cands.sort(mcSortFn);
      // If no SL available due to F7/F8 night rules, relax them — Sun MC must be covered
      if (cands.length === 0) {
        approved.add("F7"); approved.add("F8");
        cands = getCandidates(slot, c => c.filter(e => e.role === "shift_lead"));
        approved.delete("F7"); approved.delete("F8");
        cands.sort(mcSortFn);
      }
      // If still no candidates, relax all soft rules — MC crew must be filled
      if (cands.length === 0) {
        const sunDate = slot._dateStr;
        cands = sls.filter(e => {
          if (!isAvail(e, sunDate, slot.start, slot.end, weeklyTimeOffs, availOverrides)) return false;
          if (sd[e.id].has(sunDate)) return false;
          return true;
        });
        cands.sort(mcSortFn);
      }
      // Absolute last resort: ignore no-doubles for MC — MC must be covered
      if (cands.length === 0) {
        const sunDate = slot._dateStr;
        cands = sls.filter(e => isAvail(e, sunDate, slot.start, slot.end, weeklyTimeOffs, availOverrides));
        if (cands.length === 0) cands = [...sls]; // anyone
        cands.sort(mcSortFn);
      }
      if (cands[0]) { assignSlotInSchedule(slot, cands[0]); continue; }
    }

    // All other SL-only slots: pick SL with fewest hours
    // For evening SL slots, relax F7/F8 (no consecutive nights) if no SL available
    // SLs sometimes need to work Fri+Sat or Sat+Sun to cover required shifts
    const isWeekendNightSlot = (slot._isFri || slot._isSat || slot._isSun) && tm(slot.start || "18:00") >= 1020;
    const slSortFn = (a, b) => {
      const aG = (a.guaranteedDays || []).includes(slot._dayKey) ? 1 : 0;
      const bG = (b.guaranteedDays || []).includes(slot._dayKey) ? 1 : 0;
      if (bG !== aG) return bG - aG;
      // For weekend night slots: STRONGLY prefer SLs with fewer weekend nights
      // This prevents stacking (Spencer getting Fri+Sat while Chan gets 0)
      if (isWeekendNightSlot) {
        const aWE = weCount[a.id] || 0;
        const bWE = weCount[b.id] || 0;
        if (aWE !== bWE) return aWE - bWE; // fewer weekend nights = higher priority
      }
      const slMin = 18;
      const aUnder = Math.max(0, slMin - sh[a.id]);
      const bUnder = Math.max(0, slMin - sh[b.id]);
      if (bUnder !== aUnder) return bUnder - aUnder;
      if (sh[a.id] !== sh[b.id]) return sh[a.id] - sh[b.id];
      if (sc[a.id] !== sc[b.id]) return sc[a.id] - sc[b.id];
      return Math.random() - 0.5;
    };
    let cands = getCandidates(slot, c => c.filter(e => e.role === "shift_lead"));
    cands.sort(slSortFn);
    // For SL-required evening slots: if no candidate due to night rules, relax F7/F8
    if (cands.length === 0 && (slot.type === "evening_sl" || slot.type === "evening_sl2")) {
      approved.add("F7"); approved.add("F8");
      cands = getCandidates(slot, c => c.filter(e => e.role === "shift_lead"));
      approved.delete("F7"); approved.delete("F8");
      cands.sort(slSortFn);
    }
    // Also relax no_fri_sat_sun for SL-required slots (SLs must cover required shifts)
    if (cands.length === 0 && slot.slOnly) {
      const origFriSatSun = approved.has("no_fri_sat_sun");
      approved.add("no_fri_sat_sun");
      cands = getCandidates(slot, c => c.filter(e => e.role === "shift_lead"));
      if (!origFriSatSun) approved.delete("no_fri_sat_sun");
      cands.sort(slSortFn);
    }
    // Last resort: if still empty and it's a required SL slot, ignore Sat+Sun night rule
    // (better to have an SL who also has Sun MC than leave the slot empty)
    if (cands.length === 0 && (slot.type === "evening_sl" || slot.type === "evening_sl2")) {
      approved.add("F7"); approved.add("F8"); approved.add("no_fri_sat_sun");
      cands = getCandidates(slot, c => c.filter(e => e.role === "shift_lead"));
      approved.delete("F7"); approved.delete("F8"); approved.delete("no_fri_sat_sun");
      // Prefer SL who has Sun MC (they're already working late, not an extra night from scratch)
      cands.sort((a, b) => {
        const aMC = nightMap[weekDates[6]]?.has(a.id) ? 0 : 1;
        const bMC = nightMap[weekDates[6]]?.has(b.id) ? 0 : 1;
        return aMC - bMC; // prefer the Sun MC person last (they have the most nights)
      });
      cands.sort(slSortFn); // re-sort by the standard SL sort
    }
    if (cands[0]) assignSlotInSchedule(slot, cands[0]);
  }

  // ── STEP 3: Place trainees on Mon-Thu evenings ─────────────────────
  // ── STEP 3: Place trainees ────────────────────────────────────────
  // Rules:
  // - Max 1 trainee per day, any day of the week
  // - Weekdays (Mon-Thu): place on mid shift (3-7pm) if exists, else last evening slot
  // - Weekends (Fri/Sat/Sun): place on mid shift if exists, else as 5th+ person on evening
  // - Spread across days — don't put same trainee on consecutive days
  // - Max 1 trainee per weekend day total

  const availTrainees = traineeEmps.filter(e => e._budget > 0);
  const traineeQueue = [...availTrainees].sort((a, b) => sh[a.id] - sh[b.id]);
  let lastPlacedTraineeId = null;

  const tryPlaceTrainee = (dateStr, dayIndex) => {
    // Find the best trainee slot for this day:
    // Priority 1: mid shift (isTraineeSlot + type=mid)
    // Priority 2: last evening slot (weekday) or 5th+ evening slot (weekend)
    const dow = new Date(dateStr + "T12:00:00").getDay();
    const isWeekend = dow === 0 || dow === 5 || dow === 6;

    // Check if trainee already placed this day
    const traineeAlreadyToday = schedule[dateStr].some(s => s.empId && isTrainee(active.find(e => e.id === s.empId)));
    if (traineeAlreadyToday) return;
    // No trainees (including recently graduated) on important evenings
    if (importantEvenings instanceof Set && importantEvenings.has(dateStr)) return;

    // Find preferred trainee slot:
    // Priority 1: dedicated isTraineeSlot (mid shift OR Thu floor "Evening (early)")
    let targetSlot = null;
    schedule[dateStr].forEach((slot, idx) => {
      if (slot.empId || slot.slOnly || slot.isMC) return;
      if (slot.isTraineeSlot) targetSlot = { slot, idx }; // catches both mid and Thu floor
    });

    // If no mid slot, find last evening slot (weekday) or 5th evening slot (weekend)
    if (!targetSlot) {
      const eveSlots = [];
      schedule[dateStr].forEach((slot, idx) => {
        if (slot.empId || slot.slOnly || slot.isMC || tm(slot.start) < 1020) return;
        eveSlots.push({ slot, idx });
      });
      if (isWeekend) {
        // Weekend: only place trainee as 5th+ person — count already-assigned evening people
        const assignedEve = schedule[dateStr].filter(s => s.empId && tm(s.start) >= 1020).length;
        if (assignedEve >= 4 && eveSlots.length > 0) {
          targetSlot = eveSlots[eveSlots.length - 1];
        }
      } else {
        // Weekday: last evening slot
        if (eveSlots.length > 0) targetSlot = eveSlots[eveSlots.length - 1];
      }
    }

    if (!targetSlot) return;

    // Try placing a trainee, prefer non-consecutive
    let placed = false;
    for (const skipConsec of [true, false]) {
      for (const trainee of traineeQueue) {
        if (skipConsec && trainee.id === lastPlacedTraineeId) continue;
        if (sd[trainee.id].has(dateStr)) continue;
        if (!traineeOK(trainee, dateStr)) continue;
        if (!isAvail(trainee, dateStr, targetSlot.slot.start, targetSlot.slot.end, weeklyTimeOffs, availOverrides)) continue;
        if (!consecOK(trainee, dayIndex)) continue;
        if (sc[trainee.id] >= trainee._effMaxShifts) continue;
        assign(dateStr, targetSlot.idx, trainee, targetSlot.slot);
        lastPlacedTraineeId = trainee.id;
        placed = true;
        break;
      }
      if (placed) break;
    }
    if (!placed) lastPlacedTraineeId = null;
    traineeQueue.sort((a, b) => sh[a.id] - sh[b.id]);
  };

  // Process all days Mon-Sun in order
  // Run weekend days TWICE to fill both mid shift slots (Sat has 2 mid slots)
  weekDates.forEach((dateStr, di) => tryPlaceTrainee(dateStr, di));
  weekDates.forEach((dateStr, di) => {
    const dow = new Date(dateStr + "T12:00:00").getDay();
    if (dow === 6 || dow === 0) tryPlaceTrainee(dateStr, di); // 2nd pass for Sat/Sun mid shifts
  });

  // ── STEP 4: Place regulars on all remaining slots ──────────────────
  // Process order: MC helpers → Weekend evening → Weekend day → Fri → Mid → Weekday 2nd day → Weekday evening
  // Pick: person with fewest hours who hasn't hit their target

  const remainingSlots = [];
  weekDates.forEach(dateStr => {
    schedule[dateStr].forEach((slot, idx) => {
      if (slot.empId || slot.slOnly) return;
      remainingSlots.push({ dateStr, idx, slot }); // isTraineeSlot unfilled = Step 4 fills with regular
    });
  });

  remainingSlots.sort((a, b) => {
    const pri = (s) => {
      if (s.slot.isMC && !s.slot.slOnly) return 0;  // MC helpers
      if ((s.slot._isWE || s.slot._isFri) && tm(s.slot.start) >= 1020) return 1; // Weekend/Fri evening
      if (s.slot._isWE && tm(s.slot.start) < 1020) return 2; // Weekend day
      if (s.slot._isFri && tm(s.slot.start) < 1020) return 3; // Friday day
      if (s.slot.type === "mid") return 0; // Mid shift: fill FIRST so trainees get it before regs
      if (!s.slot._isWE && !s.slot._isFri && tm(s.slot.start) < 1020) return 5; // Weekday 2nd day
      return 6; // Weekday evening (Mon-Wed remaining slots)
    };
    return pri(a) - pri(b);
  });

  for (const { dateStr, idx, slot } of remainingSlots) {
    if (schedule[dateStr][idx].empId) continue;

    let cands = getCandidates(slot);
    const isWeekendSlot = slot._isWE || (slot._isFri && tm(slot.start) >= 1020);

    // Mid shift: strongly prefer trainees (their dedicated slot)
    if (slot.type === "mid" || slot.isTraineeSlot) {
      const traineeCands = cands.filter(e => e.role === "trainee" || isTrainee(e));
      if (traineeCands.length > 0) cands = traineeCands;
      // Sort by cumulative hours — less experienced first
      cands.sort((a, b) => (a.traineeCumulative || 0) - (b.traineeCumulative || 0));
    }

    // MC helpers assignment
    if (slot.isMC) {
      const isSunMC = slot._dow === 0;

      if (isSunMC) {
        // Sunday MC: PREFER 3 SLs + 1 reg. Count SLs already on MC crew.
        const slsOnMC = schedule[slot._dateStr]?.filter(s => s.isMC && s.empId && active.find(e => e.id === s.empId && e.role === "shift_lead")).length || 0;
        const slAvail = cands.filter(e => e.role === "shift_lead");
        const regAvail = cands.filter(e => e.role !== "shift_lead" && (e.role !== "trainee" || isEffectivelyGraduated(e)) && !(e.tags || []).includes("mc_exempt"));

        if (slsOnMC < 3 && slAvail.length > 0) {
          // Still room for another SL — prefer SL to reach 3 total
          cands = slAvail;
        } else if (regAvail.length > 0) {
          // Have 3 SLs or no SL available — use reg
          cands = regAvail;
        } else if (slAvail.length > 0) {
          // No regs available — use SL anyway (better than empty)
          cands = slAvail;
        }
        // else: fall through to whatever getCandidates returned
      } else {
        // Thu MC: always regs (Crystal leads, you help as owner)
        const nonSLT = cands.filter(e => e.role !== "shift_lead" && (e.role !== "trainee" || isEffectivelyGraduated(e)) && !(e.tags || []).includes("mc_exempt"));
        console.log("[THU MC] slot.order:", slot.order, "| getCandidates:", cands.map(e=>e.name+"/"+e.role), "| nonSLT:", nonSLT.map(e=>e.name+"/sc:"+sc[e.id]+"/max:"+e._effMaxShifts+"/sd:"+sd[e.id].has(slot._dateStr)));
        if (nonSLT.length > 0) cands = nonSLT;
        else {
          const slFallback = cands.filter(e => e.role === "shift_lead");
          if (slFallback.length > 0) cands = slFallback;
        }
      }
      // Sort by MC rotation: fewest MC times first, then longest since last MC
      // Strongly deprioritize anyone who MC'd last week (no back-to-back)
      const prevWeekKey = weekDates[0] ? (() => {
        const d = new Date(weekDates[0] + "T12:00:00"); d.setDate(d.getDate() - 7);
        return d.toISOString().split("T")[0];
      })() : "";
      // Build the same ranked order as the "Next Up" display panel:
      // 1. Penalize back-to-back (MC'd last week)
      // 2. Never done MC → most overdue (goes first)
      // 3. Oldest last MC date first
      // 4. Tiebreaker: use assistantPool order (explicit manager preference), NOT count
      //    (count is unreliable because trainees accumulate history before graduating)
      const assistantPool = rules?.mcRotation?.assistantPool || [];
      cands.sort((a, b) => {
        const aLastMC = mcHistoryLast[a.name] || "";
        const bLastMC = mcHistoryLast[b.name] || "";
        // Penalize anyone who MCd last week (no back-to-back)
        const aRecent = aLastMC >= prevWeekKey ? 1 : 0;
        const bRecent = bLastMC >= prevWeekKey ? 1 : 0;
        if (aRecent !== bRecent) return aRecent - bRecent;
        // Never done MC → most overdue
        if (!aLastMC && !bLastMC) {
          const ai = assistantPool.indexOf(a.name); const bi = assistantPool.indexOf(b.name);
          if (ai !== -1 && bi !== -1) return ai - bi;
          return 0;
        }
        if (!aLastMC) return -1;
        if (!bLastMC) return 1;
        // Oldest last MC date first
        if (aLastMC !== bLastMC) return aLastMC.localeCompare(bLastMC);
        // Same date → use assistantPool order as tiebreaker (NOT count)
        const ai = assistantPool.indexOf(a.name);
        const bi = assistantPool.indexOf(b.name);
        if (ai !== -1 && bi !== -1) return ai - bi;
        if (ai !== -1) return -1;
        if (bi !== -1) return 1;
        return 0;
      });
    }
    // Weekend/Fri evening: trainees only if shift already has 4 people (they become the 5th)
    // Max 1 trainee per shift period. No trainees on weekend day shifts.
    else if (isWeekendSlot && tm(slot.start) >= 1020) {
      const dow3 = new Date(dateStr + "T12:00:00").getDay();
      const isWeekendNight = dow3 === 5 || dow3 === 6;
      // Count people already assigned to the evening period this day
      const eveningAssigned = schedule[dateStr].filter(s =>
        s.empId && tm(s.start) >= 1020
      ).length;
      const traineesThisEvening = schedule[dateStr].filter(s =>
        s.empId && isTrainee(active.find(e => e.id === s.empId)) && tm(s.start) >= 1020
      ).length;
      // Trainee allowed only if: 4+ already assigned (they'd be 5th+) AND no trainee yet this shift
      const traineeAllowed = eveningAssigned >= 4 && traineesThisEvening === 0;

      if (isWeekendNight && slot.type === "evening") {
        // No SLs on regular evening slots
        const noSL = cands.filter(e => e.role !== "shift_lead");
        if (noSL.length > 0) cands = noSL;
        // Prefer trainee if 5th slot opportunity — actively pick trainee when allowed
        if (traineeAllowed) {
          const traineeFirst = cands.filter(e => isTrainee(e));
          if (traineeFirst.length > 0) cands = traineeFirst; // prioritize trainee for this slot
        } else {
          const noT = cands.filter(e => !isTrainee(e));
          if (noT.length > 0) cands = noT;
        }
      } else {
        // Weekend day slots: no trainees at all
        const noT = cands.filter(e => !isTrainee(e));
        if (noT.length > 0) cands = noT;
      }
      if (cands.length === 0) cands = getCandidates(slot); // fallback
      if (needsSwirler(slot)) {
        const sw = cands.filter(e => canSwirl(e));
        if (sw.length > 0) cands = sw;
      }
      const goodWE = rules.goodWeekendPeople || [];
      const good = cands.filter(e => goodWE.includes(e.name));
      if (good.length > 0) cands = good;
      // Important evening: prefer non-trainees, experienced regulars first
      if (slot.isImportant) {
        const noTrainees = cands.filter(e => !isTrainee(e));
        if (noTrainees.length > 0) cands = noTrainees;
      }
    }
    // Weekend day / Fri day: no trainees
    else if (isWeekendSlot || slot._isFri) {
      const noT = cands.filter(e => !isTrainee(e));
      if (noT.length > 0) cands = noT;
    }
    // Weekday 2nd day: no SLs, no trainees, prefer 2nd day priority list
    else if (slot.type === "day") {
      const noSLT = cands.filter(e => e.role !== "shift_lead" && e.role !== "trainee");
      if (noSLT.length > 0) cands = noSLT;
      const pri = rules.secondDayPriority || [];
      const fromPri = cands.filter(e => pri.includes(e.name));
      if (fromPri.length > 0) cands = fromPri;
    }
    // Weekday evening: prefer regulars + graduated trainees, then non-graduated trainees as fallback
    else if (tm(slot.start) >= 1020) {
      // Include graduated trainees (isEffectivelyGraduated) as "regulars" for filling purposes
      const regsOnly = cands.filter(e => e.role === "regular" || isEffectivelyGraduated(e));
      if (regsOnly.length > 0) cands = regsOnly;
      // If still no one, allow trainees (better than unfilled)
    }

    // PICK: SLs under their 18h minimum get priority, then fewest hours
    const slMinHours = 18;
    cands.sort((a, b) => {
      const aOv = availOverrides?.[dateStr + ":" + a.id] ? 1 : 0;
      const bOv = availOverrides?.[dateStr + ":" + b.id] ? 1 : 0;
      if (bOv !== aOv) return bOv - aOv;
      const aG = (a.guaranteedDays || []).includes(slot._dayKey) ? 1 : 0;
      const bG = (b.guaranteedDays || []).includes(slot._dayKey) ? 1 : 0;
      if (bG !== aG) return bG - aG;
      // SLs under 18h get priority over regulars who are at or above their fair share
      const aSLUnder = a.role === "shift_lead" && sh[a.id] < slMinHours ? 1 : 0;
      const bSLUnder = b.role === "shift_lead" && sh[b.id] < slMinHours ? 1 : 0;
      if (bSLUnder !== aSLUnder) return bSLUnder - aSLUnder;
      if (sh[a.id] !== sh[b.id]) return sh[a.id] - sh[b.id];
      if (sc[a.id] !== sc[b.id]) return sc[a.id] - sc[b.id];
      if (isWeekendSlot) {
        const aWE = weCount[a.id] || 0, bWE = weCount[b.id] || 0;
        if (aWE !== bWE) return aWE - bWE;
      }
      return Math.random() - 0.5;
    });

    if (cands[0]) assign(dateStr, idx, cands[0], slot);
  }

  // ── STEP 5: SL overflow — give SLs slots to reach 4 shifts ──
  // Try weekends first, then weekdays if still short
  for (const sl of sls.sort((a, b) => sc[a.id] - sc[b.id])) {
    if (sl._isBreakSL) continue; // break SL stays at 3
    const needed = 4 - sc[sl.id];
    if (needed <= 0) continue;

    // First try: open slots on any day (Thu-Sun preferred, Mon-Wed fallback)
    const openSlots = [];
    weekDates.forEach(dateStr => {
      const dow = new Date(dateStr + "T12:00:00").getDay();
      schedule[dateStr].forEach((slot, idx) => {
        if (slot.empId) return;
        if (slot.slOnly) return; // already handled
        if (slot.isTraineeSlot) return;
        if (sd[sl.id].has(dateStr)) return;
        if (!isAvail(sl, dateStr, slot.start, slot.end, weeklyTimeOffs, availOverrides)) return;
        if (!friSatSunOK(sl, dateStr, slot.slOnly)) return;
        if (!dayAfterMCOK(sl, dateStr, slot.start)) return;
        if (!crystalSundayOK(sl, dateStr)) return;
        if (!weekendNightOK(sl, dateStr, slot.start, slot.isMC)) return;
        if (!consecOK(sl, weekDates.indexOf(dateStr))) return;
        if (slot.isMC && mcCount[sl.id] >= 1) return;
        // SLs shouldn't take Mon-Wed evening regular slots
        if ((dow >= 1 && dow <= 3) && slot.type === "evening") return;
        // SLs shouldn't take Fri/Sat/Sun regular evening slots (those are for regulars)
        if ((dow === 5 || dow === 6 || dow === 0) && slot.type === "evening") return;
        openSlots.push({ dateStr, idx, slot, dow });
      });
    });

    // Sort: prefer Thu/Fri/Sat/Sun day slots
    openSlots.sort((a, b) => {
      const priority = d => [4,5,6,0,1,2,3].indexOf(d);
      return priority(a.dow) - priority(b.dow);
    });

    let filled = 0;
    for (const { dateStr, idx, slot } of openSlots) {
      if (filled >= needed) break;
      if (sd[sl.id].has(dateStr)) continue;
      if (schedule[dateStr][idx].empId) continue;
      assign(dateStr, idx, sl, slot);
      filled++;
    }

    // Second try: if still short, swap a regular out of a day slot to give it to the SL
    if (filled < needed) {
      for (const dateStr of weekDates) {
        if (filled >= needed) break;
        if (sd[sl.id].has(dateStr)) continue;
        if (!isAvail(sl, dateStr, "12:00", "18:00", weeklyTimeOffs, availOverrides)) continue;
        if (!friSatSunOK(sl, dateStr, false)) continue;
        if (!crystalSundayOK(sl, dateStr)) continue;
        if (!consecOK(sl, weekDates.indexOf(dateStr))) continue;
        const dow = new Date(dateStr + "T12:00:00").getDay();
        // Only consider day slots (regulars can do weekday day shifts, SLs just join)
        for (let idx = 0; idx < schedule[dateStr].length; idx++) {
          const slot = schedule[dateStr][idx];
          if (slot.empId) continue; // only unfilled
          if (slot.type !== "day") continue; // day slots only
          if ((dow >= 1 && dow <= 3)) {
            assign(dateStr, idx, sl, slot);
            filled++;
            break;
          }
        }
      }
    }
  }

  // ── STEP 5b: 5th person on a shift can be a trainee ────────────────
  // If a shift already has 4+ assigned people, a trainee can be the 5th.
  // This lets trainees work Fri/Sat/Sun as extra help without replacing regulars.
  // Also catches any unfilled weekday evening slots trainees can fill.
  const traineesStillAvail = traineeEmps.filter(e => sc[e.id] < e._effMaxShifts && e._budget > sc[e.id]);
  if (traineesStillAvail.length > 0) {
    weekDates.forEach(dateStr => {
      schedule[dateStr].forEach((slot, idx) => {
        if (slot.empId) return; // already filled
        // Count how many people are already assigned this day on evening/same period
        const isEve = tm(slot.start) >= 1020;
        const samePeriod = schedule[dateStr].filter(s => {
          if (!s.empId) return false;
          const sIsEve = tm(s.start) >= 1020;
          return isEve ? sIsEve : !sIsEve;
        });

        // Allow trainee as 5th+ person (4+ already assigned to this period)
        // OR any unfilled weekday evening slot (Mon-Thu)
        const dow = new Date(dateStr + "T12:00:00").getDay();
        const isWeekday = dow >= 1 && dow <= 4; // Mon-Thu
        const isWeekend = dow === 0 || dow === 5 || dow === 6;

        // Weekend rule: trainee only if 4+ people already on the shift AND no trainee yet
        if (isWeekend && isEve) {
          const alreadyFilled = samePeriod.length;
          // Max 1 trainee per day on weekends
          // Exception: mid shift slots are always OK for trainees
          const traineeAlreadyToday = schedule[dateStr].some(s => s.empId && isTrainee(active.find(e => e.id === s.empId)));
          const isMidSlot = slot.type === "mid" || slot.isTraineeSlot;
          if (!isMidSlot && (alreadyFilled < 4 || traineeAlreadyToday)) return;
          if (isMidSlot && traineeAlreadyToday) return; // still only 1 trainee per day
        }

        const canTraineeFill = samePeriod.length >= 4 || (isWeekday && isEve);
        if (!canTraineeFill) return;
        if (slot.slOnly || slot.isMC) return;

        // Find a trainee
        for (const trainee of traineesStillAvail.sort((a, b) => sh[a.id] - sh[b.id])) {
          if (sd[trainee.id].has(dateStr)) continue;
          if (!traineeOK(trainee, dateStr)) continue;
          if (!isAvail(trainee, dateStr, slot.start, slot.end, weeklyTimeOffs, availOverrides)) continue;
          if (!consecOK(trainee, weekDates.indexOf(dateStr))) continue;
          if (sc[trainee.id] >= trainee._effMaxShifts) continue;
          assign(dateStr, idx, trainee, slot);
          break;
        }
      });
    });
  }

  // ── STEP 6: Balance pass ──────────────────────────────────────────
  // Two-phase: first equalize SLs (target 18-22h), then equalize regulars.
  // SLs are priority workers — they get hours first, regulars split what remains.
  const isBalanceExempt = (emp) => emp.name === "Grae McKown" || isTrainee(emp);
  const SL_MIN_TARGET = 18;
  const SL_MAX_TARGET = 22;

  // Phase A: SL balance — bring all SLs into 18-22h range
  let balanceChanged = true;
  let balanceSafety = 40;
  while (balanceChanged && balanceSafety-- > 0) {
    balanceChanged = false;
    const pool = active.filter(e => e.role === "shift_lead" && !isBalanceExempt(e) && e._budget > 0);
    if (pool.length < 2) break;

    pool.sort((a, b) => sh[b.id] - sh[a.id]);
    const maxH = sh[pool[0].id];
    const minH = sh[pool[pool.length - 1].id];
    if (maxH - minH <= 1.5) break; // SLs within 1.5h of each other — close enough

    const overP = pool.filter(e => sh[e.id] >= maxH - 1);
    const underP = pool.filter(e => sh[e.id] <= minH + 1);

    let swapped = false;
    outer: for (const under of underP) {
      for (const over of overP) {
        if (under.id === over.id) continue;
        for (const dateStr of weekDates) {
          if (sd[under.id].has(dateStr) || !sd[over.id].has(dateStr)) continue;
          for (let si = 0; si < schedule[dateStr].length; si++) {
            const slot = schedule[dateStr][si];
            if (slot.empId !== over.id) continue;
            if (slot.slOnly && under.role !== "shift_lead") continue;
            if (!friSatSunOK(under, dateStr, slot.slOnly)) continue;
            if (slot.isMC && under.role === "trainee" && !isEffectivelyGraduated(under)) continue;
            if (slot.isTraineeSlot && under.role !== "trainee") continue;
            if (!isAvail(under, dateStr, slot.start, slot.end, weeklyTimeOffs, availOverrides)) continue;
            if (con("no_mc_twice") && slot.isMC && mcCount[under.id] >= 1) continue;
            if (!weekendNightOK(under, dateStr, slot.start, slot.isMC)) continue;
            if (sh[under.id] + slot.hours > (under._effMaxHours || 24)) continue;
            if (!consecOK(under, weekDates.indexOf(dateStr))) continue;
            // Don't steal SL-required slots from SLs
            if (over.role === "shift_lead" && (slot.type === "evening_sl" || slot.type === "evening_sl2" || slot.type === "day_lead" || slot.type === "mc_leader")) continue;
            // Don't put SLs on Mon-Wed evening via swap
            const sDow = new Date(dateStr + "T12:00:00").getDay();
            if (under.role === "shift_lead" && slot.type === "evening" && sDow >= 1 && sDow <= 3) continue;
            // Don't put SLs on Fri/Sat/Sun night regular evening slots via swap
            if (under.role === "shift_lead" && slot.type === "evening" && (sDow === 5 || sDow === 6 || sDow === 0)) continue;

            // Execute swap
            sc[over.id]--; sh[over.id] -= slot.hours;
            if (!schedule[dateStr].some((s, i) => i !== si && s.empId === over.id)) sd[over.id].delete(dateStr);
            if (slot.isMC) mcCount[over.id] = Math.max(0, mcCount[over.id] - 1);
            if (slot._isWE || (slot._isFri && tm(slot.start) >= 1020)) weCount[over.id] = Math.max(0, weCount[over.id] - 1);
            if (nightMap[dateStr]) nightMap[dateStr].delete(over.id);
            assign(dateStr, si, under, { ...slot, _isWE: slot._isWE, _isFri: slot._isFri, _dayKey: slot._dayKey });
            swapped = true; balanceChanged = true;
            break outer;
          }
        }
      }
    }
    if (!swapped) break;
  }

  // ── STEP 6B: Regular balance pass ────────────────────────────────
  // After SLs are equalized, balance regulars among themselves.
  // Regulars share hours equally — person with fewest hours picks first.
  let balanceChangedB = true;
  let balanceSafetyB = 40;
  while (balanceChangedB && balanceSafetyB-- > 0) {
    balanceChangedB = false;
    const pool = active.filter(e => e.role === "regular" && !isBalanceExempt(e) && e._budget > 0);
    if (pool.length < 2) break;

    pool.sort((a, b) => sh[b.id] - sh[a.id]);
    const maxH = sh[pool[0].id];
    const minH = sh[pool[pool.length - 1].id];
    if (maxH - minH <= 2) break;

    const overP = pool.filter(e => sh[e.id] >= maxH - 1);
    const underP = pool.filter(e => sh[e.id] <= minH + 1);

    let swapped = false;
    outer2: for (const under of underP) {
      for (const over of overP) {
        if (under.id === over.id) continue;
        for (const dateStr of weekDates) {
          if (sd[under.id].has(dateStr) || !sd[over.id].has(dateStr)) continue;
          if (!friSatSunOK(under, dateStr, false)) continue;

          for (let si = 0; si < schedule[dateStr].length; si++) {
            const slot = schedule[dateStr][si];
            if (slot.empId !== over.id) continue;
            if (slot.slOnly) continue; // can't take SL-required slots
            if (slot.isMC && under.role === "trainee" && !isEffectivelyGraduated(under)) continue;
            if (slot.isTraineeSlot && under.role !== "trainee") continue;
            if (!isAvail(under, dateStr, slot.start, slot.end, weeklyTimeOffs, availOverrides)) continue;
            if (con("no_mc_twice") && slot.isMC && mcCount[under.id] >= 1) continue;
            if (!weekendNightOK(under, dateStr, slot.start, slot.isMC)) continue;
            if (sh[under.id] + slot.hours > (under._effMaxHours || 24)) continue;
            if (!consecOK(under, weekDates.indexOf(dateStr))) continue;
            // Don't take Fri/Sat night slots from regulars who are SLs
            const sDow = new Date(dateStr + "T12:00:00").getDay();
            if (over.role === "shift_lead" && slot.type === "evening" && (sDow === 5 || sDow === 6)) continue;

            sc[over.id]--; sh[over.id] -= slot.hours;
            if (!schedule[dateStr].some((s, i) => i !== si && s.empId === over.id)) sd[over.id].delete(dateStr);
            if (slot.isMC) mcCount[over.id] = Math.max(0, mcCount[over.id] - 1);
            if (slot._isWE || (slot._isFri && tm(slot.start) >= 1020)) weCount[over.id] = Math.max(0, weCount[over.id] - 1);
            if (nightMap[dateStr]) nightMap[dateStr].delete(over.id);
            assign(dateStr, si, under, { ...slot, _isWE: slot._isWE, _isFri: slot._isFri, _dayKey: slot._dayKey });
            swapped = true; balanceChangedB = true;
            break outer2;
          }
        }
      }
    }
    if (!swapped) break;
  }

  // ── Gap fill cascade: 5 passes, each more relaxed than the last ─────
  // Every slot MUST be filled. We try progressively relaxing rules until filled.

  const SOFT_RULES = ["F1","F2","F3","F4","F5","F6","F7","F8","F9","F10","F11",
    "no_fri_sat_night","no_fri_sat_sun","max_consecutive_3",
    "min_swirlers_weekend","sat_night_sl_neq_sun_sl"];

  // Helper: sort candidates — SLs needing 4th shift first, then fewest shifts, then fewest hours
  const sortCands = (cands) => [...cands].sort((a, b) => {
    // SLs who still need shifts (non-break SLs under 4) get top priority
    const aNeedsSL = a.role === "shift_lead" && !a._isBreakSL && sc[a.id] < 4;
    const bNeedsSL = b.role === "shift_lead" && !b._isBreakSL && sc[b.id] < 4;
    if (aNeedsSL && !bNeedsSL) return -1;
    if (!aNeedsSL && bNeedsSL) return 1;
    // Then regulars who still need 3rd shift before anyone getting a 4th
    const aNeedsReg = a.role !== "shift_lead" && sc[a.id] < 3;
    const bNeedsReg = b.role !== "shift_lead" && sc[b.id] < 3;
    if (aNeedsReg && !bNeedsReg) return -1;
    if (!aNeedsReg && bNeedsReg) return 1;
    // Finally sort by fewest shifts then fewest hours
    return sc[a.id] - sc[b.id] || sh[a.id] - sh[b.id];
  });

  const fillEmptySlots = (filterFn) => {
    weekDates.forEach(dateStr => {
      schedule[dateStr].forEach((slot, idx) => {
        if (slot.empId) return;
        const cands = sortCands(filterFn(active, dateStr, slot));
        if (cands[0]) assign(dateStr, idx, cands[0], slot);
      });
    });
  };

  // Pass 1: Normal rules, respect all caps
  fillEmptySlots((emps, dateStr, slot) => getCandidates(slot));

  // Pass 2: Relax shift cap for SLs who still need 4 shifts
  fillEmptySlots((emps, dateStr, slot) => {
    return getCandidates(slot).filter(emp => {
      // Allow SLs to exceed their current count to reach 4
      if (emp.role === "shift_lead" && !emp._isBreakSL && sc[emp.id] < 4) return true;
      // Regulars/trainees: only if they haven't hit 3 yet (respect the cap in pass 2)
      if (emp.role !== "shift_lead" && sc[emp.id] >= 3) return false;
      return true;
    });
  });

  // Pass 3: Relax ALL soft rules
  SOFT_RULES.forEach(r => approved.add(r));
  fillEmptySlots((emps, dateStr, slot) => getCandidates(slot));
  SOFT_RULES.forEach(r => approved.delete(r));

  // Pass 4: Use real maxShifts, bypass soft rules, availability required
  SOFT_RULES.forEach(r => approved.add(r));
  fillEmptySlots((emps, dateStr, slot) =>
    emps.filter(emp => {
      if (!isAvail(emp, dateStr, slot.start, slot.end, weeklyTimeOffs, availOverrides)) return false;
      if (slot.slOnly && emp.role !== "shift_lead") return false;
      if (slot.isMC && emp.role === "trainee" && !isEffectivelyGraduated(emp)) return false;
      if (slot.isImportant && emp.role === "trainee" && !isEffectivelyGraduated(emp)) return false;
      if (sc[emp.id] >= emp.maxShifts) return false; // use real maxShifts
      // Special cases always respect their hard caps
      if ((emp.id === "reg-7" || emp.id === "tr-6") && sc[emp.id] >= emp.maxShifts) return false;
      return true;
    })
  );
  SOFT_RULES.forEach(r => approved.delete(r));

  // Pass 5: Ignore shift caps. If slOnly slot has no SL available, allow strong regulars.
  SOFT_RULES.forEach(r => approved.add(r));
  fillEmptySlots((emps, dateStr, slot) => {
    const available = emps.filter(emp =>
      isAvail(emp, dateStr, slot.start, slot.end, weeklyTimeOffs, availOverrides)
    );
    // For SL-only slots: try SLs first, fall back to non-trainees if no SL available
    if (slot.slOnly) {
      const slCands = available.filter(e => e.role === "shift_lead");
      if (slCands.length > 0) return slCands;
      // No SL available — use any non-trainee (better than empty)
      return available.filter(e => e.role !== "trainee" || isEffectivelyGraduated(e));
    }
    return available.filter(emp => {
      if (slot.isMC && emp.role === "trainee" && !isEffectivelyGraduated(emp)) return false;
      return true;
    });
  });
  SOFT_RULES.forEach(r => approved.delete(r));

  // Pass 6: Nuclear — ignore everything EXCEPT time-off and hard caps for special employees
  weekDates.forEach(dateStr => {
    schedule[dateStr].forEach((slot, idx) => {
      if (slot.empId) return;
      // Try to find someone with capacity first
      let pool = active.filter(e => {
        if (slot.slOnly && e.role !== "shift_lead") return false;
        if (slot.isMC && e.role === "trainee") return false;
        // Special cases (Grae, Cesia): always respect their maxShifts AND time-off
        const isSpecial = e.id === "reg-7" || e.id === "tr-6";
        if (isSpecial && sc[e.id] >= e.maxShifts) return false;
        if (isSpecial && !isAvail(e, dateStr, slot.start, slot.end, weeklyTimeOffs, availOverrides)) return false;
        return true;
      });
      pool.sort((a, b) => sc[a.id] - sc[b.id] || sh[a.id] - sh[b.id]);
      // Prefer someone not already on this day AND not on time-off
      const noDouble = pool.filter(e => !sd[e.id].has(dateStr));
      const noDoubleNoTO = noDouble.filter(e => {
        const hasTO = weeklyTimeOffs.some(t => t.empId === e.id && t.date === dateStr && t.allDay);
        return !hasTO;
      });
      const pick = noDoubleNoTO[0] || noDouble[0] || pool[0];
      if (pick) forceAssign(dateStr, idx, pick, slot);
    });
  });

  // ── Flexible rule detection ───────────────────────────────────────
  const FLEXIBLE_RULES = [
    { id: "F1",  label: "Good weekend people preferred on weekends" },
    { id: "F2",  label: "Grae max 1 weekend shift" },
    { id: "F3",  label: "2nd day priority list" },
    { id: "F4",  label: "Trainees preferred on Mon-Thu evenings" },
    { id: "F5",  label: "Regulars preferred over SLs on weekday 2nd day" },
    { id: "F6",  label: "Max shifts cap per employee" },
    { id: "F7",  label: "No Fri + Sat night — same person both nights" },
    { id: "F8",  label: "No Sat + Sun night — same person both nights" },
    { id: "F9",  label: "Max 3 consecutive days" },
    { id: "F10", label: "Min 2 swirlers per weekend shift" },
    { id: "F11", label: "Fri/Sat night: 1 SL + 1 regular (no double SLs)" },
  ];

  const simulateRelax = (slot, ruleId) => {
    const testApproved = new Set([...(Array.from(approved || [])), ruleId]);
    const origApproved = new Set(approved || []);
    approved.clear(); testApproved.forEach(x => approved.add(x));
    const cands = getCandidates(slot);
    approved.clear(); origApproved.forEach(x => approved.add(x));
    return cands.length > 0;
  };

  const rulesNeeded = [];
  weekDates.forEach(dateStr => {
    schedule[dateStr].forEach(slot => {
      if (slot.empId) return;
      for (const rule of FLEXIBLE_RULES) {
        if (approved.has(rule.id)) continue;
        if (simulateRelax(slot, rule.id)) {
          const existing = rulesNeeded.find(r => r.id === rule.id);
          const entry = { date: dateStr, slotLabel: slot.label };
          if (existing) existing.slots.push(entry);
          else rulesNeeded.push({ id: rule.id, label: rule.label, slots: [entry] });
          break;
        }
      }
    });
  });

  // ── STEP 7: Extra shifts — surface to manager ─────────────────────
  // After all required slots filled, count how many extra slots remain unfilled
  // These represent "bonus" shifts. Return info so UI can prompt manager.
  const extraUnfilled = [];
  weekDates.forEach(dateStr => {
    schedule[dateStr].forEach(slot => {
      if (!slot.empId) extraUnfilled.push({ date: dateStr, slot: slot.label });
    });
  });

  // ── STEP 8: Warnings ──────────────────────────────────────────────
  const warnings2 = [];

  // Swirl check
  if (con("min_swirlers_weekend")) {
    const minSwirl = rules.swirl?.minPerShift || 2;
    weekDates.forEach(d => {
      const dt = new Date(d + "T12:00:00");
      const dow = dt.getDay();
      const isWEday = dow === 0 || dow === 6;
      const isFriday = dow === 5;
      if (!isWEday && !isFriday) return;
      const eveningSlots = schedule[d].filter(s => s.empId && tm(s.start) >= 1020);
      const eveningSwirlers = eveningSlots.filter(s => canSwirl(active.find(e => e.id === s.empId))).length;
      if (eveningSwirlers < minSwirl) {
        warnings2.push({ date: d, msg: `⚠ ${["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][dow]} night has ${eveningSwirlers} swirler(s) (min: ${minSwirl})` });
      }
      if (isWEday) {
        const daySwirlers = schedule[d].filter(s => s.empId && tm(s.start) < 1020 && canSwirl(active.find(e => e.id === s.empId))).length;
        if (daySwirlers < minSwirl) {
          warnings2.push({ date: d, msg: `⚠ ${dow === 6 ? "Sat" : "Sun"} day has ${daySwirlers} swirler(s) (min: ${minSwirl})` });
        }
      }
    });
  }

  // Unfilled slots
  weekDates.forEach(d => {
    schedule[d].forEach(slot => {
      if (!slot.empId) warnings2.push({ date: d, msg: `No available employee for ${slot.label}` });
    });
  });

  // Under-budget warnings (not minimums — just showing who got fewer than their available days)
  active.forEach(e => {
    if (sc[e.id] < e._budget) {
      warnings2.push({ date: "", msg: `${e.name} has ${sc[e.id]} shifts (could have taken ${e._budget})` });
    }
  });

  // SL weekend check
  active.filter(e => e.role === "shift_lead").forEach(e => {
    if (weCount[e.id] < (rules.shiftLead?.minWeekendShifts || 2)) {
      warnings2.push({ date: "", msg: `${e.name} has ${weCount[e.id]} weekend night shifts` });
    }
  });

  // Warn if more than 1 SL has no MC duty this week
  const slsWithMC = new Set();
  weekDates.forEach(d => {
    schedule[d].forEach(slot => {
      if (slot.isMC && slot.empId) slsWithMC.add(slot.empId);
    });
  });
  const slsWithoutMC = active.filter(e => e.role === "shift_lead" && !slsWithMC.has(e.id));
  if (slsWithoutMC.length > 1) {
    warnings2.push({ date: "", msg: `⚠ ${slsWithoutMC.length} SLs have no MC this week (max 1 should be on break): ${slsWithoutMC.map(e => e.name).join(", ")}` });
  }

  const shortSLs = active.filter(e => e.role === "shift_lead" && sc[e.id] < e.minShifts).map(e => e.id);
  const hasUnfilled = weekDates.some(d => schedule[d].some(s => !s.empId));

  return { schedule, empShiftCount: sc, empHours: sh, warnings: warnings2, shortSLs, extraUnfilled, rulesNeeded, hasUnfilled };
}

// === PRE-SCHEDULE NUANCE MODAL ===
function NuanceModal({ employees, weeklyMaxOverrides, setWeeklyMaxOverrides, onGenerate, onClose, font, savedRanking, savedSchedules, weekStart }) {
  const active = employees.filter(e => e.status === "active");

  // Section 1: Special cases — Grae, Cesia (low shift caps)
  const SPECIAL_IDS = ["reg-7", "tr-6"];
  const specials = active.filter(e => SPECIAL_IDS.includes(e.id));

  // Section 2: Shift Leads — drag to set who gets 3 shifts (MC break)
  const sls = active.filter(e => e.role === "shift_lead");

  // Section 3: Regular staff — all get 3 shifts, no knobs
  const regs = active.filter(e =>
    e.role !== "shift_lead" &&
    !SPECIAL_IDS.includes(e.id) &&
    e.name !== "Nani Hoomes" &&
    e.id !== "tr-4"
  );

  // Section 4: Leftover bucket — Nani by default, gets gaps only
  const leftoverDefaults = active.filter(e => e.name === "Nani Hoomes" || e.id === "tr-4");

  // ── Auto-rank SLs from MC history ─────────────────────────────
  // Compute who most deserves break (hasn't had one recently) → put them at bottom of ranking
  const computeSLBreakRanking = () => {
    if (!savedSchedules) return sls.map(e => e.id);
    const now = new Date();
    const todayDay = now.getDay();
    const currentMon = new Date(now); currentMon.setDate(now.getDate() - (todayDay === 0 ? 6 : todayDay - 1)); currentMon.setHours(0,0,0,0);
    const slLastBreak = {}; const slBreakCount = {};
    sls.forEach(e => { slLastBreak[e.name] = null; slBreakCount[e.name] = 0; });
    Object.entries(savedSchedules).forEach(([key, data]) => {
      const weekMon = new Date(key + "T00:00:00");
      if (weekMon >= currentMon) return; // skip current/future
      const schedule = data.schedule || data;
      const mcNames = new Set();
      Object.values(schedule).forEach(slots => {
        if (!Array.isArray(slots)) return;
        slots.forEach(slot => { if (slot.isMC && slot.empName) mcNames.add(slot.empName); });
      });
      sls.forEach(e => {
        if (!mcNames.has(e.name)) { slBreakCount[e.name]++; slLastBreak[e.name] = key; }
      });
    });
    // Sort: most overdue for break → should be at bottom (gets break this week)
    // Most overdue = fewest breaks + oldest last break
    return [...sls].sort((a, b) => {
      if (slBreakCount[a.name] !== slBreakCount[b.name]) return slBreakCount[b.name] - slBreakCount[a.name]; // more breaks = higher priority (goes first, NOT break this week)
      if (!slLastBreak[a.name] && slLastBreak[b.name]) return 1; // never had break → should get one → put at bottom
      if (slLastBreak[a.name] && !slLastBreak[b.name]) return -1;
      if (slLastBreak[a.name] && slLastBreak[b.name]) return slLastBreak[b.name].localeCompare(slLastBreak[a.name]); // older break → put at bottom
      return 0;
    }).map(e => e.id);
  };

  // SL ranking state — auto-init from MC history if no saved ranking
  const initSlRanking = () => {
    if (savedRanking?.sl?.length) {
      const saved = savedRanking.sl.filter(id => sls.find(e => e.id === id));
      const newSLs = sls.filter(e => !saved.includes(e.id)).map(e => e.id);
      return [...newSLs, ...saved];
    }
    return computeSLBreakRanking(); // auto-rank from history
  };
  const [slRanking, setSlRanking] = useState(initSlRanking);

  // Special case overrides
  const [specialOverrides, setSpecialOverrides] = useState(() => {
    const init = {};
    specials.forEach(e => {
      init[e.id] = weeklyMaxOverrides[e.id]?.max ?? e.maxShifts;
    });
    return init;
  });

  // Leftover bucket — who's in it
  const [leftoverIds, setLeftoverIds] = useState(() => {
    if (savedRanking?.leftovers?.length) {
      const valid = savedRanking.leftovers.filter(id => active.find(e => e.id === id));
      if (valid.length > 0) return new Set(valid);
    }
    return new Set(leftoverDefaults.map(e => e.id));
  });

  const [dragId, setDragId] = useState(null);

  const handleDragStart = (id) => setDragId(id);
  const handleDragOver = (e, overId) => {
    e.preventDefault();
    if (!dragId || dragId === overId) return;
    setSlRanking(prev => {
      const arr = [...prev];
      const from = arr.indexOf(dragId);
      const to = arr.indexOf(overId);
      if (from < 0 || to < 0) return prev;
      arr.splice(from, 1);
      arr.splice(to, 0, dragId);
      return arr;
    });
  };

  const toggleLeftover = (emp) => {
    setLeftoverIds(prev => {
      const n = new Set(prev);
      if (n.has(emp.id)) n.delete(emp.id);
      else n.add(emp.id);
      return n;
    });
  };

  const handleConfirm = () => {
    const finalOverrides = {};
    // Special cases: use their adjusted limit
    specials.forEach(e => {
      const val = specialOverrides[e.id] ?? e.maxShifts;
      if (val !== e.maxShifts) finalOverrides[e.id] = { min: val, max: val };
    });
    // Bottom SL gets 3 shifts (MC break week)
    if (slRanking.length >= 1) {
      const lastId = slRanking[slRanking.length - 1];
      finalOverrides[lastId] = { min: 3, max: 3 };
    }
    // Leftover bucket: no hard cap — scheduler fills them with whatever is left
    // We mark them so scheduler knows to fill them last
    leftoverIds.forEach(id => {
      if (!finalOverrides[id]) finalOverrides[id] = { min: 0, max: 3, isLeftover: true };
    });
    setWeeklyMaxOverrides(finalOverrides);
    onGenerate(finalOverrides, slRanking, [], [...leftoverIds]);
  };

  const sectionLabel = (txt, sub) => (
    <div style={{ marginTop: 18, marginBottom: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: "#4A3F2F", textTransform: "uppercase", letterSpacing: 0.5 }}>{txt}</div>
      {sub && <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>{sub}</div>}
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000, padding: 16 }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 16, padding: 24, width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 25px 60px rgba(0,0,0,0.3)" }} onClick={e => e.stopPropagation()}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: "#4A3F2F" }}>⚙️ Before You Generate</h3>
            <div style={{ fontSize: 12, color: "#9CA3AF", marginTop: 3 }}>Any nuances for this week?</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#9CA3AF" }}>×</button>
        </div>

        {/* 1. Special Cases */}
        {sectionLabel("High Schoolers", "Adjust shifts if needed this week")}
        <div style={{ background: "#F9FAFB", borderRadius: 10, padding: "8px 12px", border: "1px solid #E5E7EB" }}>
          {specials.map(emp => {
            const cur = specialOverrides[emp.id] ?? emp.maxShifts;
            return (
              <div key={emp.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid #F3F4F6" }}>
                <div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#6D28D9", background: "#EDE9FE", padding: "2px 8px", borderRadius: 10 }}>{emp.name}</span>
                  <span style={{ fontSize: 10, color: "#9CA3AF", marginLeft: 8 }}>normally {emp.maxShifts} shifts</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <button onClick={() => setSpecialOverrides(p => ({ ...p, [emp.id]: Math.max(0, cur - 1) }))} style={{ width: 24, height: 24, borderRadius: 4, border: "1px solid #E5E7EB", background: "#FEF2F2", color: "#DC2626", cursor: "pointer", fontSize: 14, fontWeight: 800, padding: 0 }}>−</button>
                  <span style={{ fontSize: 13, fontWeight: 800, minWidth: 20, textAlign: "center", color: cur < emp.maxShifts ? "#DC2626" : "#374151" }}>{cur}</span>
                  <button onClick={() => setSpecialOverrides(p => ({ ...p, [emp.id]: Math.min(emp.maxShifts, cur + 1) }))} style={{ width: 24, height: 24, borderRadius: 4, border: "1px solid #E5E7EB", background: "#F0FDF4", color: "#16A34A", cursor: "pointer", fontSize: 14, fontWeight: 800, padding: 0 }}>+</button>
                </div>
              </div>
            );
          })}
        </div>

        {/* 2. Shift Leads */}
        {sectionLabel("Shift Leads", "Everyone gets 4 shifts. Drag bottom person — they get 3 (MC break week).")}
        <div style={{ background: "#FFFBEB", borderRadius: 10, padding: "8px", border: "1px solid #FDE68A" }}>
          {(() => {
            const suggested = computeSLBreakRanking();
            const suggestedBottomId = suggested[suggested.length - 1];
            const currentBottomId = slRanking[slRanking.length - 1];
            const autoMatches = suggestedBottomId === currentBottomId;
            return (
              <div style={{ fontSize: 10, color: autoMatches ? "#16A34A" : "#F59E0B", background: autoMatches ? "#F0FDF4" : "#FFFBEB", borderRadius: 6, padding: "4px 8px", marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span>{autoMatches ? "✓" : "💡"} Rotation suggests: <strong>{sls.find(e => e.id === suggestedBottomId)?.name}</strong> gets the break this week</span>
                {!autoMatches && <button onClick={() => setSlRanking(suggested)} style={{ fontSize: 9, color: "#F59E0B", background: "none", border: "1px solid #FDE68A", borderRadius: 4, padding: "1px 6px", cursor: "pointer", fontFamily: font }}>Apply</button>}
              </div>
            );
          })()}
          {slRanking.map((id, i) => {
            const emp = sls.find(e => e.id === id);
            if (!emp) return null;
            const isBottom = i === slRanking.length - 1;
            return (
              <div
                key={id}
                draggable
                onDragStart={() => handleDragStart(id)}
                onDragOver={e => handleDragOver(e, id)}
                onDragEnd={() => setDragId(null)}
                style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
                  borderRadius: 8, marginBottom: 4, cursor: "grab", userSelect: "none",
                  background: isBottom ? "#FEF9C3" : "#F9FAFB",
                  border: isBottom ? "1px dashed #F59E0B" : "1px solid #F3F4F6",
                  opacity: dragId === id ? 0.5 : 1,
                }}
              >
                <span style={{ fontSize: 13, color: "#D1D5DB" }}>⠿</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", minWidth: 18 }}>#{i + 1}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#B45309", background: "#FEF3C7", padding: "2px 8px", borderRadius: 10, flex: 1 }}>{emp.name}</span>
                {isBottom
                  ? <span style={{ fontSize: 10, color: "#F59E0B", fontWeight: 700 }}>← 3 shifts · no MC</span>
                  : <span style={{ fontSize: 10, color: "#9CA3AF" }}>4 shifts</span>
                }
              </div>
            );
          })}
          <div style={{ fontSize: 10, color: "#9CA3AF", textAlign: "center", marginTop: 4 }}>drag to reorder</div>
        </div>

        {/* 3. Regular Staff */}
        {sectionLabel("Regular Staff", "All get 3 shifts equally — no changes needed")}
        <div style={{ background: "#F0FDF4", borderRadius: 10, padding: "10px 12px", border: "1px solid #BBF7D0" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {regs.filter(e => !leftoverIds.has(e.id)).map(e => (
              <span key={e.id} style={{ fontSize: 12, fontWeight: 600, color: "#166534", background: "#DCFCE7", padding: "3px 10px", borderRadius: 10 }}>{e.name}</span>
            ))}
          </div>
          <div style={{ fontSize: 11, color: "#16A34A", marginTop: 6 }}>✓ 3 shifts each this week</div>
        </div>

        {/* 4. Leftover Bucket */}
        {sectionLabel("Leftover Bucket", "Gets whatever shifts remain — could be 3, 2, or 1")}
        <div style={{ background: "#FEF2F2", borderRadius: 10, padding: "10px 12px", border: "1px solid #FECACA" }}>
          <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 8 }}>Tap to add/remove anyone from this bucket. They'll fill gaps after everyone else is scheduled.</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {active.filter(e => !SPECIAL_IDS.includes(e.id) && e.role !== "shift_lead").map(e => {
              const inBucket = leftoverIds.has(e.id);
              const rc = e.role === "trainee" ? { color: "#6D28D9", bg: "#EDE9FE" } : { color: "#1D4ED8", bg: "#DBEAFE" };
              return (
                <button key={e.id} onClick={() => toggleLeftover(e)} style={{
                  fontSize: 12, fontWeight: 600, padding: "4px 12px", borderRadius: 10,
                  cursor: "pointer", border: "none",
                  background: inBucket ? "#DC2626" : rc.bg,
                  color: inBucket ? "#fff" : rc.color,
                }}>
                  {inBucket ? "✕ " : ""}{e.name}
                </button>
              );
            })}
          </div>
          {leftoverIds.size > 0 && <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 6 }}>Red = leftover bucket (fills gaps, no guaranteed shifts)</div>}
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: "1px solid #D1D5DB", background: "#fff", color: "#6B7280", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: font }}>Cancel</button>
          <button onClick={handleConfirm} style={{ flex: 2, padding: "10px 0", borderRadius: 8, border: "none", background: "#4A3F2F", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: font }}>⚡ Generate Schedule</button>
        </div>
      </div>
    </div>
  );
}

// === EDIT SHIFT MODAL ===
function EditShiftModal({ slot, date, employees, onSave, onClose }) {
  const [empId, setEmpId] = useState(slot.empId || "");
  const [start, setStart] = useState(slot.start || "");
  const [end, setEnd] = useState(slot.end || "");
  const active = employees.filter(e => e.status === "active").sort((a, b) => {
    const o = { shift_lead: 0, regular: 1, trainee: 2 };
    return (o[a.role] || 3) - (o[b.role] || 3) || a.name.localeCompare(b.name);
  });
  const dt = new Date(date + "T12:00:00");
  const dayName = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][dt.getDay()];

  const handleSave = () => {
    const emp = active.find(e => e.id === empId);
    const hrs = start && end ? (tm(end) - tm(start)) / 60 : slot.hours;
    onSave({
      ...slot,
      empId: empId || null,
      empName: emp ? emp.name : (empId ? slot.empName : "\u26a0 UNFILLED"),
      empRole: emp ? emp.role : null,
      start: start || slot.start,
      end: end || slot.end,
      hours: hrs,
    });
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 16, padding: 22, width: "100%", maxWidth: 400, boxShadow: "0 25px 60px rgba(0,0,0,0.3)" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "#4A3F2F" }}>Edit Shift</h3>
            <div style={{ fontSize: 12, color: "#9CA3AF", marginTop: 2 }}>{dayName} {dt.getMonth()+1}/{dt.getDate()} &middot; {slot.label}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#9CA3AF" }}>&times;</button>
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={sl}>Assigned Employee</label>
          <select value={empId} onChange={e => setEmpId(e.target.value)} style={si}>
            <option value="">&mdash; Unassigned &mdash;</option>
            {active.map(e => {
              const rc = ROLE_CONFIG[e.role];
              return <option key={e.id} value={e.id}>{e.name} ({rc.label})</option>;
            })}
          </select>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 18 }}>
          <div><label style={sl}>Start Time</label><input type="time" value={start} onChange={e => setStart(e.target.value)} style={si} /></div>
          <div><label style={sl}>End Time</label><input type="time" value={end} onChange={e => setEnd(e.target.value)} style={si} /></div>
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #D1D5DB", background: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#6B7280", fontFamily: font }}>Cancel</button>
          <button onClick={handleSave} style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: "#4A3F2F", color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: font }}>Save</button>
        </div>
      </div>
    </div>
  );
}

// === MAIN COMPONENT ===
export function ScheduleTab({ employees, setEmployees, rules, schoolDates, timeOffs, savedSchedules, setSavedSchedules }) {
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
  const [availOverrides, setAvailOverrides] = useState({}); // { "2026-03-19:sl-5": "all"|"morning"|"evening" }
  const [dragSlot, setDragSlot] = useState(null);
  const [overridePopup, setOverridePopup] = useState(null); // { date, empId, x, y }
  const [weeklyMaxOverrides, setWeeklyMaxOverrides] = useState({}); // { "sl-3": { min: 3, max: 3 } }
  const [step, setStep] = useState("timeoff");
  const [viewMode, setViewMode] = useState("shift");
  const [selected, setSelected] = useState(null);
  const [editingShift, setEditingShift] = useState(null);
  const [dayStaffing, setDayStaffing] = useState(null);
  const [importantEvenings, setImportantEvenings] = useState(new Set()); // dates where evening needs top workers
  const [warningsOpen, setWarningsOpen] = useState(false);
  const [empOrder, setEmpOrder] = useState(null); // custom employee display order
  const [dragEmpId, setDragEmpId] = useState(null); // for employee row reordering
  const [addShiftPopup, setAddShiftPopup] = useState(null); // { empId, date }
  const [approvedBreaks, setApprovedBreaks] = useState([]); // rule IDs manager approved breaking
  const [showNuance, setShowNuance] = useState(false); // pre-schedule nuance modal
  const [pendingApprovals, setPendingApprovals] = useState(null); // rulesNeeded from last run, waiting for approval
  const [ruleApprovalChecked, setRuleApprovalChecked] = useState([]); // checkboxes in approval modal

  const handleSaveShift = (updatedSlot) => {
    if (!draft || !editingShift) return;
    const { date, type, order } = editingShift;
    const newSchedule = {};
    Object.keys(draft.schedule).forEach(d => { newSchedule[d] = [...draft.schedule[d]]; });
    const idx = newSchedule[date].findIndex(a => a.type === type && a.order === order);
    if (idx >= 0) newSchedule[date][idx] = updatedSlot;
    const newSc = {}, newSh = {};
    employees.filter(e => e.status === "active").forEach(e => { newSc[e.id] = 0; newSh[e.id] = 0; });
    Object.values(newSchedule).forEach(daySlots => {
      daySlots.forEach(slot => { if (slot.empId) { newSc[slot.empId] = (newSc[slot.empId] || 0) + 1; newSh[slot.empId] = (newSh[slot.empId] || 0) + slot.hours; } });
    });
    setDraft({ ...draft, schedule: newSchedule, empShiftCount: newSc, empHours: newSh });
    setEditingShift(null);
  };

  const handleCellClick = (date, type, order) => {
    if (!draft || isSaved) return;
    const slotKey = type + "-" + order;
    if (!selected) { setSelected({ date, slotKey, type, order }); }
    else if (selected.date === date && selected.slotKey === slotKey) { setSelected(null); }
    else {
      const newSchedule = {};
      Object.keys(draft.schedule).forEach(d => { newSchedule[d] = [...draft.schedule[d]]; });
      const fromSlotIdx = newSchedule[selected.date].findIndex(a => a.type === selected.type && a.order === selected.order);
      const toSlotIdx = newSchedule[date].findIndex(a => a.type === type && a.order === order);
      if (fromSlotIdx >= 0 && toSlotIdx >= 0) {
        const fromSlot = newSchedule[selected.date][fromSlotIdx];
        const toSlot = newSchedule[date][toSlotIdx];
        newSchedule[selected.date][fromSlotIdx] = { ...fromSlot, empId: toSlot.empId, empName: toSlot.empName, empRole: toSlot.empRole };
        newSchedule[date][toSlotIdx] = { ...toSlot, empId: fromSlot.empId, empName: fromSlot.empName, empRole: fromSlot.empRole };
        const newSc = {}, newSh = {};
        employees.filter(e => e.status === "active").forEach(e => { newSc[e.id] = 0; newSh[e.id] = 0; });
        Object.values(newSchedule).forEach(daySlots => { daySlots.forEach(slot => { if (slot.empId) { newSc[slot.empId] = (newSc[slot.empId] || 0) + 1; newSh[slot.empId] = (newSh[slot.empId] || 0) + slot.hours; } }); });
        setDraft({ ...draft, schedule: newSchedule, empShiftCount: newSc, empHours: newSh });
      }
      setSelected(null);
    }
  };

  const weekDates = getWeekDates(weekStart);
  const weekKey = weekDates[0];
  const saved = savedSchedules?.[weekKey] || null;
  // Always recompute empShiftCount and empHours from actual schedule data — stored counts can be stale
  const _rawResult = saved || draft;
  const result = (() => {
    if (!_rawResult) return null;
    const sc = {}, sh = {};
    employees.filter(e => e.status === "active").forEach(e => { sc[e.id] = 0; sh[e.id] = 0; });
    Object.values(_rawResult.schedule || {}).forEach(daySlots => {
      daySlots.forEach(slot => {
        if (slot.empId && slot.empId !== "seed" && !slot.empId.startsWith("seed-")) {
          sc[slot.empId] = (sc[slot.empId] || 0) + 1;
          sh[slot.empId] = (sh[slot.empId] || 0) + (slot.hours || 0);
        } else if (slot.empName) {
          const emp = employees.find(e => e.name === slot.empName);
          if (emp) { sc[emp.id] = (sc[emp.id] || 0) + 1; sh[emp.id] = (sh[emp.id] || 0) + (slot.hours || 0); }
        }
      });
    });
    return { ..._rawResult, empShiftCount: sc, empHours: sh };
  })();
  const isSaved = !!saved;
  const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  const initDayStaffing = (dates) => {
    const ds = {};
    dates.forEach(d => { const dt = getDayType(d, schoolDates); const s = rules.staffing[dt] || rules.staffing.weekday; ds[d] = { day: s.day || 2, mid: s.mid || 0, evening: s.evening || 3 }; });
    return ds;
  };

  const handleParseTimeOffs = () => {
    const parsed = parseTimeOffs(toText, employees.filter(e => e.status === "active"), weekDates);
    setWeeklyTOs(parsed);
    if (!dayStaffing) setDayStaffing(initDayStaffing(weekDates));
    setStep("review");
  };

  const handleGenerate = (breaks, maxOverridesOverride) => {
    const useBreaks = breaks || approvedBreaks;
    const useMaxOverrides = maxOverridesOverride !== undefined ? maxOverridesOverride : weeklyMaxOverrides;
    setGenerating(true); setStep("result"); setPendingApprovals(null);
    const ds = dayStaffing || initDayStaffing(weekDates);
    setTimeout(() => {
      try {
        const allTOs = [...(timeOffs || []), ...weeklyTOs];

        // ── MULTI-ATTEMPT SOLVER ──────────────────────────────────────
        // Score a result: lower = better
        const scoreResult = (r) => {
          let score = 0;
          // Unfilled slots are very bad
          let unfilled = 0;
          weekDates.forEach(d => { r.schedule[d].forEach(s => { if (!s.empId) unfilled++; }); });
          score += unfilled * 1000;
          // Unfilled SL slots are extra bad
          weekDates.forEach(d => { r.schedule[d].forEach(s => { if (!s.empId && s.slOnly) score += 500; }); });
          // Warnings add up
          score += (r.warnings || []).length * 10;
          // Short SLs (under min shifts) are bad
          score += (r.shortSLs || []).length * 200;
          // Hours imbalance among SLs (penalize big gaps)
          const active = employees.filter(e => e.status === "active" && e.role === "shift_lead");
          const hrs = active.map(e => r.empHours?.[e.id] || 0);
          const maxH = Math.max(...hrs), minH = Math.min(...hrs);
          score += (maxH - minH) * 2;
          return score;
        };

        // Build variations — different SL orderings to try
        const sls = employees.filter(e => e.status === "active" && e.role === "shift_lead");
        const baseSLOrder = priorityRanking?.sl || sls.map(e => e.id);

        // Generate permutations of the break SL (bottom of ranking)
        const attempts = [];

        // Attempt 1: use the exact ranking as given
        attempts.push({ slRanking: baseSLOrder, breakIdx: baseSLOrder.length - 1 });

        // Attempts 2-5: try each SL as the break SL
        sls.forEach(sl => {
          const withoutThis = baseSLOrder.filter(id => id !== sl.id);
          attempts.push({ slRanking: [...withoutThis, sl.id], breakIdx: withoutThis.length });
        });

        // Attempts 6-15: shuffle the non-break SLs to get different day/evening assignments
        const shuffleArray = (arr) => {
          const a = [...arr];
          for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
          }
          return a;
        };

        const baseBreakId = baseSLOrder[baseSLOrder.length - 1];
        for (let i = 0; i < 10; i++) {
          const nonBreak = shuffleArray(baseSLOrder.filter(id => id !== baseBreakId));
          attempts.push({ slRanking: [...nonBreak, baseBreakId], breakIdx: nonBreak.length });
        }

        // Run all attempts and score them
        let best = null;
        let bestScore = Infinity;
        const allResults = [];

        attempts.forEach(({ slRanking }) => {
          try {
            const r = genSchedule(
              weekDates, employees, rules, schoolDates, allTOs, ds,
              availOverrides, useMaxOverrides, useBreaks, savedSchedules,
              { ...priorityRanking, sl: slRanking },
              importantEvenings
            );
            const s = scoreResult(r);
            allResults.push({ r, s });
            if (s < bestScore) { bestScore = s; best = r; }
          } catch (e) { /* skip failed attempts */ }
        });

        // If best is significantly better than first attempt, use it
        // Otherwise use first attempt (preserve determinism)
        const first = allResults[0]?.r;
        const firstScore = allResults[0]?.s ?? Infinity;
        const chosen = (best && bestScore < firstScore) ? best : (first || best);

        if (chosen?.rulesNeeded?.length > 0) {
          setPendingApprovals(chosen.rulesNeeded);
          setRuleApprovalChecked(chosen.rulesNeeded.map(x => x.id));
        }

        // Add a note if multi-attempt found a better solution
        if (best && bestScore < firstScore && allResults.length > 1) {
          chosen.warnings = [
            { date: "", msg: `✓ Tried ${allResults.length} schedule variations — showing best result (score: ${bestScore} vs initial: ${firstScore})` },
            ...(chosen.warnings || []),
          ];
        }

        setDraft(chosen); setGenerating(false);
      } catch (err) {
        console.error("Schedule generation error:", err);
        setGenerating(false);
        alert("Error generating schedule: " + err.message);
      }
    }, 50);
  };

  const [priorityRanking, setPriorityRanking] = useState(() => {
    try {
      const saved = localStorage.getItem("somisomi-priority-ranking");
      if (saved) {
        const parsed = JSON.parse(saved);
        // Ensure leftovers key exists
        if (!parsed.leftovers) parsed.leftovers = ["tr-4"]; // Nani default
        return parsed;
      }
    } catch(e) {}
    return { sl: [], reg: [], leftovers: ["tr-4"] }; // tr-4 = Nani
  });

  const savePriorityRanking = (ranking) => {
    setPriorityRanking(ranking);
    try { localStorage.setItem("somisomi-priority-ranking", JSON.stringify(ranking)); } catch(e) {}
  };

  const handleGenerateFromNuance = (overrides, slRanking, regRanking, leftoverIds) => {
    setWeeklyMaxOverrides(overrides);
    savePriorityRanking({ sl: slRanking || [], reg: regRanking || [], leftovers: leftoverIds || [] });
    setShowNuance(false);
    // Do NOT reset dayStaffing here — preserve any staffing adjustments the manager made
    // Pass overrides directly — React state update is async so weeklyMaxOverrides would be stale
    setTimeout(() => handleGenerate(approvedBreaks, overrides), 50);
  };

  const handleApproveBreaks = (approvedIds) => {
    const newBreaks = [...new Set([...(Array.isArray(approvedBreaks) ? approvedBreaks : []), ...(Array.isArray(approvedIds) ? approvedIds : [])])];
    setApprovedBreaks(newBreaks);
    setPendingApprovals(null);
    handleGenerate(newBreaks);
  };

  const handleAccept = () => {
    if (draft) {
      // Auto-track trainee hours: calculate hours for each trainee this week
      const traineeHours = {};
      const schedData = draft.schedule || draft;
      Object.values(schedData).forEach(daySlots => {
        if (!Array.isArray(daySlots)) return;
        daySlots.forEach(slot => {
          if (slot.empId) {
            const emp = employees.find(e => e.id === slot.empId);
            if (emp && emp.role === "trainee" && (emp.traineeCumulative || 0) < (rules.trainee?.graduationHours || 30)) {
              traineeHours[emp.id] = (traineeHours[emp.id] || 0) + (slot.hours || 0);
            }
          }
        });
      });

      // Update trainee cumulative hours on employee records
      if (Object.keys(traineeHours).length > 0 && setEmployees) {
        setEmployees(prev => prev.map(emp => {
          if (traineeHours[emp.id]) {
            const newCumulative = (emp.traineeCumulative || 0) + traineeHours[emp.id];
            const graduated = newCumulative >= (rules.trainee?.graduationHours || 30);
            return {
              ...emp,
              traineeCumulative: Math.round(newCumulative * 100) / 100,
              // Auto-graduate: promote to regular when they hit 30h
              ...(graduated && emp.role === "trainee" ? {
                role: "regular",
                maxShifts: 4, minShifts: 3, maxHours: 20, minHours: 12,
                tags: [...new Set([...(emp.tags || []), "can_swirl", "can_mc"])],
                notes: (emp.notes || "") + ` Graduated from trainee at ${newCumulative.toFixed(1)}h.`,
              } : {}),
            };
          }
          return emp;
        }));
      }

      // Save the schedule with trainee hour snapshot
      setSavedSchedules(prev => ({
        ...prev,
        [weekKey]: {
          ...draft, notes, weeklyTOs,
          savedAt: new Date().toISOString(),
          traineeHoursThisWeek: traineeHours,
        }
      }));
      setDraft(null); setNotes([]);
    }
  };
  const handleReject = () => {
    setApprovedBreaks([]);
    setPendingApprovals(null);
    setGenerating(true); setStep("result");
    const ds = dayStaffing || initDayStaffing(weekDates);
    setTimeout(() => {
      const allTOs = [...(timeOffs || []), ...weeklyTOs];
      try {
        const r = genSchedule(weekDates, employees, rules, schoolDates, allTOs, ds, availOverrides, weeklyMaxOverrides, [], savedSchedules, priorityRanking, importantEvenings);
        if (r.rulesNeeded?.length > 0) {
          setPendingApprovals(r.rulesNeeded);
          setRuleApprovalChecked(r.rulesNeeded.map(x => x.id));
        }
        setDraft(r); setGenerating(false);
      } catch (err) {
        console.error("Schedule generation error:", err);
        setGenerating(false);
        alert("Error generating schedule: " + err.message);
      }
    }, 200);
  };
  const handleUnsave = () => { setSavedSchedules(prev => { const n = { ...prev }; delete n[weekKey]; return n; }); setStep("timeoff"); };
  const removeTo = (idx) => setWeeklyTOs(prev => prev.filter((_, i) => i !== idx));
  const handleWeekChange = (val) => { setWeekStart(val); setDraft(null); setNotes([]); setWeeklyTOs([]); setToText(""); setStep("timeoff"); setDayStaffing(null); setAvailOverrides({}); setWeeklyMaxOverrides({}); setApprovedBreaks([]); setPendingApprovals(null); setImportantEvenings(new Set()); };

  const getRows = () => {
    if (!result) return [];
    const typeOrder = ["day_lead", "day", "mid", "evening_sl", "evening_sl2", "evening", "mc_leader", "mc_sl_helper", "mc_helper"];
    const all = {};
    weekDates.forEach(d => { (result.schedule[d] || []).forEach(a => { const k = a.type + "-" + a.order; if (!all[k]) all[k] = { type: a.type, label: a.label, order: a.order }; }); });
    return Object.values(all).sort((a, b) => { const ai = typeOrder.indexOf(a.type); const bi = typeOrder.indexOf(b.type); return ai !== bi ? ai - bi : a.order - b.order; });
  };

  const tc = {
    day_lead:     { color: "#fff",    bg: "#F97316" }, // orange — matches Homebase Day Shift Lead
    day:          { color: "#fff",    bg: "#EAB308" }, // yellow — Weekday Day
    mid:          { color: "#fff",    bg: "#EAB308" }, // yellow — Mid Shift (same as day)
    evening_sl:   { color: "#fff",    bg: "#EF4444" }, // red — Shift Lead evening
    evening_sl2:  { color: "#fff",    bg: "#EF4444" }, // red
    evening:      { color: "#fff",    bg: "#A855F7" }, // purple — Night Shift
    mc_leader:    { color: "#fff",    bg: "#22C55E" }, // green — MC Lead
    mc_sl_helper: { color: "#fff",    bg: "#22C55E" }, // green — MC Crew
    mc_helper:    { color: "#fff",    bg: "#22C55E" }, // green — MC Helper
  };

  const savedCount = Object.keys(savedSchedules || {}).length;

  return (
    <div style={{ padding: "18px 28px" }}>
      {/* Nuance modal — always rendered at top level so it shows regardless of step */}
      {showNuance && (
        <NuanceModal
          employees={employees}
          weeklyMaxOverrides={weeklyMaxOverrides}
          setWeeklyMaxOverrides={setWeeklyMaxOverrides}
          onGenerate={handleGenerateFromNuance}
          onClose={() => setShowNuance(false)}
          font={font}
          savedRanking={priorityRanking}
          savedSchedules={savedSchedules}
          weekStart={weekStart}
        />
      )}

      {/* ── TOP ACTION BAR ─────────────────────────────────────────── */}
      <div style={{ background: "#fff", borderRadius: 14, padding: "14px 20px", boxShadow: "0 1px 4px rgba(0,0,0,0.07)", marginBottom: 16, display: "flex", alignItems: "center", gap: 12 }}>

        {/* Hidden date input — triggered by clicking the week label */}
        <input type="date" id="weekDatePicker" value={weekStart} onChange={e => handleWeekChange(e.target.value)}
          style={{ position: "absolute", opacity: 0, width: 0, height: 0, pointerEvents: "none" }} />

        {/* ‹ Prev week */}
        <button onClick={() => { const d = new Date(weekStart + "T12:00:00"); d.setDate(d.getDate() - 7); handleWeekChange(d.toISOString().split("T")[0]); }}
          style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid #E5E7EB", background: "#F9FAFB", cursor: "pointer", fontSize: 16, color: "#6B7280", flexShrink: 0 }}>‹</button>

        {/* Week label — click to open date picker */}
        <div onClick={() => { try { document.getElementById("weekDatePicker").showPicker(); } catch(e) { document.getElementById("weekDatePicker").click(); } }}
          style={{ textAlign: "center", minWidth: 150, cursor: "pointer", userSelect: "none" }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#4A3F2F" }}>
            {new Date(weekDates[0] + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            {" – "}
            {new Date(weekDates[6] + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </div>
          <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 1 }}>
            {new Date(weekDates[0] + "T12:00:00").getFullYear()}
            {weekDates.some(d => getDayType(d, schoolDates).includes("Holiday")) && <span style={{ marginLeft: 4, color: "#F59E0B" }}>🎉 Holiday week</span>}
          </div>
        </div>

        {/* Next week › */}
        <button onClick={() => { const d = new Date(weekStart + "T12:00:00"); d.setDate(d.getDate() + 7); handleWeekChange(d.toISOString().split("T")[0]); }}
          style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid #E5E7EB", background: "#F9FAFB", cursor: "pointer", fontSize: 16, color: "#6B7280", flexShrink: 0 }}>›</button>

        <div style={{ width: 1, height: 32, background: "#E5E7EB", flexShrink: 0 }} />

        {/* Saved week chips */}
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", flex: 1, alignItems: "center", overflow: "hidden" }}>
          {savedCount > 0 && <span style={{ fontSize: 9, fontWeight: 800, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: 0.5, whiteSpace: "nowrap" }}>Saved</span>}
          {Object.keys(savedSchedules).sort().reverse().slice(0, 10).map(key => {
            const dt = new Date(key + "T12:00:00");
            const isA = key === weekKey;
            return (
              <div key={key} style={{ display: "inline-flex", alignItems: "center", gap: 1 }}>
                <button onClick={() => handleWeekChange(key)} style={{
                  padding: "3px 9px", borderRadius: 6, fontSize: 10, fontWeight: 600, cursor: "pointer",
                  border: isA ? "2px solid #4A3F2F" : "1px solid #E5E7EB",
                  background: isA ? "#4A3F2F" : "#F9FAFB",
                  color: isA ? "#fff" : "#6B7280", fontFamily: font, whiteSpace: "nowrap",
                }}>{dt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</button>
                {isA && <button onClick={() => { if (window.confirm("Delete this saved week?")) { setSavedSchedules(prev => { const n = {...prev}; delete n[key]; return n; }); } }}
                  style={{ width: 14, height: 14, borderRadius: "50%", fontSize: 8, fontWeight: 800, cursor: "pointer", border: "none", background: "#FEF2F2", color: "#DC2626", padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>}
              </div>
            );
          })}
        </div>

        {/* Right: status + primary actions */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {!isSaved && !draft && (
            <button onClick={() => { setStep("timeoff"); setShowNuance(true); }}
              style={{ padding: "9px 22px", borderRadius: 9, border: "none", background: "#4A3F2F", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: font }}>
              ⚡ Generate
            </button>
          )}
          {!isSaved && draft && step === "result" && <>
            <button onClick={() => setShowNuance(true)}
              style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #E5E7EB", background: "#fff", color: "#4A3F2F", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: font }}>
              ↻ Regenerate
            </button>
            <button onClick={() => {
              const scheduleToSave = { schedule: draft.schedule, empShiftCount: draft.empShiftCount, empHours: draft.empHours, savedAt: new Date().toISOString(), notes, weeklyTOs, weekStart };
              setSavedSchedules(prev => ({ ...prev, [weekKey]: scheduleToSave }));
            }} style={{ padding: "9px 22px", borderRadius: 9, border: "none", background: "#16A34A", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: font, boxShadow: "0 2px 8px rgba(22,163,74,0.25)" }}>
              ✅ Save Schedule
            </button>
          </>}
          {isSaved && <>
            <span style={{ fontSize: 12, color: "#16A34A", fontWeight: 700 }}>✓ Saved</span>
            <button onClick={handleUnsave}
              style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid #E5E7EB", background: "#fff", color: "#6B7280", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: font }}>
              ✏️ Edit
            </button>
          </>}
        </div>
      </div>

      {/* STEP 1: Time-Off — compact */}
      {!isSaved && step === "timeoff" && (
        <div style={{ background: "#fff", borderRadius: 12, padding: "14px 18px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)", marginBottom: 16, display: "flex", gap: 14, alignItems: "flex-start" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#4A3F2F", marginBottom: 6 }}>📋 Any time-off this week?</div>
            <textarea value={toText} onChange={e => setToText(e.target.value)}
              placeholder="e.g. Kennedy off Saturday, Gwen off Monday 12pm-6pm — leave blank if none"
              style={{ ...si, minHeight: 56, resize: "vertical", fontSize: 12 }} />
          </div>
          <button onClick={handleParseTimeOffs}
            style={{ padding: "9px 20px", borderRadius: 8, border: "none", background: "#4A3F2F", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: font, marginTop: 24, flexShrink: 0 }}>
            {toText.trim() ? "Next →" : "Skip →"}
          </button>
        </div>
      )}

      {/* STEP 2: Confirm */}
      {!isSaved && step === "review" && (
        <div style={{ background: "#fff", borderRadius: 12, padding: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.06)", marginBottom: 16, border: "2px solid #F59E0B" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 22 }}>{"\u2705"}</span>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#4A3F2F" }}>Step 2: Confirm time-off</div>
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
                      <span style={{ color: "#6B7280" }}>{to.allDay ? "All day" : fmtTime(to.start) + "\u2013" + fmtTime(to.end)}</span>
                      <div style={{ flex: 1 }} />
                      <button onClick={() => removeTo(i)} style={{ background: "none", border: "none", cursor: "pointer", color: "#DC2626", fontSize: 11, fontWeight: 600 }}>{"\u2715"} Remove</button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {dayStaffing && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 16 }}>{"\ud83d\udc65"}</span>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#4A3F2F" }}>Staffing per day</div>
                <div style={{ fontSize: 11, color: "#9CA3AF" }}>— adjust before generating</div>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, minWidth: 700 }}>
                  <thead><tr>
                    <th style={{ padding: "4px 6px", fontSize: 10, fontWeight: 700, color: "#9CA3AF", textAlign: "left", width: 60 }}></th>
                    {weekDates.map((d, i) => {
                      const dt = new Date(d + "T12:00:00");
                      const dayType = getDayType(d, schoolDates);
                      const isH = dayType.includes("Holiday");
                      return (<th key={d} style={{ padding: "4px 4px", textAlign: "center", fontSize: 10, fontWeight: 700, color: isH ? "#DC2626" : "#374151" }}>
                        {dayLabels[i]} {dt.getDate()}{isH && <div style={{ fontSize: 8, color: "#DC2626" }}>HOLIDAY</div>}
                      </th>);
                    })}
                  </tr></thead>
                  <tbody>
                    {[{ key: "day", label: "Day", color: "#16A34A" }, { key: "mid", label: "Mid", color: "#0891B2" }, { key: "evening", label: "Eve*", color: "#7C3AED" }].map(row => (
                      <tr key={row.key}>
                        <td style={{ padding: "3px 6px", fontSize: 10, fontWeight: 700, color: row.color }}>{row.label}</td>
                        {weekDates.map(d => {
                          const val = dayStaffing[d]?.[row.key] ?? 0;
                          return (<td key={d} style={{ padding: "2px 2px", textAlign: "center" }}>
                            <div style={{ display: "inline-flex", alignItems: "center", gap: 1 }}>
                              <button onClick={() => setDayStaffing(prev => ({ ...prev, [d]: { ...prev[d], [row.key]: Math.max(0, val - 1) } }))} style={{ width: 20, height: 20, borderRadius: 4, border: "1px solid #D1D5DB", background: "#fff", cursor: "pointer", fontSize: 11, fontWeight: 700, color: "#374151", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>-</button>
                              <span style={{ width: 18, textAlign: "center", fontSize: 13, fontWeight: 800, color: "#4A3F2F" }}>{val}</span>
                              <button onClick={() => setDayStaffing(prev => ({ ...prev, [d]: { ...prev[d], [row.key]: val + 1 } }))} style={{ width: 20, height: 20, borderRadius: 4, border: "1px solid #D1D5DB", background: "#fff", cursor: "pointer", fontSize: 11, fontWeight: 700, color: "#374151", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>+</button>
                            </div>
                          </td>);
                        })}
                      </tr>
                    ))}
                    <tr>
                      <td style={{ padding: "3px 6px", fontSize: 10, fontWeight: 800, color: "#4A3F2F" }}>Total</td>
                      {weekDates.map(d => {
                        const s = dayStaffing[d] || {};
                        return <td key={d} style={{ padding: "2px 2px", textAlign: "center", fontSize: 12, fontWeight: 800, color: "#4A3F2F" }}>{(s.day||0)+(s.mid||0)+(s.evening||0)}</td>;
                      })}
                    </tr>
                  </tbody>
                </table>
                <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 6 }}>* Sunday Eve = total evening including MC crew (4 fixed). Min 5 = 4 MC + 1 floor SL.</div>

                {/* Important Evening flags */}
                <div style={{ marginTop: 12, borderTop: "1px solid #F3F4F6", paddingTop: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#4A3F2F", marginBottom: 6 }}>⭐ Important Evenings <span style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 400 }}>— mark days needing top workers / extra SL</span></div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {weekDates.map((d, i) => {
                      const dt = new Date(d + "T12:00:00");
                      const isMarked = importantEvenings.has(d);
                      const dayType = getDayType(d, schoolDates);
                      const isH = dayType.includes("Holiday") || dayType.includes("holiday");
                      return (
                        <button key={d} onClick={() => setImportantEvenings(prev => { const n = new Set(prev); if (n.has(d)) n.delete(d); else n.add(d); return n; })}
                          style={{ padding: "4px 10px", borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: "pointer", border: isMarked ? "2px solid #F59E0B" : "1px solid #E5E7EB", background: isMarked ? "#FEF3C7" : "#F9FAFB", color: isMarked ? "#B45309" : "#6B7280", fontFamily: font }}>
                          {["M","Tu","W","Th","F","Sa","Su"][dt.getDay() === 0 ? 6 : dt.getDay() - 1]} {dt.getDate()}{isH ? " 🎉" : ""}
                          {isMarked ? " ⭐" : ""}
                        </button>
                      );
                    })}
                  </div>
                  {importantEvenings.size > 0 && <div style={{ fontSize: 10, color: "#B45309", marginTop: 6 }}>⭐ = scheduler will prioritize experienced workers + add 2nd SL on these evenings</div>}
                </div>
              </div>

              {/* Evening shift start times */}
              <div style={{ marginTop: 12, padding: 12, background: "#FAF5FF", borderRadius: 8, border: "1px solid #E9D5FF" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#7C3AED", marginBottom: 8 }}>Evening Start Times</div>
                <div style={{ fontSize: 10, color: "#9CA3AF", marginBottom: 8 }}>Set when each evening person starts. E.g. 2 at 6pm, 1 at 6:30pm.</div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, minWidth: 700 }}>
                    <thead><tr>
                      <th style={{ padding: "4px 6px", fontSize: 10, fontWeight: 700, color: "#9CA3AF", textAlign: "left", width: 60 }}></th>
                      {weekDates.map((d, i) => {
                        const eveCount = dayStaffing[d]?.evening || 0;
                        return (<th key={d} style={{ padding: "4px 4px", textAlign: "center", fontSize: 10, fontWeight: 700, color: "#374151" }}>
                          {dayLabels[i]} ({eveCount})
                        </th>);
                      })}
                    </tr></thead>
                    <tbody>
                      {[0,1,2,3,4].map(slotIdx => {
                        const anyHasThisSlot = weekDates.some(d => (dayStaffing[d]?.evening || 0) > slotIdx);
                        if (!anyHasThisSlot) return null;
                        const defaults = ["18:00","18:00","18:15","18:30","19:00"];
                        return (
                          <tr key={slotIdx}>
                            <td style={{ padding: "3px 6px", fontSize: 10, fontWeight: 600, color: "#7C3AED" }}>#{slotIdx + 1}</td>
                            {weekDates.map(d => {
                              const eveCount = dayStaffing[d]?.evening || 0;
                              if (slotIdx >= eveCount) return <td key={d}></td>;
                              const timesKey = d + "_eveTimes";
                              const times = dayStaffing[timesKey] || defaults.slice(0, eveCount);
                              const val = times[slotIdx] || defaults[slotIdx] || "18:00";
                              return (<td key={d} style={{ padding: "2px 2px", textAlign: "center" }}>
                                <input type="time" value={val} onChange={e => {
                                  setDayStaffing(prev => {
                                    const newTimes = [...(prev[timesKey] || defaults.slice(0, eveCount))];
                                    newTimes[slotIdx] = e.target.value;
                                    return { ...prev, [timesKey]: newTimes };
                                  });
                                }} style={{ width: 75, padding: "2px 4px", borderRadius: 4, border: "1px solid #D1D5DB", fontSize: 10, fontFamily: font }} />
                              </td>);
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setStep("timeoff")} style={{ padding: "10px 18px", borderRadius: 8, border: "1px solid #D1D5DB", background: "#fff", color: "#6B7280", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: font }}>{"\u2190"} Back</button>
            {Object.keys(availOverrides).length > 0 && <span style={{ fontSize: 11, color: "#22C55E", fontWeight: 600 }}>{"\u2713"} {Object.keys(availOverrides).length} availability override{Object.keys(availOverrides).length > 1 ? "s" : ""}</span>}
            <button onClick={() => setShowNuance(true)} style={{ padding: "10px 24px", borderRadius: 8, border: "none", background: "#4A3F2F", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: font }}>{"\u26a1"} Generate Schedule</button>
          </div>
        </div>
      )}

      {/* RESULT */}
      {(result && (step === "result" || isSaved)) && (
        <>
      {/* RULE BREAK APPROVAL MODAL */}
          {pendingApprovals && pendingApprovals.length > 0 && (
            <div style={{ background: "#FFF7ED", borderRadius: 12, padding: 18, marginBottom: 16, border: "2px solid #FB923C" }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#C2410C", marginBottom: 4 }}>⚠️ Schedule has unfilled slots</div>
              <div style={{ fontSize: 12, color: "#9A3412", marginBottom: 14 }}>
                The best possible schedule requires bending the rules below. Check the ones you approve, then click Regenerate.
              </div>
              {pendingApprovals.map(rule => (
                <label key={rule.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 12, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={ruleApprovalChecked.includes(rule.id)}
                    onChange={e => setRuleApprovalChecked(prev => e.target.checked ? [...prev, rule.id] : prev.filter(x => x !== rule.id))}
                    style={{ marginTop: 2, accentColor: "#C2410C", width: 16, height: 16, flexShrink: 0 }}
                  />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#9A3412" }}>{rule.label}</div>
                    <div style={{ fontSize: 11, color: "#C2410C", marginTop: 2 }}>
                      Affects: {rule.slots.map(s => {
                        const dt = new Date(s.date + "T12:00:00");
                        return dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) + " — " + s.slotLabel;
                      }).join(", ")}
                    </div>
                  </div>
                </label>
              ))}
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button
                  onClick={() => handleApproveBreaks(ruleApprovalChecked)}
                  disabled={ruleApprovalChecked.length === 0}
                  style={{ padding: "9px 20px", borderRadius: 8, border: "none", background: ruleApprovalChecked.length === 0 ? "#D1D5DB" : "#C2410C", color: "#fff", cursor: ruleApprovalChecked.length === 0 ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 700, fontFamily: font }}>
                  ⚡ Approve & Regenerate
                </button>
                <button
                  onClick={() => setPendingApprovals(null)}
                  style={{ padding: "9px 16px", borderRadius: 8, border: "1px solid #D1D5DB", background: "#fff", color: "#6B7280", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: font }}>
                  Keep as-is
                </button>
              </div>
            </div>
          )}

          {/* Approved breaks indicator */}
          {approvedBreaks.length > 0 && !pendingApprovals && (
            <div style={{ background: "#FFFBEB", borderRadius: 8, padding: "8px 12px", marginBottom: 12, border: "1px solid #FDE68A", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, color: "#92400E" }}>⚠ {approvedBreaks.length} rule exception{approvedBreaks.length > 1 ? "s" : ""} approved this week</span>
              <button onClick={() => { setApprovedBreaks([]); handleGenerate([]); }} style={{ fontSize: 10, color: "#B45309", background: "none", border: "1px solid #FCD34D", borderRadius: 4, padding: "2px 6px", cursor: "pointer", fontFamily: font }}>Reset rules</button>
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            {!isSaved && draft ? (
              <div style={{ fontSize: 11, color: "#9CA3AF" }}>💡 Click any cell to edit shift details</div>
            ) : <div />}
            <div style={{ display: "flex", background: "#F3F4F6", borderRadius: 8, padding: 2 }}>
              {[["shift", "Shift View"], ["employee", "Employee View"]].map(([k, l]) => (
                <button key={k} onClick={() => setViewMode(k)} style={{ padding: "5px 14px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer", border: "none", fontFamily: font, background: viewMode === k ? "#4A3F2F" : "transparent", color: viewMode === k ? "#fff" : "#6B7280" }}>{l}</button>
              ))}
            </div>
          </div>

          {viewMode === "shift" ? (
          <div style={{ overflowX: "auto", background: "#fff", borderRadius: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.06)", marginBottom: 16 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 900 }}>
              <thead><tr style={{ borderBottom: "2px solid #E5E7EB" }}>
                <th style={{ padding: "10px 8px", textAlign: "left", fontWeight: 700, color: "#9CA3AF", fontSize: 9, width: 90, position: "sticky", left: 0, background: "#fff", zIndex: 1, borderRight: "1px solid #E5E7EB" }}>SHIFT</th>
                {weekDates.map((d, i) => {
                  const dt = new Date(d + "T12:00:00");
                  const dayType = getDayType(d, schoolDates);
                  const isH = dayType.includes("Holiday");
                  const isMC = i === 3 || i === 6;
                  const isWE = i === 5 || i === 6;
                  const colBg = isMC ? "#F5F3FF" : isH ? "#FFF1F0" : isWE ? "#FAFAFA" : "#fff";
                  return (<th key={d} style={{ padding: "10px 6px", textAlign: "center", fontWeight: 700, fontSize: 11, color: isH ? "#DC2626" : isMC ? "#7C3AED" : "#374151", background: colBg, minWidth: 120 }}>
                    <div style={{ fontSize: 13, fontWeight: 800 }}>{dayLabels[i]}</div>
                    <div style={{ fontSize: 10, fontWeight: 500, color: "#9CA3AF", marginTop: 1 }}>{dt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>
                    {isH && <div style={{ fontSize: 9, color: "#fff", fontWeight: 700, background: "#EF4444", borderRadius: 4, padding: "1px 5px", marginTop: 3, display: "inline-block" }}>HOLIDAY</div>}
                    {isMC && !isH && <div style={{ fontSize: 9, color: "#fff", fontWeight: 700, background: "#7C3AED", borderRadius: 4, padding: "1px 5px", marginTop: 3, display: "inline-block" }}>MC NIGHT</div>}
                  </th>);
                })}
              </tr></thead>
              <tbody>
                {getRows().map(row => {
                  const colors = tc[row.type] || { color: "#374151", bg: "transparent" };
                  return (<tr key={row.type + "-" + row.order} style={{ borderBottom: "1px solid #F3F4F6" }}>
                    <td style={{ padding: "5px 8px", whiteSpace: "nowrap", position: "sticky", left: 0, zIndex: 1, background: "#fff", borderRight: `3px solid ${colors.bg || "#E5E7EB"}` }}>
                        <span style={{ fontSize: 9, fontWeight: 700, color: colors.bg || "#6B7280", letterSpacing: 0.2 }}>{row.label}</span>
                      </td>
                    {weekDates.map((d, i) => {
                      const dayType = getDayType(d, schoolDates);
                      const isH = dayType.includes("Holiday");
                      const isMC = i === 3 || i === 6;
                      const isWE = i === 5 || i === 6;
                      const colBg = isMC ? "#FAF8FF" : isH ? "#FFF8F8" : isWE ? "#FAFAFA" : "#fff";
                      const match = (result.schedule[d] || []).find(a => a.type === row.type && a.order === row.order);
                      if (!match) return <td key={d} style={{ padding: "6px 4px", textAlign: "center", color: "#E5E7EB", fontSize: 10, background: colBg }}>{"\u2014"}</td>;
                      const un = !match.empId; const isTr = match.empRole === "trainee"; const isSL = match.empRole === "shift_lead";
                      const isSel = selected && selected.date === d && selected.type === row.type && selected.order === row.order;
                      const canClick = !isSaved && draft;
                      return (
                        <td key={d}
                          onClick={canClick ? () => setEditingShift({ date: d, type: row.type, order: row.order, slot: match }) : undefined}
                          style={{ padding: "5px 4px", textAlign: "center", cursor: canClick ? "pointer" : "default", background: isSel ? "#DBEAFE" : colBg, transition: "background 0.15s" }}
                        >
                          <div style={{
                            padding: "5px 4px", borderRadius: 6, fontSize: 11, fontWeight: 600,
                            color: un ? "#DC2626" : isTr ? "#7C3AED" : isSL ? "#B45309" : "#374151",
                            background: un ? "#FEE2E2" : isTr ? "#EDE9FE" : isSL ? "#FEF3C7" : "#F9FAFB",
                            border: isSel ? "2px solid #2563EB" : un ? "1px dashed #FCA5A5" : "1px solid #E5E7EB",
                            boxShadow: isSel ? "0 0 0 2px rgba(37,99,235,0.2)" : "none",
                          }}>{match.empName.split(" ")[0]}</div>
                          <div style={{ fontSize: 8, color: "#9CA3AF", marginTop: 1 }}>{fmtTime(match.start)}{"\u2013"}{fmtTime(match.end)}</div>
                        </td>
                      );
                    })}
                  </tr>);
                })}
              </tbody>
              <tbody>
                <tr style={{ borderTop: "2px solid #E5E7EB", background: "#F9FAFB" }}>
                  <td style={{ padding: "7px 8px", fontSize: 9, fontWeight: 800, color: "#6B7280", position: "sticky", left: 0, background: "#F9FAFB", zIndex: 1 }}>HRS</td>
                  {weekDates.map((d, i) => {
                    const daySlots = (result.schedule[d] || []);
                    const totalHrs = daySlots.reduce((sum, s) => sum + (s.empId ? (s.hours || 0) : 0), 0);
                    const headcount = new Set(daySlots.filter(s => s.empId).map(s => s.empId)).size;
                    const isMC = i === 3 || i === 6;
                    const isH = getDayType(d, schoolDates).includes("Holiday");
                    const colBg = isMC ? "#FAF8FF" : isH ? "#FFF8F8" : "#F9FAFB";
                    return (
                      <td key={d} style={{ padding: "7px 4px", textAlign: "center", background: colBg }}>
                        <div style={{ fontSize: 11, fontWeight: 800, color: "#374151" }}>{totalHrs.toFixed(1)}h</div>
                        <div style={{ fontSize: 9, color: "#9CA3AF" }}>{headcount} ppl</div>
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
          ) : (
          <div style={{ overflowX: "auto", background: "#fff", borderRadius: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.06)", marginBottom: 16 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 1000 }}>
              <thead><tr style={{ borderBottom: "2px solid #E5E7EB" }}>
                <th style={{ padding: "8px 8px", textAlign: "left", fontWeight: 700, color: "#6B7280", fontSize: 10, width: 140, position: "sticky", left: 0, background: "#fff", zIndex: 2 }}></th>
                {weekDates.map((d, i) => {
                  const dt = new Date(d + "T12:00:00");
                  const dayType = getDayType(d, schoolDates);
                  const isH = dayType.includes("Holiday");
                  const isMC = i === 3 || i === 6;
                  const isWE = i === 5 || i === 6;
                  const colBg = isMC ? "#F5F3FF" : isH ? "#FFF1F0" : isWE ? "#FAFAFA" : "#fff";
                  return (<th key={d} style={{ padding: "7px 4px", textAlign: "center", fontWeight: 700, fontSize: 11, color: isH ? "#DC2626" : isMC ? "#7C3AED" : "#374151", borderBottom: "none", minWidth: 110, background: colBg }}>
                    <div style={{ fontWeight: 800 }}>{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][dt.getDay()]}, {dt.getDate()}</div>
                    {isH && <div style={{ fontSize: 8, color: "#fff", background: "#EF4444", borderRadius: 3, padding: "0 4px", display: "inline-block", marginTop: 2 }}>HOLIDAY</div>}
                    {isMC && !isH && <div style={{ fontSize: 8, color: "#fff", background: "#7C3AED", borderRadius: 3, padding: "0 4px", display: "inline-block", marginTop: 2 }}>MC NIGHT</div>}
                  </th>);
                })}
              </tr></thead>
              <tbody>
                {(() => {
                  const defaultSort = employees.filter(e => e.status === "active").sort((a, b) => {
                    const o = { shift_lead: 0, regular: 1, trainee: 2 };
                    return (o[a.role] || 3) - (o[b.role] || 3) || a.name.localeCompare(b.name);
                  });
                  const sortedEmps = empOrder ? empOrder.map(id => defaultSort.find(e => e.id === id)).filter(Boolean) : defaultSort;
                  // Add any new employees not in custom order
                  if (empOrder) { defaultSort.forEach(e => { if (!sortedEmps.find(s => s.id === e.id)) sortedEmps.push(e); }); }
                  // Colors match Homebase exactly
                  const shiftColors = {
                    day_lead:     { bg: "#F97316", text: "#fff", label: "Day Shift Lead" },  // orange
                    day:          { bg: "#EAB308", text: "#fff", label: "Weekday Day" },     // yellow
                    mid:          { bg: "#EAB308", text: "#fff", label: "Mid Shift" },       // yellow
                    evening_sl:   { bg: "#EF4444", text: "#fff", label: "Shift Lead" },      // red
                    evening_sl2:  { bg: "#EF4444", text: "#fff", label: "Shift Lead" },      // red
                    evening:      { bg: "#A855F7", text: "#fff", label: "Night Shift" },     // purple
                    mc_leader:    { bg: "#22C55E", text: "#fff", label: "SHIFTLEAD/MACHINECLEAN" }, // green
                    mc_sl_helper: { bg: "#22C55E", text: "#fff", label: "MACHINECLEAN" },    // green
                    mc_helper:    { bg: "#22C55E", text: "#fff", label: "MACHINECLEAN" },    // green
                  };
                  const weekendDayColor = { bg: "#EAB308", text: "#fff", label: "Weekend Day" };
                  const roleCircle = { shift_lead: "#EF4444", regular: "#3B82F6", trainee: "#22C3E6" };

                  return (<>
                    {sortedEmps.map(emp => {
                      const totalHrs = result.empHours?.[emp.id] || 0;
                      const initials = emp.name.split(" ").map(w => w[0]).join("").toUpperCase();
                      const below = (result.empShiftCount?.[emp.id] || 0) < emp.minShifts;
                      return (<tr key={emp.id} style={{ borderBottom: "1px solid #F3F4F6", background: dragEmpId === emp.id ? "#DBEAFE" : undefined }}>
                        <td draggable
                          onDragStart={() => setDragEmpId(emp.id)}
                          onDragOver={e => e.preventDefault()}
                          onDrop={() => {
                            if (dragEmpId && dragEmpId !== emp.id) {
                              const order = sortedEmps.map(e => e.id);
                              const fromIdx = order.indexOf(dragEmpId);
                              const toIdx = order.indexOf(emp.id);
                              if (fromIdx >= 0 && toIdx >= 0) {
                                const [moved] = order.splice(fromIdx, 1);
                                order.splice(toIdx, 0, moved);
                                setEmpOrder(order);
                              }
                            }
                            setDragEmpId(null);
                          }}
                          onDragEnd={() => setDragEmpId(null)}
                          style={{ padding: "6px 8px", position: "sticky", left: 0, background: dragEmpId === emp.id ? "#DBEAFE" : "#fff", zIndex: 1, borderRight: "1px solid #E5E7EB", verticalAlign: "top", cursor: "grab" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                            <span style={{ color: "#D1D5DB", fontSize: 10, cursor: "grab" }}>{"\u2807"}</span>
                            <div style={{ width: 26, height: 26, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: roleCircle[emp.role] || "#9CA3AF", color: "#fff", fontSize: 9, fontWeight: 800, flexShrink: 0 }}>{initials}</div>
                            <div>
                              <div style={{ fontWeight: 700, fontSize: 11, color: below ? "#DC2626" : "#374151", lineHeight: 1.2 }}>{emp.name}</div>
                              <div style={{ fontSize: 9, color: "#9CA3AF", fontWeight: 600 }}>{totalHrs.toFixed(1)} hrs · {result.empShiftCount?.[emp.id] || 0} shifts</div>
                              {draft && (() => {
                                const actualShifts = result.empShiftCount?.[emp.id] || 0;
                                const override = weeklyMaxOverrides[emp.id];
                                const target = (override && typeof override === "object" && typeof override.max === "number") ? override.max : null;
                                const displayNum = target !== null ? target : actualShifts;
                                const hasChange = target !== null && target !== actualShifts;
                                
                                const adjust = (delta) => {
                                  if (isSaved) return; // read-only when saved
                                  const current = target !== null ? target : actualShifts;
                                  const next = Math.max(0, Math.min(7, current + delta));
                                  setWeeklyMaxOverrides(prev => {
                                    const n = { ...prev };
                                    if (next === actualShifts && !override) { delete n[emp.id]; }
                                    else { n[emp.id] = { min: next, max: next }; }
                                    return n;
                                  });
                                };
                                const reset = () => setWeeklyMaxOverrides(prev => { const n = { ...prev }; delete n[emp.id]; return n; });
                                
                                return (
                                  <div style={{ display: "flex", alignItems: "center", gap: 3, marginTop: 2 }}>
                                    {!isSaved && <button onClick={() => adjust(-1)} style={{ width: 15, height: 15, borderRadius: 3, border: "1px solid #E5E7EB", background: "#FEF2F2", color: "#DC2626", cursor: "pointer", fontSize: 11, fontWeight: 800, padding: 0, lineHeight: "16px" }}>{"\u2212"}</button>}
                                    <span style={{ fontSize: 11, fontWeight: 800, minWidth: 16, textAlign: "center", color: actualShifts < emp.minShifts ? "#DC2626" : (hasChange ? (target > actualShifts ? "#16A34A" : "#DC2626") : "#374151") }}>{actualShifts}</span>
                                    {!isSaved && <button onClick={() => adjust(1)} style={{ width: 15, height: 15, borderRadius: 3, border: "1px solid #E5E7EB", background: "#F0FDF4", color: "#16A34A", cursor: "pointer", fontSize: 11, fontWeight: 800, padding: 0, lineHeight: "16px" }}>+</button>}
                                    {!isSaved && hasChange ? (
                                      <>
                                        <span style={{ fontSize: 9, color: target > actualShifts ? "#16A34A" : "#DC2626", fontWeight: 700 }}>
                                          {target > actualShifts ? "\u25b2" + (target - actualShifts) : "\u25bc" + (actualShifts - target)}
                                        </span>
                                        <button onClick={reset} style={{ fontSize: 9, color: "#9CA3AF", cursor: "pointer", background: "none", border: "none", padding: 0 }}>{"\u21ba"}</button>
                                      </>
                                    ) : (
                                      <span style={{ fontSize: 9, color: "#9CA3AF" }}>shifts</span>
                                    )}
                                  </div>
                                );
                              })()}
                            </div>
                          </div>
                        </td>
                        {weekDates.map((d, di) => {
                          const shifts = (result.schedule[d] || []).filter(a => a.empId === emp.id);
                          const dt = new Date(d + "T12:00:00");
                          const dow = dt.getDay();
                          const isWE = dow === 0 || dow === 6;
                          const dayKey = DAYS[dow === 0 ? 6 : dow - 1];
                          const u = emp.unavailability[dayKey];
                          const weekTO = weeklyTOs.filter(t => t.empId === emp.id && t.date === d);
                          const hasTO = weekTO.length > 0;
                          const hasUnavail = u.allDay || (u.start && u.end);
                          // Show unavail badge if: all day unavail with no shifts, OR partial unavail always (so you can see it alongside a shift)
                          const showUnavail = u.allDay ? shifts.length === 0 : hasUnavail;
                          // Helper: does a shift's time overlap with this employee's unavailability?
                          const shiftOverlapsUnavail = (shiftStart, shiftEnd) => {
                            if (!hasUnavail) return false;
                            if (u.allDay) return true;
                            const weekTO2 = weekTO.find(t => t.allDay || (t.start && t.end && tm(shiftStart) < tm(t.end) && tm(t.start) < tm(shiftEnd)));
                            if (weekTO2) return true;
                            if (u.start && u.end) return tm(shiftStart) < tm(u.end) && tm(u.start) < tm(shiftEnd);
                            return false;
                          };
                          return (<td key={d}
                            onDragOver={!isSaved && draft ? (ev) => { ev.preventDefault(); ev.dataTransfer.dropEffect = "move"; } : undefined}
                            onDrop={!isSaved && draft && dragSlot ? (ev) => {
                              ev.preventDefault();
                              const newSchedule = {};
                              Object.keys(draft.schedule).forEach(dd => { newSchedule[dd] = [...draft.schedule[dd]]; });
                              const fromIdx = newSchedule[dragSlot.date].findIndex(a => a.type === dragSlot.type && a.order === dragSlot.order);
                              if (fromIdx < 0) { setDragSlot(null); return; }
                              const fromSlot = newSchedule[dragSlot.date][fromIdx];

                              // Block drop if shift time overlaps with employee's unavailability
                              if (shiftOverlapsUnavail(fromSlot.start, fromSlot.end)) { setDragSlot(null); return; }

                              // Check if target employee has a shift on the same day we can swap with
                              const targetShifts = (result.schedule[d] || []).filter(a => a.empId === emp.id);
                              if (targetShifts.length > 0) {
                                // Swap with the target's shift
                                const target = targetShifts[0];
                                if (dragSlot.date === d && dragSlot.type === target.type && dragSlot.order === target.order) { setDragSlot(null); return; }
                                const toIdx = newSchedule[d].findIndex(a => a.type === target.type && a.order === target.order);
                                if (toIdx >= 0) {
                                  const toSlot = newSchedule[d][toIdx];
                                  newSchedule[dragSlot.date][fromIdx] = { ...fromSlot, empId: toSlot.empId, empName: toSlot.empName, empRole: toSlot.empRole };
                                  newSchedule[d][toIdx] = { ...toSlot, empId: fromSlot.empId, empName: fromSlot.empName, empRole: fromSlot.empRole };
                                }
                              } else {
                                // Target employee has no shift this day — reassign the dragged shift to this employee
                                newSchedule[dragSlot.date][fromIdx] = { ...fromSlot, empId: emp.id, empName: emp.name, empRole: emp.role };
                              }
                              // Recalculate counts
                              const newSc = {}, newSh = {};
                              employees.filter(e2 => e2.status === "active").forEach(e2 => { newSc[e2.id] = 0; newSh[e2.id] = 0; });
                              Object.values(newSchedule).forEach(daySlots => { daySlots.forEach(slot => { if (slot.empId) { newSc[slot.empId] = (newSc[slot.empId] || 0) + 1; newSh[slot.empId] = (newSh[slot.empId] || 0) + slot.hours; } }); });
                              setDraft({ ...draft, schedule: newSchedule, empShiftCount: newSc, empHours: newSh });
                              setDragSlot(null);
                            } : undefined}
                            style={{ padding: "3px 3px", verticalAlign: "top", minHeight: 44, background: dragSlot ? "#FEFCE8" : undefined }}>
                            {hasTO && weekTO.map((to, ti) => (
                              <div key={"to-" + ti} style={{ padding: "4px 6px", borderRadius: 5, marginBottom: 2, background: "#F3F4F6", border: "1px solid #D1D5DB" }}>
                                <div style={{ fontSize: 10, color: "#6B7280", fontWeight: 600 }}>{"\u23f0"} Time-off</div>
                                <div style={{ fontSize: 9, color: "#9CA3AF" }}>{to.allDay ? "All Day" : fmtTime(to.start) + "\u2013" + fmtTime(to.end)}</div>
                              </div>
                            ))}
                            {showUnavail && !hasTO && (() => {
                              const ovKey = d + ":" + emp.id;
                              const ov = availOverrides[ovKey];
                              const ovLabels = { all: "Available All Day", morning: "Available Day Shift (before 6pm)", evening: "Available Night Shift (3pm+)" };
                              return (
                                <div style={{ position: "relative" }}>
                                  <div onClick={(ev) => {
                                    if (isSaved) return;
                                    if (ov) { setAvailOverrides(prev => { const n = { ...prev }; delete n[ovKey]; return n; }); }
                                    else { setOverridePopup({ date: d, empId: emp.id, x: ev.clientX, y: ev.clientY }); }
                                  }} style={{ padding: "4px 6px", borderRadius: 5, marginBottom: 2, background: ov ? "#F0FDF4" : "#F9FAFB", border: ov ? "2px solid #22C55E" : "1px dashed #D1D5DB", cursor: isSaved ? "default" : "pointer" }}>
                                    {ov ? (
                                      <>
                                        <div style={{ fontSize: 10, color: "#22C55E", fontWeight: 700 }}>{"\u2713"} Override: {ovLabels[ov]}</div>
                                        <div style={{ fontSize: 8, color: "#6B7280" }}>Click to remove</div>
                                      </>
                                    ) : (
                                      <>
                                        <div style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600 }}>Unavailable</div>
                                        <div style={{ fontSize: 9, color: "#D1D5DB" }}>{u.allDay ? "All Day" : fmtTime(u.start) + "\u2013" + fmtTime(u.end)}</div>
                                        {!isSaved && <div style={{ fontSize: 8, color: "#9CA3AF", marginTop: 2 }}>Click to override</div>}
                                      </>
                                    )}
                                  </div>
                                </div>
                              );
                            })()}
                            {shifts.map((s, si2) => {
                              let sColors = shiftColors[s.type] || { bg: "#6B7280", text: "#fff", label: s.label };
                              if (isWE && (s.type === "day_lead" || s.type === "day")) sColors = { ...sColors, ...weekendDayColor, label: s.type === "day_lead" ? "Shift Lead" : "Weekend Day" };
                              if (s.type === "day_lead" && !isWE) sColors = { ...sColors, label: "Day Shift Lead" };
                              // Trainees show in blue, but graduated trainees show as regulars
                              if (s.empRole === "trainee") {
                                const emp = employees.find(e => e.id === s.empId);
                                const isGraduated = emp && (emp.traineeCumulative || 0) >= (rules?.trainee?.graduationHours || 30);
                                if (!isGraduated) sColors = { ...sColors, bg: "#22C3E6" };
                              }
                              const canClick = !isSaved && draft;
                              const isDragging = dragSlot && dragSlot.date === d && dragSlot.type === s.type && dragSlot.order === s.order;
                              const isDropTarget = dragSlot && !(dragSlot.date === d && dragSlot.type === s.type && dragSlot.order === s.order);
                              return (
                                <div key={si2}
                                  draggable={!!(canClick && s.empId)}
                                  onDragStart={canClick && s.empId ? (ev) => { ev.dataTransfer.setData("text/plain", ""); ev.dataTransfer.effectAllowed = "move"; setDragSlot({ date: d, type: s.type, order: s.order, empId: s.empId, empName: s.empName }); } : undefined}
                                  onDragEnd={() => setDragSlot(null)}
                                  onDragOver={(ev) => { ev.preventDefault(); ev.dataTransfer.dropEffect = "move"; }}
                                  onDrop={canClick ? (ev) => {
                                    ev.preventDefault();
                                    ev.stopPropagation();
                                    if (!dragSlot || (dragSlot.date === d && dragSlot.type === s.type && dragSlot.order === s.order)) return;
                                    const newSchedule = {};
                                    Object.keys(draft.schedule).forEach(dd => { newSchedule[dd] = [...draft.schedule[dd]]; });
                                    const fromIdx = newSchedule[dragSlot.date].findIndex(a => a.type === dragSlot.type && a.order === dragSlot.order);
                                    const toIdx = newSchedule[d].findIndex(a => a.type === s.type && a.order === s.order);
                                    if (fromIdx >= 0 && toIdx >= 0) {
                                      const fromSlot = newSchedule[dragSlot.date][fromIdx];
                                      const toSlot = newSchedule[d][toIdx];
                                      // Only swap if neither employee would land in their own unavailability
                                      const fromEmp = employees.find(e2 => e2.status === "active" && e2.id === fromSlot.empId);
                                      const toEmp = employees.find(e2 => e2.status === "active" && e2.id === toSlot.empId);
                                      const checkOverlap = (emp2, dateStr2, start2, end2) => {
                                        if (!emp2) return false;
                                        const dow3 = new Date(dateStr2 + "T12:00:00").getDay();
                                        const dk = DAYS[dow3 === 0 ? 6 : dow3 - 1];
                                        const u2 = emp2.unavailability[dk];
                                        if (u2?.allDay) return true;
                                        if (u2?.start && u2?.end && tm(start2) < tm(u2.end) && tm(u2.start) < tm(end2)) return true;
                                        return false;
                                      };
                                      // fromSlot's employee going to d (toSlot's day/time)
                                      const fromWouldConflict = fromEmp && checkOverlap(fromEmp, d, toSlot.start, toSlot.end);
                                      // toSlot's employee going to dragSlot.date (fromSlot's day/time)
                                      const toWouldConflict = toEmp && checkOverlap(toEmp, dragSlot.date, fromSlot.start, fromSlot.end);
                                      if (fromWouldConflict || toWouldConflict) { setDragSlot(null); return; }
                                      newSchedule[dragSlot.date][fromIdx] = { ...fromSlot, empId: toSlot.empId, empName: toSlot.empName, empRole: toSlot.empRole };
                                      newSchedule[d][toIdx] = { ...toSlot, empId: fromSlot.empId, empName: fromSlot.empName, empRole: fromSlot.empRole };
                                      const newSc = {}, newSh = {};
                                      employees.filter(e2 => e2.status === "active").forEach(e2 => { newSc[e2.id] = 0; newSh[e2.id] = 0; });
                                      Object.values(newSchedule).forEach(daySlots => { daySlots.forEach(slot => { if (slot.empId) { newSc[slot.empId] = (newSc[slot.empId] || 0) + 1; newSh[slot.empId] = (newSh[slot.empId] || 0) + slot.hours; } }); });
                                      setDraft({ ...draft, schedule: newSchedule, empShiftCount: newSc, empHours: newSh });
                                    }
                                    setDragSlot(null);
                                  } : undefined}
                                  onClick={canClick ? () => setEditingShift({ date: d, type: s.type, order: s.order, slot: s }) : undefined}
                                  style={{ padding: "4px 6px", borderRadius: 5, marginBottom: 2, background: isDropTarget ? "#FEF9C3" : sColors.bg, color: isDropTarget ? "#92400E" : sColors.text, minHeight: 36, cursor: canClick && s.empId ? "grab" : "pointer", opacity: isDragging ? 0.4 : 1, transition: "all 0.15s", border: isDropTarget ? "2px dashed #F59E0B" : "2px solid transparent" }}>
                                  <div style={{ fontSize: 9.5, fontWeight: 700 }}>{fmtTime(s.start)}{"\u2013"}{fmtTime(s.end)}</div>
                                  <div style={{ fontSize: 8, fontWeight: 600, opacity: 0.9 }}>{sColors.label}</div>
                                </div>
                              );
                            })}
                            {/* Add shift button — show when employee has no shifts this day and schedule is editable */}
                            {shifts.length === 0 && !hasTO && !showUnavail && !isSaved && draft && (
                              <div onClick={() => setAddShiftPopup({ empId: emp.id, empName: emp.name, empRole: emp.role, date: d })}
                                style={{ padding: "8px 8px", borderRadius: 6, border: "1px dashed #D1D5DB", cursor: "pointer", textAlign: "center", color: "#9CA3AF", fontSize: 11, fontWeight: 600, transition: "all 0.15s" }}
                                onMouseOver={e => { e.currentTarget.style.background = "#F0FDF4"; e.currentTarget.style.borderColor = "#22C55E"; e.currentTarget.style.color = "#16A34A"; }}
                                onMouseOut={e => { e.currentTarget.style.background = ""; e.currentTarget.style.borderColor = "#D1D5DB"; e.currentTarget.style.color = "#9CA3AF"; }}>
                                + Add Shift
                              </div>
                            )}
                          </td>);
                        })}
                      </tr>);
                    })}
                  </>);
                })()}
              </tbody>
            </table>
          </div>
          )}  

          {/* Action Bar */}
          {!isSaved && draft && (
            <div style={{ background: "#fff", borderRadius: 12, padding: "12px 18px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)", marginBottom: 16, border: "2px solid #F59E0B" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <button onClick={handleAccept} style={{ padding: "8px 24px", borderRadius: 8, border: "none", background: "#22C55E", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: font }}>{"\u2713"} Save</button>
                <button onClick={handleReject} style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: "#4A3F2F", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: font }}>{"\ud83d\udd04"} Regenerate</button>
                <button onClick={() => { setDraft(null); setStep("timeoff"); setNotes([]); setWeeklyMaxOverrides({}); setDayStaffing(null); setImportantEvenings(new Set()); }} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #D1D5DB", background: "#fff", color: "#6B7280", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: font }}>{"\u2715"} Start Over</button>
                <div style={{ flex: 1 }} />
                {Object.keys(availOverrides).length > 0 && (
                  <span style={{ fontSize: 10, color: "#16A34A", fontWeight: 600, padding: "4px 8px", background: "#F0FDF4", borderRadius: 6 }}>{"\u2713"} {Object.keys(availOverrides).length} override{Object.keys(availOverrides).length > 1 ? "s" : ""}</span>
                )}
                {Object.keys(weeklyMaxOverrides).length > 0 && (
                  <span style={{ fontSize: 10, color: "#F59E0B", fontWeight: 600, padding: "4px 8px", background: "#FFFBEB", borderRadius: 6 }}>{"\u25b2\u25bc"} {Object.keys(weeklyMaxOverrides).length} shift adjustment{Object.keys(weeklyMaxOverrides).length > 1 ? "s" : ""}</span>
                )}
              </div>
              {/* Smart feedback: balance check + target suggestions */}
              {result && (() => {
                const feedback = [];
                const activeEmps = employees.filter(e => e.status === "active");
                
                // Check weekly target mismatches
                Object.entries(weeklyMaxOverrides).forEach(([empId, wmo]) => {
                  if (!wmo || typeof wmo !== "object") return;
                  const emp2 = activeEmps.find(e => e.id === empId);
                  if (!emp2) return;
                  const actual = result.empShiftCount?.[empId] || 0;
                  const target = wmo.max;
                  if (typeof target === "number" && actual < target) {
                    // Find who could give up a shift
                    const canReduce = activeEmps.filter(e => {
                      if (e.id === empId) return false;
                      const theirShifts = result.empShiftCount?.[e.id] || 0;
                      return theirShifts > e.minShifts && theirShifts > 1 && e.maxShifts > 2;
                    }).sort((a, b) => (result.empShiftCount?.[b.id] || 0) - (result.empShiftCount?.[a.id] || 0));
                    const suggestion = canReduce.length > 0 ? " Try reducing " + canReduce.slice(0, 2).map(e => e.name + " (" + (result.empShiftCount?.[e.id] || 0) + " shifts)").join(" or ") : "";
                    feedback.push({ msg: "\u26a0 " + emp2.name + " has " + actual + " shifts (target: " + target + ")." + suggestion, type: "warn" });
                  }
                });

                // Balance check: find imbalanced hours (skip time-off, high schoolers)
                const regulars = activeEmps.filter(e => e.role === "regular" && e.maxShifts > 2);
                const regHours = regulars.map(e => ({ name: e.name, id: e.id, hrs: result.empHours?.[e.id] || 0, shifts: result.empShiftCount?.[e.id] || 0, min: e.minShifts }));
                const avgHrs = regHours.length > 0 ? regHours.reduce((s, e) => s + e.hrs, 0) / regHours.length : 0;
                const highHrs = regHours.filter(e => e.hrs > avgHrs + 4 && e.shifts > e.min);
                const lowHrs = regHours.filter(e => e.hrs < avgHrs - 4 && e.shifts < e.min + 1);
                if (highHrs.length > 0 && lowHrs.length > 0) {
                  feedback.push({ msg: "\ud83d\udca1 Hours imbalance: " + lowHrs.map(e => e.name + " (" + e.hrs.toFixed(0) + "h)").join(", ") + " could use more hours. Consider reducing " + highHrs.map(e => e.name + " (" + e.hrs.toFixed(0) + "h)").join(", "), type: "balance" });
                }

                // SL balance
                const sls = activeEmps.filter(e => e.role === "shift_lead");
                const slHours = sls.map(e => ({ name: e.name, hrs: result.empHours?.[e.id] || 0, shifts: result.empShiftCount?.[e.id] || 0 }));
                const slAvg = slHours.length > 0 ? slHours.reduce((s, e) => s + e.hrs, 0) / slHours.length : 0;
                const slHigh = slHours.filter(e => e.hrs > slAvg + 3);
                const slLow = slHours.filter(e => e.hrs < slAvg - 3);
                if (slHigh.length > 0 && slLow.length > 0) {
                  feedback.push({ msg: "\ud83d\udca1 SL imbalance: " + slLow.map(e => e.name + " (" + e.hrs.toFixed(0) + "h)").join(", ") + " vs " + slHigh.map(e => e.name + " (" + e.hrs.toFixed(0) + "h)").join(", "), type: "balance" });
                }

                if (feedback.length === 0) return null;
                return (
                  <div style={{ marginTop: 8 }}>
                    {feedback.map((f, i) => (
                      <div key={i} style={{ fontSize: 11, padding: "6px 10px", marginBottom: 3, borderRadius: 6, background: f.type === "warn" ? "#FEF3C7" : f.type === "balance" ? "#F0F9FF" : "#EFF6FF", color: f.type === "warn" ? "#92400E" : "#1E40AF", lineHeight: 1.4 }}>
                        {f.msg}
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}

          {/* Saved timestamp */}
          {isSaved && saved?.savedAt && (
            <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 8, paddingLeft: 2 }}>
              ✓ Saved {new Date(saved.savedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
            </div>
          )}

          {/* Warnings — collapsed by default */}
          {(result.warnings || []).length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <button onClick={() => setWarningsOpen(!warningsOpen)}
                style={{ fontSize: 11, color: "#92400E", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 6, padding: "3px 10px", cursor: "pointer", fontFamily: font, fontWeight: 600 }}>
                {warningsOpen ? "▾" : "▸"} {(result.warnings || []).length} warning{(result.warnings || []).length !== 1 ? "s" : ""}
              </button>
              {warningsOpen && (
                <div style={{ marginTop: 6, background: "#FFFBEB", borderRadius: 8, padding: "8px 12px", border: "1px solid #FDE68A" }}>
                  {(result.warnings || []).map((w, i) => (
                    <div key={i} style={{ fontSize: 11, color: "#92400E", marginBottom: 2 }}>
                      {w.date && <span style={{ fontWeight: 600 }}>{new Date(w.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} — </span>}
                      {w.msg}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Edit Shift Modal */}
          {overridePopup && (
            <div onClick={() => setOverridePopup(null)} style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 999 }}>
              <div onClick={e => e.stopPropagation()} style={{ position: "fixed", top: Math.min(overridePopup.y, window.innerHeight - 160), left: Math.min(overridePopup.x, window.innerWidth - 200), background: "#fff", borderRadius: 10, boxShadow: "0 8px 30px rgba(0,0,0,0.2)", padding: 6, zIndex: 1000, minWidth: 180 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#374151", padding: "6px 10px" }}>Make available for:</div>
                <div style={{ fontSize: 10, color: "#6B7280", padding: "0 10px 6px", borderBottom: "1px solid #E5E7EB", marginBottom: 4 }}>{employees.find(e => e.id === overridePopup.empId)?.name} on {new Date(overridePopup.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</div>
                {[["all", "\u2600\ufe0f Available All Day"], ["morning", "\ud83c\udf04 Available for Day Shift (before 6pm)"], ["evening", "\ud83c\udf19 Available for Night Shift (3pm+)"]].map(([val, label]) => (
                  <div key={val} onClick={() => { setAvailOverrides(prev => ({ ...prev, [overridePopup.date + ":" + overridePopup.empId]: val })); setOverridePopup(null); }}
                    style={{ padding: "8px 10px", fontSize: 12, cursor: "pointer", borderRadius: 6, fontWeight: 600, color: "#374151" }}
                    onMouseEnter={e => e.currentTarget.style.background = "#F0FDF4"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    {label}
                  </div>
                ))}
              </div>
            </div>
          )}
          {editingShift && !isSaved && (
            <EditShiftModal
              slot={editingShift.slot}
              date={editingShift.date}
              employees={employees}
              onSave={handleSaveShift}
              onClose={() => setEditingShift(null)}
            />
          )}

          {/* Add Shift Popup */}
          {addShiftPopup && !isSaved && draft && (() => {
            const { empId, empName, empRole, date } = addShiftPopup;
            const shiftTypes = [
              { type: "day", label: "Day Shift", start: "12:00", end: "18:00", hours: 6, color: "#22C55E" },
              { type: "mid", label: "Mid Shift", start: "15:00", end: "19:00", hours: 4, color: "#FB923C" },
              { type: "evening", label: "Evening Shift", start: "18:00", end: "22:30", hours: 4.5, color: "#A855F7" },
              { type: "mc_helper", label: "MC Helper", start: "18:00", end: "23:45", hours: 5.75, isMC: true, color: "#F59E0B" },
            ];
            const addShift = (st) => {
              const newSchedule = {};
              Object.keys(draft.schedule).forEach(dd => { newSchedule[dd] = [...draft.schedule[dd]]; });
              const maxOrder = newSchedule[date].reduce((m, s) => Math.max(m, s.order || 0), 0);
              newSchedule[date].push({
                type: st.type, label: st.label, start: st.start, end: st.end, hours: st.hours,
                slOnly: false, isMC: st.isMC || false, order: maxOrder + 1,
                empId, empName, empRole,
                _dateStr: date, _isWE: [0,6].includes(new Date(date + "T12:00:00").getDay()), _isFri: new Date(date + "T12:00:00").getDay() === 5,
              });
              const newSc = {}, newSh = {};
              employees.filter(e2 => e2.status === "active").forEach(e2 => { newSc[e2.id] = 0; newSh[e2.id] = 0; });
              Object.values(newSchedule).forEach(daySlots => { daySlots.forEach(slot => { if (slot.empId) { newSc[slot.empId] = (newSc[slot.empId] || 0) + 1; newSh[slot.empId] = (newSh[slot.empId] || 0) + slot.hours; } }); });
              setDraft({ ...draft, schedule: newSchedule, empShiftCount: newSc, empHours: newSh });
              setAddShiftPopup(null);
            };
            return (
              <div onClick={() => setAddShiftPopup(null)} style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.3)", zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 12, padding: 20, minWidth: 280, boxShadow: "0 8px 30px rgba(0,0,0,0.2)" }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#4A3F2F", marginBottom: 4 }}>Add Shift</div>
                  <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 14 }}>{empName} — {new Date(date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {shiftTypes.map(st => (
                      <button key={st.type} onClick={() => addShift(st)} style={{
                        padding: "10px 14px", borderRadius: 8, border: "1px solid #E5E7EB", background: "#fff", cursor: "pointer",
                        display: "flex", alignItems: "center", gap: 10, fontFamily: font, transition: "all 0.15s",
                      }} onMouseOver={e => e.currentTarget.style.background = "#F9FAFB"} onMouseOut={e => e.currentTarget.style.background = "#fff"}>
                        <div style={{ width: 10, height: 10, borderRadius: "50%", background: st.color, flexShrink: 0 }} />
                        <div style={{ textAlign: "left" }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>{st.label}</div>
                          <div style={{ fontSize: 10, color: "#9CA3AF" }}>{fmtTime(st.start)}–{fmtTime(st.end)} ({st.hours}h)</div>
                        </div>
                      </button>
                    ))}
                  </div>
                  <button onClick={() => setAddShiftPopup(null)} style={{ marginTop: 10, width: "100%", padding: "8px", borderRadius: 8, border: "1px solid #D1D5DB", background: "#F9FAFB", cursor: "pointer", fontSize: 11, fontWeight: 600, color: "#6B7280", fontFamily: font }}>Cancel</button>
                </div>
              </div>
            );
          })()}

          
        </>
      )}

      {/* MC ROTATION TRACKER */}
      {Object.keys(savedSchedules || {}).length > 0 && (
        <div style={{ background: "#fff", borderRadius: 12, padding: 22, boxShadow: "0 1px 3px rgba(0,0,0,0.06)", marginTop: 16 }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 800, color: "#4A3F2F", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 18 }}>{"\ud83e\uddf9"}</span> MC Rotation Tracker
          </h3>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#F9FAFB", borderBottom: "2px solid #E5E7EB" }}>
                  <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: 700, color: "#6B7280", fontSize: 10, textTransform: "uppercase" }}>Week</th>
                  <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: 700, color: "#7C3AED", fontSize: 10, textTransform: "uppercase" }}>Thu MC</th>
                  <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: 700, color: "#2563EB", fontSize: 10, textTransform: "uppercase" }}>Sun MC</th>
                  <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: 700, color: "#DC2626", fontSize: 10, textTransform: "uppercase" }}>SL Break</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(savedSchedules).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 8).map(([key, data]) => {
                  const schedule = data.schedule || data;
                  const dates = [];
                  try {
                    const d = new Date(key + "T12:00:00");
                    for (let i = 0; i < 7; i++) { const dd = new Date(d); dd.setDate(d.getDate() + i); dates.push(dd.toISOString().split("T")[0]); }
                  } catch { return null; }
                  const thuDate = dates[3], sunDate = dates[6];
                  const thuMC = { leader: null, slHelpers: [], helpers: [] };
                  const sunMC = { leader: null, slHelpers: [], helpers: [] };
                  const allMCNames = new Set();
                  
                  [thuDate, sunDate].forEach(dt => {
                    if (!schedule[dt] || !Array.isArray(schedule[dt])) return;
                    const isThu = dt === thuDate;
                    schedule[dt].forEach(slot => {
                      if (!slot.isMC) return;
                      // Skip slots explicitly removed (both empId and empName are null)
                      if (!slot.empId && !slot.empName) return;
                      const name = slot.empName || employees.find(e => e.id === slot.empId)?.name || "?";
                      if (!name || name === "?") return;
                      allMCNames.add(name);
                      const mc = isThu ? thuMC : sunMC;
                      if (slot.type === "mc_leader") mc.leader = name;
                      else if (slot.type === "mc_sl_helper") mc.slHelpers.push(name);
                      else mc.helpers.push(name);
                    });
                  });

                  // Find SLs who didn't MC this week
                  const slNames = employees.filter(e => e.role === "shift_lead" && e.status === "active").map(e => e.name);
                  const didntMC = slNames.filter(n => !allMCNames.has(n));

                  const fmtWeek = (() => {
                    try {
                      const d = new Date(key + "T12:00:00");
                      const end = new Date(d); end.setDate(d.getDate() + 6);
                      const f = dt => dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                      const now = new Date();
                      const weekEnd = new Date(end);
                      let badge = null;
                      if (now >= d && now <= weekEnd) badge = "this week";
                      else if (d > now && d < new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)) badge = "next week";
                      return { label: `${f(d)} – ${f(end)}`, badge };
                    } catch { return { label: key, badge: null }; }
                  })();

                  return (
                    <tr key={key} onClick={() => { handleWeekChange(key); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                      style={{ borderBottom: "1px solid #F3F4F6", cursor: "pointer", transition: "background 0.1s" }}
                      onMouseEnter={e => e.currentTarget.style.background = "#F9FAFB"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                      <td style={{ padding: "8px 12px", fontWeight: 600, color: "#374151", whiteSpace: "nowrap" }}>
                        {fmtWeek.label}
                        {fmtWeek.badge && <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 10, background: fmtWeek.badge === "this week" ? "#DCFCE7" : "#DBEAFE", color: fmtWeek.badge === "this week" ? "#16A34A" : "#2563EB", border: fmtWeek.badge === "this week" ? "1px solid #86EFAC" : "1px solid #93C5FD" }}>{fmtWeek.badge}</span>}
                      </td>
                      <td style={{ padding: "8px 12px" }}>
                        {(thuMC.leader || thuMC.slHelpers.length > 0 || thuMC.helpers.length > 0) ? (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                            {thuMC.leader && <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: "#EDE9FE", color: "#7C3AED", border: "1px solid #DDD6FE" }}>★ {thuMC.leader}</span>}
                            {thuMC.slHelpers.map((n, i) => <span key={i} style={{ fontSize: 11, fontWeight: 500, padding: "2px 8px", borderRadius: 6, background: "#FEF3C7", color: "#B45309", border: "1px solid #FDE68A" }}>{n}</span>)}
                            {thuMC.helpers.map((n, i) => <span key={i} style={{ fontSize: 11, fontWeight: 500, padding: "2px 8px", borderRadius: 6, background: "#F3F4F6", color: "#374151", border: "1px solid #E5E7EB" }}>{n}</span>)}
                          </div>
                        ) : <span style={{ color: "#D1D5DB" }}>—</span>}
                      </td>
                      <td style={{ padding: "8px 12px" }}>
                        {(sunMC.leader || sunMC.slHelpers.length > 0 || sunMC.helpers.length > 0) ? (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                            {sunMC.leader && <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: "#EDE9FE", color: "#7C3AED", border: "1px solid #DDD6FE" }}>★ {sunMC.leader}</span>}
                            {sunMC.slHelpers.map((n, i) => <span key={i} style={{ fontSize: 11, fontWeight: 500, padding: "2px 8px", borderRadius: 6, background: "#FEF3C7", color: "#B45309", border: "1px solid #FDE68A" }}>{n}</span>)}
                            {sunMC.helpers.map((n, i) => <span key={i} style={{ fontSize: 11, fontWeight: 500, padding: "2px 8px", borderRadius: 6, background: "#F3F4F6", color: "#374151", border: "1px solid #E5E7EB" }}>{n}</span>)}
                          </div>
                        ) : <span style={{ color: "#D1D5DB" }}>—</span>}
                      </td>
                      <td style={{ padding: "8px 12px" }}>
                        {didntMC.length > 0 ? (
                          didntMC.map((n, i) => (
                            <span key={n} style={{ fontWeight: 600, color: "#DC2626", background: "#FEF2F2", padding: "2px 8px", borderRadius: 6, fontSize: 11, marginRight: 4 }}>{n}</span>
                          ))
                        ) : <span style={{ color: "#D1D5DB", fontSize: 11 }}>—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Next Up for MC */}
          {(() => {
            // Build MC frequency from saved schedules (past + current week only)
            const regMCCount = {};
            const slMCCount = {};
            const regLastMC = {};
            const slLastMC = {};
            const regScheduledWeek = {}; // "this week" or "next week" if already assigned
            const slScheduledWeek = {};  // for SLs: tracks break week assignments
            const slLastBreak = {};      // last week an SL had a break
            const slBreakCount = {};     // how many breaks each SL has had
            const activeRegs = employees.filter(e => e.status === "active" && e.role === "regular" && !(e.tags || []).includes("mc_exempt")).map(e => e.name);
            const activeSLs = employees.filter(e => e.status === "active" && e.role === "shift_lead").map(e => e.name);
            activeRegs.forEach(n => { regMCCount[n] = 0; regLastMC[n] = null; });
            activeSLs.forEach(n => { slMCCount[n] = 0; slLastMC[n] = null; slLastBreak[n] = null; slBreakCount[n] = 0; });

            const now = new Date();
            // Find start of current week (Monday)
            const todayDay = now.getDay(); // 0=Sun,1=Mon...6=Sat
            const currentMon = new Date(now); currentMon.setDate(now.getDate() - (todayDay === 0 ? 6 : todayDay - 1)); currentMon.setHours(0,0,0,0);
            const nextMon = new Date(currentMon); nextMon.setDate(currentMon.getDate() + 7);
            const nextSun = new Date(nextMon); nextSun.setDate(nextMon.getDate() + 6); nextSun.setHours(23,59,59,999);
            Object.entries(savedSchedules).sort((a, b) => a[0].localeCompare(b[0])).forEach(([key, data]) => {
              const weekMon = new Date(key + "T00:00:00");
              const weekSun = new Date(weekMon); weekSun.setDate(weekMon.getDate() + 6); weekSun.setHours(23,59,59,999);

              const isThisWeek = weekMon >= currentMon && weekMon < nextMon;
              const isNextWeek = weekMon >= nextMon && weekMon <= nextSun;
              const isFuture = weekMon > nextSun;

              const schedule = data.schedule || data;
              Object.entries(schedule).forEach(([dateStr, slots]) => {
                if (!Array.isArray(slots)) return;
                slots.forEach(slot => {
                  if (!slot.isMC || !slot.empId) return;
                  const name = slot.empName || "?";

                  if (isFuture) return;
                  // Always record count + last date for sorting (so this week still counts as history)
                  if (activeRegs.includes(name)) { regMCCount[name]++; regLastMC[name] = key; }
                  if (activeSLs.includes(name)) { slMCCount[name]++; slLastMC[name] = key; }
                  // Additionally mark as scheduled this/next week for the ✓ badge
                  if (isThisWeek || isNextWeek) {
                    const label = isThisWeek ? "this week" : "next week";
                    if (activeRegs.includes(name)) regScheduledWeek[name] = label;
                  }
                });
              });

              // Track SL break weeks: SLs who did NOT MC this week had a break
              if (!isFuture) {
                const mcNames = new Set();
                Object.values(schedule).forEach(slots => {
                  if (!Array.isArray(slots)) return;
                  slots.forEach(slot => { if (slot.isMC && slot.empName) mcNames.add(slot.empName); });
                });
                activeSLs.forEach(n => {
                  if (!mcNames.has(n)) {
                    // This SL had a break this week
                    if (isThisWeek) slScheduledWeek[n] = "this week";
                    else if (isNextWeek) slScheduledWeek[n] = "next week";
                    else { slBreakCount[n]++; slLastBreak[n] = key; }
                  }
                });
              }
            });

            // Sort: scheduled this/next week go to bottom, then sort by oldest last date first (most overdue)
            // Tiebreaker for same date: use assistantPool order (NOT count, which is unreliable for promoted trainees)
            const assistantPoolOrder = (rules?.mcRotation?.assistantPool || []);
            const poolRank = (name) => { const i = assistantPoolOrder.indexOf(name); return i === -1 ? 999 : i; };
            const sortFn = (countMap, lastMap, scheduledMap) => (a, b) => {
              const aScheduled = !!scheduledMap[a];
              const bScheduled = !!scheduledMap[b];
              if (aScheduled && !bScheduled) return 1;
              if (!aScheduled && bScheduled) return -1;
              if (aScheduled && bScheduled) {
                // Both scheduled: this week before next week
                const order = { "this week": 0, "next week": 1 };
                return (order[scheduledMap[a]] || 0) - (order[scheduledMap[b]] || 0);
              }
              // Neither scheduled: oldest last date = most overdue = sort first
              if (!lastMap[a] && !lastMap[b]) return poolRank(a) - poolRank(b); // both never → pool order
              if (!lastMap[a]) return -1; // never done MC → most overdue, goes first
              if (!lastMap[b]) return 1;
              if (lastMap[a] !== lastMap[b]) return lastMap[a].localeCompare(lastMap[b]); // older date first
              return poolRank(a) - poolRank(b); // same date → pool order as tiebreaker
            };

            const regSorted = [...activeRegs].sort(sortFn(regMCCount, regLastMC, regScheduledWeek));
            // SL sort: fewest breaks first, then oldest last break — those at bottom already have break this/next week
            const slSorted = [...activeSLs].sort((a, b) => {
              const aOff = !!slScheduledWeek[a];
              const bOff = !!slScheduledWeek[b];
              if (aOff && !bOff) return 1;
              if (!aOff && bOff) return -1;
              if (aOff && bOff) {
                const order = { "this week": 0, "next week": 1 };
                return (order[slScheduledWeek[a]] || 0) - (order[slScheduledWeek[b]] || 0);
              }
              // Neither has break scheduled — sort by fewest breaks, then oldest last break
              if (slBreakCount[a] !== slBreakCount[b]) return slBreakCount[a] - slBreakCount[b];
              if (!slLastBreak[a] && slLastBreak[b]) return -1;
              if (slLastBreak[a] && !slLastBreak[b]) return 1;
              if (slLastBreak[a] && slLastBreak[b]) return slLastBreak[a].localeCompare(slLastBreak[b]);
              return 0;
            });

            const fmtLast = (key) => {
              if (!key) return "never";
              try {
                const weekMon = new Date(key + "T00:00:00");
                if (weekMon >= currentMon && weekMon < nextMon) return "this week";
                if (weekMon >= nextMon && weekMon <= nextSun) return "next week";
                // Past weeks
                const weeksAgo = Math.round((currentMon - weekMon) / (7 * 24 * 60 * 60 * 1000));
                if (weeksAgo === 1) return "last week";
                return `${weeksAgo} weeks ago`;
              } catch { return key; }
            };

            return (
              <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div style={{ padding: 14, background: "#FFF7ED", borderRadius: 10, border: "1px solid #FED7AA" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#C2410C", marginBottom: 4 }}>Next Up — Regular MC Helpers</div>
                  <div style={{ fontSize: 10, color: "#9CA3AF", marginBottom: 10 }}>Top = most overdue, should clean next</div>
                  {regSorted.map((name, i) => (
                    <div key={name} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: i < regSorted.length - 1 ? "1px solid #FEF3C7" : "none", opacity: regScheduledWeek[name] ? 0.5 : 1 }}>
                      <span style={{ fontSize: 10, fontWeight: 800, color: i === 0 && !regScheduledWeek[name] ? "#16A34A" : "#D1D5DB", width: 18 }}>#{i + 1}</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "#374151", flex: 1 }}>{name}</span>
                      <span style={{ fontSize: 10, color: regScheduledWeek[name] ? "#7C3AED" : regLastMC[name] ? "#9CA3AF" : "#DC2626", fontStyle: regLastMC[name] || regScheduledWeek[name] ? "normal" : "italic", fontWeight: regScheduledWeek[name] ? 700 : 400 }}>
                        {regScheduledWeek[name] ? `✓ ${regScheduledWeek[name]}` : `last: ${fmtLast(regLastMC[name])}`}
                      </span>
                    </div>
                  ))}
                </div>
                <div style={{ padding: 14, background: "#FEF3C7", borderRadius: 10, border: "1px solid #FDE68A" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#92400E", marginBottom: 4 }}>Next Up — SL Break Week</div>
                  <div style={{ fontSize: 10, color: "#9CA3AF", marginBottom: 10 }}>Top = hasn't had a break recently, next in line</div>
                  {slSorted.map((name, i) => (
                    <div key={name} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: i < slSorted.length - 1 ? "1px solid #FDE68A" : "none", opacity: slScheduledWeek[name] ? 0.5 : 1 }}>
                      <span style={{ fontSize: 10, fontWeight: 800, color: i === 0 && !slScheduledWeek[name] ? "#16A34A" : "#D1D5DB", width: 18 }}>#{i + 1}</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "#374151", flex: 1 }}>{name}</span>
                      <span style={{ fontSize: 10, color: slScheduledWeek[name] ? "#7C3AED" : slLastBreak[name] ? "#9CA3AF" : "#DC2626", fontStyle: slLastBreak[name] || slScheduledWeek[name] ? "normal" : "italic", fontWeight: slScheduledWeek[name] ? 700 : 400 }}>
                        {slScheduledWeek[name] ? `✓ off ${slScheduledWeek[name]}` : slLastBreak[name] ? `last off: ${fmtLast(slLastBreak[name])}` : "never had break"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
