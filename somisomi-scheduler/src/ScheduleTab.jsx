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
function genSchedule(weekDates, employees, rules, schoolDates, weeklyTimeOffs, dayStaffingOverrides, availOverrides, weeklyMaxOverrides) {
  // ─────────────────────────────────────────────────────────────────
  // NEW ENGINE: Balance-first, priority-driven assignment
  //
  // PHILOSOPHY:
  //   Ignore min/max entirely during assignment. Instead:
  //   1. Figure out how many shifts each person CAN work this week
  //   2. Distribute those slots evenly (balance budget)
  //   3. Assign slots in strict priority order, always picking the
  //      person with the most remaining budget who fits the slot rules
  //   4. After all slots assigned, surface "extra" shifts so manager
  //      can decide who gets them
  //
  // SLOT PRIORITY ORDER (hardest/most constrained first):
  //   P0: Thu MC night (Crystal+Zoe fixed)
  //   P1: Sun MC night (2 SLs + 2 reg helpers)
  //   P2: Fri evening SL + 2nd SL backup
  //   P3: Sat evening SL + 2nd SL backup
  //   P4: Sun evening SL (already covered by MC but for non-MC Sundays)
  //   P5: All remaining Day Lead (SL) slots across the week
  //   P6: Sat/Sun day slots
  //   P7: Fri day slots
  //   P8: Weekday day slots (Mon-Thu)
  //   P9: Fri/Sat/Sun evening regular slots
  //   P10: Wed/Thu evening regular slots
  //   P11: Mon/Tue evening (trainee priority)
  // ─────────────────────────────────────────────────────────────────
  const schedule = {};
  const active = employees.filter(e => e.status === "active");
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
    e._effMaxHours = e.maxHours;
    e._effMinHours = 0;
    // Budget: how many shifts can we give them (availability capped at their max)
    e._budget = Math.min(availCount, e._effMaxShifts);
  });

  // GRAE RULE: max 1 weekend shift, prefer to use her other shift on a weekday
  // (unless weekday is unavailable, then allow 2 weekends)
  const graeEmp = active.find(e => e.name === "Grae McKown");
  if (graeEmp) {
    graeEmp._maxWeekendShifts = 1; // soft cap — enforced during assignment
  }

  // ── STEP 1b: Compute target shifts for balancing ──────────────────
  // After budgets are set, figure out the "target" shifts per person so the
  // balance pass knows what "equal" looks like. Target = budget (what they can do).
  // The balance pass will try to get everyone as close to their target as possible
  // and prevent anyone from being more than 1 shift above the group average.
  const computeGroupAvg = (group) => {
    const budgets = group.map(e => e._budget);
    return budgets.length > 0 ? budgets.reduce((a, b) => a + b, 0) / budgets.length : 0;
  };
  const con = id => { const c = rules.constraints.find(x => x.id === id); return c ? c.enabled : true; };
  const T = rules.shiftTimes;
  const nightMap = {};   // dateStr -> Set of empIds who worked nights
  const mcCount = {};    // empId -> number of MC nights this week
  const weCount = {};    // empId -> weekend night shift count
  active.forEach(e => { mcCount[e.id] = 0; weCount[e.id] = 0; });

  // ── HELPERS ──────────────────────────────────────────────────────
  const slCheck = (slot, emp, fallback = false) => {
    if (!slot.slOnly) return true;
    if (emp.role === "shift_lead") return true;
    if (slot.type === "day_lead" && emp.role !== "trainee" && fallback) return true;
    return false;
  };

  const weekendNightOK = (emp, dateStr, slotStart) => {
    if (tm(slotStart) < 1020) return true;
    const dow2 = new Date(dateStr + "T12:00:00").getDay();
    if (con("no_fri_sat_night")) {
      if (dow2 === 5 && nightMap[weekDates[5]]?.has(emp.id)) return false;
      if (dow2 === 6 && nightMap[weekDates[4]]?.has(emp.id)) return false;
    }
    if (con("no_sat_sun_night")) {
      if (dow2 === 6 && nightMap[weekDates[6]]?.has(emp.id)) return false;
      if (dow2 === 0 && nightMap[weekDates[5]]?.has(emp.id)) return false;
    }
    return true;
  };

  const consecOK = (emp, dayIndex2) => {
    if (!con("max_consecutive_3")) return true;
    let consec = 1;
    for (let c = 1; c <= 3; c++) { if (dayIndex2 + c > 6) break; if (sd[emp.id].has(weekDates[dayIndex2 + c])) consec++; else break; }
    for (let c = 1; c <= 3; c++) { if (dayIndex2 - c < 0) break; if (sd[emp.id].has(weekDates[dayIndex2 - c])) consec++; else break; }
    return consec <= 3;
  };

  const friSatSunOK = (emp, dateStr) => {
    if (!con("no_fri_sat_sun")) return true;
    const overrideKey = dateStr + ":" + emp.id;
    if (availOverrides && availOverrides[overrideKey]) return true;
    const d2 = new Date(dateStr + "T12:00:00").getDay();
    const hasFri = sd[emp.id].has(weekDates[4]);
    const hasSat = sd[emp.id].has(weekDates[5]);
    const hasSun = sd[emp.id].has(weekDates[6]);
    const wouldHave = (d2 === 5 ? 1 : (hasFri ? 1 : 0)) + (d2 === 6 ? 1 : (hasSat ? 1 : 0)) + (d2 === 0 ? 1 : (hasSun ? 1 : 0));
    return wouldHave < 3;
  };

  const traineeOK = (emp, dateStr) => {
    if (emp.role !== "trainee") return true;
    if (!con("no_two_trainees")) return true;
    return !schedule[dateStr].some(a => a.empId && active.find(e => e.id === a.empId)?.role === "trainee");
  };

  const canSwirl = (emp) => {
    const swirlList = rules.swirl?.swirlers || [];
    if (swirlList.length > 0) return swirlList.includes(emp.name);
    return (emp.tags || []).includes("can_swirl");
  };

  // Register an assignment into the schedule
  const assign = (dateStr, slotIndex, emp, slot) => {
    const isWE = slot._isWE;
    const isFri = slot._isFri;
    schedule[dateStr][slotIndex] = { ...slot, empId: emp.id, empName: emp.name, empRole: emp.role };
    sc[emp.id]++; sh[emp.id] += slot.hours; sd[emp.id].add(dateStr);
    if (slot.isMC) mcCount[emp.id]++;
    if (isWE) weCount[emp.id]++;
    if (isFri && tm(slot.start) >= 1020) weCount[emp.id]++;
    if (tm(slot.start) >= 1020 || slot.isMC) {
      if (!nightMap[dateStr]) nightMap[dateStr] = new Set();
      nightMap[dateStr].add(emp.id);
    }
  };

  // ── STEP 2: Build all slots ───────────────────────────────────────
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
    if (staffing.mid > 0) { for (let i = 0; i < staffing.mid; i++) { slots.push({ type: "mid", label: "Mid Shift", start: midS, end: midE, hours: hrs(midS, midE), slOnly: false, order: 10 + i }); } }
    if (isMC) {
      // Thu MC: 1 SL leader + 1 SL helper + 1 reg helper (3 total)
      // Sun MC: 1 SL leader + 1 SL helper + 2 reg helpers (4 total)
      slots.push({ type: "mc_leader", label: "MC Leader (Eve SL)", start: mcS, end: mcE, hours: hrs(mcS, mcE), slOnly: true, isMC: true, order: 20 });
      slots.push({ type: "mc_sl_helper", label: "MC Helper (SL)", start: mcS, end: mcE, hours: hrs(mcS, mcE), slOnly: true, isMC: true, order: 21 });
      const regHelpers = isSun ? 2 : 1;
      for (let i = 0; i < regHelpers; i++) { slots.push({ type: "mc_helper", label: "MC Helper", start: mcS, end: mcE, hours: hrs(mcS, mcE), slOnly: false, isMC: true, order: 22 + i }); }
    } else {
      for (let i = 0; i < (staffing.evening || 3); i++) {
        slots.push({ type: i === 0 ? "evening_sl" : "evening", label: i === 0 ? "Evening SL" : "Evening", start: eveS, end: eveE, hours: hrs(eveS, eveE), slOnly: i === 0, order: 20 + i });
      }
    }
    slots.sort((a, b) => a.order - b.order);
    slots.forEach(s => { s._dateStr = dateStr; s._dayIndex = dayIndex; s._isWE = isWE; s._isFri = isFri; s._isSat = isSat; s._isSun = isSun; s._isMC = isMC; s._dayKey = dayKey; s._dow = dow; });
    schedule[dateStr] = slots.map(s => ({ ...s, empId: null, empName: "⚠ UNFILLED", empRole: null }));
    allSlots.push(...slots.map(s => ({ ...s })));
  });

  // ── STEP 3: Balance budget across all employees ───────────────────
  // Count total slots needing to be filled, by type
  // Each employee gets a "remaining budget" tracker — this is what drives pick order
  // (person with most remaining budget = most underutilized = pick them first)

  // ── STEP 4: Priority-ordered slot assignment ──────────────────────
  // Slot priority groups — assigned in this order:
  //   G0: Thu MC (fixed: Crystal leader + Zoe SL helper + 1 reg)
  //   G1: Sun MC (2 SLs + 2 regs)
  //   G2: Fri/Sat/Sun Evening SL slots (need 2 SLs each night)
  //   G3: All other Day Lead (SL) slots Mon-Thu
  //   G4: Sat/Sun day + mid
  //   G5: Fri day
  //   G6: Mon-Thu day (2nd day slots) — prefer regulars
  //   G7: Fri/Sat/Sun evening regular slots — 2nd SL preferred, then regulars
  //   G8: Wed/Thu evening regular slots — regulars only
  //   G9: Mon/Tue evening — trainee priority, then regulars

  const getSlotGroup = (slot) => {
    const dow = slot._dow;
    const isMC = slot.isMC;
    const isEve = tm(slot.start) >= 1020;
    const isWE = slot._isWE;
    const isFri = slot._isFri;
    const isSat = slot._isSat;
    const isSun = slot._isSun;
    const isThu = dow === 4;

    if (isMC && isThu) return 0;   // Thu MC
    if (isMC && isSun) return 1;   // Sun MC
    if (slot.slOnly && isEve && (isFri || isSat || isSun)) return 2; // Fri/Sat/Sun evening SL
    if (slot.slOnly) return 3;     // All other SL slots (day leads)
    if ((isWE) && !isEve) return 4; // Sat/Sun day
    if (isFri && !isEve) return 5;  // Fri day
    if (!isWE && !isFri && !isEve) return 6; // Mon-Thu day
    if ((isFri || isSat || isSun) && isEve) return 7; // Fri/Sat/Sun evening regular
    if ((dow === 3 || dow === 4) && isEve) return 8;  // Wed/Thu evening
    return 9; // Mon/Tue evening — trainee slots
  };

  // Sort all slots by group
  allSlots.sort((a, b) => {
    const ga = getSlotGroup(a), gb = getSlotGroup(b);
    if (ga !== gb) return ga - gb;
    return a.order - b.order;
  });

  // Core candidate filter — checks all hard constraints
  const getCandidates = (slot, extraFilter) => {
    const dateStr = slot._dateStr;
    const dayIndex = slot._dayIndex;
    const isWE = slot._isWE;
    const isFri = slot._isFri;
    const dow = slot._dow;

    let cands = active.filter(emp => {
      if (!isAvail(emp, dateStr, slot.start, slot.end, weeklyTimeOffs, availOverrides)) return false;
      if (!slCheck(slot, emp)) return false;
      if (con("no_doubles") && sd[emp.id].has(dateStr)) return false;
      if (sc[emp.id] >= emp._effMaxShifts) return false;
      if (sh[emp.id] + slot.hours > emp._effMaxHours) return false;
      if (slot.isMC && emp.role === "trainee") return false;
      if (con("no_mc_twice") && slot.isMC && mcCount[emp.id] >= 1) return false;
      if (con("no_trainees_weekday_day") && emp.role === "trainee" && !isWE && !isFri && (slot.type === "day_lead" || slot.type === "day")) return false;
      if (!traineeOK(emp, dateStr)) return false;
      if (!friSatSunOK(emp, dateStr)) return false;
      if (!weekendNightOK(emp, dateStr, slot.start)) return false;
      if (!consecOK(emp, dayIndex)) return false;
      if (schedule[dateStr].some(a => a.empId === emp.id)) return false;
      // GRAE RULE: max 1 weekend shift; use other shift on a weekday if possible
      if (emp._maxWeekendShifts !== undefined) {
        const isWeekendSlot = dow === 0 || dow === 6 || (dow === 5 && tm(slot.start) >= 1020);
        if (isWeekendSlot) {
          const weekendShiftsSoFar = [4,5,6].reduce((c, wi) => c + (sd[emp.id].has(weekDates[wi]) ? 1 : 0), 0);
          if (weekendShiftsSoFar >= emp._maxWeekendShifts) {
            // Already hit weekend cap — check if they have weekday availability left
            const hasWeekdayAvail = [0,1,2,3].some(wi =>
              !sd[emp.id].has(weekDates[wi]) &&
              isAvail(emp, weekDates[wi], "18:00", "22:30", weeklyTimeOffs, availOverrides)
            );
            if (hasWeekdayAvail) return false; // block 2nd weekend, save for weekday
          }
        }
      }
      return true;
    });

    if (extraFilter) {
      const filtered = extraFilter(cands);
      if (filtered.length > 0) cands = filtered;
    }
    return cands;
  };

  // Pick the best candidate from a list — balance-first:
  // person with most remaining budget (budget - shifts assigned so far) goes first
  // ties broken by: fewer weekend shifts (for weekend slots), then random
  const pickBest = (cands, slot) => {
    if (cands.length === 0) return null;
    const isWS = slot._isWE || (slot._isFri && tm(slot.start) >= 1020);
    cands.sort((a, b) => {
      // Explicit override (manager said make them available)
      const aOv = availOverrides?.[slot._dateStr + ":" + a.id] ? 1 : 0;
      const bOv = availOverrides?.[slot._dateStr + ":" + b.id] ? 1 : 0;
      if (bOv !== aOv) return bOv - aOv;
      // Guaranteed days
      const aG = (a.guaranteedDays || []).includes(slot._dayKey) ? 1 : 0;
      const bG = (b.guaranteedDays || []).includes(slot._dayKey) ? 1 : 0;
      if (bG !== aG) return bG - aG;
      // Balance: most remaining budget first (fewest shifts relative to their available days)
      const aRemain = a._budget - sc[a.id];
      const bRemain = b._budget - sc[b.id];
      if (bRemain !== aRemain) return bRemain - aRemain;
      // For weekend slots: prefer people with fewer weekend shifts already
      if (isWS) {
        const aWEc = [4,5,6].reduce((c, wi) => c + (sd[a.id].has(weekDates[wi]) ? 1 : 0), 0);
        const bWEc = [4,5,6].reduce((c, wi) => c + (sd[b.id].has(weekDates[wi]) ? 1 : 0), 0);
        if (aWEc !== bWEc) return aWEc - bWEc;
      }
      return Math.random() - 0.5;
    });
    return cands[0];
  };

  // Assign a slot by finding its index in the schedule array and filling it
  const assignSlotInSchedule = (slot, emp) => {
    const dateStr = slot._dateStr;
    const idx = schedule[dateStr].findIndex(s =>
      s.type === slot.type && s.start === slot.start && s.end === slot.end && s.empId === null &&
      s.order === slot.order
    );
    if (idx >= 0) assign(dateStr, idx, emp, slot);
  };

  // Swirl check helper
  const needsSwirler = (slot) => {
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

  // ── ASSIGN ALL SLOTS in priority order ───────────────────────────
  for (const slot of allSlots) {
    const dateStr = slot._dateStr;
    const dow = slot._dow;
    const group = getSlotGroup(slot);

    // Check if this slot already got filled (shouldn't happen but safety check)
    const slotInSched = schedule[dateStr].find(s =>
      s.type === slot.type && s.start === slot.start && s.order === slot.order
    );
    if (slotInSched?.empId) continue;

    let cands = [];

    // ── GROUP 0: Thu MC ── Crystal always leads, Zoe always SL helper
    if (group === 0) {
      if (slot.type === "mc_leader") {
        const crystal = active.find(e => e.name === "Crystal Guel");
        if (crystal && getCandidates(slot).find(e => e.id === crystal.id)) {
          assignSlotInSchedule(slot, crystal); continue;
        }
      }
      if (slot.type === "mc_sl_helper") {
        const zoe = active.find(e => e.name === "Zoe Rains");
        if (zoe && getCandidates(slot).find(e => e.id === zoe.id)) {
          assignSlotInSchedule(slot, zoe); continue;
        }
        // Fallback: any available SL
        cands = getCandidates(slot, c => c.filter(e => e.role === "shift_lead"));
        const pick = pickBest(cands, slot);
        if (pick) assignSlotInSchedule(slot, pick);
        continue;
      }
      if (slot.type === "mc_helper") {
        // Thu MC reg helper — from assistant pool, no SLs
        cands = getCandidates(slot, c => {
          const pool = rules.mcRotation?.assistantPool || [];
          const fromPool = c.filter(e => pool.includes(e.name) && e.role !== "shift_lead");
          return fromPool.length > 0 ? fromPool : c.filter(e => e.role !== "shift_lead");
        });
        const pick = pickBest(cands, slot);
        if (pick) assignSlotInSchedule(slot, pick);
        continue;
      }
    }

    // ── GROUP 1: Sun MC ── 2 SLs + 2 reg helpers
    if (group === 1) {
      if (slot.type === "mc_leader" || slot.type === "mc_sl_helper") {
        cands = getCandidates(slot, c => {
          const pool = rules.mcRotation?.shiftLeadPool || [];
          const fromPool = c.filter(e => pool.includes(e.name) && e.role === "shift_lead");
          return fromPool.length > 0 ? fromPool : c.filter(e => e.role === "shift_lead");
        });
        const pick = pickBest(cands, slot);
        if (pick) assignSlotInSchedule(slot, pick);
        continue;
      }
      if (slot.type === "mc_helper") {
        cands = getCandidates(slot, c => {
          const pool = rules.mcRotation?.assistantPool || [];
          const fromPool = c.filter(e => pool.includes(e.name) && e.role !== "shift_lead");
          return fromPool.length > 0 ? fromPool : c.filter(e => e.role !== "shift_lead");
        });
        const pick = pickBest(cands, slot);
        if (pick) assignSlotInSchedule(slot, pick);
        continue;
      }
    }

    // ── GROUP 2: Fri/Sat/Sun Evening SL slot (evening_sl) ──
    // Also: try to get a 2nd SL into a regular evening slot on these nights
    if (group === 2) {
      cands = getCandidates(slot, c => c.filter(e => e.role === "shift_lead"));
      const pick = pickBest(cands, slot);
      if (pick) assignSlotInSchedule(slot, pick);
      continue;
    }

    // ── GROUP 3: All other Day Lead (SL) slots ──
    if (group === 3) {
      cands = getCandidates(slot, c => c.filter(e => e.role === "shift_lead"));
      const pick = pickBest(cands, slot);
      if (pick) assignSlotInSchedule(slot, pick);
      continue;
    }

    // ── GROUPS 4-9: Regular (non-SL) slots ──
    cands = getCandidates(slot);

    // No trainees on weekend evening/night
    if ((slot._isWE || slot._isFri) && slot.type !== "mid") {
      const noTrainees = cands.filter(e => e.role !== "trainee");
      if (noTrainees.length > 0) cands = noTrainees;
    }

    // GROUP 7: Fri/Sat/Sun evening regular — try to get a 2nd SL on these nights
    if (group === 7) {
      const slsOnEvening = schedule[dateStr].filter(a =>
        a.empId && (a.type === "evening_sl" || a.type === "evening") &&
        active.find(e => e.id === a.empId)?.role === "shift_lead"
      ).length;
      if (slsOnEvening < 2) {
        // Push for 2nd SL on Fri/Sat/Sun evenings
        const slCands = cands.filter(e => e.role === "shift_lead");
        if (slCands.length > 0) cands = slCands;
      } else {
        // Already have 2 SLs — use regulars now, not more SLs
        const nonSL = cands.filter(e => e.role !== "shift_lead");
        if (nonSL.length > 0) cands = nonSL;
      }
    }

    // GROUP 8: Wed/Thu evening — regulars only (no SLs, no trainees)
    if (group === 8) {
      const nonSL = cands.filter(e => e.role !== "shift_lead" && e.role !== "trainee");
      if (nonSL.length > 0) cands = nonSL;
    }

    // GROUP 9: Mon/Tue evening — trainee priority, then regulars, NO SLs
    if (group === 9) {
      const nonSL = cands.filter(e => e.role !== "shift_lead");
      if (nonSL.length > 0) cands = nonSL;
      // Trainees first on Mon/Tue
      if (dow <= 2) {
        const trainees = cands.filter(e => e.role === "trainee");
        const regs = cands.filter(e => e.role === "regular");
        if (trainees.length > 0) cands = [...trainees, ...regs];
      }
    }

    // GROUP 6: Weekday day (2nd day) — prefer 2nd day priority list, no SLs
    if (group === 6 && slot.type === "day") {
      const priority = rules.secondDayPriority || [];
      const fromPriority = cands.filter(e => priority.includes(e.name));
      if (fromPriority.length > 0) cands = fromPriority;
      else {
        const nonSL = cands.filter(e => e.role !== "shift_lead");
        if (nonSL.length > 0) cands = nonSL;
      }
    }

    // Swirl: if weekend and need more swirlers, prefer them
    if (needsSwirler(slot)) {
      const swirlers = cands.filter(e => canSwirl(e));
      if (swirlers.length > 0) cands = swirlers;
    }

    // Good weekend people preference on weekends
    if ((slot._isWE || slot._isFri) && !slot.slOnly && !slot.isMC) {
      const goodWE = rules.goodWeekendPeople || [];
      const good = cands.filter(e => goodWE.includes(e.name));
      if (good.length > 0) cands = good;
    }

    const pick = pickBest(cands, slot);
    if (pick) assignSlotInSchedule(slot, pick);
  }

  // ── STEP 5: Gap fill pass ─────────────────────────────────────────
  // For any slot still unfilled, try again with relaxed constraints
  weekDates.forEach(dateStr => {
    schedule[dateStr].forEach((slot, idx) => {
      if (slot.empId !== null) return;
      let cands = active.filter(emp => {
        if (!isAvail(emp, dateStr, slot.start, slot.end, weeklyTimeOffs, availOverrides)) return false;
        if (!weekendNightOK(emp, dateStr, slot.start)) return false;
        if (!friSatSunOK(emp, dateStr)) return false;
        if (!slCheck(slot, emp, true)) return false; // true = fallback allowed
        if (sc[emp.id] >= emp._effMaxShifts || sh[emp.id] + slot.hours > emp._effMaxHours) return false;
        if (slot.isMC && emp.role === "trainee") return false;
        if (!traineeOK(emp, dateStr)) return false;
        if (con("no_mc_twice") && slot.isMC && mcCount[emp.id] >= 1) return false;
        if (schedule[dateStr].some(a => a.empId === emp.id)) return false;
        return true;
      });
      // Sort by balance (most remaining budget first)
      cands.sort((a, b) => {
        const aR = a._budget - sc[a.id], bR = b._budget - sc[b.id];
        return bR !== aR ? bR - aR : Math.random() - 0.5;
      });
      if (cands.length > 0) assign(dateStr, idx, cands[0], slot);
    });
  });

  // ── STEP 6: Iterative balance pass ───────────────────────────────
  // Repeatedly find the most over-assigned person and the most under-assigned
  // person, and try to swap one of their slots. Keep going until nobody is
  // more than 1 shift apart from the group average. This guarantees no one
  // has 1 shift while someone else has 4 if the slots are swappable.
  //
  // Skip from balancing: Grae (special rules), trainees (trainee-specific slots)
  const isBalanceExempt = (emp) => emp.name === "Grae McKown" || emp.role === "trainee";

  let balanceChanged = true;
  let balanceSafety = 30;
  while (balanceChanged && balanceSafety-- > 0) {
    balanceChanged = false;

    // Find everyone's current shift count
    const balancePool = active.filter(e => !isBalanceExempt(e));
    if (balancePool.length < 2) break;

    // Sort: most shifts first
    balancePool.sort((a, b) => sc[b.id] - sc[a.id]);
    const maxShifts = sc[balancePool[0].id];
    const minShifts = sc[balancePool[balancePool.length - 1].id];

    // If spread is <= 1, we're balanced
    if (maxShifts - minShifts <= 1) break;

    // Find the over-assigned and under-assigned people
    const overPeople = balancePool.filter(e => sc[e.id] === maxShifts);
    const underPeople = balancePool.filter(e => sc[e.id] === minShifts);

    let swapped = false;
    outer: for (const under of underPeople) {
      for (const over of overPeople) {
        if (under.id === over.id) continue;
        // Try to find a slot that 'over' has that 'under' could take
        for (const dateStr of weekDates) {
          if (sd[under.id].has(dateStr)) continue; // under already works this day
          if (!sd[over.id].has(dateStr)) continue;  // over doesn't work this day
          if (!friSatSunOK(under, dateStr)) continue;
          if (!traineeOK(under, dateStr)) continue;

          for (let si = 0; si < schedule[dateStr].length; si++) {
            const slot = schedule[dateStr][si];
            if (slot.empId !== over.id) continue;
            if (slot.slOnly && under.role !== "shift_lead") continue;
            if (slot.isMC && under.role === "trainee") continue;
            if (!isAvail(under, dateStr, slot.start, slot.end, weeklyTimeOffs, availOverrides)) continue;
            if (con("no_mc_twice") && slot.isMC && mcCount[under.id] >= 1) continue;
            if (!weekendNightOK(under, dateStr, slot.start)) continue;
            if (sh[under.id] + slot.hours > under._effMaxHours) continue;
            // Don't violate Grae's weekend rule on the receiving end
            if (under._maxWeekendShifts !== undefined) {
              const dow3 = new Date(dateStr + "T12:00:00").getDay();
              const isWknd = dow3 === 0 || dow3 === 6 || (dow3 === 5 && tm(slot.start) >= 1020);
              if (isWknd) {
                const wkndCount = [4,5,6].reduce((c, wi) => c + (sd[under.id].has(weekDates[wi]) ? 1 : 0), 0);
                if (wkndCount >= under._maxWeekendShifts) continue;
              }
            }
            // Don't take a slot from 'over' if it would orphan a required SL day
            // (i.e. over is the only SL on that day and slot is evening_sl/day_lead)
            if (over.role === "shift_lead" && (slot.type === "evening_sl" || slot.type === "day_lead")) continue;

            // Do the swap
            sc[over.id]--; sh[over.id] -= slot.hours;
            const overOther = schedule[dateStr].filter((s, i) => i !== si && s.empId === over.id);
            if (overOther.length === 0) sd[over.id].delete(dateStr);
            // Remove old MC/night tracking for over
            if (slot.isMC) mcCount[over.id] = Math.max(0, mcCount[over.id] - 1);

            assign(dateStr, si, under, { ...slot, _isWE: slot._isWE, _isFri: slot._isFri });
            swapped = true;
            balanceChanged = true;
            break outer;
          }
        }
      }
    }
    if (!swapped) break; // no viable swaps found, stop
  }

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

  const shortSLs = active.filter(e => e.role === "shift_lead" && sc[e.id] < e.minShifts).map(e => e.id);

  return { schedule, empShiftCount: sc, empHours: sh, warnings: warnings2, shortSLs, extraUnfilled };
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
  const [availOverrides, setAvailOverrides] = useState({}); // { "2026-03-19:sl-5": "all"|"morning"|"evening" }
  const [dragSlot, setDragSlot] = useState(null);
  const [overridePopup, setOverridePopup] = useState(null); // { date, empId, x, y }
  const [weeklyMaxOverrides, setWeeklyMaxOverrides] = useState({}); // { "sl-3": { min: 3, max: 3 } }
  const [step, setStep] = useState("timeoff");
  const [viewMode, setViewMode] = useState("shift");
  const [selected, setSelected] = useState(null);
  const [editingShift, setEditingShift] = useState(null);
  const [dayStaffing, setDayStaffing] = useState(null);

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
  const result = saved || draft;
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

  const handleGenerate = () => {
    setGenerating(true); setStep("result");
    const ds = dayStaffing || initDayStaffing(weekDates);
    setTimeout(() => {
      const allTOs = [...(timeOffs || []), ...weeklyTOs];
      const r = genSchedule(weekDates, employees, rules, schoolDates, allTOs, ds, availOverrides, weeklyMaxOverrides);
      setDraft(r); setGenerating(false);
    }, 200);
  };

  const handleAccept = () => {
    if (draft) {
      setSavedSchedules(prev => ({
        ...prev,
        [weekKey]: { ...draft, notes, weeklyTOs, savedAt: new Date().toISOString() }
      }));
      setDraft(null); setNotes([]);
    }
  };
  const handleReject = () => {
    setGenerating(true); setStep("result");
    const ds = dayStaffing || initDayStaffing(weekDates);
    setTimeout(() => {
      const allTOs = [...(timeOffs || []), ...weeklyTOs];
      const r = genSchedule(weekDates, employees, rules, schoolDates, allTOs, ds, availOverrides, weeklyMaxOverrides);
      setDraft(r); setGenerating(false);
    }, 200);
  };
  const handleUnsave = () => { setSavedSchedules(prev => { const n = { ...prev }; delete n[weekKey]; return n; }); setStep("timeoff"); };
  const removeTo = (idx) => setWeeklyTOs(prev => prev.filter((_, i) => i !== idx));
  const handleWeekChange = (val) => { setWeekStart(val); setDraft(null); setNotes([]); setWeeklyTOs([]); setToText(""); setStep("timeoff"); setDayStaffing(null); setAvailOverrides({}); setWeeklyMaxOverrides({}); };

  const getRows = () => {
    if (!result) return [];
    const typeOrder = ["day_lead", "day", "mid", "evening_sl", "evening", "mc_leader", "mc_sl_helper", "mc_helper"];
    const all = {};
    weekDates.forEach(d => { (result.schedule[d] || []).forEach(a => { const k = a.type + "-" + a.order; if (!all[k]) all[k] = { type: a.type, label: a.label, order: a.order }; }); });
    return Object.values(all).sort((a, b) => { const ai = typeOrder.indexOf(a.type); const bi = typeOrder.indexOf(b.type); return ai !== bi ? ai - bi : a.order - b.order; });
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
      {/* Week picker */}
      <div style={{ background: "#fff", borderRadius: 12, padding: 18, boxShadow: "0 1px 3px rgba(0,0,0,0.06)", marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div>
            <label style={sl}>Week Starting (Monday)</label>
            <input type="date" value={weekStart} onChange={e => handleWeekChange(e.target.value)} style={{ ...si, width: 170 }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 11, color: "#6B7280" }}>
              {dayLabels[0]} {new Date(weekDates[0] + "T12:00:00").getMonth() + 1}/{new Date(weekDates[0] + "T12:00:00").getDate()}
              {" \u2192 "}{dayLabels[6]} {new Date(weekDates[6] + "T12:00:00").getMonth() + 1}/{new Date(weekDates[6] + "T12:00:00").getDate()}
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
          {isSaved && <span style={{ padding: "4px 12px", borderRadius: 8, fontSize: 11, fontWeight: 700, background: "#F0FDF4", color: "#16A34A", border: "1px solid #BBF7D0" }}>{"\u2713"} Saved</span>}
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

      {/* STEP 1: Time-Off */}
      {!isSaved && step === "timeoff" && (
        <div style={{ background: "#fff", borderRadius: 12, padding: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.06)", marginBottom: 16, border: "2px solid #3B82F6" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 22 }}>{"\ud83d\udccb"}</span>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#4A3F2F" }}>Step 1: Any time-off this week?</div>
          </div>
          <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 12 }}>Check your Homebase and type any time-off requests for this week. Or skip if none.</div>
          <textarea value={toText} onChange={e => setToText(e.target.value)} placeholder="e.g. Kennedy off Saturday all day, Gwen off Monday 12pm-6pm, Sam off Wednesday" style={{ ...si, minHeight: 80, resize: "vertical", marginBottom: 12 }} />
          <button onClick={handleParseTimeOffs} style={{ padding: "10px 24px", borderRadius: 8, border: "none", background: "#4A3F2F", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: font }}>
            {toText.trim() ? "Next \u2192" : "Skip \u2014 No Time-Off \u2192"}
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
                    {[{ key: "day", label: "Day", color: "#16A34A" }, { key: "mid", label: "Mid", color: "#0891B2" }, { key: "evening", label: "Eve", color: "#7C3AED" }].map(row => (
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
              </div>
            </div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setStep("timeoff")} style={{ padding: "10px 18px", borderRadius: 8, border: "1px solid #D1D5DB", background: "#fff", color: "#6B7280", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: font }}>{"\u2190"} Back</button>
            {Object.keys(availOverrides).length > 0 && <span style={{ fontSize: 11, color: "#22C55E", fontWeight: 600 }}>{"\u2713"} {Object.keys(availOverrides).length} availability override{Object.keys(availOverrides).length > 1 ? "s" : ""}</span>}
            <button onClick={handleGenerate} style={{ padding: "10px 24px", borderRadius: 8, border: "none", background: "#4A3F2F", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: font }}>{"\u26a1"} Generate Schedule</button>
          </div>
        </div>
      )}

      {/* RESULT */}
      {(result && (step === "result" || isSaved)) && (
        <>
          {result.warnings.length > 0 && (
            <div style={{ background: "#FEF3C7", borderRadius: 12, padding: 14, marginBottom: 16, border: "1px solid #FDE68A" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#92400E", marginBottom: 6 }}>{"\u26a0"} Warnings ({result.warnings.length})</div>
              {result.warnings.map((w, i) => (
                <div key={i} style={{ fontSize: 12, color: "#92400E", marginBottom: 2 }}>
                  {w.date && <span style={{ fontWeight: 600 }}>{new Date(w.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} — </span>}
                  {w.msg}
                </div>
              ))}
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            {!isSaved && draft ? (
              <div style={{ fontSize: 11, color: "#9CA3AF" }}>{"\ud83d\udca1"} Click any cell to edit shift details</div>
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
                <th style={{ padding: "10px 10px", textAlign: "left", fontWeight: 700, color: "#6B7280", fontSize: 10, width: 110, position: "sticky", left: 0, background: "#fff", zIndex: 1 }}>SHIFT</th>
                {weekDates.map((d, i) => {
                  const dt = new Date(d + "T12:00:00");
                  const dayType = getDayType(d, schoolDates);
                  const isH = dayType.includes("Holiday");
                  const isMC = i === 3 || i === 6;
                  return (<th key={d} style={{ padding: "10px 6px", textAlign: "center", fontWeight: 700, fontSize: 10.5, color: isH ? "#DC2626" : "#374151", background: isMC ? "#F5F3FF" : isH ? "#FEF2F2" : "transparent" }}>
                    <div>{dayLabels[i]}</div>
                    <div style={{ fontSize: 9, fontWeight: 500, color: "#9CA3AF" }}>{dt.getMonth() + 1}/{dt.getDate()}</div>
                    {isH && <div style={{ fontSize: 7.5, color: "#DC2626", fontWeight: 700 }}>HOLIDAY</div>}
                    {isMC && <div style={{ fontSize: 7.5, color: "#7C3AED", fontWeight: 700 }}>MC NIGHT</div>}
                  </th>);
                })}
              </tr></thead>
              <tbody>
                {getRows().map(row => {
                  const colors = tc[row.type] || { color: "#374151", bg: "transparent" };
                  return (<tr key={row.type + "-" + row.order} style={{ borderBottom: "1px solid #F3F4F6" }}>
                    <td style={{ padding: "7px 8px", fontWeight: 700, fontSize: 9.5, color: colors.color, background: colors.bg, whiteSpace: "nowrap", position: "sticky", left: 0, zIndex: 1 }}>{row.label}</td>
                    {weekDates.map(d => {
                      const match = (result.schedule[d] || []).find(a => a.type === row.type && a.order === row.order);
                      if (!match) return <td key={d} style={{ padding: "6px 4px", textAlign: "center", color: "#E5E7EB", fontSize: 10 }}>{"\u2014"}</td>;
                      const un = !match.empId; const isTr = match.empRole === "trainee"; const isSL = match.empRole === "shift_lead";
                      const isSel = selected && selected.date === d && selected.type === row.type && selected.order === row.order;
                      const canClick = !isSaved && draft;
                      return (
                        <td key={d}
                          onClick={canClick ? () => setEditingShift({ date: d, type: row.type, order: row.order, slot: match }) : undefined}
                          style={{ padding: "5px 4px", textAlign: "center", cursor: canClick ? "pointer" : "default", background: isSel ? "#DBEAFE" : "transparent", transition: "background 0.15s" }}
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
            </table>
          </div>
          ) : (
          <div style={{ overflowX: "auto", background: "#fff", borderRadius: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.06)", marginBottom: 16 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 1000 }}>
              <thead><tr style={{ borderBottom: "2px solid #E5E7EB" }}>
                <th style={{ padding: "12px 10px", textAlign: "left", fontWeight: 700, color: "#6B7280", fontSize: 10, width: 150, position: "sticky", left: 0, background: "#fff", zIndex: 2 }}></th>
                {weekDates.map((d, i) => {
                  const dt = new Date(d + "T12:00:00");
                  const dayType = getDayType(d, schoolDates);
                  const isH = dayType.includes("Holiday");
                  return (<th key={d} style={{ padding: "12px 6px", textAlign: "center", fontWeight: 700, fontSize: 13, color: isH ? "#DC2626" : "#374151", borderBottom: "none", minWidth: 110 }}>
                    <div>{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][dt.getDay()]}, {dt.getDate()}</div>
                  </th>);
                })}
              </tr></thead>
              <tbody>
                {(() => {
                  const sortedEmps = employees.filter(e => e.status === "active").sort((a, b) => {
                    const o = { shift_lead: 0, regular: 1, trainee: 2 };
                    return (o[a.role] || 3) - (o[b.role] || 3) || a.name.localeCompare(b.name);
                  });
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
                  const weekendDayColor = { bg: "#3B82F6", text: "#fff", label: "Weekend Day" };
                  const roleCircle = { shift_lead: "#EF4444", regular: "#3B82F6", trainee: "#A855F7" };

                  return (<>
                    {sortedEmps.map(emp => {
                      const totalHrs = result.empHours[emp.id] || 0;
                      const initials = emp.name.split(" ").map(w => w[0]).join("").toUpperCase();
                      const below = (result.empShiftCount[emp.id] || 0) < emp.minShifts;
                      return (<tr key={emp.id} style={{ borderBottom: "1px solid #F3F4F6" }}>
                        <td style={{ padding: "10px 10px", position: "sticky", left: 0, background: "#fff", zIndex: 1, borderRight: "1px solid #E5E7EB", verticalAlign: "top" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ width: 32, height: 32, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: roleCircle[emp.role] || "#9CA3AF", color: "#fff", fontSize: 11, fontWeight: 800, flexShrink: 0 }}>{initials}</div>
                            <div>
                              <div style={{ fontWeight: 700, fontSize: 12, color: below ? "#DC2626" : "#374151", lineHeight: 1.2 }}>{emp.name}</div>
                              <div style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600 }}>{totalHrs.toFixed(2)} hrs</div>
                              {!isSaved && draft && (() => {
                                const actualShifts = result.empShiftCount?.[emp.id] || 0;
                                const override = weeklyMaxOverrides[emp.id];
                                const target = (override && typeof override === "object" && typeof override.max === "number") ? override.max : null;
                                const displayNum = target !== null ? target : actualShifts;
                                const hasChange = target !== null && target !== actualShifts;
                                
                                const adjust = (delta) => {
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
                                    <button onClick={() => adjust(-1)} style={{ width: 18, height: 18, borderRadius: 4, border: "1px solid #E5E7EB", background: "#FEF2F2", color: "#DC2626", cursor: "pointer", fontSize: 11, fontWeight: 800, padding: 0, lineHeight: "16px" }}>{"\u2212"}</button>
                                    <span style={{ fontSize: 11, fontWeight: 800, minWidth: 16, textAlign: "center", color: hasChange ? (target > actualShifts ? "#16A34A" : "#DC2626") : "#374151" }}>{displayNum}</span>
                                    <button onClick={() => adjust(1)} style={{ width: 18, height: 18, borderRadius: 4, border: "1px solid #E5E7EB", background: "#F0FDF4", color: "#16A34A", cursor: "pointer", fontSize: 11, fontWeight: 800, padding: 0, lineHeight: "16px" }}>+</button>
                                    {hasChange ? (
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
                          const showUnavail = hasUnavail && shifts.length === 0;
                          return (<td key={d}
                            onDragOver={!isSaved && draft ? (ev) => { ev.preventDefault(); ev.dataTransfer.dropEffect = "move"; } : undefined}
                            onDrop={!isSaved && draft && dragSlot ? (ev) => {
                              ev.preventDefault();
                              const newSchedule = {};
                              Object.keys(draft.schedule).forEach(dd => { newSchedule[dd] = [...draft.schedule[dd]]; });
                              const fromIdx = newSchedule[dragSlot.date].findIndex(a => a.type === dragSlot.type && a.order === dragSlot.order);
                              if (fromIdx < 0) { setDragSlot(null); return; }
                              const fromSlot = newSchedule[dragSlot.date][fromIdx];

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
                            style={{ padding: "6px 4px", verticalAlign: "top", minHeight: 60, background: dragSlot ? "#FEFCE8" : undefined }}>
                            {hasTO && weekTO.map((to, ti) => (
                              <div key={"to-" + ti} style={{ padding: "6px 8px", borderRadius: 6, marginBottom: 3, background: "#F3F4F6", border: "1px solid #D1D5DB" }}>
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
                                  }} style={{ padding: "6px 8px", borderRadius: 6, marginBottom: 3, background: ov ? "#F0FDF4" : "#F9FAFB", border: ov ? "2px solid #22C55E" : "1px dashed #D1D5DB", cursor: isSaved ? "default" : "pointer" }}>
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
                                  style={{ padding: "7px 8px", borderRadius: 6, marginBottom: 3, background: isDropTarget ? "#FEF9C3" : sColors.bg, color: isDropTarget ? "#92400E" : sColors.text, minHeight: 36, cursor: canClick && s.empId ? "grab" : "pointer", opacity: isDragging ? 0.4 : 1, transition: "all 0.15s", border: isDropTarget ? "2px dashed #F59E0B" : "2px solid transparent" }}>
                                  <div style={{ fontSize: 11, fontWeight: 700 }}>{fmtTime(s.start)}{"\u2013"}{fmtTime(s.end)}</div>
                                  <div style={{ fontSize: 9, fontWeight: 600, opacity: 0.9 }}>{sColors.label}</div>
                                </div>
                              );
                            })}
                          </td>);
                        })}
                      </tr>);
                    })}
                    <tr style={{ borderTop: "2px solid #E5E7EB", background: "#F9FAFB" }}>
                      <td style={{ padding: "10px 10px", fontWeight: 700, fontSize: 11, color: "#374151", position: "sticky", left: 0, background: "#F9FAFB", zIndex: 1, borderRight: "1px solid #E5E7EB" }}>Hours</td>
                      {weekDates.map(d => {
                        const dayAssignments = result.schedule[d] || [];
                        const filled = dayAssignments.filter(a => a.empId);
                        const totalHrs = filled.reduce((sum, a) => sum + a.hours, 0);
                        return (<td key={d} style={{ padding: "8px 6px", textAlign: "center" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                            <span style={{ fontSize: 11, color: "#6B7280" }}>{"\ud83d\udc64"} {filled.length}</span>
                            <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>{totalHrs.toFixed(2)}</span>
                          </div>
                        </td>);
                      })}
                    </tr>
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
                <button onClick={() => { setDraft(null); setStep("timeoff"); setNotes([]); setWeeklyMaxOverrides({}); }} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #D1D5DB", background: "#fff", color: "#6B7280", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: font }}>{"\u2715"} Start Over</button>
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

          {isSaved && (
            <div style={{ background: "#F0FDF4", borderRadius: 12, padding: 14, marginBottom: 16, border: "1px solid #BBF7D0", display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#16A34A" }}>{"\u2713"} Schedule saved</span>
              <span style={{ fontSize: 11, color: "#6B7280" }}>{saved.savedAt && "Saved " + new Date(saved.savedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
              <div style={{ flex: 1 }} />
              <button onClick={handleUnsave} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #FCA5A5", background: "#FEF2F2", color: "#DC2626", cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: font }}>Unsave & Edit</button>
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

          {/* Employee Summary */}
          <div style={{ background: "#fff", borderRadius: 12, padding: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#4A3F2F", marginBottom: 10 }}>Employee Summary</div>
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
                      <span style={{ color: below ? "#DC2626" : "#6B7280", fontWeight: below ? 700 : 500 }}>{shifts} shifts{below ? " (min: " + emp.minShifts + ")" : ""}</span>
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
