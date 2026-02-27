import { useState } from "react";
import { DAYS, DAY_FULL, fmtTime } from "./constants";

const font = "'DM Sans',sans-serif";
const si = { padding: "8px 12px", border: "1px solid #D1D5DB", borderRadius: 8, fontSize: 13, outline: "none", fontFamily: font, boxSizing: "border-box", width: "100%" };
const sl = { fontSize: 10.5, fontWeight: 700, color: "#6B7280", marginBottom: 4, display: "block", textTransform: "uppercase", letterSpacing: 0.5 };

const SHIFT_TYPES = [
  { id: "day_lead", label: "Day Lead (SL)", color: "#F59E0B", bg: "#FEF3C7", slOnly: true },
  { id: "day", label: "Day / 2nd Day", color: "#22C55E", bg: "#F0FDF4", slOnly: false },
  { id: "evening_sl", label: "Evening SL", color: "#E11D48", bg: "#FFF1F2", slOnly: true },
  { id: "evening", label: "Evening", color: "#3B82F6", bg: "#EFF6FF", slOnly: false },
  { id: "mc_leader", label: "MC Leader (SL)", color: "#7C3AED", bg: "#F5F3FF", slOnly: true },
  { id: "mc_helper", label: "MC Helper", color: "#8B5CF6", bg: "#EDE9FE", slOnly: false },
];

function getWeekDates(startDate) {
  const d = new Date(startDate + "T12:00:00");
  const day = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const dd = new Date(monday);
    dd.setDate(monday.getDate() + i);
    dates.push(dd.toISOString().split("T")[0]);
  }
  return dates;
}

function getDayType(dateStr, schoolDates) {
  const d = new Date(dateStr + "T12:00:00");
  const dow = d.getDay(); // 0=Sun, 6=Sat
  const isSchoolOff = schoolDates.some(s => s.date === dateStr && (s.type === "holiday" || s.type === "summer"));
  const isEarlyRelease = schoolDates.some(s => s.date === dateStr && s.type === "early_release");

  if (dow === 0) return "sunday";
  if (dow === 6) return "saturday";
  if (dow === 5) return isSchoolOff ? "fridayHoliday" : "friday";
  return isSchoolOff ? "weekdayHoliday" : "weekday";
}

function timeToMin(t) { if (!t) return 0; const [h, m] = t.split(":"); return +h * 60 + +m; }

function shiftsOverlap(shiftStart, shiftEnd, unavailStart, unavailEnd) {
  const ss = timeToMin(shiftStart), se = timeToMin(shiftEnd);
  const us = timeToMin(unavailStart), ue = timeToMin(unavailEnd);
  return ss < ue && us < se;
}

function isAvailable(emp, dateStr, shiftStart, shiftEnd, timeOffs) {
  const d = new Date(dateStr + "T12:00:00");
  const dayKey = DAYS[d.getDay() === 0 ? 6 : d.getDay() - 1];
  const u = emp.unavailability[dayKey];

  // Check all-day unavailability
  if (u.allDay) return false;

  // Check partial unavailability
  if (u.start && u.end) {
    if (shiftsOverlap(shiftStart, shiftEnd, u.start, u.end)) return false;
  }

  // Check time-off
  if (timeOffs.some(t => t.empId === emp.id && t.date === dateStr)) return false;

  return true;
}

