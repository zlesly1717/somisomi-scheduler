import { useState } from "react";
import { fmtTime } from "./constants";

const si = { padding: "8px 12px", border: "1px solid #D1D5DB", borderRadius: 8, fontSize: 13, outline: "none", fontFamily: "'DM Sans',sans-serif", boxSizing: "border-box", width: "100%" };
const sl = { fontSize: 10.5, fontWeight: 700, color: "#6B7280", marginBottom: 4, display: "block", textTransform: "uppercase", letterSpacing: 0.5 };

export function TimeOffTab({ employees, timeOffs, setTimeOffs }) {
  const [toForm, setToForm] = useState({ empId: "", date: "", note: "" });

  const addTO = () => {
    if (!toForm.empId || !toForm.date) return;
    setTimeOffs(p => [...p, { ...toForm, id: "to-" + Date.now() }]);
    setToForm({ empId: "", date: "", note: "" });
  };

  const delTO = id => setTimeOffs(p => p.filter(t => t.id !== id));

  const upcoming = timeOffs
    .filter(t => new Date(t.date) >= new Date(new Date().toDateString()))
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  return (
    <div style={{ padding: "18px 28px", maxWidth: 680 }}>
      <div style={{ background: "#fff", borderRadius: 12, padding: 18, boxShadow: "0 1px 3px rgba(0,0,0,0.06)", marginBottom: 16 }}>
        <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700, color: "#111827" }}>Add Time-Off</h3>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div><label style={sl}>Employee</label>
            <select value={toForm.empId} onChange={e => setToForm(f => ({ ...f, empId: e.target.value }))} style={{ ...si, width: 180 }}>
              <option value="">Select...</option>
              {employees.filter(e => e.status === "active").sort((a, b) => a.name.localeCompare(b.name)).map(e => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </div>
          <div><label style={sl}>Date</label><input type="date" value={toForm.date} onChange={e => setToForm(f => ({ ...f, date: e.target.value }))} style={{ ...si, width: 150 }} /></div>
          <div style={{ flex: 1, minWidth: 120 }}><label style={sl}>Note</label><input value={toForm.note} onChange={e => setToForm(f => ({ ...f, note: e.target.value }))} placeholder="Optional" style={si} /></div>
          <button onClick={addTO} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#111827", color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "'DM Sans',sans-serif" }}>Add</button>
        </div>
      </div>
      <div style={{ background: "#fff", borderRadius: 12, padding: 18, boxShadow: "0 1px 3px rgba(0,0,0,0.06)", marginBottom: 16 }}>
        <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700, color: "#111827" }}>Upcoming</h3>
        {upcoming.length === 0 ? (
          <div style={{ color: "#9CA3AF", fontSize: 13, padding: "10px 0" }}>No upcoming time-off.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {upcoming.map(t => {
              const emp = employees.find(e => e.id === t.empId);
              return (
                <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", background: "#FEF3C7", borderRadius: 8, fontSize: 12.5 }}>
                  <span style={{ fontWeight: 700, color: "#92400E", minWidth: 90 }}>
                    {new Date(t.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                  </span>
                  <span style={{ fontWeight: 600, color: "#111827" }}>{emp?.name || "?"}</span>
                  {t.note && <span style={{ color: "#6B7280", fontStyle: "italic" }}>&mdash; {t.note}</span>}
                  <div style={{ flex: 1 }} />
                  <button onClick={() => delTO(t.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#DC2626", fontSize: 11, fontWeight: 600 }}>{"\u2715"}</button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
