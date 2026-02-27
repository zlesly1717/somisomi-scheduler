import { useState, useEffect } from "react";
import { DAYS, DAY_LABELS, DAY_FULL, ROLE_CONFIG, TAG_OPTIONS, newUnavail, fmtTime } from "./constants";
import { loadData, saveData } from "./storage";
import { SEED_EMPLOYEES, SEED_RULES } from "./seedData";
import { EmployeesTab } from "./EmployeesTab";
import { TimeOffTab } from "./TimeOffTab";
import { RulesTab } from "./RulesTab";
import { SchoolCalendarTab, SEED_SCHOOL_CALENDAR } from "./SchoolCalendarTab";
import { ScheduleTab } from "./ScheduleTab";

export default function App() {
  const [employees, setEmployees] = useState([]);
  const [timeOffs, setTimeOffs] = useState([]);
  const [rules, setRules] = useState(SEED_RULES);
  const [schoolDates, setSchoolDates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("employees");

  useEffect(() => {
    const d = loadData();
    if (d) {
      setEmployees(d.employees || SEED_EMPLOYEES);
      setTimeOffs(d.timeOffs || []);
      setRules(d.rules || SEED_RULES);
      setSchoolDates(d.schoolDates || SEED_SCHOOL_CALENDAR);
    } else {
      setEmployees(SEED_EMPLOYEES);
      setTimeOffs([]);
      setRules(SEED_RULES);
      setSchoolDates(SEED_SCHOOL_CALENDAR);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!loading) saveData({ employees, timeOffs, rules, schoolDates });
  }, [employees, timeOffs, rules, schoolDates, loading]);

  const ct = r => employees.filter(e => e.status === "active" && e.role === r).length;
  const upcomingTOs = timeOffs.filter(t => new Date(t.date) >= new Date(new Date().toDateString()));

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", fontFamily: "'DM Sans',sans-serif" }}>
        <span style={{ color: "#9CA3AF" }}>Loading...</span>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#F3F4F6", fontFamily: "'DM Sans',sans-serif" }}>
      {/* Header */}
      <div style={{ background: "#111827", padding: "18px 28px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 9.5, fontWeight: 700, color: "#F59E0B", letterSpacing: 2.5, textTransform: "uppercase", marginBottom: 1 }}>
            SomiSomi · The Woodlands
          </div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "#fff", letterSpacing: -0.3 }}>Schedule Builder</h1>
        </div>
        <div style={{ display: "flex", gap: 20 }}>
          {[["SL", ct("shift_lead"), "#F59E0B"], ["REG", ct("regular"), "#3B82F6"], ["TR", ct("trainee"), "#8B5CF6"]].map(([l, n, c]) => (
            <div key={l} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: c }}>{n}</div>
              <div style={{ fontSize: 8.5, color: "#9CA3AF", fontWeight: 700, letterSpacing: 0.8 }}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ background: "#fff", borderBottom: "1px solid #E5E7EB", padding: "0 28px", display: "flex" }}>
        {[["employees", "Employees"], ["timeoff", "Time-Off"], ["calendar", "Calendar"], ["schedule", "Schedule"], ["rules", "Rules"]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            padding: "11px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer", border: "none", background: "none",
            color: tab === k ? "#111827" : "#9CA3AF",
            borderBottom: tab === k ? "2px solid #F59E0B" : "2px solid transparent",
            fontFamily: "'DM Sans',sans-serif",
          }}>
            {l}
            {k === "timeoff" && upcomingTOs.length > 0 && (
              <span style={{ marginLeft: 6, padding: "1px 7px", borderRadius: 10, fontSize: 10, fontWeight: 700, background: "#FEF3C7", color: "#92400E" }}>
                {upcomingTOs.length}
              </span>
            )}
            {k === "calendar" && (
              <span style={{ marginLeft: 6, padding: "1px 7px", borderRadius: 10, fontSize: 10, fontWeight: 700, background: "#DBEAFE", color: "#1D4ED8" }}>📅</span>
            )}
            {k === "schedule" && (
              <span style={{ marginLeft: 6, padding: "1px 7px", borderRadius: 10, fontSize: 10, fontWeight: 700, background: "#F0FDF4", color: "#16A34A" }}>⚡</span>
            )}
            {k === "rules" && (
              <span style={{ marginLeft: 6, padding: "1px 7px", borderRadius: 10, fontSize: 10, fontWeight: 700, background: "#EDE9FE", color: "#6D28D9" }}>⚙</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === "employees" && (
        <EmployeesTab employees={employees} setEmployees={setEmployees} timeOffs={timeOffs} />
      )}
      {tab === "timeoff" && (
        <TimeOffTab employees={employees} timeOffs={timeOffs} setTimeOffs={setTimeOffs} />
      )}
      {tab === "rules" && (
        <RulesTab rules={rules} setRules={setRules} employees={employees} />
      )}
      {tab === "calendar" && (
        <SchoolCalendarTab schoolDates={schoolDates} setSchoolDates={setSchoolDates} />
      )}
      {tab === "schedule" && (
        <ScheduleTab employees={employees} rules={rules} schoolDates={schoolDates} timeOffs={timeOffs} />
      )}
    </div>
  );
}
