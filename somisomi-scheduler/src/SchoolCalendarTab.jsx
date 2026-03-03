import { useState, useRef } from "react";

const si = { padding: "8px 12px", border: "1px solid #D1D5DB", borderRadius: 8, fontSize: 13, outline: "none", fontFamily: "'DM Sans',sans-serif", boxSizing: "border-box", width: "100%" };
const sl = { fontSize: 10.5, fontWeight: 700, color: "#6B7280", marginBottom: 4, display: "block", textTransform: "uppercase", letterSpacing: 0.5 };

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const WDAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

function getDaysInMonth(year, month) { return new Date(year, month + 1, 0).getDate(); }
function getFirstDayOfMonth(year, month) { return new Date(year, month, 1).getDay(); }
function dateStr(y, m, d) { return y + "-" + String(m + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0"); }
function isWeekend(y, m, d) { const day = new Date(y, m, d).getDay(); return day === 0 || day === 6; }

function parseUploadedCalendar(text) {
  const results = [];
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);

  // Try CSV format: date,label,type
  if (lines[0] && lines[0].toLowerCase().includes("date")) {
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(",").map(s => s.trim().replace(/^"|"$/g, ""));
      if (parts.length >= 2) {
        const date = parts[0];
        const label = parts[1] || "Holiday";
        const type = parts[2] || "holiday";
        if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          results.push({ date, label, type: ["holiday","early_release","summer"].includes(type) ? type : "holiday" });
        }
      }
    }
    return results;
  }

  // Try plain text: "March 9-13, 2026 - Spring Break" or "2026-03-09 Spring Break"
  for (const line of lines) {
    // ISO date format
    const isoMatch = line.match(/(\d{4}-\d{2}-\d{2})\s+(.+)/);
    if (isoMatch) {
      const label = isoMatch[2].trim();
      const type = label.toLowerCase().includes("summer") ? "summer" : label.toLowerCase().includes("early") ? "early_release" : "holiday";
      results.push({ date: isoMatch[1], label, type });
      continue;
    }
    // MM/DD/YYYY format
    const slashMatch = line.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(.+)/);
    if (slashMatch) {
      const [, mm, dd, yyyy, label] = slashMatch;
      const date = yyyy + "-" + mm.padStart(2,"0") + "-" + dd.padStart(2,"0");
      const type = label.toLowerCase().includes("summer") ? "summer" : label.toLowerCase().includes("early") ? "early_release" : "holiday";
      results.push({ date, label: label.trim(), type });
    }
  }
  return results;
}