// ── Auto-Generate Engine ──
function generateSchedule(weekDates, employees, rules, schoolDates, timeOffs) {
  const schedule = {};
  const empShiftCount = {};
  const empHours = {};
  const empDays = {}; // track which days each emp is assigned
  const warnings = [];
  const activeEmps = employees.filter(e => e.status === "active");

  activeEmps.forEach(e => { empShiftCount[e.id] = 0; empHours[e.id] = 0; empDays[e.id] = new Set(); });

  weekDates.forEach(dateStr => {
    schedule[dateStr] = [];
  });

  const getConstraint = id => {
    const c = rules.constraints.find(x => x.id === id);
    return c ? c.enabled : true;
  };

  // For each day, determine slots needed
  weekDates.forEach((dateStr, dayIndex) => {
    const dayType = getDayType(dateStr, schoolDates);
    const staffing = rules.staffing[dayType] || rules.staffing.weekday;
    const d = new Date(dateStr + "T12:00:00");
    const dow = d.getDay();
    const dayKey = DAYS[dow === 0 ? 6 : dow - 1];
    const isWeekend = dow === 0 || dow === 6;
    const isFriday = dow === 5;
    const isSunday = dow === 0;
    const isThursday = dow === 4;

    // Determine shift times based on day type
    const times = rules.shiftTimes;
    let dayShiftStart, dayShiftEnd, eveShiftStart, eveShiftEnd;

    if (isWeekend) {
      dayShiftStart = times.weekendDay.start;
      dayShiftEnd = times.weekendDay.end;
      eveShiftStart = times.weekendEvening.start;
      eveShiftEnd = times.weekendEvening.end;
    } else if (isFriday) {
      dayShiftStart = times.fridayDay.start;
      dayShiftEnd = times.fridayDay.end || times.weekdayDay.end;
      eveShiftStart = times.weekdayEvening.start;
      eveShiftEnd = times.weekdayEvening.end;
    } else {
      dayShiftStart = times.weekdayDay.start;
      dayShiftEnd = times.weekdayDay.end;
      eveShiftStart = times.weekdayEvening.start;
      eveShiftEnd = times.weekdayEvening.end;
    }

    const dayHours = (timeToMin(dayShiftEnd) - timeToMin(dayShiftStart)) / 60;
    const eveHours = (timeToMin(eveShiftEnd) - timeToMin(eveShiftStart)) / 60;

    const slots = [];

    // ── Build slot list ──
    // Day slots
    for (let i = 0; i < staffing.day; i++) {
      if (i === 0) {
        slots.push({ type: "day_lead", start: dayShiftStart, end: dayShiftEnd, hours: dayHours, slOnly: true });
      } else {
        slots.push({ type: "day", start: dayShiftStart, end: dayShiftEnd, hours: dayHours, slOnly: false });
      }
    }

    // Evening slots
    for (let i = 0; i < staffing.evening; i++) {
      if (i === 0) {
        slots.push({ type: "evening_sl", start: eveShiftStart, end: eveShiftEnd, hours: eveHours, slOnly: true });
      } else {
        slots.push({ type: "evening", start: eveShiftStart, end: eveShiftEnd, hours: eveHours, slOnly: false });
      }
    }

    // ── MC Night (Thursday or Sunday) ──
    const isMCDay = isThursday || isSunday;
    if (isMCDay) {
      // Replace last evening slot with MC leader + helper
      const mcStart = times.mcNight.start;
      const mcEnd = times.mcNight.end;
      const mcHours = (timeToMin(mcEnd) - timeToMin(mcStart)) / 60;

      // Add MC leader slot
      slots.push({ type: "mc_leader", start: mcStart, end: mcEnd, hours: mcHours, slOnly: true, isMC: true });
      // Add MC helper slot
      slots.push({ type: "mc_helper", start: mcStart, end: mcEnd, hours: mcHours, slOnly: false, isMC: true });
    }

    // ── Assign employees to slots ──
    const dayAssignments = [];

    const canAssign = (emp, slot) => {
      // Basic availability
      if (!isAvailable(emp, dateStr, slot.start, slot.end, timeOffs)) return false;

      // SL-only check
      if (slot.slOnly && emp.role !== "shift_lead") return false;

      // No doubles
      if (getConstraint("no_doubles") && empDays[emp.id].has(dateStr)) return false;

      // Max shifts check
      const roleConfig = emp.role === "shift_lead" ? rules.shiftLead : emp.role === "trainee" ? rules.trainee : rules.regular;
      const maxShifts = emp.maxShifts || roleConfig.shiftsPerWeek.max;
      if (empShiftCount[emp.id] >= maxShifts) return false;

      // Max hours check
      if (empHours[emp.id] + slot.hours > emp.maxHours) return false;

      // No weekday nights for tagged employees
      if (!isWeekend && !isFriday && emp.tags.includes("no_weekday_nights") && timeToMin(slot.start) >= timeToMin("17:00")) return false;

      return true;
    };

    // Sort slots: SL slots first, then regular
    const slSlots = slots.filter(s => s.slOnly);
    const regSlots = slots.filter(s => !s.slOnly);

    // Assign SL slots
    const shiftLeads = activeEmps.filter(e => e.role === "shift_lead");

    slSlots.forEach(slot => {
      let candidates = shiftLeads.filter(e => canAssign(e, slot));

      // MC leader: check fixed rules
      if (slot.type === "mc_leader") {
        if (isThursday) {
          // Thursday MC: Crystal & Zoe always
          const thuLeaders = rules.mcRotation.thursdayLeaders || [];
          const fixedCandidates = candidates.filter(e => thuLeaders.includes(e.name));
          if (fixedCandidates.length > 0) candidates = fixedCandidates;
        } else if (isSunday) {
          const sunPool = rules.mcRotation.sundayLeaderPool || [];
          const poolCandidates = candidates.filter(e => sunPool.includes(e.name));
          if (poolCandidates.length > 0) candidates = poolCandidates;
        }
      }

      // Sort by fewest shifts assigned so far (balance)
      candidates.sort((a, b) => empShiftCount[a.id] - empShiftCount[b.id]);

      if (candidates.length > 0) {
        const chosen = candidates[0];
        dayAssignments.push({ ...slot, empId: chosen.id, empName: chosen.name, empRole: chosen.role });
        empShiftCount[chosen.id]++;
        empHours[chosen.id] += slot.hours;
        empDays[chosen.id].add(dateStr);
      } else {
        dayAssignments.push({ ...slot, empId: null, empName: "⚠ UNFILLED", empRole: null });
        warnings.push({ date: dateStr, slot: slot.type, msg: `No available SL for ${slot.type}` });
      }
    });

    // Assign regular slots
    const assignedToday = new Set(dayAssignments.filter(a => a.empId).map(a => a.empId));

    regSlots.forEach(slot => {
      let candidates = activeEmps.filter(e => {
        if (assignedToday.has(e.id)) return false;
        return canAssign(e, slot);
      });

      // MC helper: prefer helper pool
      if (slot.type === "mc_helper") {
        const helperPool = rules.mcRotation.helperPool || [];
        const poolCandidates = candidates.filter(e => helperPool.includes(e.name));
        if (poolCandidates.length > 0) candidates = poolCandidates;
      }

      // 2nd Day: prefer priority list
      if (slot.type === "day") {
        const priorityList = rules.secondDayPriority || [];
        const priCandidates = candidates.filter(e => priorityList.includes(e.name));
        if (priCandidates.length > 0) candidates = priCandidates;
      }

      // Weekend: prefer good weekend people
      if (isWeekend && !slot.isMC) {
        const goodWeekend = rules.goodWeekendPeople || [];
        const wkCandidates = candidates.filter(e => goodWeekend.includes(e.name));
        if (wkCandidates.length > 0) candidates = wkCandidates;
      }

      // Prefer regulars over trainees
      const nonTrainees = candidates.filter(e => e.role !== "trainee");
      if (nonTrainees.length > 0) candidates = nonTrainees;

      // Prefer those with fewer shifts (balance)
      candidates.sort((a, b) => {
        const aMin = a.minShifts || 0;
        const bMin = b.minShifts || 0;
        const aBelow = empShiftCount[a.id] < aMin ? 1 : 0;
        const bBelow = empShiftCount[b.id] < bMin ? 1 : 0;
        if (bBelow !== aBelow) return bBelow - aBelow; // prioritize those below minimum
        return empShiftCount[a.id] - empShiftCount[b.id];
      });

      if (candidates.length > 0) {
        const chosen = candidates[0];
        dayAssignments.push({ ...slot, empId: chosen.id, empName: chosen.name, empRole: chosen.role });
        empShiftCount[chosen.id]++;
        empHours[chosen.id] += slot.hours;
        empDays[chosen.id].add(dateStr);
        assignedToday.add(chosen.id);
      } else {
        // Try trainees
        const trainees = activeEmps.filter(e => e.role === "trainee" && !assignedToday.has(e.id) && canAssign(e, slot));
        if (trainees.length > 0) {
          const chosen = trainees[0];
          dayAssignments.push({ ...slot, empId: chosen.id, empName: chosen.name, empRole: chosen.role });
          empShiftCount[chosen.id]++;
          empHours[chosen.id] += slot.hours;
          empDays[chosen.id].add(dateStr);
          assignedToday.add(chosen.id);
        } else {
          dayAssignments.push({ ...slot, empId: null, empName: "⚠ UNFILLED", empRole: null });
          warnings.push({ date: dateStr, slot: slot.type, msg: `No available employee for ${slot.type}` });
        }
      }
    });

    schedule[dateStr] = dayAssignments;
  });

  // Check for employees below minimum shifts
  activeEmps.forEach(e => {
    const roleConfig = e.role === "shift_lead" ? rules.shiftLead : e.role === "trainee" ? rules.trainee : rules.regular;
    const minShifts = e.minShifts || roleConfig.shiftsPerWeek.min;
    if (empShiftCount[e.id] < minShifts && e.role !== "trainee") {
      warnings.push({ date: "", slot: "", msg: `${e.name} has ${empShiftCount[e.id]} shifts (minimum: ${minShifts})` });
    }
  });

  return { schedule, empShiftCount, empHours, warnings };
}

