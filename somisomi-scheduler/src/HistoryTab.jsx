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
      if (!slot.isMC || !slot.empId) return;
      const emp = employees.find(e => e.id === slot.empId);
      const name = emp?.name || slot.empName || "Unknown";
      if (dow === 4) { // Thu
        if (slot.type === "mc_leader") mc.thu.leader = name;
        else mc.thu.helpers.push(name);
      }
      if (dow === 0) { // Sun
        if (slot.type === "mc_leader") mc.sun.leader = name;
        else if (slot.type === "mc_sl_helper") mc.sun.slHelper = name;
        else mc.sun.helpers.push(name);
      }
    });
  });

  // Find SLs and determine who had the "break" (fewest shifts or 0 shifts)
  const slEmps = employees.filter(e => e.role === "shift_lead" && e.status === "active");
  const slBreak = slEmps
    .map(e => ({ name: e.name, shifts: empShifts[e.id] || 0, hours: empHours[e.id] || 0 }))
    .sort((a, b) => a.shifts - b.shifts);
  const breakSL = slBreak.length > 0 && slBreak[0].shifts < 4 ? slBreak[0].name : null;

  return { mc, empHours, empShifts, breakSL, slBreak };
}

export function HistoryTab({ employees, savedSchedules, rules }) {
  const [expandedWeek, setExpandedWeek] = useState(null);
  if (!employees || !savedSchedules || !rules) return <div style={{ padding: 40, textAlign: "center", color: "#9CA3AF" }}>Loading...</div>;

  const weeks = Object.entries(savedSchedules || {})
    .map(([key, data]) => ({ key, ...data }))
    .sort((a, b) => b.key.localeCompare(a.key));

  // Build MC rotation frequency across all saved weeks
  const mcFreq = {};
  weeks.forEach(w => {
    const info = extractMCInfo(w, employees);
    [...info.mc.thu.helpers, ...info.mc.sun.helpers].forEach(name => {
      mcFreq[name] = (mcFreq[name] || 0) + 1;
    });
  });

  // Trainee progress (active only)
  const trainees = employees.filter(e => e.status === "active" && (e.role === "trainee" || (e.traineeCumulative && e.traineeCumulative > 0 && e.role !== "shift_lead")));
  const graduationHours = rules?.trainee?.graduationHours || 30;

  return (
    <div style={{ padding: "24px 32px", maxWidth: 960, margin: "0 auto" }}>

      {/* MC Rotation Summary */}
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 16, fontWeight: 800, color: "#4A3F2F", marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 20 }}>{"\ud83e\uddf9"}</span> MC Rotation Tracker
        </h2>
        <p style={{ fontSize: 11, color: "#9CA3AF", margin: "0 0 16px" }}>Tracks who machine cleaned each week so everyone rotates fairly.</p>

        {weeks.length > 0 ? (
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #E5E7EB", overflow: "hidden" }}>
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
                  return (
                    <tr key={w.key} style={{ borderBottom: "1px solid #F3F4F6" }}>
                      <td style={{ padding: "10px 14px", fontWeight: 600, color: "#374151" }}>{formatWeek(w.key)}</td>
                      <td style={{ padding: "10px 14px" }}>
                        <span style={{ fontWeight: 700, color: "#7C3AED" }}>{info.mc.thu.leader || "—"}</span>
                        {info.mc.thu.helpers.length > 0 && (
                          <span style={{ color: "#9CA3AF" }}> + {info.mc.thu.helpers.join(", ")}</span>
                        )}
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        <span style={{ fontWeight: 700, color: "#2563EB" }}>{info.mc.sun.leader || "—"}</span>
                        {info.mc.sun.slHelper && <span style={{ color: "#F59E0B" }}> + {info.mc.sun.slHelper}</span>}
                        {info.mc.sun.helpers.length > 0 && (
                          <span style={{ color: "#9CA3AF" }}> + {info.mc.sun.helpers.join(", ")}</span>
                        )}
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        {info.breakSL ? (
                          <span style={{ fontWeight: 600, color: "#DC2626", background: "#FEF2F2", padding: "2px 8px", borderRadius: 6, fontSize: 11 }}>{info.breakSL}</span>
                        ) : <span style={{ color: "#9CA3AF" }}>None</span>}
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

      {/* MC Helper Frequency */}
      {Object.keys(mcFreq).length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "#4A3F2F", marginBottom: 12 }}>MC Helper Frequency (regulars)</h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {Object.entries(mcFreq).sort((a, b) => b[1] - a[1]).map(([name, count]) => (
              <div key={name} style={{
                padding: "8px 14px", borderRadius: 8, background: count > 2 ? "#FEF2F2" : "#F0FDF4",
                border: `1px solid ${count > 2 ? "#FECACA" : "#BBF7D0"}`, fontSize: 12,
              }}>
                <span style={{ fontWeight: 600, color: "#374151" }}>{name}</span>
                <span style={{ marginLeft: 6, fontWeight: 800, color: count > 2 ? "#DC2626" : "#16A34A" }}>{count}×</span>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 6 }}>Red = done MC 3+ times. Prioritize others next.</div>
        </div>
      )}

      {/* Trainee Progress */}
      {trainees.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: "#4A3F2F", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 20 }}>{"\ud83c\udf93"}</span> Trainee Progress
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
                    {graduated ? (
                      <span style={{ fontSize: 10, fontWeight: 700, background: "#16A34A", color: "#fff", padding: "2px 8px", borderRadius: 10 }}>{"\u2713"} GRADUATED</span>
                    ) : (
                      <span style={{ fontSize: 10, fontWeight: 600, color: "#6B7280" }}>{Math.max(0, graduationHours - cum).toFixed(1)}h left</span>
                    )}
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

      {/* Weekly Detail (expandable) */}
      {weeks.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: "#4A3F2F", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 20 }}>{"\ud83d\udccb"}</span> Saved Weeks ({weeks.length})
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
                  <div onClick={() => setExpandedWeek(isExp ? null : w.key)} style={{
                    padding: "14px 20px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center",
                    background: isExp ? "#FEFCE8" : "transparent",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span style={{ fontSize: 16, transform: isExp ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>{"\u25b6"}</span>
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

      {/* Summary */}
      {weeks.length > 0 && (
        <div style={{ background: "#F9FAFB", borderRadius: 12, padding: 20, border: "1px solid #E5E7EB" }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: "#4A3F2F", marginBottom: 12 }}>{"\ud83d\udcca"} Summary</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, textAlign: "center" }}>
            <div>
              <div style={{ fontSize: 24, fontWeight: 800, color: "#4A3F2F" }}>{weeks.length}</div>
              <div style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600 }}>Weeks Saved</div>
            </div>
            <div>
              <div style={{ fontSize: 24, fontWeight: 800, color: "#4A3F2F" }}>
                {trainees.filter(e => (e.traineeCumulative || 0) >= graduationHours).length}
              </div>
              <div style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600 }}>Graduated</div>
            </div>
            <div>
              <div style={{ fontSize: 24, fontWeight: 800, color: "#4A3F2F" }}>
                {trainees.filter(e => e.role === "trainee").length}
              </div>
              <div style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600 }}>In Training</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