export function SchoolCalendarTab({ schoolDates, setSchoolDates }) {
  const [viewMonth, setViewMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [addForm, setAddForm] = useState({ startDate: "", endDate: "", label: "", type: "holiday" });
  const [filterType, setFilterType] = useState("all");
  const [uploadStatus, setUploadStatus] = useState(null);
  const fileRef = useRef(null);

  const { year, month } = viewMonth;
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);

  const navigate = (dir) => {
    setViewMonth(prev => {
      let m = prev.month + dir; let y = prev.year;
      if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; }
      return { year: y, month: m };
    });
  };

  const getDateEntry = (d) => schoolDates.find(e => e.date === dateStr(year, month, d));

  const toggleDate = (d) => {
    const ds = dateStr(year, month, d);
    const exists = schoolDates.find(e => e.date === ds);
    if (exists) { setSchoolDates(prev => prev.filter(e => e.date !== ds)); }
    else { setSchoolDates(prev => [...prev, { date: ds, label: "Holiday", type: "holiday" }]); }
  };

  const addRange = () => {
    if (!addForm.startDate) return;
    const end = addForm.endDate || addForm.startDate;
    const start = new Date(addForm.startDate + "T12:00:00");
    const endD = new Date(end + "T12:00:00");
    const newDates = [];
    const current = new Date(start);
    while (current <= endD) {
      const ds = current.toISOString().split("T")[0];
      if (!schoolDates.find(e => e.date === ds)) {
        newDates.push({ date: ds, label: addForm.label || "Holiday", type: addForm.type });
      }
      current.setDate(current.getDate() + 1);
    }
    setSchoolDates(prev => [...prev, ...newDates]);
    setAddForm({ startDate: "", endDate: "", label: "", type: "holiday" });
  };

  const removeDate = (date) => setSchoolDates(prev => prev.filter(e => e.date !== date));

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target.result;
      const parsed = parseUploadedCalendar(text);
      if (parsed.length === 0) {
        setUploadStatus({ type: "error", msg: "Could not parse any dates. Use CSV format: date,label,type (e.g. 2026-09-07,Labor Day,holiday)" });
      } else {
        setSchoolDates(parsed);
        setUploadStatus({ type: "success", msg: "Loaded " + parsed.length + " dates from " + file.name + ". Previous calendar was replaced." });
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleExport = () => {
    const csv = "date,label,type\n" + schoolDates.sort((a,b) => a.date.localeCompare(b.date)).map(d => d.date + "," + d.label + "," + d.type).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "school-calendar.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const typeColors = {
    holiday: { bg: "#FEE2E2", color: "#DC2626", dot: "#EF4444" },
    early_release: { bg: "#FEF3C7", color: "#B45309", dot: "#F59E0B" },
    summer: { bg: "#DBEAFE", color: "#1D4ED8", dot: "#3B82F6" },
  };

  const upcoming = [...schoolDates]
    .filter(d => { if (filterType !== "all" && d.type !== filterType) return false; return new Date(d.date + "T12:00:00") >= new Date(new Date().toDateString()); })
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const grouped = {};
  upcoming.forEach(d => {
    const dt = new Date(d.date + "T12:00:00");
    const key = dt.getFullYear() + "-" + dt.getMonth();
    if (!grouped[key]) grouped[key] = { label: MONTHS[dt.getMonth()] + " " + dt.getFullYear(), dates: [] };
    grouped[key].dates.push(d);
  });

  return (
    <div style={{ padding: "18px 28px" }}>
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-start" }}>
        {/* Calendar */}
        <div style={{ flex: "1 1 340px", minWidth: 320 }}>
          <div style={{ background: "#fff", borderRadius: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.06)", overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", background: "#111827" }}>
              <button onClick={() => navigate(-1)} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", fontSize: 18, padding: "4px 8px" }}>{"\u2039"}</button>
              <span style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>{MONTHS[month]} {year}</span>
              <button onClick={() => navigate(1)} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", fontSize: 18, padding: "4px 8px" }}>{"\u203a"}</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderBottom: "1px solid #E5E7EB" }}>
              {WDAYS.map(d => (<div key={d} style={{ textAlign: "center", padding: "8px 0", fontSize: 10, fontWeight: 700, color: "#9CA3AF" }}>{d}</div>))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
              {Array.from({ length: firstDay }).map((_, i) => (<div key={"empty-" + i} style={{ padding: 8 }} />))}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const d = i + 1;
                const entry = getDateEntry(d);
                const weekend = isWeekend(year, month, d);
                const today = new Date();
                const isToday = year === today.getFullYear() && month === today.getMonth() && d === today.getDate();
                const tc2 = entry ? typeColors[entry.type] || typeColors.holiday : null;
                return (
                  <div key={d} onClick={() => toggleDate(d)} style={{
                    padding: "6px 4px", textAlign: "center", cursor: "pointer", minHeight: 48,
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                    background: entry ? tc2.bg : "transparent", transition: "background 0.1s",
                    border: isToday ? "2px solid #F59E0B" : "1px solid #F3F4F6",
                  }} title={entry ? entry.label + " (" + entry.type + ")" : weekend ? "Weekend" : "Click to add holiday"}>
                    <span style={{ fontSize: 12, fontWeight: isToday ? 800 : entry ? 700 : 500, color: entry ? tc2.color : weekend ? "#D1D5DB" : "#374151" }}>{d}</span>
                    {entry && (<span style={{ fontSize: 7, fontWeight: 600, color: tc2.color, lineHeight: 1.1, maxWidth: 40, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.label}</span>)}
                  </div>
                );
              })}
            </div>
            <div style={{ padding: "10px 18px", borderTop: "1px solid #E5E7EB", display: "flex", gap: 14, flexWrap: "wrap" }}>
              {[["Holiday (No School)", typeColors.holiday.dot], ["Early Release", typeColors.early_release.dot], ["Summer Break", typeColors.summer.dot]].map(([l, c]) => (
                <div key={l} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "#6B7280" }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: c, display: "inline-block" }} />{l}
                </div>
              ))}
            </div>
            <div style={{ padding: "8px 18px 14px", fontSize: 10.5, color: "#9CA3AF", fontStyle: "italic" }}>Click any date to toggle holiday on/off</div>
          </div>

          {/* Upload / Export */}
          <div style={{ background: "#fff", borderRadius: 12, padding: 16, marginTop: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#111827", marginBottom: 8 }}>{"\ud83d\udcc1"} Upload New Calendar</div>
            <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 10, lineHeight: 1.5 }}>
              Upload a CSV or text file to replace the current calendar. CSV format: <code>date,label,type</code> (e.g. <code>2026-09-07,Labor Day,holiday</code>).
              This will replace all existing dates.
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleFileUpload} style={{ display: "none" }} />
              <button onClick={() => fileRef.current?.click()} style={{ padding: "8px 16px", borderRadius: 8, border: "2px dashed #3B82F6", background: "#EFF6FF", color: "#2563EB", cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "'DM Sans',sans-serif" }}>{"\ud83d\udce4"} Upload Calendar File</button>
              <button onClick={handleExport} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #D1D5DB", background: "#fff", color: "#6B7280", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans',sans-serif" }}>{"\ud83d\udce5"} Export Current Calendar</button>
            </div>
            {uploadStatus && (
              <div style={{ marginTop: 8, padding: "8px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600, background: uploadStatus.type === "success" ? "#F0FDF4" : "#FEF2F2", color: uploadStatus.type === "success" ? "#16A34A" : "#DC2626", border: "1px solid " + (uploadStatus.type === "success" ? "#BBF7D0" : "#FCA5A5") }}>
                {uploadStatus.msg}
              </div>
            )}
          </div>

          {/* Add range */}
          <div style={{ background: "#fff", borderRadius: 12, padding: 16, marginTop: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#111827", marginBottom: 10 }}>Add Date Range</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
              <div><label style={sl}>Start</label><input type="date" value={addForm.startDate} onChange={e => setAddForm(f => ({ ...f, startDate: e.target.value }))} style={{ ...si, width: 140 }} /></div>
              <div><label style={sl}>End (optional)</label><input type="date" value={addForm.endDate} onChange={e => setAddForm(f => ({ ...f, endDate: e.target.value }))} style={{ ...si, width: 140 }} /></div>
              <div style={{ flex: 1, minWidth: 120 }}><label style={sl}>Label</label><input value={addForm.label} onChange={e => setAddForm(f => ({ ...f, label: e.target.value }))} placeholder="e.g. Spring Break" style={si} /></div>
              <div><label style={sl}>Type</label><select value={addForm.type} onChange={e => setAddForm(f => ({ ...f, type: e.target.value }))} style={{ ...si, width: 120 }}><option value="holiday">Holiday</option><option value="early_release">Early Release</option><option value="summer">Summer</option></select></div>
              <button onClick={addRange} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#111827", color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "'DM Sans',sans-serif" }}>Add</button>
            </div>
          </div>
        </div>

        {/* Date list */}
        <div style={{ flex: "1 1 280px", minWidth: 260 }}>
          <div style={{ background: "#fff", borderRadius: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.06)", padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>Upcoming Dates</div>
              <span style={{ padding: "2px 8px", borderRadius: 10, fontSize: 10, fontWeight: 700, background: "#EDE9FE", color: "#6D28D9" }}>{upcoming.length}</span>
            </div>
            <div style={{ display: "flex", gap: 4, marginBottom: 10, flexWrap: "wrap" }}>
              {[["all","All"],["holiday","Holidays"],["early_release","Early Release"],["summer","Summer"]].map(([k,l]) => (
                <button key={k} onClick={() => setFilterType(k)} style={{ padding: "3px 10px", borderRadius: 12, fontSize: 10, fontWeight: 600, cursor: "pointer", border: filterType === k ? "none" : "1px solid #D1D5DB", background: filterType === k ? "#111827" : "#fff", color: filterType === k ? "#fff" : "#6B7280", fontFamily: "'DM Sans',sans-serif" }}>{l}</button>
              ))}
            </div>
            <div style={{ maxHeight: 500, overflow: "auto" }}>
              {Object.values(grouped).length === 0 ? (
                <div style={{ color: "#9CA3AF", fontSize: 12, padding: "12px 0" }}>No upcoming dates.</div>
              ) : Object.values(grouped).map(g => (
                <div key={g.label} style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>{g.label}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    {g.dates.map(d => {
                      const tc2 = typeColors[d.type] || typeColors.holiday;
                      const dt = new Date(d.date + "T12:00:00");
                      const dayName = WDAYS[dt.getDay()];
                      return (
                        <div key={d.date} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", background: tc2.bg, borderRadius: 6, fontSize: 12 }}>
                          <span style={{ width: 7, height: 7, borderRadius: "50%", background: tc2.dot, flexShrink: 0 }} />
                          <span style={{ fontWeight: 700, color: tc2.color, minWidth: 30 }}>{dayName}</span>
                          <span style={{ fontWeight: 600, color: "#374151", minWidth: 36 }}>{dt.getDate()}</span>
                          <span style={{ color: "#6B7280", flex: 1 }}>{d.label}</span>
                          <button onClick={() => removeDate(d.date)} style={{ background: "none", border: "none", cursor: "pointer", color: "#DC2626", fontSize: 10, fontWeight: 600 }}>{"\u2715"}</button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ background: "#fff", borderRadius: 12, padding: 16, marginTop: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#111827", marginBottom: 8 }}>Calendar Stats</div>
            {[["Total holidays", schoolDates.filter(d => d.type === "holiday").length, "#EF4444"],
              ["Early release", schoolDates.filter(d => d.type === "early_release").length, "#F59E0B"],
              ["Summer dates", schoolDates.filter(d => d.type === "summer").length, "#3B82F6"]
            ].map(([label, count, color]) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 2 }}>
                <span style={{ color: "#6B7280" }}>{label}</span><span style={{ fontWeight: 700, color }}>{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