// ── Schedule Tab Component ──
export function ScheduleTab({ employees, rules, schoolDates, timeOffs }) {
  const [weekStart, setWeekStart] = useState(() => {
    const now = new Date();
    const day = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1) + 7); // next monday
    return monday.toISOString().split("T")[0];
  });
  const [result, setResult] = useState(null);
  const [generating, setGenerating] = useState(false);

  const weekDates = getWeekDates(weekStart);

  const handleGenerate = () => {
    setGenerating(true);
    setTimeout(() => {
      const r = generateSchedule(weekDates, employees, rules, schoolDates, timeOffs);
      setResult(r);
      setGenerating(false);
    }, 300);
  };

  const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div style={{ padding: "18px 28px" }}>
      {/* Controls */}
      <div style={{ background: "#fff", borderRadius: 12, padding: 18, boxShadow: "0 1px 3px rgba(0,0,0,0.06)", marginBottom: 16, display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div>
          <label style={sl}>Week Starting (Monday)</label>
          <input type="date" value={weekStart} onChange={e => { setWeekStart(e.target.value); setResult(null); }} style={{ ...si, width: 170 }} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontSize: 11, color: "#6B7280" }}>
            {weekDates.map((d, i) => {
              const dt = new Date(d + "T12:00:00");
              return i === 0 || i === 6 ? `${dayLabels[i]} ${dt.getMonth() + 1}/${dt.getDate()}` : null;
            }).filter(Boolean).join(" → ")}
          </span>
          <div style={{ display: "flex", gap: 4 }}>
            {weekDates.map((d, i) => {
              const dayType = getDayType(d, schoolDates);
              const isHoliday = dayType.includes("Holiday") || dayType === "weekdayHoliday" || dayType === "fridayHoliday";
              return (
                <span key={d} style={{
                  padding: "2px 6px", borderRadius: 6, fontSize: 9, fontWeight: 600,
                  background: isHoliday ? "#FEE2E2" : "#F0FDF4",
                  color: isHoliday ? "#DC2626" : "#16A34A",
                }}>{dayLabels[i]}: {dayType}</span>
              );
            })}
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <button onClick={handleGenerate} disabled={generating} style={{
          padding: "10px 24px", borderRadius: 8, border: "none",
          background: generating ? "#9CA3AF" : "#111827", color: "#fff",
          cursor: generating ? "default" : "pointer", fontSize: 13, fontWeight: 700, fontFamily: font,
        }}>
          {generating ? "Generating..." : result ? "🔄 Regenerate" : "⚡ Auto-Generate Schedule"}
        </button>
      </div>

      {!result && !generating && (
        <div style={{ textAlign: "center", padding: 60, color: "#9CA3AF" }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>📋</div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Select a week and click Generate</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>The engine will auto-assign shifts based on your rules, availability, and school calendar.</div>
        </div>
      )}

      {result && (
        <>
          {/* Warnings */}
          {result.warnings.length > 0 && (
            <div style={{ background: "#FEF3C7", borderRadius: 12, padding: 14, marginBottom: 16, border: "1px solid #FDE68A" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#92400E", marginBottom: 6 }}>⚠ Warnings ({result.warnings.length})</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {result.warnings.map((w, i) => (
                  <div key={i} style={{ fontSize: 12, color: "#92400E" }}>
                    {w.date && <span style={{ fontWeight: 600 }}>{new Date(w.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} — </span>}
                    {w.msg}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Schedule Grid */}
          <div style={{ overflowX: "auto", background: "#fff", borderRadius: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 900 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #E5E7EB" }}>
                  <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 700, color: "#6B7280", fontSize: 10, width: 90 }}>SHIFT</th>
                  {weekDates.map((d, i) => {
                    const dt = new Date(d + "T12:00:00");
                    const dayType = getDayType(d, schoolDates);
                    const isHoliday = dayType.includes("Holiday") || dayType === "weekdayHoliday" || dayType === "fridayHoliday";
                    return (
                      <th key={d} style={{
                        padding: "10px 8px", textAlign: "center", fontWeight: 700, fontSize: 10.5,
                        color: isHoliday ? "#DC2626" : "#374151",
                        background: isHoliday ? "#FEF2F2" : "transparent",
                      }}>
                        <div>{dayLabels[i]}</div>
                        <div style={{ fontSize: 9, fontWeight: 500, color: "#9CA3AF" }}>{dt.getMonth() + 1}/{dt.getDate()}</div>
                        {isHoliday && <div style={{ fontSize: 8, color: "#DC2626", fontWeight: 700 }}>HOLIDAY</div>}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {(() => {
                  // Get all unique slot types across the week
                  const allSlotTypes = new Set();
                  weekDates.forEach(d => {
                    (result.schedule[d] || []).forEach(a => allSlotTypes.add(a.type));
                  });

                  const typeOrder = ["day_lead", "day", "evening_sl", "evening", "mc_leader", "mc_helper"];
                  const sortedTypes = [...allSlotTypes].sort((a, b) => typeOrder.indexOf(a) - typeOrder.indexOf(b));

                  // For each type, find max count across days
                  const rows = [];
                  sortedTypes.forEach(type => {
                    const maxCount = Math.max(...weekDates.map(d => (result.schedule[d] || []).filter(a => a.type === type).length));
                    for (let idx = 0; idx < maxCount; idx++) {
                      rows.push({ type, idx });
                    }
                  });

                  return rows.map((row, ri) => {
                    const st = SHIFT_TYPES.find(s => s.id === row.type);
                    return (
                      <tr key={`${row.type}-${row.idx}`} style={{ borderBottom: "1px solid #F3F4F6" }}>
                        {row.idx === 0 ? (
                          <td style={{
                            padding: "8px 10px", fontWeight: 700, fontSize: 10, color: st?.color || "#374151",
                            background: st?.bg || "transparent", whiteSpace: "nowrap", verticalAlign: "top",
                          }}>
                            {st?.label || row.type}
                          </td>
                        ) : <td style={{ background: st?.bg || "transparent" }} />}
                        {weekDates.map(d => {
                          const dayAssignments = (result.schedule[d] || []).filter(a => a.type === row.type);
                          const assignment = dayAssignments[row.idx];
                          if (!assignment) return <td key={d} style={{ padding: "8px 6px", textAlign: "center", color: "#E5E7EB" }}>—</td>;

                          const unfilled = !assignment.empId;
                          const isTrainee = assignment.empRole === "trainee";

                          return (
                            <td key={d} style={{
                              padding: "6px 6px", textAlign: "center",
                              background: unfilled ? "#FEE2E2" : "transparent",
                            }}>
                              <div style={{
                                padding: "4px 6px", borderRadius: 6, fontSize: 11, fontWeight: 600,
                                color: unfilled ? "#DC2626" : isTrainee ? "#7C3AED" : "#374151",
                                background: unfilled ? "#FEE2E2" : isTrainee ? "#EDE9FE" : "#F9FAFB",
                                border: unfilled ? "1px dashed #FCA5A5" : "1px solid #E5E7EB",
                              }}>
                                {assignment.empName.split(" ")[0]}
                              </div>
                              <div style={{ fontSize: 8.5, color: "#9CA3AF", marginTop: 2 }}>
                                {fmtTime(assignment.start)}–{fmtTime(assignment.end)}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>

          {/* Employee Summary */}
          <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>
            {employees.filter(e => e.status === "active").sort((a, b) => {
              const order = { shift_lead: 0, regular: 1, trainee: 2 };
              return (order[a.role] || 3) - (order[b.role] || 3);
            }).map(emp => {
              const shifts = result.empShiftCount[emp.id] || 0;
              const hours = result.empHours[emp.id] || 0;
              const roleConfig = emp.role === "shift_lead" ? rules.shiftLead : emp.role === "trainee" ? rules.trainee : rules.regular;
              const minShifts = emp.minShifts || roleConfig.shiftsPerWeek.min;
              const belowMin = shifts < minShifts && emp.role !== "trainee";
              const roleColors = { shift_lead: "#F59E0B", regular: "#3B82F6", trainee: "#8B5CF6" };

              return (
                <div key={emp.id} style={{
                  padding: "10px 12px", borderRadius: 8, background: "#fff",
                  border: belowMin ? "2px solid #FCA5A5" : "1px solid #E5E7EB",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>{emp.name}</span>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: roleColors[emp.role] }} />
                  </div>
                  <div style={{ display: "flex", gap: 12, marginTop: 4, fontSize: 11 }}>
                    <span style={{ color: belowMin ? "#DC2626" : "#6B7280", fontWeight: belowMin ? 700 : 500 }}>
                      {shifts} shifts {belowMin && `(min: ${minShifts})`}
                    </span>
                    <span style={{ color: "#6B7280" }}>{hours.toFixed(1)}h</span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
