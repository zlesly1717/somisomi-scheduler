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
function genSchedule(weekDates, employees, rules, schoolDates, weeklyTimeOffs, dayStaffingOverrides, availOverrides, weeklyMaxOverrides, approvedBreaks, savedSchedules) {
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
  const weekendNightOK = (emp, dateStr, slotStart) => {
    if (tm(slotStart) < 1020) return true;
    const dow2 = new Date(dateStr + "T12:00:00").getDay();
    if (!approved.has("F7") && con("no_fri_sat_night")) {
      if (dow2 === 5 && nightMap[weekDates[5]]?.has(emp.id)) return false;
      if (dow2 === 6 && nightMap[weekDates[4]]?.has(emp.id)) return false;
    }
    if (!approved.has("F8") && con("no_sat_sun_night")) {
      if (dow2 === 6 && nightMap[weekDates[6]]?.has(emp.id)) return false;
      if (dow2 === 0 && nightMap[weekDates[5]]?.has(emp.id)) return false;
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
  const friSatSunOK = (emp, dateStr) => {
    if (!con("no_fri_sat_sun")) return true;
    const d2 = new Date(dateStr + "T12:00:00").getDay();
    // Rule only applies when assigning a weekend day (Fri/Sat/Sun)
    if (d2 !== 5 && d2 !== 6 && d2 !== 0) return true;
    const overrideKey = dateStr + ":" + emp.id;
    if (availOverrides && availOverrides[overrideKey]) return true;
    const hasFri = sd[emp.id].has(weekDates[4]);
    const hasSat = sd[emp.id].has(weekDates[5]);
    const hasSun = sd[emp.id].has(weekDates[6]);
    // Count how many weekend days they'd have after this assignment
    const wouldHave = (d2 === 5 ? 1 : (hasFri ? 1 : 0)) + (d2 === 6 ? 1 : (hasSat ? 1 : 0)) + (d2 === 0 ? 1 : (hasSun ? 1 : 0));
    return wouldHave < 3;
  };

  // CANNOT BREAK: No two trainees same day
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
      if (slot.noTrainee && emp.role === "trainee") return false; // no trainees on first 4 weekend night slots
      if (slot.isMC && emp.role === "trainee") return false; // no trainees on MC
      if (slot.isMC && (emp.tags || []).includes("mc_exempt")) return false; // mc_exempt employees never MC
      if (con("no_mc_twice") && slot.isMC && mcCount[emp.id] >= 1) return false; // no MC twice
      if (emp.role === "trainee" && (slot.type === "day_lead" || slot.type === "day")) return false; // no trainees on any day shift
      if (emp.role === "trainee" && slot.type === "evening_sl") return false; // no trainees on SL-only evening slots
      if (emp.role === "trainee" && slot.type === "evening_sl2") return false; // no trainees on 2nd SL slot
      if (!traineeOK(emp, dateStr)) return false; // no two trainees same day
      if (!friSatSunOK(emp, dateStr)) return false; // no all 3 weekend days
      if (!dayAfterMCOK(emp, dateStr, slot.start)) return false; // no day after MC night
      if (!crystalSundayOK(emp, dateStr)) return false; // Crystal off Sundays
      // CANNOT BREAK: SLs blocked from Mon–Wed evenings
      if (emp.role === "shift_lead" && slot.type === "evening" && !isWE && !isFri && dow >= 1 && dow <= 3) return false;
      // CANNOT BREAK: Mon–Thu day shifts only 1 SL (the Day Lead)
      if (emp.role === "shift_lead" && slot.type === "day" && !isWE && !isFri) {
        const slAlreadyOnDay = schedule[dateStr].some(a => a.empId && active.find(e => e.id === a.empId)?.role === "shift_lead");
        if (slAlreadyOnDay) return false;
      }
      if (schedule[dateStr].some(a => a.empId === emp.id)) return false;

      // ── FLEXIBLE rules (blocked unless approved) ──
      if (!approved.has("F6") && sc[emp.id] >= emp._effMaxShifts) return false;
      if (sh[emp.id] + slot.hours > emp._effMaxHours * (approved.has("F6") ? 1.5 : 1)) return false;
      if (!weekendNightOK(emp, dateStr, slot.start)) return false; // F7/F8
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
      const filtered = extraFilter(cands);
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
    if (staffing.mid > 0) { for (let i = 0; i < staffing.mid; i++) { slots.push({ type: "mid", label: "Mid Shift", start: midS, end: midE, hours: hrs(midS, midE), slOnly: false, order: 10 + i }); } }
    if (isMC) {
      // Thu MC: 1 SL leader + 2 reg helpers (3 total)
      // Sun MC: 1 SL leader + 1 SL helper + 2 reg helpers (4 total)
      slots.push({ type: "mc_leader", label: "MC Leader (Eve SL)", start: mcS, end: mcE, hours: hrs(mcS, mcE), slOnly: true, isMC: true, order: 20 });
      if (isSun) {
        slots.push({ type: "mc_sl_helper", label: "MC Helper (SL)", start: mcS, end: mcE, hours: hrs(mcS, mcE), slOnly: true, isMC: true, order: 21 });
      }
      const regHelpers = isSun ? 2 : 2; // Thu: 2 reg helpers, Sun: 2 reg helpers
      for (let i = 0; i < regHelpers; i++) { slots.push({ type: "mc_helper", label: "MC Helper", start: mcS, end: mcE, hours: hrs(mcS, mcE), slOnly: false, isMC: true, order: 22 + i }); }
      // Thu: add trainee evening slot (6pm-10:30pm, leaves before MC cleaning starts)
      if (isThu) {
        slots.push({ type: "evening", label: "Evening", start: eveS, end: eveE, hours: hrs(eveS, eveE), slOnly: false, isMC: false, isTraineeSlot: true, order: 25 });
      }
    } else {
      for (let i = 0; i < (staffing.evening || 3); i++) {
        // Fri/Sat nights: first 2 slots are SL-only (2 SLs required)
        // Sun is MC night so handled separately above with mc_leader + mc_sl_helper
        // Trainees only allowed as 5th+ person on Fri/Sat nights
        const needsSL = i <= 1 && (isFri || isSat);
        slots.push({
          type: i === 0 ? "evening_sl" : (needsSL ? "evening_sl2" : "evening"),
          label: i === 0 ? "Evening SL" : (needsSL ? "Evening SL 2" : "Evening"),
          start: eveS, end: eveE, hours: hrs(eveS, eveE),
          slOnly: needsSL,
          noTrainee: (isFri || isSat) && i < 4, // no trainees on first 4 slots of Fri/Sat nights
          order: 20 + i
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

  const sls = active.filter(e => e.role === "shift_lead");
  const regs = active.filter(e => e.role === "regular");
  const traineeEmps = active.filter(e => e.role === "trainee");

  // ── STEP 2: Place SLs on SL-REQUIRED slots ────────────────────────
  // Only fills slots marked slOnly=true. No overflow yet.
  // Order: Thu MC (Crystal) → Sun MC SLs → Fri/Sat/Sun Eve SL → Sat/Sun DL → Mon-Fri DL → Thu Eve SL

  const slSlots = allSlots.filter(s => s.slOnly);
  slSlots.sort((a, b) => {
    const pri = (s) => {
      if (s.isMC && s._dow === 4) return 0;  // Thu MC Leader (Crystal)
      if (s.isMC && s._dow === 0) return 1;  // Sun MC SLs
      if ((s.type === "evening_sl" || s.type === "evening_sl2") && (s._isFri || s._isSat || s._isSun)) return 2; // Weekend Eve SLs (both slots)
      if (s.type === "day_lead" && (s._isSat || s._isSun)) return 3; // Weekend DL
      if (s.type === "day_lead") return 4;    // Weekday DL
      if (s.type === "evening_sl") return 5;  // Thu Eve SL
      return 6;
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
      const cands = getCandidates(slot, c => c.filter(e => e.role === "shift_lead"));
      cands.sort((a, b) => {
        const aCount = mcHistoryCount[a.name] || 0;
        const bCount = mcHistoryCount[b.name] || 0;
        if (aCount !== bCount) return aCount - bCount;
        const aLast = mcHistoryLast[a.name] || "";
        const bLast = mcHistoryLast[b.name] || "";
        if (!aLast && bLast) return -1;
        if (aLast && !bLast) return 1;
        if (aLast !== bLast) return aLast.localeCompare(bLast);
        return sh[a.id] - sh[b.id];
      });
      if (cands[0]) { assignSlotInSchedule(slot, cands[0]); continue; }
    }

    // All other SL-only slots: pick SL with fewest hours
    let cands = getCandidates(slot, c => c.filter(e => e.role === "shift_lead"));
    cands.sort((a, b) => {
      // Guaranteed days first
      const aG = (a.guaranteedDays || []).includes(slot._dayKey) ? 1 : 0;
      const bG = (b.guaranteedDays || []).includes(slot._dayKey) ? 1 : 0;
      if (bG !== aG) return bG - aG;
      // SLs furthest under 18h get priority (need hours most)
      const slMin = 18;
      const aUnder = Math.max(0, slMin - sh[a.id]);
      const bUnder = Math.max(0, slMin - sh[b.id]);
      if (bUnder !== aUnder) return bUnder - aUnder;
      // Then fewest hours overall
      if (sh[a.id] !== sh[b.id]) return sh[a.id] - sh[b.id];
      if (sc[a.id] !== sc[b.id]) return sc[a.id] - sc[b.id];
      return Math.random() - 0.5;
    });
    if (cands[0]) assignSlotInSchedule(slot, cands[0]);
  }

  // ── STEP 3: Place trainees on Mon-Thu evenings ─────────────────────
  // 1 trainee per day. Thu has a dedicated isTraineeSlot. Mon-Wed take the last evening slot.
  // Place BEFORE regulars so trainees don't get squeezed out.

  const availTrainees = traineeEmps.filter(e => e._budget > 0);

  // Thu trainee slot first (dedicated)
  weekDates.forEach(dateStr => {
    schedule[dateStr].forEach((slot, idx) => {
      if (slot.empId || !slot.isTraineeSlot) return;
      let cands = getCandidates(slot).filter(e => e.role === "trainee");
      cands.sort((a, b) => sh[a.id] - sh[b.id] || Math.random() - 0.5);
      if (cands[0]) assign(dateStr, idx, cands[0], slot);
    });
  });

  // Mon/Tue/Wed: assign trainee to last unfilled evening slot
  const traineeQueue = [...availTrainees].sort((a, b) => sh[a.id] - sh[b.id]);
  for (let di = 0; di < 3; di++) { // Mon=0, Tue=1, Wed=2
    const dateStr = weekDates[di];
    // Find unfilled evening slots
    const eveSlots = [];
    schedule[dateStr].forEach((slot, idx) => {
      if (slot.empId || tm(slot.start) < 1020 || slot.isMC || slot.slOnly) return;
      eveSlots.push({ slot, idx });
    });
    if (eveSlots.length === 0) continue;
    const targetSlot = eveSlots[eveSlots.length - 1]; // last evening slot

    for (const trainee of traineeQueue) {
      if (sd[trainee.id].has(dateStr)) continue;
      if (!traineeOK(trainee, dateStr)) continue;
      if (!isAvail(trainee, dateStr, targetSlot.slot.start, targetSlot.slot.end, weeklyTimeOffs, availOverrides)) continue;
      if (!consecOK(trainee, di)) continue;
      if (sc[trainee.id] >= trainee._effMaxShifts) continue;
      assign(dateStr, targetSlot.idx, trainee, targetSlot.slot);
      break;
    }
    traineeQueue.sort((a, b) => sh[a.id] - sh[b.id]); // re-sort after each placement
  }

  // ── STEP 4: Place regulars on all remaining slots ──────────────────
  // Process order: MC helpers → Weekend evening → Weekend day → Fri → Mid → Weekday 2nd day → Weekday evening
  // Pick: person with fewest hours who hasn't hit their target

  const remainingSlots = [];
  weekDates.forEach(dateStr => {
    schedule[dateStr].forEach((slot, idx) => {
      if (slot.empId || slot.slOnly || slot.isTraineeSlot) return;
      remainingSlots.push({ dateStr, idx, slot });
    });
  });

  remainingSlots.sort((a, b) => {
    const pri = (s) => {
      if (s.slot.isMC && !s.slot.slOnly) return 0;  // MC helpers
      if ((s.slot._isWE || s.slot._isFri) && tm(s.slot.start) >= 1020) return 1; // Weekend/Fri evening
      if (s.slot._isWE && tm(s.slot.start) < 1020) return 2; // Weekend day
      if (s.slot._isFri && tm(s.slot.start) < 1020) return 3; // Friday day
      if (s.slot.type === "mid") return 4;
      if (!s.slot._isWE && !s.slot._isFri && tm(s.slot.start) < 1020) return 5; // Weekday 2nd day
      return 6; // Weekday evening (Mon-Wed remaining slots)
    };
    return pri(a) - pri(b);
  });

  for (const { dateStr, idx, slot } of remainingSlots) {
    if (schedule[dateStr][idx].empId) continue;

    let cands = getCandidates(slot);
    const isWeekendSlot = slot._isWE || (slot._isFri && tm(slot.start) >= 1020);

    // MC helpers: ALL regulars rotate (except mc_exempt and trainees), prefer those who haven't cleaned recently
    if (slot.isMC) {
      const nonSLT = cands.filter(e => e.role !== "shift_lead" && e.role !== "trainee" && !(e.tags || []).includes("mc_exempt"));
      if (nonSLT.length > 0) cands = nonSLT;
      // Sort by MC rotation: fewest MC times first, then longest since last MC
      cands.sort((a, b) => {
        const aCount = mcHistoryCount[a.name] || 0;
        const bCount = mcHistoryCount[b.name] || 0;
        if (aCount !== bCount) return aCount - bCount;
        const aLast = mcHistoryLast[a.name] || "";
        const bLast = mcHistoryLast[b.name] || "";
        if (!aLast && bLast) return -1;
        if (aLast && !bLast) return 1;
        return aLast.localeCompare(bLast); // earlier = longer ago = pick first
      });
    }
    // Weekend/Fri evening: slots 1+2 are slOnly (handled in Step 2 by evening_sl/evening_sl2)
    // Remaining evening slots (3rd, 4th): prefer regulars, no SLs, no trainees unless 5th slot
    // Trainees only on slot order >= 24 (5th person, index 4) if near graduation (20h+)
    else if (isWeekendSlot && tm(slot.start) >= 1020) {
      const dow3 = new Date(dateStr + "T12:00:00").getDay();
      const isWeekendNight = dow3 === 5 || dow3 === 6; // Sun nights are MC slots, handled separately
      const nearGradHours = rules.trainee?.graduationHours ? rules.trainee.graduationHours * 0.67 : 20;
      const nearGrad = e => e.role === "trainee" && (e.traineeCumulative || 0) >= nearGradHours;
      // Weekend nights: no SLs on regular evening slots (SLs belong on slOnly slots)
      if (isWeekendNight && slot.type === "evening") {
        const noSL = cands.filter(e => e.role !== "shift_lead");
        if (noSL.length > 0) cands = noSL;
        // Trainees only as 5th person (slot order 24+) and only near-grads
        const isFifthSlot = slot.order >= 24;
        if (!isFifthSlot) {
          cands = cands.filter(e => e.role !== "trainee");
        } else {
          const noEarlyT = cands.filter(e => e.role !== "trainee" || nearGrad(e));
          if (noEarlyT.length > 0) cands = noEarlyT;
        }
      } else {
        // Non-weekend-night weekend slots: no trainees
        const noT = cands.filter(e => e.role !== "trainee");
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
    }
    // Weekend day / Fri day: no trainees
    else if (isWeekendSlot || slot._isFri) {
      const noT = cands.filter(e => e.role !== "trainee");
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
    // Weekday evening (remaining slots after trainees placed): prefer regulars, allow trainee as fallback
    else if (tm(slot.start) >= 1020) {
      const regsOnly = cands.filter(e => e.role === "regular");
      if (regsOnly.length > 0) cands = regsOnly;
      // If no regulars available, allow trainees (better than unfilled)
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

  // ── STEP 5: SL overflow — give SLs WEEKEND regular slots to reach 4 ──
  // ONLY weekend (Fri/Sat/Sun) day, mid, or evening slots. NEVER weekday evening.
  for (const sl of sls.sort((a, b) => sc[a.id] - sc[b.id])) {
    const needed = 4 - sc[sl.id];
    if (needed <= 0) continue;

    const openSlots = [];
    weekDates.forEach(dateStr => {
      const dow = new Date(dateStr + "T12:00:00").getDay();
      const isWeekend = dow === 0 || dow === 5 || dow === 6; // Fri/Sat/Sun only
      if (!isWeekend) return;

      schedule[dateStr].forEach((slot, idx) => {
        if (slot.empId) return;
        if (slot.slOnly) return; // already handled
        if (slot.isTraineeSlot) return;
        if (sd[sl.id].has(dateStr)) return;
        if (!isAvail(sl, dateStr, slot.start, slot.end, weeklyTimeOffs, availOverrides)) return;
        if (!friSatSunOK(sl, dateStr)) return;
        if (!dayAfterMCOK(sl, dateStr, slot.start)) return;
        if (!crystalSundayOK(sl, dateStr)) return;
        if (!weekendNightOK(sl, dateStr, slot.start)) return;
        if (!consecOK(sl, weekDates.indexOf(dateStr))) return;
        if (slot.isMC && mcCount[sl.id] >= 1) return;
        // Fri/Sat/Sun nights: SL overflow should not take regular evening slots
        // (2 SL slots are slOnly, remaining evening slots go to regulars)
        const slDow = new Date(dateStr + "T12:00:00").getDay();
        if ((slDow === 5 || slDow === 6 || slDow === 0) && slot.type === "evening") return;
        openSlots.push({ dateStr, idx, slot });
      });
    });

    let filled = 0;
    for (const { dateStr, idx, slot } of openSlots) {
      if (filled >= needed) break;
      if (sd[sl.id].has(dateStr)) continue;
      if (schedule[dateStr][idx].empId) continue;
      assign(dateStr, idx, sl, slot);
      filled++;
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
        // OR any unfilled weekday evening slot
        const dow = new Date(dateStr + "T12:00:00").getDay();
        const isWeekday = dow >= 1 && dow <= 4;
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
  const isBalanceExempt = (emp) => emp.name === "Grae McKown" || emp.role === "trainee";
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
    if (maxH - minH <= 3) break; // SLs within 3h of each other — close enough

    const overP = pool.filter(e => sh[e.id] >= maxH - 1);
    const underP = pool.filter(e => sh[e.id] <= minH + 1);

    let swapped = false;
    outer: for (const under of underP) {
      for (const over of overP) {
        if (under.id === over.id) continue;
        for (const dateStr of weekDates) {
          if (sd[under.id].has(dateStr) || !sd[over.id].has(dateStr)) continue;
          if (!friSatSunOK(under, dateStr)) continue;

          for (let si = 0; si < schedule[dateStr].length; si++) {
            const slot = schedule[dateStr][si];
            if (slot.empId !== over.id) continue;
            if (slot.slOnly && under.role !== "shift_lead") continue;
            if (slot.isMC && under.role === "trainee") continue;
            if (slot.isTraineeSlot && under.role !== "trainee") continue;
            if (!isAvail(under, dateStr, slot.start, slot.end, weeklyTimeOffs, availOverrides)) continue;
            if (con("no_mc_twice") && slot.isMC && mcCount[under.id] >= 1) continue;
            if (!weekendNightOK(under, dateStr, slot.start)) continue;
            if (sh[under.id] + slot.hours > (under._effMaxHours || 24)) continue;
            if (!consecOK(under, weekDates.indexOf(dateStr))) continue;
            // Don't steal SL-required slots from SLs
            if (over.role === "shift_lead" && (slot.type === "evening_sl" || slot.type === "day_lead" || slot.type === "mc_leader" || slot.type === "mc_sl_helper")) continue;
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
    if (maxH - minH <= 4) break;

    const overP = pool.filter(e => sh[e.id] >= maxH - 1);
    const underP = pool.filter(e => sh[e.id] <= minH + 1);

    let swapped = false;
    outer2: for (const under of underP) {
      for (const over of overP) {
        if (under.id === over.id) continue;
        for (const dateStr of weekDates) {
          if (sd[under.id].has(dateStr) || !sd[over.id].has(dateStr)) continue;
          if (!friSatSunOK(under, dateStr)) continue;

          for (let si = 0; si < schedule[dateStr].length; si++) {
            const slot = schedule[dateStr][si];
            if (slot.empId !== over.id) continue;
            if (slot.slOnly) continue; // can't take SL-required slots
            if (slot.isMC && under.role === "trainee") continue;
            if (slot.isTraineeSlot && under.role !== "trainee") continue;
            if (!isAvail(under, dateStr, slot.start, slot.end, weeklyTimeOffs, availOverrides)) continue;
            if (con("no_mc_twice") && slot.isMC && mcCount[under.id] >= 1) continue;
            if (!weekendNightOK(under, dateStr, slot.start)) continue;
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

  // ── Gap fill: any remaining empty slots ───────────────────────────
  weekDates.forEach(dateStr => {
    schedule[dateStr].forEach((slot, idx) => {
      if (slot.empId) return;
      const cands = getCandidates(slot);
      cands.sort((a, b) => sh[a.id] - sh[b.id] || Math.random() - 0.5);
      if (cands[0]) assign(dateStr, idx, cands[0], slot);
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

  const shortSLs = active.filter(e => e.role === "shift_lead" && sc[e.id] < e.minShifts).map(e => e.id);
  const hasUnfilled = weekDates.some(d => schedule[d].some(s => !s.empId));

  return { schedule, empShiftCount: sc, empHours: sh, warnings: warnings2, shortSLs, extraUnfilled, rulesNeeded, hasUnfilled };
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
  const [warningsOpen, setWarningsOpen] = useState(false);
  const [empOrder, setEmpOrder] = useState(null); // custom employee display order
  const [dragEmpId, setDragEmpId] = useState(null); // for employee row reordering
  const [addShiftPopup, setAddShiftPopup] = useState(null); // { empId, date }
  const [approvedBreaks, setApprovedBreaks] = useState([]); // rule IDs manager approved breaking
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

  const handleGenerate = (breaks) => {
    const useBreaks = breaks || approvedBreaks;
    setGenerating(true); setStep("result"); setPendingApprovals(null);
    const ds = dayStaffing || initDayStaffing(weekDates);
    setTimeout(() => {
      try {
        const allTOs = [...(timeOffs || []), ...weeklyTOs];
        const r = genSchedule(weekDates, employees, rules, schoolDates, allTOs, ds, availOverrides, weeklyMaxOverrides, useBreaks, savedSchedules);
        // If there are unfilled slots that need rule breaks, surface them for approval
        if (r.rulesNeeded?.length > 0) {
          setPendingApprovals(r.rulesNeeded);
          setRuleApprovalChecked(r.rulesNeeded.map(x => x.id)); // pre-check all by default
        }
        setDraft(r); setGenerating(false);
      } catch (err) {
        console.error("Schedule generation error:", err);
        setGenerating(false);
        alert("Error generating schedule: " + err.message);
      }
    }, 200);
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
            if (emp && emp.role === "trainee") {
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
        const r = genSchedule(weekDates, employees, rules, schoolDates, allTOs, ds, availOverrides, weeklyMaxOverrides, [], savedSchedules);
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
  const handleWeekChange = (val) => { setWeekStart(val); setDraft(null); setNotes([]); setWeeklyTOs([]); setToText(""); setStep("timeoff"); setDayStaffing(null); setAvailOverrides({}); setWeeklyMaxOverrides({}); setApprovedBreaks([]); setPendingApprovals(null); };

  const getRows = () => {
    if (!result) return [];
    const typeOrder = ["day_lead", "day", "mid", "evening_sl", "evening_sl2", "evening", "mc_leader", "mc_sl_helper", "mc_helper"];
    const all = {};
    weekDates.forEach(d => { (result.schedule[d] || []).forEach(a => { const k = a.type + "-" + a.order; if (!all[k]) all[k] = { type: a.type, label: a.label, order: a.order }; }); });
    return Object.values(all).sort((a, b) => { const ai = typeOrder.indexOf(a.type); const bi = typeOrder.indexOf(b.type); return ai !== bi ? ai - bi : a.order - b.order; });
  };

  const tc = {
    day_lead: { color: "#B45309", bg: "#FEF3C7" }, day: { color: "#16A34A", bg: "#F0FDF4" },
    mid: { color: "#0891B2", bg: "#ECFEFF" }, evening_sl: { color: "#E11D48", bg: "#FFF1F2" },
    evening_sl2: { color: "#E11D48", bg: "#FFF1F2" },
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
            <button onClick={handleGenerate} style={{ padding: "10px 24px", borderRadius: 8, border: "none", background: "#4A3F2F", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: font }}>{"\u26a1"} Generate Schedule</button>
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

          {(result.warnings || []).length > 0 && (
            <div style={{ background: "#FEF3C7", borderRadius: 12, marginBottom: 16, border: "1px solid #FDE68A", overflow: "hidden" }}>
              <div onClick={() => setWarningsOpen(!warningsOpen)} style={{ padding: "10px 14px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#92400E" }}>{"\u26a0"} Warnings ({(result.warnings || []).length})</div>
                <span style={{ fontSize: 12, color: "#92400E", transform: warningsOpen ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>{"\u25b6"}</span>
              </div>
              {warningsOpen && (
                <div style={{ padding: "0 14px 10px" }}>
                  {(result.warnings || []).map((w, i) => (
                    <div key={i} style={{ fontSize: 12, color: "#92400E", marginBottom: 2 }}>
                      {w.date && <span style={{ fontWeight: 600 }}>{new Date(w.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} — </span>}
                      {w.msg}
                    </div>
                  ))}
                </div>
              )}
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
                <th style={{ padding: "8px 8px", textAlign: "left", fontWeight: 700, color: "#6B7280", fontSize: 10, width: 140, position: "sticky", left: 0, background: "#fff", zIndex: 2 }}></th>
                {weekDates.map((d, i) => {
                  const dt = new Date(d + "T12:00:00");
                  const dayType = getDayType(d, schoolDates);
                  const isH = dayType.includes("Holiday");
                  return (<th key={d} style={{ padding: "7px 4px", textAlign: "center", fontWeight: 700, fontSize: 11, color: isH ? "#DC2626" : "#374151", borderBottom: "none", minWidth: 110 }}>
                    <div>{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][dt.getDay()]}, {dt.getDate()}</div>
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
                  const shiftColors = {
                    day_lead: { bg: "#F97316", text: "#fff", label: "Day Shift Lead" },
                    day: { bg: "#EAB308", text: "#fff", label: "Weekday Day" },
                    mid: { bg: "#EAB308", text: "#fff", label: "Mid Shift" },
                    evening_sl: { bg: "#EF4444", text: "#fff", label: "Shift Lead" },
                    evening_sl2: { bg: "#EF4444", text: "#fff", label: "Shift Lead" },
                    evening: { bg: "#A855F7", text: "#fff", label: "Night Shift" },
                    mc_leader: { bg: "#22C55E", text: "#fff", label: "Shiftlead/Machineclean" },
                    mc_sl_helper: { bg: "#22C55E", text: "#fff", label: "Machineclean" },
                    mc_helper: { bg: "#22C55E", text: "#fff", label: "Machineclean" },
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
                              <div style={{ fontSize: 9, color: "#9CA3AF", fontWeight: 600 }}>{totalHrs.toFixed(1)} hrs</div>
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
                                    <button onClick={() => adjust(-1)} style={{ width: 15, height: 15, borderRadius: 3, border: "1px solid #E5E7EB", background: "#FEF2F2", color: "#DC2626", cursor: "pointer", fontSize: 11, fontWeight: 800, padding: 0, lineHeight: "16px" }}>{"\u2212"}</button>
                                    <span style={{ fontSize: 11, fontWeight: 800, minWidth: 16, textAlign: "center", color: hasChange ? (target > actualShifts ? "#16A34A" : "#DC2626") : "#374151" }}>{displayNum}</span>
                                    <button onClick={() => adjust(1)} style={{ width: 15, height: 15, borderRadius: 3, border: "1px solid #E5E7EB", background: "#F0FDF4", color: "#16A34A", cursor: "pointer", fontSize: 11, fontWeight: 800, padding: 0, lineHeight: "16px" }}>+</button>
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
                              // Trainees always show in blue regardless of shift type
                              if (s.empRole === "trainee") sColors = { ...sColors, bg: "#22C3E6" };
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
                    <tr style={{ borderTop: "2px solid #E5E7EB", background: "#F9FAFB" }}>
                      <td style={{ padding: "6px 8px", fontWeight: 700, fontSize: 10, color: "#374151", position: "sticky", left: 0, background: "#F9FAFB", zIndex: 1, borderRight: "1px solid #E5E7EB" }}>Hours</td>
                      {weekDates.map(d => {
                        const dayAssignments = result.schedule[d] || [];
                        const filled = dayAssignments.filter(a => a.empId);
                        const totalHrs = filled.reduce((sum, a) => sum + a.hours, 0);
                        return (<td key={d} style={{ padding: "4px 4px", textAlign: "center" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                            <span style={{ fontSize: 9, color: "#9CA3AF" }}>{filled.length} ppl</span>
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
                  <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: 700, color: "#DC2626", fontSize: 10, textTransform: "uppercase" }}>Didn't MC</th>
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
                  const thuMC = { leader: null, helpers: [] };
                  const sunMC = { leader: null, helpers: [] };
                  const allMCNames = new Set();
                  
                  [thuDate, sunDate].forEach(dt => {
                    if (!schedule[dt] || !Array.isArray(schedule[dt])) return;
                    const isThu = dt === thuDate;
                    schedule[dt].forEach(slot => {
                      if (!slot.isMC || !slot.empId) return;
                      const name = slot.empName || "?";
                      allMCNames.add(name);
                      const mc = isThu ? thuMC : sunMC;
                      if (slot.type === "mc_leader") mc.leader = name;
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
                      return `${f(d)} – ${f(end)}`;
                    } catch { return key; }
                  })();

                  return (
                    <tr key={key} style={{ borderBottom: "1px solid #F3F4F6" }}>
                      <td style={{ padding: "8px 12px", fontWeight: 600, color: "#374151", whiteSpace: "nowrap" }}>{fmtWeek}</td>
                      <td style={{ padding: "8px 12px" }}>
                        {thuMC.leader ? (
                          <>
                            <span style={{ fontWeight: 700, color: "#7C3AED" }}>{thuMC.leader}</span>
                            {thuMC.helpers.length > 0 && <span style={{ color: "#9CA3AF" }}> + {thuMC.helpers.join(", ")}</span>}
                          </>
                        ) : <span style={{ color: "#D1D5DB" }}>—</span>}
                      </td>
                      <td style={{ padding: "8px 12px" }}>
                        {sunMC.leader ? (
                          <>
                            <span style={{ fontWeight: 700, color: "#2563EB" }}>{sunMC.leader}</span>
                            {sunMC.helpers.length > 0 && <span style={{ color: "#9CA3AF" }}> + {sunMC.helpers.join(", ")}</span>}
                          </>
                        ) : <span style={{ color: "#D1D5DB" }}>—</span>}
                      </td>
                      <td style={{ padding: "8px 12px" }}>
                        {didntMC.length > 0 ? (
                          didntMC.map((n, i) => (
                            <span key={n} style={{ fontWeight: 600, color: "#DC2626", background: "#FEF2F2", padding: "2px 8px", borderRadius: 6, fontSize: 11, marginRight: 4 }}>{n}</span>
                          ))
                        ) : <span style={{ color: "#16A34A", fontSize: 11 }}>All SLs cleaned</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Next Up for MC */}
          {(() => {
            // Build MC frequency from saved schedules
            const regMCCount = {};
            const slMCCount = {};
            const regLastMC = {};
            const slLastMC = {};
            const activeRegs = employees.filter(e => e.status === "active" && e.role === "regular" && !(e.tags || []).includes("mc_exempt")).map(e => e.name);
            const activeSLs = employees.filter(e => e.status === "active" && e.role === "shift_lead").map(e => e.name);
            activeRegs.forEach(n => { regMCCount[n] = 0; regLastMC[n] = null; });
            activeSLs.forEach(n => { slMCCount[n] = 0; slLastMC[n] = null; });

            Object.entries(savedSchedules).sort((a, b) => a[0].localeCompare(b[0])).forEach(([key, data]) => {
              const schedule = data.schedule || data;
              Object.entries(schedule).forEach(([dateStr, slots]) => {
                if (!Array.isArray(slots)) return;
                slots.forEach(slot => {
                  if (!slot.isMC || !slot.empId) return;
                  const name = slot.empName || "?";
                  if (activeRegs.includes(name)) { regMCCount[name]++; regLastMC[name] = key; }
                  if (activeSLs.includes(name)) { slMCCount[name]++; slLastMC[name] = key; }
                });
              });
            });

            // Sort: fewest MC times first, then longest since last MC
            const regSorted = activeRegs.sort((a, b) => {
              if (regMCCount[a] !== regMCCount[b]) return regMCCount[a] - regMCCount[b];
              if (!regLastMC[a] && regLastMC[b]) return -1;
              if (regLastMC[a] && !regLastMC[b]) return 1;
              if (regLastMC[a] && regLastMC[b]) return regLastMC[a].localeCompare(regLastMC[b]);
              return 0;
            });
            const slSorted = activeSLs.sort((a, b) => {
              if (slMCCount[a] !== slMCCount[b]) return slMCCount[a] - slMCCount[b];
              if (!slLastMC[a] && slLastMC[b]) return -1;
              if (slLastMC[a] && !slLastMC[b]) return 1;
              if (slLastMC[a] && slLastMC[b]) return slLastMC[a].localeCompare(slLastMC[b]);
              return 0;
            });

            const fmtLast = (key) => {
              if (!key) return "Never";
              try { const d = new Date(key + "T12:00:00"); return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }); } catch { return key; }
            };

            return (
              <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div style={{ padding: 14, background: "#FFF7ED", borderRadius: 10, border: "1px solid #FED7AA" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#C2410C", marginBottom: 8 }}>Next Up — Regular MC Helpers</div>
                  <div style={{ fontSize: 10, color: "#9CA3AF", marginBottom: 8 }}>Sorted by who's overdue. Top = should clean next.</div>
                  {regSorted.map((name, i) => (
                    <div key={name} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: i < regSorted.length - 1 ? "1px solid #FDE68A" : "none" }}>
                      <span style={{ fontSize: 11, fontWeight: 800, color: i < 4 ? "#16A34A" : "#9CA3AF", width: 18 }}>#{i + 1}</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "#374151", flex: 1 }}>{name}</span>
                      <span style={{ fontSize: 10, color: "#9CA3AF" }}>{regMCCount[name]}× · last: {fmtLast(regLastMC[name])}</span>
                    </div>
                  ))}
                </div>
                <div style={{ padding: 14, background: "#FEF3C7", borderRadius: 10, border: "1px solid #FDE68A" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#92400E", marginBottom: 8 }}>Next Up — SL MC Leaders</div>
                  <div style={{ fontSize: 10, color: "#9CA3AF", marginBottom: 8 }}>Sorted by who's overdue. Top = should lead next.</div>
                  {slSorted.map((name, i) => (
                    <div key={name} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: i < slSorted.length - 1 ? "1px solid #FDE68A" : "none" }}>
                      <span style={{ fontSize: 11, fontWeight: 800, color: i < 2 ? "#16A34A" : "#9CA3AF", width: 18 }}>#{i + 1}</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "#374151", flex: 1 }}>{name}</span>
                      <span style={{ fontSize: 10, color: "#9CA3AF" }}>{slMCCount[name]}× · last: {fmtLast(slLastMC[name])}</span>
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
