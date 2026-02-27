import { useState } from "react";
import { TAG_OPTIONS, fmtTime } from "./constants";

const si = { padding: "8px 12px", border: "1px solid #D1D5DB", borderRadius: 8, fontSize: 13, outline: "none", fontFamily: "'DM Sans',sans-serif", boxSizing: "border-box", width: "100%" };
const sl = { fontSize: 10.5, fontWeight: 700, color: "#6B7280", marginBottom: 4, display: "block", textTransform: "uppercase", letterSpacing: 0.5 };

function Section({ id, title, icon, expandedSection, setExpandedSection, children }) {
  const open = expandedSection === id;
  return (
    <div style={{ background: "#fff", borderRadius: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.06)", marginBottom: 12, overflow: "hidden" }}>
      <button onClick={() => setExpandedSection(open ? null : id)} style={{
        width: "100%", padding: "14px 18px", display: "flex", alignItems: "center", gap: 10,
        background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans',sans-serif", textAlign: "left",
        borderBottom: open ? "1px solid #E5E7EB" : "none",
      }}>
        <span style={{ fontSize: 18 }}>{icon}</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: "#111827", flex: 1 }}>{title}</span>
        <span style={{ fontSize: 16, color: "#9CA3AF", transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>▾</span>
      </button>
      {open && <div style={{ padding: "14px 18px" }}>{children}</div>}
    </div>
  );
}

function Toggle({ checked, onChange, label, desc }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 0", borderBottom: "1px solid #F3F4F6" }}>
      <button onClick={() => onChange(!checked)} style={{
        width: 40, height: 22, borderRadius: 11, border: "none", cursor: "pointer", padding: 2, flexShrink: 0, marginTop: 1,
        background: checked ? "#22C55E" : "#D1D5DB", transition: "background 0.2s", display: "flex", alignItems: "center",
      }}>
        <div style={{
          width: 18, height: 18, borderRadius: "50%", background: "#fff",
          boxShadow: "0 1px 3px rgba(0,0,0,0.2)", transition: "transform 0.2s",
          transform: checked ? "translateX(18px)" : "translateX(0)",
        }} />
      </button>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: checked ? "#111827" : "#9CA3AF" }}>{label}</div>
        {desc && <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 1, lineHeight: 1.4 }}>{desc}</div>}
      </div>
    </div>
  );
}

function NumField({ label, value, onChange, min = 0, max = 20 }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 12, color: "#6B7280", fontWeight: 600, minWidth: 120 }}>{label}</span>
      <input type="number" min={min} max={max} value={value} onChange={e => onChange(+e.target.value)}
        style={{ ...si, width: 70, padding: "5px 8px", textAlign: "center" }} />
    </div>
  );
}

