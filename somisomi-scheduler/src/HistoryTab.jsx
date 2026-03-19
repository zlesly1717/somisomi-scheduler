import { useState } from "react";
import { DAYS, fmtTime, ROLE_CONFIG } from "./constants";

const font = "'DM Sans',sans-serif";

function calcSlotHours(start, end) {
  if (!start || !end) return 0;
  const tm = t => { const [h, m] = t.split(":"); return +h * 60 + +m; };
  return (tm(end) - tm(start)) / 60;
}

export function HistoryTab({ employees, savedSchedules, rules }) {
  const [expandedWeek, setExpandedWeek] = useState(null);
  const graduationHours = rules?.trainee?.graduationHours || 30;

  // Sort saved weeks newest first
  const weeks = Object.entries(savedSchedules || {})
    .map(([key, data]) => ({ key, ...data }))
    .sort((a, b) => b.key.localeCompare(a.key));

  // Calculate per-employee hours for a saved week
  const getWeekHours = (weekData) => {
    const hours = {};
    const schedule = weekData.schedule || weekData;
    Object.values(schedule).forEach(daySlots => {
      if (!Array.isArray(daySlots)) return;
      daySlots.forEach(slot => {
        if (slot.empId && slot.hours) {
          hours[slot.empId] = (hours[slot.empId] || 0) + slot.hours;
        }
      });
    });
    return hours;
  };

  // Get all trainees (current + graduated)
  const trainees = employees.filter(e => e.status === "active" &&
    e.role === "trainee" || (e.traineeCumulative && e.traineeCumulative > 0)
  );

  // Format week key to readable date range
  const formatWeekLabel = (key) => {
    try {
      const d = new Date(key + "T12:00:00");
      const end = new Date(d);
      end.setDate(d.getDate() + 6);
      const fmt = dt => dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      return `${fmt(d)} – ${fmt(end)}`;
    } catch { return key; }
  };

  return (
    <div style={{ padding: "24px 32px", maxWidth: 900, margin: "0 auto" }}>
      {/* Trainee Progress Section */}
      <div style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 16, fontWeight: 800, color: "#4A3F2F", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 20 }}>🎓</span> Trainee Progress
        </h2>
        {trainees.length === 0 ? (
          <div style={{ color: "#9CA3AF", fontSize: 13, padding: 16 }}>No trainees to track.</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
            {trainees.map(emp => {
              const cumulative = emp.traineeCumulative || 0;
              const pct = Math.min(100, (cumulative / graduationHours) * 100);
              const graduated = cumulative >= graduationHours;
              const remaining = Math.max(0, graduationHours - cumulative);

              return (
                <div key={emp.id} style={{
                  background: graduated ? "#F0FDF4" : "#fff",
                  border: `1px solid ${graduated ? "#BBF7D0" : "#E5E7EB"}`,
                  borderRadius: 12, padding: 16,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: "#374151" }}>{emp.name}</div>
                    {graduated ? (
                      <span style={{ fontSize: 10, fontWeight: 700, background: "#16A34A", color: "#fff", padding: "2px 8px", borderRadius: 10 }}>GRADUATED ✓</span>
                    ) : (
                      <span style={{ fontSize: 10, fontWeight: 600, color: "#6B7280" }}>{remaining.toFixed(1)}h left</span>
                    )}
                  </div>
                  {/* Progress bar */}
                  <div style={{ background: "#F3F4F6", borderRadius: 6, height: 10, overflow: "hidden", marginBottom: 6 }}>
                    <div style={{
                      width: `${pct}%`, height: "100%", borderRadius: 6,
                      background: graduated ? "#16A34A" : pct > 66 ? "#F59E0B" : "#3B82F6",
                      transition: "width 0.3s ease",
                    }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#9CA3AF" }}>
                    <span>{cumulative.toFixed(1)}h completed</span>
                    <span>{graduationHours}h goal</span>
                  </div>
                  {emp.role !== "trainee" && graduated && (
                    <div style={{ fontSize: 10, color: "#16A34A", fontWeight: 600, marginTop: 4 }}>
                      Promoted to {emp.role === "shift_lead" ? "Shift Lead" : "Regular"}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Saved Weeks History */}
      <div>
        <h2 style={{ fontSize: 16, fontWeight: 800, color: "#4A3F2F", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 20 }}>📋</span> Saved Schedules ({weeks.length})
        </h2>

        {weeks.length === 0 ? (
          <div style={{
            background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12,
            padding: 40, textAlign: "center", color: "#9CA3AF", fontSize: 13,
          }}>
            No saved schedules yet. Generate and accept a schedule on the Schedule tab to start tracking history.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {weeks.map(week => {
              const isExpanded = expandedWeek === week.key;
              const weekHours = getWeekHours(week);
              const totalHours = Object.values(weekHours).reduce((a, b) => a + b, 0);
              const empCount = Object.keys(weekHours).length;
              const traineeHrs = week.traineeHoursThisWeek || {};
              const savedDate = week.savedAt ? new Date(week.savedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";

              return (
                <div key={week.key} style={{
                  background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12,
                  overflow: "hidden",
                }}>
                  {/* Header row — clickable */}
                  <div
                    onClick={() => setExpandedWeek(isExpanded ? null : week.key)}
                    style={{
                      padding: "14px 20px", cursor: "pointer", display: "flex",
                      justifyContent: "space-between", alignItems: "center",
                      background: isExpanded ? "#FEFCE8" : "transparent",
                      transition: "background 0.15s",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span style={{ fontSize: 16, transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>▶</span>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13, color: "#374151" }}>
                          Week of {formatWeekLabel(week.key)}
                        </div>
                        <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 2 }}>
                          {empCount} employees • {totalHours.toFixed(1)}h total
                          {savedDate && ` • Saved ${savedDate}`}
                        </div>
                      </div>
                    </div>
                    {Object.keys(traineeHrs).length > 0 && (
                      <div style={{ fontSize: 10, fontWeight: 600, color: "#7C3AED", background: "#EDE9FE", padding: "3px 10px", borderRadius: 8 }}>
                        🎓 {Object.values(traineeHrs).reduce((a, b) => a + b, 0).toFixed(1)}h trainee
                      </div>
                    )}
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div style={{ padding: "0 20px 16px", borderTop: "1px solid #F3F4F6" }}>
                      {/* Employee hours table */}
                      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12, fontSize: 12 }}>
                        <thead>
                          <tr style={{ borderBottom: "2px solid #E5E7EB" }}>
                            <th style={{ textAlign: "left", padding: "6px 8px", fontWeight: 700, color: "#6B7280", fontSize: 10, textTransform: "uppercase" }}>Employee</th>
                            <th style={{ textAlign: "left", padding: "6px 8px", fontWeight: 700, color: "#6B7280", fontSize: 10, textTransform: "uppercase" }}>Role</th>
                            <th style={{ textAlign: "right", padding: "6px 8px", fontWeight: 700, color: "#6B7280", fontSize: 10, textTransform: "uppercase" }}>Hours</th>
                            <th style={{ textAlign: "right", padding: "6px 8px", fontWeight: 700, color: "#6B7280", fontSize: 10, textTransform: "uppercase" }}>Shifts</th>
                          </tr>
                        </thead>
                        <tbody>
                          {employees
                            .filter(e => weekHours[e.id])
                            .sort((a, b) => (weekHours[b.id] || 0) - (weekHours[a.id] || 0))
                            .map(emp => {
                              const hrs = weekHours[emp.id] || 0;
                              const schedule = week.schedule || week;
                              let shifts = 0;
                              Object.values(schedule).forEach(daySlots => {
                                if (Array.isArray(daySlots)) {
                                  daySlots.forEach(s => { if (s.empId === emp.id) shifts++; });
                                }
                              });
                              const isTrainee = traineeHrs[emp.id];
                              const roleLabel = ROLE_CONFIG[emp.role]?.label || emp.role;

                              return (
                                <tr key={emp.id} style={{ borderBottom: "1px solid #F3F4F6" }}>
                                  <td style={{ padding: "8px 8px", fontWeight: 600, color: "#374151" }}>
                                    {emp.name}
                                    {isTrainee && <span style={{ marginLeft: 6, fontSize: 9, background: "#EDE9FE", color: "#7C3AED", padding: "1px 6px", borderRadius: 6, fontWeight: 700 }}>TRAINEE</span>}
                                  </td>
                                  <td style={{ padding: "8px 8px", color: "#6B7280" }}>{roleLabel}</td>
                                  <td style={{ padding: "8px 8px", textAlign: "right", fontWeight: 700, color: "#374151" }}>{hrs.toFixed(1)}h</td>
                                  <td style={{ padding: "8px 8px", textAlign: "right", color: "#6B7280" }}>{shifts}</td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>

                      {/* Trainee hours this week */}
                      {Object.keys(traineeHrs).length > 0 && (
                        <div style={{ marginTop: 12, background: "#FAF5FF", borderRadius: 8, padding: 12 }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: "#7C3AED", textTransform: "uppercase", marginBottom: 8 }}>Trainee Hours Logged This Week</div>
                          {Object.entries(traineeHrs).map(([empId, hrs]) => {
                            const emp = employees.find(e => e.id === empId);
                            return emp ? (
                              <div key={empId} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 0" }}>
                                <span style={{ color: "#374151" }}>{emp.name}</span>
                                <span style={{ fontWeight: 700, color: "#7C3AED" }}>+{hrs.toFixed(1)}h</span>
                              </div>
                            ) : null;
                          })}
                        </div>
                      )}

                      {/* Notes */}
                      {week.notes && week.notes.length > 0 && (
                        <div style={{ marginTop: 12, fontSize: 11, color: "#6B7280" }}>
                          <div style={{ fontWeight: 700, marginBottom: 4 }}>Notes:</div>
                          {week.notes.map((n, i) => <div key={i}>• {typeof n === "string" ? n : n.text || JSON.stringify(n)}</div>)}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Summary stats */}
      {weeks.length > 0 && (
        <div style={{ marginTop: 24, background: "#F9FAFB", borderRadius: 12, padding: 20, border: "1px solid #E5E7EB" }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: "#4A3F2F", marginBottom: 12 }}>📊 All-Time Summary</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, textAlign: "center" }}>
            <div>
              <div style={{ fontSize: 24, fontWeight: 800, color: "#4A3F2F" }}>{weeks.length}</div>
              <div style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600 }}>Weeks Saved</div>
            </div>
            <div>
              <div style={{ fontSize: 24, fontWeight: 800, color: "#4A3F2F" }}>
                {trainees.filter(e => (e.traineeCumulative || 0) >= graduationHours).length}
              </div>
              <div style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600 }}>Trainees Graduated</div>
            </div>
            <div>
              <div style={{ fontSize: 24, fontWeight: 800, color: "#4A3F2F" }}>
                {trainees.filter(e => e.role === "trainee" && (e.traineeCumulative || 0) < graduationHours).length}
              </div>
              <div style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600 }}>In Training</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
