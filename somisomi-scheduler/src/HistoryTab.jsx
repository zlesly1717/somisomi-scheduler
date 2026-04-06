import { useState } from "react";
import { ROLE_CONFIG } from "./constants";

const font = "'DM Sans',sans-serif";

function formatWeek(key) {
  try {
    const d = new Date(key + "T12:00:00");
    const end = new Date(d); end.setDate(d.getDate() + 6);
    const f = dt => dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return `${f(d)} – ${f(end)}`;
  } catch { return key; }
}

function extractMCInfo(weekData, employees) {
  const schedule = weekData.schedule || weekData;
  const mc = { thu: { leader: null, helpers: [] }, sun: { leader: null, slHelper: null, helpers: [] } };
  const empHours = {};
  const empShifts = {};

  Object.entries(schedule).forEach(([dateStr, slots]) => {
    if (!Array.isArray(slots) || slots.length === 0) return;
    const dow = new Date(dateStr + "T12:00:00").getDay();
    slots.forEach(slot => {
      if (slot.empId) {
        empHours[slot.empId] = (empHours[slot.empId] || 0) + (slot.hours || 0);
        empShifts[slot.empId] = (empShifts[slot.empId] || 0) + 1;
      }
      if (!slot.isMC) return;
      // Skip slots explicitly removed (empId and empName both null)
      if (!slot.empId && !slot.empName) return;
      const emp = employees.find(e => e.id === slot.empId);
      const name = emp?.name || slot.empName || null;
      if (!name) return;
      if (dow === 4) {
        if (slot.type === "mc_leader") mc.thu.leader = name;
        else mc.thu.helpers.push(name);
      }
      if (dow === 0) {
        if (slot.type === "mc_leader") mc.sun.leader = name;
        else if (slot.type === "mc_sl_helper") mc.sun.slHelper = name;
        else mc.sun.helpers.push(name);
      }
    });
  });

  if (weekData.breakSL !== undefined) {
    return { mc, empHours, empShifts, breakSL: weekData.breakSL, slBreak: [] };
  }
  const slEmps = employees.filter(e => e.role === "shift_lead" && e.status === "active");
  const slBreak = slEmps
    .map(e => ({ name: e.name, shifts: empShifts[e.id] || 0, hours: empHours[e.id] || 0 }))
    .sort((a, b) => a.shifts - b.shifts);
  const breakSL = slBreak.length > 0 && slBreak[0].shifts < 4 ? slBreak[0].name : null;
  return { mc, empHours, empShifts, breakSL, slBreak };
}

// Edit a person in the saved schedule's MC slots for a given week
function editMCInSchedule(weekData, employees, day, oldName, newName) {
  const schedule = { ...(weekData.schedule || {}) };
  const targetDow = day === "thu" ? 4 : 0;
  Object.keys(schedule).forEach(dateStr => {
    const dow = new Date(dateStr + "T12:00:00").getDay();
    if (dow !== targetDow) return;
    schedule[dateStr] = schedule[dateStr].map(slot => {
      if (!slot.isMC) return slot;
      const slotName = slot.empName || employees.find(e => e.id === slot.empId)?.name;
      if (slotName !== oldName) return slot;
      if (newName === null) {
        return { ...slot, empId: null, empName: null, empRole: null };
      }
      const newEmp = employees.find(e => e.name === newName);
      return { ...slot, empId: newEmp?.id || slot.empId, empName: newName, empRole: newEmp?.role || slot.empRole };
    });
  });
  return { ...weekData, schedule };
}