function PriorityList({ title, items, onReorder }) {
  const [dragIdx, setDragIdx] = useState(null);
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 6 }}>{title}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {items.map((item, i) => (
          <div key={item} draggable
            onDragStart={() => setDragIdx(i)}
            onDragOver={e => e.preventDefault()}
            onDrop={() => {
              if (dragIdx !== null && dragIdx !== i) {
                const arr = [...items];
                const [moved] = arr.splice(dragIdx, 1);
                arr.splice(i, 0, moved);
                onReorder(arr);
              }
              setDragIdx(null);
            }}
            onDragEnd={() => setDragIdx(null)}
            style={{
              display: "flex", alignItems: "center", gap: 8, padding: "8px 12px",
              background: dragIdx === i ? "#FEF3C7" : "#F9FAFB", borderRadius: 8, cursor: "grab",
              border: "1px solid #E5E7EB", fontSize: 13, fontWeight: 500, userSelect: "none",
            }}
          >
            <span style={{ color: "#D1D5DB", fontSize: 14, cursor: "grab" }}>⠿</span>
            <span style={{ color: "#F59E0B", fontWeight: 800, fontSize: 11, width: 20 }}>#{i + 1}</span>
            <span style={{ color: "#374151" }}>{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function RulesTab({ rules, setRules, employees }) {
  const [expandedSection, setExpandedSection] = useState("constraints");
  const [newFixedRule, setNewFixedRule] = useState({ empName: "", rule: "", desc: "" });
  const activeEmps = employees.filter(e => e.status === "active").sort((a, b) => a.name.localeCompare(b.name));

  const update = fn => setRules(prev => {
    const next = JSON.parse(JSON.stringify(prev));
    fn(next);
    return next;
  });

  const sectionProps = { expandedSection, setExpandedSection };

  return (
    <div style={{ padding: "18px 28px", maxWidth: 700 }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: "0 0 4px", fontSize: 17, fontWeight: 800, color: "#111827" }}>Scheduling Rules</h2>
        <p style={{ margin: 0, fontSize: 12, color: "#9CA3AF" }}>Configure all rules the auto-generator follows. Changes save automatically.</p>
      </div>

      {/* Hard Constraints */}
      <Section id="constraints" title="Hard Constraints" icon="🚫" {...sectionProps}>
        <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 8 }}>These rules cannot be broken. The scheduler will never violate an enabled constraint.</div>
        {rules.constraints.map(c => (
          <Toggle key={c.id} checked={c.enabled} label={c.label} desc={c.desc}
            onChange={v => update(r => { const idx = r.constraints.findIndex(x => x.id === c.id); r.constraints[idx].enabled = v; })} />
        ))}
      </Section>

      {/* Shift Lead Settings */}
      <Section id="shiftlead" title="Shift Lead Settings" icon="★" {...sectionProps}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", gap: 16 }}>
            <NumField label="Min shifts/week" value={rules.shiftLead.shiftsPerWeek.min} onChange={v => update(r => { r.shiftLead.shiftsPerWeek.min = v; })} />
            <NumField label="Max shifts/week" value={rules.shiftLead.shiftsPerWeek.max} onChange={v => update(r => { r.shiftLead.shiftsPerWeek.max = v; })} />
          </div>
          <NumField label="Min weekend shifts" value={rules.shiftLead.minWeekendShifts} onChange={v => update(r => { r.shiftLead.minWeekendShifts = v; })} />
          <NumField label="MC shifts/week" value={rules.shiftLead.mcPerWeek} onChange={v => update(r => { r.shiftLead.mcPerWeek = v; })} />
          <Toggle checked={rules.shiftLead.alternateDayLeads} label="Alternate Day Leads across SLs"
            desc="Rotate weekday Day Lead role among different Shift Leads"
            onChange={v => update(r => { r.shiftLead.alternateDayLeads = v; })} />
        </div>
      </Section>

      {/* Regular & Trainee */}
      <Section id="empSettings" title="Regular & Trainee Settings" icon="●" {...sectionProps}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 8 }}>Regular Employees</div>
        <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
          <NumField label="Min shifts/week" value={rules.regular.shiftsPerWeek.min} onChange={v => update(r => { r.regular.shiftsPerWeek.min = v; })} />
          <NumField label="Max shifts/week" value={rules.regular.shiftsPerWeek.max} onChange={v => update(r => { r.regular.shiftsPerWeek.max = v; })} />
        </div>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 8 }}>Trainees</div>
        <div style={{ display: "flex", gap: 16, marginBottom: 8 }}>
          <NumField label="Min shifts/week" value={rules.trainee.shiftsPerWeek.min} onChange={v => update(r => { r.trainee.shiftsPerWeek.min = v; })} />
          <NumField label="Max shifts/week" value={rules.trainee.shiftsPerWeek.max} onChange={v => update(r => { r.trainee.shiftsPerWeek.max = v; })} />
        </div>
        <NumField label="Graduation hours" value={rules.trainee.graduationHours} onChange={v => update(r => { r.trainee.graduationHours = v; })} />
        <div style={{ marginTop: 8 }}>
          <Toggle checked={rules.trainee.fillGapsOnly} label="Trainees fill gaps only"
            desc="Trainees only get shifts in holiday extra slots and gaps — never replace regulars"
            onChange={v => update(r => { r.trainee.fillGapsOnly = v; })} />
          <Toggle checked={rules.trainee.doNotReplaceRegulars} label="Don't replace regulars with trainees"
            desc="Regular employees always get their minimum shifts before trainees are assigned"
            onChange={v => update(r => { r.trainee.doNotReplaceRegulars = v; })} />
        </div>
      </Section>

      {/* Staffing Levels */}
      <Section id="staffing" title="Staffing Levels" icon="👥" {...sectionProps}>
        <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 10 }}>How many people needed per day type. Weekend includes a mid shift (3pm–7pm).</div>
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
            <div key={key} style={{ marginBottom: 12, padding: "10px 12px", background: "#F9FAFB", borderRadius: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 6 }}>{label}</div>
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
                <NumField label="Day" value={s.day} onChange={v => update(r => { r.staffing[key].day = v; r.staffing[key].total = v + (r.staffing[key].mid || 0) + r.staffing[key].evening; })} />
                {hasMid && <NumField label="Mid" value={s.mid || 0} onChange={v => update(r => { r.staffing[key].mid = v; r.staffing[key].total = r.staffing[key].day + v + r.staffing[key].evening; })} />}
                <NumField label="Evening" value={s.evening} onChange={v => update(r => { r.staffing[key].evening = v; r.staffing[key].total = r.staffing[key].day + (r.staffing[key].mid || 0) + v; })} />
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 12, color: "#6B7280", fontWeight: 600 }}>Total:</span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: "#111827" }}>{total}</span>
                </div>
              </div>
            </div>
          );
        })}
      </Section>

      {/* Priority Lists */}
      <Section id="priority" title="Priority Order" icon="📋" {...sectionProps}>
        <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 10 }}>Drag to reorder. Higher = gets assigned first.</div>
        <PriorityList title="4th Shift Priority" items={rules.fourthShiftPriority}
          onReorder={arr => update(r => { r.fourthShiftPriority = arr; })} />
        <PriorityList title="2nd Day Priority (Mon–Fri)" items={rules.secondDayPriority}
          onReorder={arr => update(r => { r.secondDayPriority = arr; })} />
        <PriorityList title="Good Weekend People" items={rules.goodWeekendPeople}
          onReorder={arr => update(r => { r.goodWeekendPeople = arr; })} />
      </Section>

      {/* Employee-Specific Fixed Rules */}
      <Section id="fixedRules" title="Employee-Specific Rules" icon="📌" {...sectionProps}>
        <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 10 }}>Special rules tied to specific employees.</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
          {rules.fixedRules.map(fr => (
            <div key={fr.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", background: "#FEF3C7", borderRadius: 8, border: "1px solid #FDE68A" }}>
              <span style={{ fontSize: 14 }}>📌</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#92400E" }}>{fr.empName}</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#111827" }}>{fr.rule}</div>
                {fr.desc && <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 1 }}>{fr.desc}</div>}
              </div>
              <button onClick={() => update(r => { r.fixedRules = r.fixedRules.filter(x => x.id !== fr.id); })}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#DC2626", fontSize: 12, fontWeight: 600 }}>✕</button>
            </div>
          ))}
        </div>
        <div style={{ padding: 12, background: "#F9FAFB", borderRadius: 8, border: "1px dashed #D1D5DB" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 8 }}>Add New Rule</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div>
              <label style={sl}>Employee</label>
              <select value={newFixedRule.empName} onChange={e => setNewFixedRule(f => ({ ...f, empName: e.target.value }))} style={{ ...si, width: 170 }}>
                <option value="">Select...</option>
                {activeEmps.map(e => <option key={e.id} value={e.name}>{e.name}</option>)}
              </select>
            </div>
            <div style={{ flex: 1, minWidth: 140 }}>
              <label style={sl}>Rule</label>
              <input value={newFixedRule.rule} onChange={e => setNewFixedRule(f => ({ ...f, rule: e.target.value }))} placeholder="e.g. Always MCs Thursday" style={si} />
            </div>
            <div style={{ flex: 1, minWidth: 140 }}>
              <label style={sl}>Why (optional)</label>
              <input value={newFixedRule.desc} onChange={e => setNewFixedRule(f => ({ ...f, desc: e.target.value }))} placeholder="Reason" style={si} />
            </div>
            <button onClick={() => {
              if (!newFixedRule.empName || !newFixedRule.rule) return;
              update(r => { r.fixedRules = [...r.fixedRules, { ...newFixedRule, id: `fr-${Date.now()}` }]; });
              setNewFixedRule({ empName: "", rule: "", desc: "" });
            }} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#111827", color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "'DM Sans',sans-serif" }}>Add</button>
          </div>
        </div>
      </Section>

      {/* MC Rotation */}
      <Section id="mcRotation" title="MC Rotation Settings" icon="🔄" {...sectionProps}>
        <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 10 }}>Configure who's in each MC rotation pool.</div>
        {[
          ["sundayLeaderPool", "Sunday MC Leader Pool", activeEmps.filter(e => e.role === "shift_lead"), "#22C55E", "#F0FDF4", "#16A34A"],
          ["thursdayLeaders", "Thursday MC Leaders (fixed)", activeEmps.filter(e => e.role === "shift_lead"), "#F59E0B", "#FEF3C7", "#B45309"],
          ["helperPool", "MC Helper Pool (non-SL)", activeEmps.filter(e => e.role === "regular"), "#3B82F6", "#DBEAFE", "#1D4ED8"],
        ].map(([key, title, pool, borderColor, bg, textColor]) => (
          <div key={key} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 6 }}>{title}</div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {pool.map(e => {
                const inPool = rules.mcRotation[key].includes(e.name);
                return (
                  <button key={e.id} onClick={() => update(r => {
                    r.mcRotation[key] = inPool ? r.mcRotation[key].filter(n => n !== e.name) : [...r.mcRotation[key], e.name];
                  })} style={{
                    padding: "4px 11px", borderRadius: 14, fontSize: 11, fontWeight: 600, cursor: "pointer",
                    border: inPool ? `2px solid ${borderColor}` : "1px solid #D1D5DB",
                    background: inPool ? bg : "#fff",
                    color: inPool ? textColor : "#6B7280",
                    fontFamily: "'DM Sans',sans-serif",
                  }}>{e.name}</button>
                );
              })}
            </div>
          </div>
        ))}
        <Toggle checked={rules.mcRotation.noBackToBackHelpers} label="No back-to-back MC helper repeats"
          desc="Same person shouldn't MC help two weeks in a row"
          onChange={v => update(r => { r.mcRotation.noBackToBackHelpers = v; })} />
      </Section>

      {/* 2nd Day Settings */}
      <Section id="secondDay" title="2nd Day Settings (Mon–Fri)" icon="📅" {...sectionProps}>
        <Toggle checked={rules.secondDay.alternateDifferentPersonEachDay} label="Different person each weekday"
          desc="Rotate the 2nd Day role so the same person doesn't do it back-to-back"
          onChange={v => update(r => { r.secondDay.alternateDifferentPersonEachDay = v; })} />
        <Toggle checked={rules.secondDay.mustBeAvailableAtStart} label="Must be available at shift start"
          desc="Employee must have no unavailability overlap with the 2nd Day start time"
          onChange={v => update(r => { r.secondDay.mustBeAvailableAtStart = v; })} />
        <div style={{ marginTop: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, color: "#6B7280", fontWeight: 600 }}>Start time:</span>
            <input type="time" value={rules.secondDay.startsAt} onChange={e => update(r => { r.secondDay.startsAt = e.target.value; })}
              style={{ ...si, width: 110, padding: "5px 8px" }} />
            <span style={{ fontSize: 11, color: "#9CA3AF" }}>({fmtTime(rules.secondDay.startsAt)})</span>
          </div>
        </div>
      </Section>
    </div>
  );
}
