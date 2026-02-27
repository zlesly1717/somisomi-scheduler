import { useState, useEffect, useRef } from "react";
import { DAYS, DAY_LABELS, DAY_FULL, ROLE_CONFIG, TAG_OPTIONS, newUnavail, fmtTime } from "./constants";

const si = { padding: "8px 12px", border: "1px solid #D1D5DB", borderRadius: 8, fontSize: 13, outline: "none", fontFamily: "'DM Sans',sans-serif", boxSizing: "border-box", width: "100%" };
const sl = { fontSize: 10.5, fontWeight: 700, color: "#6B7280", marginBottom: 4, display: "block", textTransform: "uppercase", letterSpacing: 0.5 };

export function EmployeesTab({ employees, setEmployees, timeOffs }) {
  const [viewMode, setViewMode] = useState("cards");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(undefined);
  const [confirmId, setConfirmId] = useState(null);

  const savEmp = emp => {
    setEmployees(p => {
      const i = p.findIndex(e => e.id === emp.id);
      return i >= 0 ? p.map(e => e.id === emp.id ? emp : e) : [...p, { ...emp, id: `emp-${Date.now()}` }];
    });
    setEditing(undefined);
  };

  const togStatus = id => setEmployees(p => p.map(e => e.id === id ? { ...e, status: e.status === "active" ? "inactive" : "active" } : e));
  const delEmp = id => { setEmployees(p => p.filter(e => e.id !== id)); setConfirmId(null); };

  const filtered = employees.filter(e => {
    if (filter === "inactive") return e.status === "inactive";
    if (e.status === "inactive") return false;
    if (filter !== "all" && e.role !== filter) return false;
    if (search && !e.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <>
      <div style={{ padding: "12px 28px", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", background: "#fff", borderBottom: "1px solid #E5E7EB" }}>
        <div style={{ position: "relative" }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." style={{ ...si, width: 170, paddingLeft: 30 }} />
          <span style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF", fontSize: 13 }}>⌕</span>
        </div>
        {[["all", "All"], ["shift_lead", "Shift Leads"], ["regular", "Regulars"], ["trainee", "Trainees"], ["inactive", "Inactive"]].map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} style={{
            padding: "4px 13px", borderRadius: 16, fontSize: 11, fontWeight: 600, cursor: "pointer",
            border: filter === k ? "none" : "1px solid #D1D5DB",
            background: filter === k ? "#111827" : "#fff",
            color: filter === k ? "#fff" : "#6B7280",
            fontFamily: "'DM Sans',sans-serif",
          }}>{l}</button>
        ))}
        <div style={{ flex: 1 }} />
        <button onClick={() => setViewMode(v => v === "cards" ? "table" : "cards")} style={{
          padding: "5px 12px", borderRadius: 8, border: "1px solid #D1D5DB", background: "#fff",
          cursor: "pointer", fontSize: 11.5, fontWeight: 600, color: "#6B7280", fontFamily: "'DM Sans',sans-serif",
        }}>{viewMode === "cards" ? "≡ Table" : "⊞ Cards"}</button>
        <button onClick={() => setEditing(null)} style={{
          padding: "6px 16px", borderRadius: 8, border: "none", background: "#F59E0B", color: "#fff",
          cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "'DM Sans',sans-serif",
        }}>+ Add</button>
      </div>

      <div style={{ padding: "18px 28px" }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "#9CA3AF" }}>No employees found.</div>
        ) : viewMode === "cards" ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(365px, 1fr))", gap: 12 }}>
            {filtered.map(emp => (
              <EmpCard key={emp.id} emp={emp} tos={timeOffs} onEdit={() => setEditing(emp)} onAction={() => setConfirmId(emp.id)} />
            ))}
          </div>
        ) : (
          <EmpTable employees={filtered} onEdit={setEditing} />
        )}
      </div>

      {editing !== undefined && <EditModal emp={editing} onSave={savEmp} onClose={() => setEditing(undefined)} />}

      {confirmId && (
        <ConfirmModal
          emp={employees.find(e => e.id === confirmId)}
          onCancel={() => setConfirmId(null)}
          onDeactivate={() => { togStatus(confirmId); setConfirmId(null); }}
          onDelete={() => delEmp(confirmId)}
        />
      )}
    </>
  );
}

