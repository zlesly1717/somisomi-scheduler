import { useState } from "react";
import { ROLE_CONFIG } from "./constants";

const font = "'DM Sans',sans-serif";

function DraggableList({ items, onReorder, renderItem }) {
  const [dragIdx, setDragIdx] = useState(null);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {items.map((item, i) => (
        <div key={item.id || i} draggable
          onDragStart={() => setDragIdx(i)} onDragOver={e => e.preventDefault()}
          onDrop={() => { if (dragIdx !== null && dragIdx !== i) { const a = [...items]; const [m] = a.splice(dragIdx, 1); a.splice(i, 0, m); onReorder(a); } setDragIdx(null); }}
          onDragEnd={() => setDragIdx(null)}
          style={{ background: dragIdx === i ? "#DBEAFE" : "#fff", borderRadius: 8, cursor: "grab", border: "1px solid #E5E7EB", userSelect: "none" }}>
          {renderItem(item, i)}
        </div>
      ))}
    </div>
  );
}

const tabs = [
  { id: "constraints", label: "Constraints", icon: "\ud83d\udeab" },
  { id: "categories", label: "Employee Groups", icon: "\ud83d\udc65" },
];

export function RulesTab({ rules, setRules, employees }) {
  const [activeTab, setActiveTab] = useState("constraints");
  const activeEmps = employees.filter(e => e.status === "active").sort((a, b) => a.name.localeCompare(b.name));
  const update = fn => setRules(prev => { const next = JSON.parse(JSON.stringify(prev)); fn(next); return next; });

  const hardRuleIds = ["no_doubles", "no_day_after_mc", "overlap_blocks", "only_sl_lead", "no_trainees_mc", "no_mc_twice", "mc_evening_sl_leads"];
  const constraints = rules.constraints || [];
  const hardRules = constraints.filter(c => hardRuleIds.includes(c.id));
  const softRules = constraints.filter(c => !hardRuleIds.includes(c.id));

  const shiftLeads = activeEmps.filter(e => e.role === "shift_lead");
  const swirlers = activeEmps.filter(e => e.role !== "shift_lead" && e.role !== "trainee" && (e.tags || []).includes("can_swirl"));
  const nonSwirlers = activeEmps.filter(e => e.role !== "shift_lead" && e.role !== "trainee" && !(e.tags || []).includes("can_swirl"));
  const traineeList = activeEmps.filter(e => e.role === "trainee");

  return (
    <div style={{ padding: "18px 28px" }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: "0 0 4px", fontSize: 17, fontWeight: 800, color: "#4A3F2F" }}>Scheduling Rules</h2>
        <p style={{ margin: 0, fontSize: 12, color: "#9CA3AF" }}>Configure rules. Drag to reorder flexible constraints. Changes save automatically.</p>
      </div>
      <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
        <div style={{ width: 180, flexShrink: 0 }}>
          <div style={{ background: "#fff", borderRadius: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.06)", overflow: "hidden" }}>
            {tabs.map(c => (
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
        <div style={{ flex: 1, background: "#fff", borderRadius: 12, padding: 22, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>

          {activeTab === "constraints" && (
            <div>
              <div style={{ marginBottom: 24 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 16 }}>{"\ud83d\udd12"}</span>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#DC2626" }}>Non-Negotiable</div>
                </div>
                <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 12 }}>Always enforced. Cannot be turned off.</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {hardRules.map(c => (
                    <div key={c.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 14px", background: "#FEF2F2", borderRadius: 8, border: "1px solid #FECACA" }}>
                      <div style={{ width: 36, height: 20, borderRadius: 10, background: "#DC2626", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                        <span style={{ fontSize: 8, color: "#fff", fontWeight: 800 }}>ON</span>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>{c.label}</div>
                        {c.desc && <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 1 }}>{c.desc}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 16 }}>{"\u2696\ufe0f"}</span>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#4A3F2F" }}>Flexible Rules (by priority)</div>
                </div>
                <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 12 }}>Drag to set priority. Toggle on/off. System may break lower rules to fill slots.</div>
                <DraggableList items={softRules}
                  onReorder={arr => update(r => { r.constraints = [...hardRules, ...arr]; })}
                  renderItem={(c, i) => (
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 14px" }}>
                      <span style={{ color: "#D1D5DB", fontSize: 13, cursor: "grab", marginTop: 2 }}>{"\u2807"}</span>
                      <span style={{ color: "#F59E0B", fontWeight: 800, fontSize: 10, width: 20, marginTop: 3 }}>#{i + 1}</span>
                      <button onClick={() => update(r => {
                        const idx = r.constraints.findIndex(x => x.id === c.id);
                        if (idx >= 0) r.constraints[idx].enabled = !r.constraints[idx].enabled;
                      })} style={{
                        width: 40, height: 22, borderRadius: 11, border: "none", cursor: "pointer", padding: 2, flexShrink: 0, marginTop: 1,
                        background: c.enabled ? "#22C55E" : "#D1D5DB", transition: "background 0.2s", display: "flex", alignItems: "center",
                      }}>
                        <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.2)", transition: "transform 0.2s", transform: c.enabled ? "translateX(18px)" : "translateX(0)" }} />
                      </button>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: c.enabled ? "#374151" : "#9CA3AF" }}>{c.label}</div>
                        {c.desc && <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 1 }}>{c.desc}</div>}
                      </div>
                    </div>
                  )}
                />
              </div>
            </div>
          )}

          {activeTab === "categories" && (
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#4A3F2F", marginBottom: 4 }}>Employee Groups</div>
              <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 16 }}>Auto-categorized from employee tags. Edit tags on the Employees tab.</div>

              <div style={{ marginBottom: 20, padding: 16, background: "#FEF3C7", borderRadius: 10, border: "1px solid #FDE68A" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: 16 }}>{"\u2b50"}</span>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#92400E" }}>Shift Leads ({shiftLeads.length})</div>
                    <div style={{ fontSize: 10, color: "#B45309" }}>4 shifts/week · Day Lead & Evening SL · Must MC once/week</div>
                  </div>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {shiftLeads.map(e => (
                    <div key={e.id} style={{ padding: "6px 12px", borderRadius: 8, background: "#fff", border: "1px solid #FDE68A", fontSize: 12, fontWeight: 600, color: "#92400E", display: "flex", alignItems: "center", gap: 6 }}>
                      {e.name}
                      {(e.tags||[]).includes("can_swirl") && <span style={{ fontSize: 10 }}>{"\ud83c\udf66"}</span>}
                      {(e.tags||[]).includes("mc_rotation_thu") && <span style={{ fontSize: 9, background: "#7C3AED", color: "#fff", padding: "1px 4px", borderRadius: 4 }}>Thu</span>}
                      {(e.tags||[]).includes("mc_rotation_sun") && <span style={{ fontSize: 9, background: "#2563EB", color: "#fff", padding: "1px 4px", borderRadius: 4 }}>Sun</span>}
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: 20, padding: 16, background: "#FFF7ED", borderRadius: 10, border: "1px solid #FED7AA" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: 16 }}>{"\ud83c\udf66"}</span>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#C2410C" }}>Swirlers ({swirlers.length})</div>
                    <div style={{ fontSize: 10, color: "#EA580C" }}>Can operate soft serve · Min {rules.swirl?.minPerShift || 2} per weekend shift</div>
                  </div>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {swirlers.map(e => (
                    <div key={e.id} style={{ padding: "6px 12px", borderRadius: 8, background: "#fff", border: "1px solid #FED7AA", fontSize: 12, fontWeight: 600, color: "#C2410C", display: "flex", alignItems: "center", gap: 6 }}>
                      {e.name}
                      {(e.tags||[]).includes("good_weekend") && <span style={{ fontSize: 9, background: "#16A34A", color: "#fff", padding: "1px 4px", borderRadius: 4 }}>Wknd</span>}
                    </div>
                  ))}
                </div>
                {swirlers.length === 0 && <div style={{ fontSize: 11, color: "#9CA3AF" }}>No swirlers. Add "Can Swirl" tag on Employees tab.</div>}
                <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#C2410C" }}>Min per weekend shift:</span>
                  <input type="number" min={1} max={5} value={rules.swirl?.minPerShift || 2}
                    onChange={e => update(r => { if (!r.swirl) r.swirl = {}; r.swirl.minPerShift = parseInt(e.target.value) || 2; })}
                    style={{ width: 50, padding: "4px 8px", borderRadius: 6, border: "1px solid #D1D5DB", fontSize: 12, fontFamily: font }} />
                </div>
              </div>

              <div style={{ marginBottom: 20, padding: 16, background: "#F9FAFB", borderRadius: 10, border: "1px solid #E5E7EB" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: 16 }}>{"\ud83d\udc64"}</span>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#374151" }}>Non-Swirlers ({nonSwirlers.length})</div>
                    <div style={{ fontSize: 10, color: "#6B7280" }}>Cannot swirl yet · Need swirler coverage on weekends</div>
                  </div>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {nonSwirlers.map(e => (
                    <div key={e.id} style={{ padding: "6px 12px", borderRadius: 8, background: "#fff", border: "1px solid #E5E7EB", fontSize: 12, fontWeight: 600, color: "#374151" }}>{e.name}</div>
                  ))}
                </div>
                {nonSwirlers.length === 0 && <div style={{ fontSize: 11, color: "#9CA3AF" }}>All regulars can swirl!</div>}
              </div>

              <div style={{ padding: 16, background: "#EDE9FE", borderRadius: 10, border: "1px solid #DDD6FE" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: 16 }}>{"\ud83c\udf93"}</span>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#6D28D9" }}>Trainees ({traineeList.length})</div>
                    <div style={{ fontSize: 10, color: "#7C3AED" }}>{rules.trainee?.graduationHours || 30}h to graduate · Mon-Thu evenings only</div>
                  </div>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {traineeList.map(e => {
                    const cum = e.traineeCumulative || 0;
                    const goal = rules.trainee?.graduationHours || 30;
                    const pct = Math.min(100, (cum / goal) * 100);
                    return (
                      <div key={e.id} style={{ padding: "8px 12px", borderRadius: 8, background: "#fff", border: "1px solid #DDD6FE", fontSize: 12, fontWeight: 600, color: "#6D28D9", minWidth: 140 }}>
                        <div>{e.name}</div>
                        <div style={{ background: "#F3F4F6", borderRadius: 4, height: 6, marginTop: 4, overflow: "hidden" }}>
                          <div style={{ width: `${pct}%`, height: "100%", background: "#7C3AED", borderRadius: 4 }} />
                        </div>
                        <div style={{ fontSize: 9, color: "#9CA3AF", marginTop: 2 }}>{cum.toFixed(1)}h / {goal}h</div>
                      </div>
                    );
                  })}
                </div>
                {traineeList.length === 0 && <div style={{ fontSize: 11, color: "#9CA3AF" }}>No active trainees.</div>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