// Promote a helper to MC lead — swaps slot types with the current leader (or takes over if leader is empty)
function promoteToLeader(weekData, employees, day, newLeaderName) {
  const schedule = { ...(weekData.schedule || {}) };
  const targetDow = day === "thu" ? 4 : 0;
  Object.keys(schedule).forEach(dateStr => {
    const dow = new Date(dateStr + "T12:00:00").getDay();
    if (dow !== targetDow) return;
    const slots = [...schedule[dateStr]];

    // Find the mc_leader slot and the new leader's current slot
    const leaderIdx = slots.findIndex(s => s.isMC && s.type === "mc_leader");
    const helperIdx = slots.findIndex(s => {
      if (!s.isMC) return false;
      const name = s.empName || employees.find(e => e.id === s.empId)?.name;
      return name === newLeaderName;
    });

    if (helperIdx === -1) return;

    if (leaderIdx === -1) {
      // No leader slot exists — just change this slot's type to mc_leader
      slots[helperIdx] = { ...slots[helperIdx], type: "mc_leader", label: "MC Lead", slOnly: true };
    } else {
      const leaderSlot = slots[leaderIdx];
      const helperSlot = slots[helperIdx];
      const leaderIsEmpty = !leaderSlot.empId && !leaderSlot.empName;

      if (leaderIsEmpty) {
        // Leader slot is empty — move new leader into it, clear their old slot
        slots[leaderIdx] = { ...leaderSlot, empId: helperSlot.empId, empName: helperSlot.empName, empRole: helperSlot.empRole };
        slots[helperIdx] = { ...helperSlot, empId: null, empName: null, empRole: null };
      } else {
        // Swap people between leader and helper slots
        slots[leaderIdx] = { ...leaderSlot, empId: helperSlot.empId, empName: helperSlot.empName, empRole: helperSlot.empRole };
        slots[helperIdx] = { ...helperSlot, empId: leaderSlot.empId, empName: leaderSlot.empName, empRole: leaderSlot.empRole };
      }
    }
    schedule[dateStr] = slots;
  });
  return { ...weekData, schedule };
}

