import { useState } from "react";
import { fmtTime } from "./constants";

const font = "'DM Sans',sans-serif";
const si = { padding: "8px 12px", border: "1px solid #D1D5DB", borderRadius: 8, fontSize: 13, outline: "none", fontFamily: font, boxSizing: "border-box", width: "100%" };

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
            <span style={{ color: "#D1D5DB", fontSize: 12, cursor: "grab" }}>{"\u2807"}</span>
            <span style={{ color: "#F59E0B", fontWeight: 800, fontSize: 10, width: 18 }}>#{i + 1}</span>
            <span style={{ color: "#374151", fontWeight: 600, flex: 1 }}>{item}</span>
            {onRemove && <button onClick={() => onRemove(item)} style={{ background: "none", border: "none", cursor: "pointer", color: "#DC2626", fontSize: 10, fontWeight: 600 }}>{"\u2715"}</button>}
          </div>
        ))}
        {items.length === 0 && <div style={{ fontSize: 11, color: "#9CA3AF", padding: 4 }}>No entries yet. Click "+ Add" to add.</div>}
      </div>
    </div>
  );
}

function AddConstraintForm({ onAdd }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [desc, setDesc] = useState("");
  const handleAdd = () => { if (!label.trim()) return; onAdd(label.trim(), desc.trim()); setLabel(""); setDesc(""); setOpen(false); };
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{
        marginTop: 14, padding: "10px 18px", borderRadius: 8, fontSize: 12, fontWeight: 700,
        border: "1px dashed #D1D5DB", background: "#F9FAFB", color: "#6B7280",
        cursor: "pointer", fontFamily: font, width: "100%", textAlign: "left",
      }}>+ Add Custom Constraint</button>
    );
  }
  return (
    <div style={{ marginTop: 14, padding: 14, background: "#F9FAFB", borderRadius: 10, border: "1px solid #E5E7EB" }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 8 }}>New Constraint</div>
      <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Rule name" style={{ ...si, marginBottom: 6 }} />
      <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Description (optional)" style={{ ...si, marginBottom: 8 }} />
      <div style={{ display: "flex", gap: 6 }}>
        <button onClick={handleAdd} style={{ padding: "7px 16px", borderRadius: 8, border: "none", background: "#4A3F2F", color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: font }}>+ Add</button>
        <button onClick={() => { setOpen(false); setLabel(""); setDesc(""); }} style={{ padding: "7px 16px", borderRadius: 8, border: "1px solid #D1D5DB", background: "#fff", color: "#6B7280", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: font }}>Cancel</button>
      </div>
    </div>
  );
}

