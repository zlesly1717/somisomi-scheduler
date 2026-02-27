import { useState } from "react";
import { fmtTime } from "./constants";

const font = "'DM Sans',sans-serif";
const si = { padding: "8px 12px", border: "1px solid #D1D5DB", borderRadius: 8, fontSize: 13, outline: "none", fontFamily: font, boxSizing: "border-box", width: "100%" };

function Toggle({ checked, onChange, label, desc }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 0", borderBottom: "1px solid #F3F4F6" }}>
      <button onClick={() => onChange(!checked)} style={{
        width: 40, height: 22, borderRadius: 11, border: "none", cursor: "pointer", padding: 2, flexShrink: 0, marginTop: 1,
        background: checked ? "#22C55E" : "#D1D5DB", transition: "background 0.2s", display: "flex", alignItems: "center",
      }}>
        <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.2)", transition: "transform 0.2s", transform: checked ? "translateX(18px)" : "translateX(0)" }} />
      </button>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: checked ? "#111827" : "#9CA3AF" }}>{label}</div>
        {desc && <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 1, lineHeight: 1.4 }}>{desc}</div>}
      </div>
    </div>
  );
}

function Num({ label, value, onChange, min = 0, max = 20 }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
      <span style={{ fontSize: 12, color: "#6B7280", fontWeight: 600, flex: 1 }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
        <button onClick={() => onChange(Math.max(min, value - 1))} style={{ width: 26, height: 26, borderRadius: 6, border: "1px solid #D1D5DB", background: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 700, color: "#374151", display: "flex", alignItems: "center", justifyContent: "center" }}>-</button>
        <span style={{ width: 30, textAlign: "center", fontSize: 14, fontWeight: 800, color: "#111827" }}>{value}</span>
        <button onClick={() => onChange(Math.min(max, value + 1))} style={{ width: 26, height: 26, borderRadius: 6, border: "1px solid #D1D5DB", background: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 700, color: "#374151", display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
      </div>
    </div>
  );
}

function PriorityList({ title, items, onReorder, onAdd, onRemove, allNames }) {
  const [dragIdx, setDragIdx] = useState(null);
  const [adding, setAdding] = useState(false);
  const available = allNames.filter(n => !items.includes(n));
  return (
    <div style={{ marginBottom: 16, padding: 14, background: "#F9FAFB", borderRadius: 10, border: "1px solid #E5E7EB" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>{title}</div>
        {onAdd && available.length > 0 && (
          <button onClick={() => setAdding(!adding)} style={{ fontSize: 11, fontWeight: 600, color: "#2563EB", background: "none", border: "none", cursor: "pointer" }}>
            {adding ? "Cancel" : "+ Add"}
          </button>
        )}
      </div>
      {adding && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
          {available.map(name => (
            <button key={name} onClick={() => { onAdd(name); setAdding(false); }} style={{
              padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer",
              border: "1px solid #D1D5DB", background: "#fff", color: "#374151", fontFamily: font,
            }}>{name}</button>
          ))}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {items.map((item, i) => (
          <div key={item} draggable
            onDragStart={() => setDragIdx(i)} onDragOver={e => e.preventDefault()}
            onDrop={() => { if (dragIdx !== null && dragIdx !== i) { const arr = [...items]; const [m] = arr.splice(dragIdx, 1); arr.splice(i, 0, m); onReorder(arr); } setDragIdx(null); }}
            onDragEnd={() => setDragIdx(null)}
            style={{
              display: "flex", alignItems: "center", gap: 6, padding: "6px 10px",
              background: dragIdx === i ? "#DBEAFE" : "#fff", borderRadius: 6, cursor: "grab",
              border: "1px solid #E5E7EB", fontSize: 12, userSelect: "none",
            }}>
            <span style={{ color: "#D1D5DB", fontSize: 12, cursor: "grab" }}>⠿</span>
            <span style={{ color: "#F59E0B", fontWeight: 800, fontSize: 10, width: 18 }}>#{i + 1}</span>
            <span style={{ color: "#374151", fontWeight: 600, flex: 1 }}>{item}</span>
            {onRemove && <button onClick={() => onRemove(item)} style={{ background: "none", border: "none", cursor: "pointer", color: "#DC2626", fontSize: 10, fontWeight: 600 }}>✕</button>}
          </div>
        ))}
        {items.length === 0 && <div style={{ fontSize: 11, color: "#9CA3AF", padding: 4 }}>No entries yet. Click "+ Add" to add.</div>}
      </div>
    </div>
  );
}

const categories = [
  { id: "constraints", label: "Constraints", icon: "🚫" },
  { id: "staffing", label: "Staffing Levels", icon: "👥" },
  { id: "shifts", label: "Shift Settings", icon: "⏰" },
  { id: "priorities", label: "Priority Lists", icon: "📋" },
  { id: "rotation", label: "MC Rotation", icon: "🔄" },
  { id: "employee_rules", label: "Employee Rules", icon: "📌" },
];

export function RulesTab({ rules, setRules, employees }) {
  const [activeTab, setActiveTab] = useState("constraints");
  const [newFixedRule, setNewFixedRule] = useState({ empName: "", rule: "", desc: "" });
  const activeEmps = employees.filter(e => e.status === "active").sort((a, b) => a.name.localeCompare(b.name));
  const allNames = activeEmps.map(e => e.name);

  const update = fn => setRules(prev => { const next = JSON.parse(JSON.stringify(prev)); fn(next); return next; });

  return (
    <div style={{ padding: "18px 28px" }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: "0 0 4px", fontSize: 17, fontWeight: 800, color: "#111827" }}>Scheduling Rules</h2>
        <p style={{ margin: 0, fontSize: 12, color: "#9CA3AF" }}>Configure all rules the auto-generator follows. Changes save automatically.</p>
      </div>

      <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
        {/* Sidebar */}
        <div style={{ width: 180, flexShrink: 0 }}>
          <div style={{ background: "#fff", borderRadius: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.06)", overflow: "hidden" }}>
            {categories.map(c => (
              <button key={c.id} onClick={() => setActiveTab(c.id)} style={{
                width: "100%", padding: "11px 14px", display: "flex", alignItems: "center", gap: 8,
                background: activeTab === c.id ? "#111827" : "transparent", border: "none", cursor: "pointer",
                fontFamily: font, textAlign: "left", borderBottom: "1px solid #F3F4F6",
              }}>
                <span style={{ fontSize: 14 }}>{c.icon}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: activeTab === c.id ? "#fff" : "#6B7280" }}>{c.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ background: "#fff", borderRadius: 12, padding: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>

            {/* ── CONSTRAINTS ── */}
            {activeTab === "constraints" && (
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#111827", marginBottom: 4 }}>Hard Constraints</div>
                <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 12 }}>The scheduler will never violate an enabled constraint.</div>
                {rules.constraints.map(c => (
                  <Toggle key={c.id} checked={c.enabled} label={c.label} desc={c.desc}
                    onChange={v => update(r => { const idx = r.constraints.findIndex(x => x.id === c.id); r.constraints[idx].enabled = v; })} />
                ))}
              </div>
            )}

            {/* ── STAFFING LEVELS ── */}
            {activeTab === "staffing" && (
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#111827", marginBottom: 4 }}>Staffing Levels</div>
                <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 12 }}>How many people per shift type for each day. Weekend includes a mid shift (3pm–7pm).</div>
                {[
                  ["weekday", "Weekday (Mon–Thu)", false],
                  ["weekdayHoliday", "Weekday Holiday", false],
                  ["friday", "Friday", false],
                  ["fridayHoliday", "Friday Holiday", false],
                  ["saturday", "Saturday", true],
                  ["sunday", "Sunday", true],
                ].map(([key, label, hasMid]) => {
                  const s = rules.staffing[key];
                  const total = (s.day || 0) + (s.mid || 0) + (s.evening || 0);
                  return (
                    <div key={key} style={{ marginBottom: 14, padding: 14, background: "#F9FAFB", borderRadius: 10, border: "1px solid #E5E7EB" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>{label}</span>
                        <span style={{ fontSize: 13, fontWeight: 800, color: "#111827", background: "#FEF3C7", padding: "2px 10px", borderRadius: 8 }}>Total: {total}</span>
                      </div>
                      <Num label="Day shift" value={s.day} onChange={v => update(r => { r.staffing[key].day = v; })} />
                      {hasMid && <Num label="Mid shift (3–7pm)" value={s.mid || 0} onChange={v => update(r => { r.staffing[key].mid = v; })} />}
                      <Num label="Evening shift" value={s.evening} onChange={v => update(r => { r.staffing[key].evening = v; })} />
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── SHIFT SETTINGS ── */}
            {activeTab === "shifts" && (
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#111827", marginBottom: 4 }}>Shift & Employee Settings</div>
                <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 12 }}>Shifts per week and role-specific settings.</div>

                <div style={{ padding: 14, background: "#FEF3C7", borderRadius: 10, marginBottom: 12, border: "1px solid #FDE68A" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#B45309", marginBottom: 8 }}>🟡 Shift Leads</div>
                  <Num label="Min shifts/week" value={rules.shiftLead.shiftsPerWeek.min} onChange={v => update(r => { r.shiftLead.shiftsPerWeek.min = v; })} />
                  <Num label="Max shifts/week" value={rules.shiftLead.shiftsPerWeek.max} onChange={v => update(r => { r.shiftLead.shiftsPerWeek.max = v; })} />
                  <Num label="Min weekend shifts" value={rules.shiftLead.minWeekendShifts} onChange={v => update(r => { r.shiftLead.minWeekendShifts = v; })} />
                  <Toggle checked={rules.shiftLead.alternateDayLeads} label="Rotate Day Leads"
                    desc="Alternate Day Lead role among Shift Leads"
                    onChange={v => update(r => { r.shiftLead.alternateDayLeads = v; })} />
                </div>

                <div style={{ padding: 14, background: "#DBEAFE", borderRadius: 10, marginBottom: 12, border: "1px solid #93C5FD" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#1D4ED8", marginBottom: 8 }}>🔵 Regular Employees</div>
                  <Num label="Min shifts/week" value={rules.regular.shiftsPerWeek.min} onChange={v => update(r => { r.regular.shiftsPerWeek.min = v; })} />
                  <Num label="Max shifts/week" value={rules.regular.shiftsPerWeek.max} onChange={v => update(r => { r.regular.shiftsPerWeek.max = v; })} />
                </div>

                <div style={{ padding: 14, background: "#EDE9FE", borderRadius: 10, border: "1px solid #C4B5FD" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#7C3AED", marginBottom: 8 }}>🟣 Trainees</div>
                  <Num label="Min shifts/week" value={rules.trainee.shiftsPerWeek.min} onChange={v => update(r => { r.trainee.shiftsPerWeek.min = v; })} />
                  <Num label="Max shifts/week" value={rules.trainee.shiftsPerWeek.max} onChange={v => update(r => { r.trainee.shiftsPerWeek.max = v; })} />
                  <Num label="Graduation hours" value={rules.trainee.graduationHours} onChange={v => update(r => { r.trainee.graduationHours = v; })} />
                  <Toggle checked={rules.trainee.fillGapsOnly} label="Fill gaps only" desc="Trainees only fill remaining slots after regulars" onChange={v => update(r => { r.trainee.fillGapsOnly = v; })} />
                </div>
              </div>
            )}

            {/* ── PRIORITY LISTS ── */}
            {activeTab === "priorities" && (
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#111827", marginBottom: 4 }}>Priority Lists</div>
                <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 12 }}>Drag to reorder priority. Click "+ Add" to include, ✕ to remove.</div>

                <PriorityList title="4th Shift Priority" items={rules.fourthShiftPriority || []} allNames={[...allNames, "Trainees"]}
                  onReorder={arr => update(r => { r.fourthShiftPriority = arr; })}
                  onAdd={name => update(r => { r.fourthShiftPriority = [...(r.fourthShiftPriority || []), name]; })}
                  onRemove={name => update(r => { r.fourthShiftPriority = r.fourthShiftPriority.filter(n => n !== name); })} />

                <PriorityList title="2nd Day Priority" items={rules.secondDayPriority || []} allNames={allNames}
                  onReorder={arr => update(r => { r.secondDayPriority = arr; })}
                  onAdd={name => update(r => { r.secondDayPriority = [...(r.secondDayPriority || []), name]; })}
                  onRemove={name => update(r => { r.secondDayPriority = r.secondDayPriority.filter(n => n !== name); })} />

                <PriorityList title="Good Weekend People" items={rules.goodWeekendPeople || []} allNames={allNames}
                  onReorder={arr => update(r => { r.goodWeekendPeople = arr; })}
                  onAdd={name => update(r => { r.goodWeekendPeople = [...(r.goodWeekendPeople || []), name]; })}
                  onRemove={name => update(r => { r.goodWeekendPeople = r.goodWeekendPeople.filter(n => n !== name); })} />
              </div>
            )}

            {/* ── MC ROTATION ── */}
            {activeTab === "rotation" && (
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#111827", marginBottom: 4 }}>MC Rotation Pools</div>
                <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 12 }}>Who leads and helps with machine cleaning. Thu MC = 3 people, Sun MC = 4 people.</div>

                <PriorityList title="Thursday MC Leaders" items={rules.mcRotation.thursdayLeaders || []} allNames={allNames}
                  onReorder={arr => update(r => { r.mcRotation.thursdayLeaders = arr; })}
                  onAdd={name => update(r => { r.mcRotation.thursdayLeaders.push(name); })}
                  onRemove={name => update(r => { r.mcRotation.thursdayLeaders = r.mcRotation.thursdayLeaders.filter(n => n !== name); })} />

                <PriorityList title="Sunday MC Leader Pool" items={rules.mcRotation.sundayLeaderPool || []} allNames={allNames}
                  onReorder={arr => update(r => { r.mcRotation.sundayLeaderPool = arr; })}
                  onAdd={name => update(r => { r.mcRotation.sundayLeaderPool.push(name); })}
                  onRemove={name => update(r => { r.mcRotation.sundayLeaderPool = r.mcRotation.sundayLeaderPool.filter(n => n !== name); })} />

                <PriorityList title="MC Helper Pool" items={rules.mcRotation.helperPool || []} allNames={allNames}
                  onReorder={arr => update(r => { r.mcRotation.helperPool = arr; })}
                  onAdd={name => update(r => { r.mcRotation.helperPool.push(name); })}
                  onRemove={name => update(r => { r.mcRotation.helperPool = r.mcRotation.helperPool.filter(n => n !== name); })} />

                <Toggle checked={rules.mcRotation.noBackToBackHelpers} label="No back-to-back MC helpers" desc="Don't assign same helper for both Thursday and Sunday MC"
                  onChange={v => update(r => { r.mcRotation.noBackToBackHelpers = v; })} />
              </div>
            )}

            {/* ── EMPLOYEE-SPECIFIC RULES ── */}
            {activeTab === "employee_rules" && (
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#111827", marginBottom: 4 }}>Employee-Specific Rules</div>
                <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 12 }}>Special rules for individual employees. These override general rules.</div>

                {(rules.fixedRules || []).map(fr => (
                  <div key={fr.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: 12, background: "#FEF3C7", borderRadius: 8, border: "1px solid #FDE68A", marginBottom: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#B45309" }}>{fr.empName}</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>{fr.rule}</div>
                      {fr.desc && <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>{fr.desc}</div>}
                    </div>
                    <button onClick={() => update(r => { r.fixedRules = r.fixedRules.filter(x => x.id !== fr.id); })} style={{
                      background: "none", border: "none", cursor: "pointer", color: "#DC2626", fontSize: 11, fontWeight: 600, flexShrink: 0,
                    }}>✕ Remove</button>
                  </div>
                ))}

                {(rules.fixedRules || []).length === 0 && (
                  <div style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 12, padding: 10, background: "#F9FAFB", borderRadius: 8 }}>No employee-specific rules yet.</div>
                )}

                <div style={{ padding: 14, background: "#F9FAFB", borderRadius: 10, border: "1px solid #E5E7EB", marginTop: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 8 }}>➕ Add New Rule</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <select value={newFixedRule.empName} onChange={e => setNewFixedRule(p => ({ ...p, empName: e.target.value }))} style={{ ...si }}>
                      <option value="">Select employee...</option>
                      {activeEmps.map(e => <option key={e.id} value={e.name}>{e.name}</option>)}
                    </select>
                    <input value={newFixedRule.rule} onChange={e => setNewFixedRule(p => ({ ...p, rule: e.target.value }))} placeholder="Rule (e.g. Always MCs Thursday)" style={si} />
                    <input value={newFixedRule.desc} onChange={e => setNewFixedRule(p => ({ ...p, desc: e.target.value }))} placeholder="Description (optional)" style={si} />
                    <button onClick={() => {
                      if (!newFixedRule.empName || !newFixedRule.rule) return;
                      update(r => { r.fixedRules = [...(r.fixedRules || []), { id: `fr-${Date.now()}`, ...newFixedRule }]; });
                      setNewFixedRule({ empName: "", rule: "", desc: "" });
                    }} style={{
                      padding: "8px 18px", borderRadius: 8, border: "none", background: "#111827", color: "#fff",
                      cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: font, alignSelf: "flex-start",
                    }}>+ Add Rule</button>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