export function HistoryTab({ employees, savedSchedules, setSavedSchedules, rules }) {
  const [expandedWeek, setExpandedWeek] = useState(null);
  const [editingMC, setEditingMC] = useState(null); // { weekKey, day, name, role }
  const [swapTarget, setSwapTarget] = useState(null); // name to swap with

  if (!employees || !savedSchedules || !rules) return <div style={{ padding: 40, textAlign: "center", color: "#9CA3AF" }}>Loading...</div>;

  const weeks = Object.entries(savedSchedules || {})
    .map(([key, data]) => ({ key, ...data }))
    .sort((a, b) => b.key.localeCompare(a.key));

  const trainees = employees.filter(e => e.status === "active" && e.role === "trainee");
  const graduationHours = rules?.trainee?.graduationHours || 30;
  const activeSLs = employees.filter(e => e.status === "active" && e.role === "shift_lead");
  const activeAll = employees.filter(e => e.status === "active");

  const handleRemove = (weekKey, day, name) => {
    const updated = editMCInSchedule(savedSchedules[weekKey], employees, day, name, null);
    setSavedSchedules(prev => ({ ...prev, [weekKey]: updated }));
    setEditingMC(null);
  };

  const handleSwap = (weekKey, day, oldName, newName) => {
    const updated = editMCInSchedule(savedSchedules[weekKey], employees, day, oldName, newName);
    setSavedSchedules(prev => ({ ...prev, [weekKey]: updated }));
    setEditingMC(null);
  };

  const handlePromote = (weekKey, day, name) => {
    const updated = promoteToLeader(savedSchedules[weekKey], employees, day, name);
    setSavedSchedules(prev => ({ ...prev, [weekKey]: updated }));
    setEditingMC(null);
  };

  const MCTag = ({ name, role, weekKey, day, editable }) => {
    const isLeader = role === "leader";
    const isSLHelper = role === "slhelper";
    const isEditing = editingMC?.weekKey === weekKey && editingMC?.day === day && editingMC?.name === name;

    return (
      <div style={{ position: "relative", display: "inline-block" }}>
        <span
          onClick={editable ? () => setEditingMC(isEditing ? null : { weekKey, day, name, role }) : undefined}
          style={{
            fontSize: 11, fontWeight: isLeader ? 700 : 500,
            padding: "2px 8px", borderRadius: 6, cursor: editable ? "pointer" : "default",
            background: isEditing ? "#FEF9C3" : isLeader ? "#EDE9FE" : isSLHelper ? "#FEF3C7" : "#F3F4F6",
            color: isLeader ? "#7C3AED" : isSLHelper ? "#B45309" : "#374151",
            border: isEditing ? "2px solid #F59E0B" : isLeader ? "1px solid #DDD6FE" : isSLHelper ? "1px solid #FDE68A" : "1px solid #E5E7EB",
            userSelect: "none",
          }}>
          {isLeader ? "★ " : ""}{name}
          {editable && <span style={{ marginLeft: 4, fontSize: 9, color: "#9CA3AF" }}>✏️</span>}
        </span>

        {isEditing && (
          <div style={{
            position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 100,
            background: "#fff", borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
            padding: 12, minWidth: 220, border: "1px solid #E5E7EB",
          }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#4A3F2F", marginBottom: 8 }}>Edit: {name}</div>

            {/* Promote to leader — show for any non-leader */}
            {!isLeader && (
              <button onClick={() => handlePromote(weekKey, day, name)}
                style={{ width: "100%", padding: "7px 10px", borderRadius: 7, border: "1px solid #DDD6FE", background: "#EDE9FE", color: "#7C3AED", cursor: "pointer", fontSize: 11, fontWeight: 600, marginBottom: 6, fontFamily: font, textAlign: "left" }}>
                ★ Make MC Lead
              </button>
            )}

            {/* Remove option */}
            <button onClick={() => handleRemove(weekKey, day, name)}
              style={{ width: "100%", padding: "7px 10px", borderRadius: 7, border: "1px solid #FECACA", background: "#FEF2F2", color: "#DC2626", cursor: "pointer", fontSize: 11, fontWeight: 600, marginBottom: 6, fontFamily: font, textAlign: "left" }}>
              ✕ Remove (owner covered / no credit)
            </button>

            {/* Swap options */}
            <div style={{ fontSize: 10, fontWeight: 700, color: "#6B7280", marginBottom: 4 }}>Swap with someone else:</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 3, maxHeight: 160, overflowY: "auto" }}>
              {activeAll.filter(e => e.name !== name && e.role !== "trainee").map(e => (
                <button key={e.id} onClick={() => handleSwap(weekKey, day, name, e.name)}
                  style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #E5E7EB", background: "#F9FAFB", color: "#374151", cursor: "pointer", fontSize: 11, fontWeight: 500, fontFamily: font, textAlign: "left" }}>
                  ⇄ {e.name} <span style={{ fontSize: 9, color: "#9CA3AF" }}>({e.role === "shift_lead" ? "SL" : "reg"})</span>
                </button>
              ))}
            </div>

            <button onClick={() => setEditingMC(null)}
              style={{ width: "100%", marginTop: 8, padding: "5px", borderRadius: 6, border: "1px solid #E5E7EB", background: "#fff", color: "#9CA3AF", cursor: "pointer", fontSize: 10, fontFamily: font }}>
              Cancel
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ padding: "24px 32px", maxWidth: 960, margin: "0 auto" }} onClick={() => setEditingMC(null)}>

      {/* MC Rotation Tracker */}
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 16, fontWeight: 800, color: "#4A3F2F", marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 20 }}>🧹</span> MC Rotation Tracker
        </h2>
        <p style={{ fontSize: 11, color: "#9CA3AF", margin: "0 0 4px" }}>Tracks who machine cleaned each week so everyone rotates fairly.</p>
        <p style={{ fontSize: 11, color: "#F59E0B", margin: "0 0 16px" }}>✏️ Click any name to edit — remove if owner covered, or swap if SLs switched.</p>

        {weeks.length > 0 ? (
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #E5E7EB", overflow: "visible" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#F9FAFB", borderBottom: "2px solid #E5E7EB" }}>
                  <th style={{ textAlign: "left", padding: "10px 14px", fontWeight: 700, color: "#6B7280", fontSize: 10, textTransform: "uppercase" }}>Week</th>
                  <th style={{ textAlign: "left", padding: "10px 14px", fontWeight: 700, color: "#7C3AED", fontSize: 10, textTransform: "uppercase" }}>Thu MC</th>
                  <th style={{ textAlign: "left", padding: "10px 14px", fontWeight: 700, color: "#2563EB", fontSize: 10, textTransform: "uppercase" }}>Sun MC</th>
                  <th style={{ textAlign: "left", padding: "10px 14px", fontWeight: 700, color: "#DC2626", fontSize: 10, textTransform: "uppercase" }}>SL Break</th>
                </tr>
              </thead>
              <tbody>
                {weeks.map(w => {
                  const info = extractMCInfo(w, employees);
                  const thuAll = [
                    info.mc.thu.leader ? { name: info.mc.thu.leader, role: "leader" } : null,
                    ...info.mc.thu.helpers.map(n => ({ name: n, role: "helper" })),
                  ].filter(Boolean);
                  const sunAll = [
                    info.mc.sun.leader ? { name: info.mc.sun.leader, role: "leader" } : null,
                    info.mc.sun.slHelper ? { name: info.mc.sun.slHelper, role: "slhelper" } : null,
                    ...info.mc.sun.helpers.map(n => ({ name: n, role: "helper" })),
                  ].filter(Boolean);

                  // Is this week editable? (has a real schedule with MC slots)
                  const hasRealSchedule = !!w.schedule;

                  const mcedNames = new Set([
                    info.mc.thu.leader, info.mc.sun.leader, info.mc.sun.slHelper,
                    ...info.mc.thu.helpers, ...info.mc.sun.helpers,
                  ].filter(Boolean));
                  const didntMC = activeSLs.filter(e => !mcedNames.has(e.name));

                  return (
                    <tr key={w.key} style={{ borderBottom: "1px solid #F3F4F6" }} onClick={e => e.stopPropagation()}>
                      <td style={{ padding: "10px 14px", fontWeight: 600, color: "#374151", whiteSpace: "nowrap", verticalAlign: "top" }}>
                        {formatWeek(w.key)}
                      </td>
                      <td style={{ padding: "10px 14px", verticalAlign: "top" }}>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                          {thuAll.length > 0 ? thuAll.map((p, i) => (
                            <MCTag key={i} name={p.name} role={p.role} weekKey={w.key} day="thu" editable={hasRealSchedule} />
                          )) : <span style={{ color: "#9CA3AF", fontSize: 11 }}>—</span>}
                        </div>
                      </td>
                      <td style={{ padding: "10px 14px", verticalAlign: "top" }}>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                          {sunAll.length > 0 ? sunAll.map((p, i) => (
                            <MCTag key={i} name={p.name} role={p.role} weekKey={w.key} day="sun" editable={hasRealSchedule} />
                          )) : <span style={{ color: "#9CA3AF", fontSize: 11 }}>—</span>}
                        </div>
                      </td>
                      <td style={{ padding: "10px 14px", verticalAlign: "top" }}>
                        {didntMC.length === 0
                          ? <span style={{ color: "#D1D5DB", fontSize: 11 }}>—</span>
                          : didntMC.map(e => (
                            <span key={e.id} style={{ fontWeight: 600, color: "#DC2626", background: "#FEF2F2", padding: "2px 8px", borderRadius: 6, fontSize: 11, marginRight: 4, display: "inline-block" }}>{e.name}</span>
                          ))
                        }
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: 40, textAlign: "center", color: "#9CA3AF", fontSize: 13 }}>
            No saved schedules yet. Save a schedule to start tracking MC rotation.
          </div>
        )}
      </div>

      {/* Trainee Progress */}
      {trainees.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: "#4A3F2F", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 20 }}>🎓</span> Trainee Progress
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
            {trainees.map(emp => {
              const cum = emp.traineeCumulative || 0;
              const pct = Math.min(100, (cum / graduationHours) * 100);
              const graduated = cum >= graduationHours;
              return (
                <div key={emp.id} style={{ background: graduated ? "#F0FDF4" : "#fff", border: `1px solid ${graduated ? "#BBF7D0" : "#E5E7EB"}`, borderRadius: 12, padding: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: "#374151" }}>{emp.name}</div>
                    {graduated
                      ? <span style={{ fontSize: 10, fontWeight: 700, background: "#16A34A", color: "#fff", padding: "2px 8px", borderRadius: 10 }}>✓ GRADUATED</span>
                      : <span style={{ fontSize: 10, fontWeight: 600, color: "#6B7280" }}>{Math.max(0, graduationHours - cum).toFixed(1)}h left</span>
                    }
                  </div>
                  <div style={{ background: "#F3F4F6", borderRadius: 6, height: 10, overflow: "hidden", marginBottom: 6 }}>
                    <div style={{ width: `${pct}%`, height: "100%", borderRadius: 6, background: graduated ? "#16A34A" : pct > 66 ? "#F59E0B" : "#3B82F6" }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#9CA3AF" }}>
                    <span>{cum.toFixed(1)}h completed</span><span>{graduationHours}h goal</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Weekly Detail */}
      {weeks.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: "#4A3F2F", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 20 }}>📋</span> Saved Weeks ({weeks.length})
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {weeks.map(w => {
              const isExp = expandedWeek === w.key;
              const info = extractMCInfo(w, employees);
              const totalH = Object.values(info.empHours).reduce((a, b) => a + b, 0);
              const empCount = Object.keys(info.empHours).length;
              const saved = w.savedAt ? new Date(w.savedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";
              return (
                <div key={w.key} style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, overflow: "hidden" }}>
                  <div onClick={() => setExpandedWeek(isExp ? null : w.key)} style={{ padding: "14px 20px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", background: isExp ? "#FEFCE8" : "transparent" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span style={{ fontSize: 14, transform: isExp ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.2s", display: "inline-block" }}>▶</span>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13, color: "#374151" }}>Week of {formatWeek(w.key)}</div>
                        <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 2 }}>
                          {empCount} employees · {totalH.toFixed(0)}h total{saved && ` · Saved ${saved}`}
                        </div>
                      </div>
                    </div>
                  </div>
                  {isExp && (
                    <div style={{ padding: "0 20px 16px", borderTop: "1px solid #F3F4F6" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12, fontSize: 12 }}>
                        <thead>
                          <tr style={{ borderBottom: "2px solid #E5E7EB" }}>
                            <th style={{ textAlign: "left", padding: "6px 8px", fontWeight: 700, color: "#6B7280", fontSize: 10, textTransform: "uppercase" }}>Employee</th>
                            <th style={{ textAlign: "right", padding: "6px 8px", fontWeight: 700, color: "#6B7280", fontSize: 10, textTransform: "uppercase" }}>Shifts</th>
                            <th style={{ textAlign: "right", padding: "6px 8px", fontWeight: 700, color: "#6B7280", fontSize: 10, textTransform: "uppercase" }}>Hours</th>
                          </tr>
                        </thead>
                        <tbody>
                          {employees.filter(e => info.empHours[e.id]).sort((a, b) => (info.empHours[b.id] || 0) - (info.empHours[a.id] || 0)).map(emp => (
                            <tr key={emp.id} style={{ borderBottom: "1px solid #F3F4F6" }}>
                              <td style={{ padding: "6px 8px", fontWeight: 600, color: "#374151" }}>
                                {emp.name}
                                <span style={{ marginLeft: 6, fontSize: 9, color: "#9CA3AF" }}>{ROLE_CONFIG[emp.role]?.label}</span>
                              </td>
                              <td style={{ padding: "6px 8px", textAlign: "right", color: "#6B7280" }}>{info.empShifts[emp.id] || 0}</td>
                              <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700, color: "#374151" }}>{(info.empHours[emp.id] || 0).toFixed(1)}h</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