const categories = [
  { id: "constraints", label: "Constraints", icon: "\ud83d\udeab" },
  { id: "priorities", label: "Priority Lists", icon: "\ud83d\udccb" },
  { id: "rotation", label: "MC Rotation", icon: "\ud83d\udd04" },
  { id: "employee_rules", label: "Employee Rules", icon: "\ud83d\udccc" },
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
        <h2 style={{ margin: "0 0 4px", fontSize: 17, fontWeight: 800, color: "#4A3F2F" }}>Scheduling Rules</h2>
        <p style={{ margin: 0, fontSize: 12, color: "#9CA3AF" }}>Configure all rules the auto-generator follows. Changes save automatically.</p>
      </div>

      <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
        {/* Sidebar */}
        <div style={{ width: 180, flexShrink: 0 }}>
          <div style={{ background: "#fff", borderRadius: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.06)", overflow: "hidden" }}>
            {categories.map(c => (
              <button key={c.id} onClick={() => setActiveTab(c.id)} style={{
                width: "100%", padding: "11px 14px", display: "flex", alignItems: "center", gap: 8,
                background: activeTab === c.id ? "#4A3F2F" : "transparent", border: "none", cursor: "pointer",
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

            {/* CONSTRAINTS */}
            {activeTab === "constraints" && (
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#4A3F2F", marginBottom: 4 }}>Hard Constraints</div>
                <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 12 }}>The scheduler will never violate an enabled constraint.</div>
                {rules.constraints.map(c => (
                  <div key={c.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 0", borderBottom: "1px solid #F3F4F6" }}>
                    <button onClick={() => update(r => { const idx = r.constraints.findIndex(x => x.id === c.id); r.constraints[idx].enabled = !c.enabled; })} style={{
                      width: 40, height: 22, borderRadius: 11, border: "none", cursor: "pointer", padding: 2, flexShrink: 0, marginTop: 1,
                      background: c.enabled ? "#22C55E" : "#D1D5DB", transition: "background 0.2s", display: "flex", alignItems: "center",
                    }}>
                      <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.2)", transition: "transform 0.2s", transform: c.enabled ? "translateX(18px)" : "translateX(0)" }} />
                    </button>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: c.enabled ? "#4A3F2F" : "#9CA3AF" }}>{c.label}</div>
                      {c.desc && <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 1, lineHeight: 1.4 }}>{c.desc}</div>}
                    </div>
                    {c.custom && (
                      <button onClick={() => update(r => { r.constraints = r.constraints.filter(x => x.id !== c.id); })} style={{
                        background: "none", border: "none", cursor: "pointer", color: "#DC2626", fontSize: 10, fontWeight: 600, flexShrink: 0, marginTop: 2,
                      }}>{"\u2715"}</button>
                    )}
                  </div>
                ))}
                <AddConstraintForm onAdd={(label, desc) => {
                  update(r => { r.constraints.push({ id: `custom-${Date.now()}`, label, desc, enabled: true, custom: true }); });
                }} />
              </div>
            )}

            {/* PRIORITY LISTS */}
            {activeTab === "priorities" && (
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#4A3F2F", marginBottom: 4 }}>Priority Lists</div>
                <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 12 }}>Drag to reorder priority. Click "+ Add" to include, {"\u2715"} to remove.</div>

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

                <div style={{ marginTop: 20, padding: 14, background: "#FFFBEB", borderRadius: 10, border: "1px solid #FDE68A" }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#92400E", marginBottom: 4 }}>{"\ud83c\udf66"} Swirlers</div>
                  <div style={{ fontSize: 11, color: "#B45309", marginBottom: 8 }}>Employees who can operate the soft serve machine. Min {rules.swirl?.minPerShift || 2} per shift on Fri night - Sun.</div>
                  <PriorityList title="Can Swirl" items={rules.swirl?.swirlers || allNames.filter(n => {
                    const emp = employees.find(e => e.name === n);
                    return emp && (emp.tags || []).includes("can_swirl");
                  })} allNames={allNames}
                    onReorder={arr => update(r => { if (!r.swirl) r.swirl = {}; r.swirl.swirlers = arr; })}
                    onAdd={name => update(r => { if (!r.swirl) r.swirl = {}; if (!r.swirl.swirlers) r.swirl.swirlers = []; r.swirl.swirlers.push(name); })}
                    onRemove={name => update(r => { if (r.swirl?.swirlers) r.swirl.swirlers = r.swirl.swirlers.filter(n => n !== name); })} />
                  <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: "#92400E" }}>Min per shift:</span>
                    <input type="number" min={1} max={5} value={rules.swirl?.minPerShift || 2}
                      onChange={e => update(r => { if (!r.swirl) r.swirl = {}; r.swirl.minPerShift = parseInt(e.target.value) || 2; })}
                      style={{ width: 50, padding: "4px 8px", borderRadius: 6, border: "1px solid #D1D5DB", fontSize: 12, fontFamily: "Inter,sans-serif" }} />
                  </div>
                </div>
              </div>
            )}

            {/* MC ROTATION - Simplified to 2 pools */}
            {activeTab === "rotation" && (
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#4A3F2F", marginBottom: 4 }}>MC Rotation Pools</div>
                <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 12 }}>Two pools: Shift Leads/SL Helpers lead MC nights. Assistants are the regular helpers.</div>

                <PriorityList title="Shift Leads / SL Helpers" items={rules.mcRotation?.shiftLeadPool || []} allNames={allNames}
                  onReorder={arr => update(r => { r.mcRotation.shiftLeadPool = arr; })}
                  onAdd={name => update(r => { if (!r.mcRotation.shiftLeadPool) r.mcRotation.shiftLeadPool = []; r.mcRotation.shiftLeadPool.push(name); })}
                  onRemove={name => update(r => { r.mcRotation.shiftLeadPool = r.mcRotation.shiftLeadPool.filter(n => n !== name); })} />

                <PriorityList title="Assistants" items={rules.mcRotation?.assistantPool || []} allNames={allNames}
                  onReorder={arr => update(r => { r.mcRotation.assistantPool = arr; })}
                  onAdd={name => update(r => { if (!r.mcRotation.assistantPool) r.mcRotation.assistantPool = []; r.mcRotation.assistantPool.push(name); })}
                  onRemove={name => update(r => { r.mcRotation.assistantPool = r.mcRotation.assistantPool.filter(n => n !== name); })} />

                <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 0", borderTop: "1px solid #F3F4F6" }}>
                  <button onClick={() => update(r => { r.mcRotation.noBackToBackHelpers = !r.mcRotation.noBackToBackHelpers; })} style={{
                    width: 40, height: 22, borderRadius: 11, border: "none", cursor: "pointer", padding: 2, flexShrink: 0, marginTop: 1,
                    background: rules.mcRotation?.noBackToBackHelpers ? "#22C55E" : "#D1D5DB", transition: "background 0.2s", display: "flex", alignItems: "center",
                  }}>
                    <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.2)", transition: "transform 0.2s", transform: rules.mcRotation?.noBackToBackHelpers ? "translateX(18px)" : "translateX(0)" }} />
                  </button>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: rules.mcRotation?.noBackToBackHelpers ? "#4A3F2F" : "#9CA3AF" }}>No back-to-back MC helpers</div>
                    <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 1 }}>Don't assign same helper for both Thursday and Sunday MC</div>
                  </div>
                </div>
              </div>
            )}

            {/* EMPLOYEE-SPECIFIC RULES */}
            {activeTab === "employee_rules" && (
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#4A3F2F", marginBottom: 4 }}>Employee-Specific Rules</div>
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
                    }}>{"\u2715"} Remove</button>
                  </div>
                ))}

                {(rules.fixedRules || []).length === 0 && (
                  <div style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 12, padding: 10, background: "#F9FAFB", borderRadius: 8 }}>No employee-specific rules yet.</div>
                )}

                <div style={{ padding: 14, background: "#F9FAFB", borderRadius: 10, border: "1px solid #E5E7EB", marginTop: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 8 }}>{"\u2795"} Add New Rule</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <select value={newFixedRule.empName} onChange={e => setNewFixedRule(p => ({ ...p, empName: e.target.value }))} style={si}>
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
                      padding: "8px 18px", borderRadius: 8, border: "none", background: "#4A3F2F", color: "#fff",
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