function EmpCard({ emp, tos, onEdit, onAction }) {
  const rc = ROLE_CONFIG[emp.role];
  const off = emp.status === "inactive";
  const upcoming = (tos || []).filter(t => t.empId === emp.id && new Date(t.date) >= new Date(new Date().toDateString())).slice(0, 3);

  return (
    <div
      style={{
        background: off ? "#F9FAFB" : "#fff", borderRadius: 12, padding: "15px 17px",
        borderLeft: `4px solid ${off ? "#D1D5DB" : rc.accent}`,
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)", opacity: off ? 0.6 : 1,
        display: "flex", flexDirection: "column", gap: 8, transition: "box-shadow 0.15s",
      }}
      onMouseEnter={e => { if (!off) e.currentTarget.style.boxShadow = "0 4px 14px rgba(0,0,0,0.08)"; }}
      onMouseLeave={e => e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.04)"}
    >
      {/* Name row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
            <span style={{ fontSize: 14.5, fontWeight: 700, color: off ? "#9CA3AF" : "#111827" }}>{emp.name}</span>
            <span style={{ padding: "2px 9px", borderRadius: 12, fontSize: 9.5, fontWeight: 700, color: off ? "#9CA3AF" : rc.color, background: off ? "#F3F4F6" : rc.bg, letterSpacing: 0.3, textTransform: "uppercase" }}>{rc.label}</span>
            {off && <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 8, background: "#FEE2E2", color: "#DC2626", fontWeight: 700 }}>INACTIVE</span>}
          </div>
          <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 1 }}>{emp.minShifts}–{emp.maxShifts} shifts · {emp.maxHours}h max</div>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          <button onClick={onEdit} style={{ background: "#F3F4F6", border: "none", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 11, fontWeight: 600, color: "#6B7280" }}>Edit</button>
          <button onClick={onAction} style={{ background: "#FEF2F2", border: "none", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 11, fontWeight: 600, color: "#DC2626" }}>···</button>
        </div>
      </div>

      {/* Unavailability dots */}
      <div style={{ display: "flex", gap: 4, alignItems: "flex-start" }}>
        <span style={{ fontSize: 9.5, color: "#9CA3AF", fontWeight: 600, width: 48, paddingTop: 1 }}>Unavail</span>
        <div style={{ display: "flex", gap: 5 }}>
          {DAYS.map(d => {
            const u = emp.unavailability[d];
            const isOff = u.allDay;
            const partial = !isOff && u.start && u.end;
            return (
              <div key={d} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1, minWidth: 26 }}>
                <span style={{ fontSize: 8.5, color: "#B0B0B0", fontWeight: 700 }}>{DAY_LABELS[d]}</span>
                <span
                  style={{ width: 8, height: 8, borderRadius: "50%", display: "block", background: isOff ? "#EF4444" : partial ? "#F59E0B" : "#22C55E" }}
                  title={isOff ? `${DAY_FULL[d]}: ALL DAY OFF` : partial ? `${DAY_FULL[d]}: ${fmtTime(u.start)}–${fmtTime(u.end)}` : `${DAY_FULL[d]}: Open`}
                />
                {partial && <span style={{ fontSize: 7, color: "#D97706", fontWeight: 600, whiteSpace: "nowrap" }}>{fmtTime(u.start)}–{fmtTime(u.end)}</span>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Tags */}
      {emp.tags.length > 0 && (
        <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
          {emp.tags.map(t => (
            <span key={t} style={{ padding: "1.5px 7px", borderRadius: 10, fontSize: 9.5, fontWeight: 600, background: "#F3F4F6", color: "#6B7280" }}>
              {TAG_OPTIONS.find(o => o.id === t)?.label || t}
            </span>
          ))}
        </div>
      )}

      {/* Trainee bar */}
      {emp.role === "trainee" && (
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <div style={{ flex: 1, height: 5, background: "#E5E7EB", borderRadius: 3, overflow: "hidden", maxWidth: 120 }}>
            <div style={{ width: `${Math.min((emp.traineeCumulative / 30) * 100, 100)}%`, height: "100%", borderRadius: 3, background: emp.traineeCumulative >= 30 ? "#22C55E" : "linear-gradient(90deg,#8B5CF6,#A78BFA)" }} />
          </div>
          <span style={{ fontSize: 10, fontWeight: 700, color: emp.traineeCumulative >= 30 ? "#16A34A" : "#6D28D9" }}>
            {emp.traineeCumulative}h/30h{emp.traineeCumulative >= 30 && " ✓"}
          </span>
        </div>
      )}

      {/* Upcoming time-off */}
      {upcoming.length > 0 && (
        <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
          {upcoming.map(t => (
            <span key={t.id} style={{ padding: "2px 7px", borderRadius: 8, fontSize: 9.5, fontWeight: 600, background: "#FEF3C7", color: "#92400E" }}>
              ⏸ {new Date(t.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </span>
          ))}
        </div>
      )}

      {emp.notes && <div style={{ fontSize: 11, color: "#9CA3AF", lineHeight: 1.35, fontStyle: "italic" }}>{emp.notes}</div>}
    </div>
  );
}

function EmpTable({ employees, onEdit }) {
  return (
    <div style={{ overflowX: "auto", background: "#fff", borderRadius: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: "2px solid #E5E7EB" }}>
            {["Name", "Role", "Shifts", "Hrs", "M", "T", "W", "Th", "F", "Sa", "Su", "Tags", ""].map(h => (
              <th key={h} style={{ padding: "9px 10px", textAlign: "left", fontWeight: 700, color: "#6B7280", fontSize: 9.5, textTransform: "uppercase", letterSpacing: 0.5 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {employees.map(emp => {
            const rc = ROLE_CONFIG[emp.role];
            return (
              <tr key={emp.id} style={{ borderBottom: "1px solid #F3F4F6" }}>
                <td style={{ padding: "9px 10px", fontWeight: 600, whiteSpace: "nowrap" }}>{emp.name}</td>
                <td><span style={{ padding: "2px 7px", borderRadius: 8, fontSize: 9.5, fontWeight: 700, color: rc.color, background: rc.bg }}>{rc.label}</span></td>
                <td style={{ color: "#6B7280" }}>{emp.minShifts}–{emp.maxShifts}</td>
                <td style={{ color: "#6B7280" }}>{emp.maxHours}</td>
                {DAYS.map(d => {
                  const u = emp.unavailability[d];
                  return (
                    <td key={d} style={{ padding: "9px 4px", textAlign: "center" }}>
                      {u.allDay ? <span style={{ color: "#EF4444", fontWeight: 700, fontSize: 10 }}>OFF</span>
                        : u.start && u.end ? <span style={{ color: "#D97706", fontSize: 9, fontWeight: 600 }}>{fmtTime(u.start)}–{fmtTime(u.end)}</span>
                          : <span style={{ color: "#D1D5DB" }}>—</span>}
                    </td>
                  );
                })}
                <td style={{ maxWidth: 120 }}>
                  <div style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
                    {emp.tags.slice(0, 3).map(t => (
                      <span key={t} style={{ padding: "1px 5px", borderRadius: 6, fontSize: 8.5, fontWeight: 600, background: "#F3F4F6", color: "#6B7280" }}>
                        {TAG_OPTIONS.find(o => o.id === t)?.label || t}
                      </span>
                    ))}
                    {emp.tags.length > 3 && <span style={{ fontSize: 8.5, color: "#9CA3AF" }}>+{emp.tags.length - 3}</span>}
                  </div>
                </td>
                <td><button onClick={() => onEdit(emp)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "#3B82F6", fontWeight: 600 }}>Edit</button></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function EditModal({ emp, onSave, onClose }) {
  const isNew = !emp;
  const [f, setF] = useState(() => JSON.parse(JSON.stringify(emp || {
    id: "", name: "", role: "regular", status: "active", maxShifts: 3, minShifts: 3, maxHours: 20,
    tags: [], unavailability: newUnavail(), notes: "", traineeCumulative: 0,
  })));
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); }, []);

  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const setU = (d, k, v) => setF(p => ({ ...p, unavailability: { ...p.unavailability, [d]: { ...p.unavailability[d], [k]: v } } }));
  const togT = id => setF(p => ({ ...p, tags: p.tags.includes(id) ? p.tags.filter(t => t !== id) : [...p.tags, id] }));

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 16, padding: 22, width: "100%", maxWidth: 550, maxHeight: "90vh", overflow: "auto", boxShadow: "0 25px 60px rgba(0,0,0,0.25)" }} onClick={e => e.stopPropagation()}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: "#111827" }}>{isNew ? "Add Employee" : `Edit ${f.name}`}</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#9CA3AF" }}>×</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9, marginBottom: 12 }}>
          <div><label style={sl}>Name</label><input ref={ref} style={si} value={f.name} onChange={e => set("name", e.target.value)} placeholder="Full name" /></div>
          <div><label style={sl}>Role</label><select style={si} value={f.role} onChange={e => set("role", e.target.value)}><option value="shift_lead">Shift Lead</option><option value="regular">Regular</option><option value="trainee">Trainee</option></select></div>
          <div><label style={sl}>Status</label><select style={si} value={f.status} onChange={e => set("status", e.target.value)}><option value="active">Active</option><option value="inactive">Inactive</option></select></div>
          <div><label style={sl}>Max Hours/Wk</label><input type="number" style={si} value={f.maxHours} onChange={e => set("maxHours", +e.target.value)} /></div>
          <div><label style={sl}>Min Shifts/Wk</label><input type="number" style={si} value={f.minShifts} onChange={e => set("minShifts", +e.target.value)} /></div>
          <div><label style={sl}>Max Shifts/Wk</label><input type="number" style={si} value={f.maxShifts} onChange={e => set("maxShifts", +e.target.value)} /></div>
        </div>

        {f.role === "trainee" && (
          <div style={{ marginBottom: 12, padding: 10, background: "#EDE9FE", borderRadius: 8 }}>
            <label style={{ ...sl, color: "#6D28D9" }}>Trainee Hours</label>
            <input type="number" step="0.5" style={si} value={f.traineeCumulative || 0} onChange={e => set("traineeCumulative", +e.target.value)} />
            <div style={{ fontSize: 10, color: "#7C3AED", marginTop: 3 }}>Graduates at 30h</div>
          </div>
        )}

        <div style={{ marginBottom: 12 }}>
          <label style={sl}>Tags</label>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {TAG_OPTIONS.map(t => (
              <button key={t.id} onClick={() => togT(t.id)} style={{
                padding: "3px 10px", borderRadius: 12, fontSize: 10.5, fontWeight: 600, cursor: "pointer",
                border: f.tags.includes(t.id) ? "2px solid #3B82F6" : "1px solid #D1D5DB",
                background: f.tags.includes(t.id) ? "#DBEAFE" : "#fff",
                color: f.tags.includes(t.id) ? "#1D4ED8" : "#6B7280",
                fontFamily: "'DM Sans',sans-serif",
              }}>{t.label}</button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={sl}>Weekly Unavailability</label>
          <div style={{ fontSize: 10, color: "#9CA3AF", marginBottom: 6 }}>Times this person CANNOT work (recurring)</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {DAYS.map(d => {
              const u = f.unavailability[d];
              const hasW = !u.allDay && (u.start || u.end);
              return (
                <div key={d} style={{
                  display: "flex", alignItems: "center", gap: 7, padding: "6px 9px",
                  background: u.allDay ? "#FEE2E2" : hasW ? "#FEF3C7" : "#F0FDF4", borderRadius: 7, fontSize: 12,
                }}>
                  <span style={{ width: 26, fontWeight: 700, color: "#374151", fontSize: 11.5 }}>{DAY_LABELS[d]}</span>
                  <label style={{ display: "flex", alignItems: "center", gap: 3, cursor: "pointer", fontSize: 11, color: "#6B7280", whiteSpace: "nowrap" }}>
                    <input type="checkbox" checked={u.allDay} onChange={e => { setU(d, "allDay", e.target.checked); if (e.target.checked) { setU(d, "start", ""); setU(d, "end", ""); } }} />
                    All day
                  </label>
                  {!u.allDay && (
                    <>
                      <span style={{ fontSize: 10, color: "#9CA3AF", marginLeft: 4 }}>Off</span>
                      <input type="time" value={u.start || ""} onChange={e => setU(d, "start", e.target.value)} style={{ ...si, width: 90, padding: "2px 5px", fontSize: 11 }} />
                      <span style={{ fontSize: 10, color: "#9CA3AF" }}>to</span>
                      <input type="time" value={u.end || ""} onChange={e => setU(d, "end", e.target.value)} style={{ ...si, width: 90, padding: "2px 5px", fontSize: 11 }} />
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={sl}>Notes</label>
          <textarea style={{ ...si, minHeight: 48, resize: "vertical" }} value={f.notes} onChange={e => set("notes", e.target.value)} placeholder="Scheduling notes..." />
        </div>

        <div style={{ display: "flex", gap: 7, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #D1D5DB", background: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#6B7280", fontFamily: "'DM Sans',sans-serif" }}>Cancel</button>
          <button onClick={() => { if (f.name.trim()) onSave(f); }} style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: "#111827", color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "'DM Sans',sans-serif" }}>
            {isNew ? "Add Employee" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmModal({ emp, onCancel, onDeactivate, onDelete }) {
  if (!emp) return null;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1001 }} onClick={onCancel}>
      <div style={{ background: "#fff", borderRadius: 14, padding: 22, maxWidth: 340, textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 5 }}>{emp.name}</div>
        <div style={{ fontSize: 12.5, color: "#6B7280", marginBottom: 4 }}>What would you like to do?</div>
        <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 14 }}>Deactivating keeps their data.</div>
        <div style={{ display: "flex", gap: 7, justifyContent: "center" }}>
          <button onClick={onCancel} style={{ padding: "7px 16px", borderRadius: 8, border: "1px solid #D1D5DB", background: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans',sans-serif" }}>Cancel</button>
          <button onClick={onDeactivate} style={{ padding: "7px 16px", borderRadius: 8, border: "none", background: "#F59E0B", color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "'DM Sans',sans-serif" }}>
            {emp.status === "inactive" ? "Reactivate" : "Deactivate"}
          </button>
          <button onClick={onDelete} style={{ padding: "7px 16px", borderRadius: 8, border: "none", background: "#DC2626", color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "'DM Sans',sans-serif" }}>Delete</button>
        </div>
      </div>
    </div>
  );
}
