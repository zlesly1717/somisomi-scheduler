import { useState, useEffect } from "react";
import { EmployeesTab } from "./EmployeesTab";
import { ScheduleTab } from "./ScheduleTab";
import { RulesTab } from "./RulesTab";
import { SchoolCalendarTab } from "./SchoolCalendarTab";
import { SEED_EMPLOYEES, SEED_RULES } from "./seedData";
import { loadData, saveData } from "./storage";

const SEED_SCHOOL_CALENDAR = [
  {date:"2025-09-01",label:"Labor Day",type:"holiday"},
  {date:"2025-10-13",label:"Columbus Day",type:"holiday"},
  {date:"2025-11-03",label:"Staff Development",type:"holiday"},
  {date:"2025-11-25",label:"Thanksgiving Break",type:"holiday"},
  {date:"2025-11-26",label:"Thanksgiving Break",type:"holiday"},
  {date:"2025-11-27",label:"Thanksgiving Day",type:"holiday"},
  {date:"2025-11-28",label:"Thanksgiving Break",type:"holiday"},
  {date:"2025-12-22",label:"Winter Break",type:"holiday"},
  {date:"2025-12-23",label:"Winter Break",type:"holiday"},
  {date:"2025-12-24",label:"Christmas Eve",type:"holiday"},
  {date:"2025-12-25",label:"Christmas Day",type:"holiday"},
  {date:"2025-12-26",label:"Winter Break",type:"holiday"},
  {date:"2025-12-29",label:"Winter Break",type:"holiday"},
  {date:"2025-12-30",label:"Winter Break",type:"holiday"},
  {date:"2025-12-31",label:"New Year's Eve",type:"holiday"},
  {date:"2026-01-01",label:"New Year's Day",type:"holiday"},
  {date:"2026-01-02",label:"Winter Break",type:"holiday"},
  {date:"2026-01-19",label:"MLK Day",type:"holiday"},
  {date:"2026-02-16",label:"Presidents Day",type:"holiday"},
  {date:"2026-03-09",label:"Spring Break",type:"holiday"},
  {date:"2026-03-10",label:"Spring Break",type:"holiday"},
  {date:"2026-03-11",label:"Spring Break",type:"holiday"},
  {date:"2026-03-12",label:"Spring Break",type:"holiday"},
  {date:"2026-03-13",label:"Spring Break",type:"holiday"},
  {date:"2026-04-02",label:"Staff Development",type:"holiday"},
  {date:"2026-04-03",label:"Good Friday",type:"holiday"},
  {date:"2026-05-25",label:"Memorial Day",type:"holiday"},
  {date:"2026-06-04",label:"Last Day of School",type:"holiday"},
  {date:"2026-06-05",label:"Summer Break",type:"summer"},
];

const font = "'DM Sans',sans-serif";

const tabs = [
  { id: "schedule", label: "Schedule", icon: "\ud83d\udcc5" },
  { id: "employees", label: "Employees", icon: "\ud83d\udc65" },
  { id: "rules", label: "Rules", icon: "\u2699\ufe0f" },
  { id: "calendar", label: "School Calendar", icon: "\ud83c\udfeb" },
];

export default function App() {
  const [activeTab, setActiveTab] = useState("schedule");
  const [employees, setEmployees] = useState([]);
  const [rules, setRules] = useState(null);
  const [schoolDates, setSchoolDates] = useState([]);
  const [timeOffs, setTimeOffs] = useState([]);
  const [savedSchedules, setSavedSchedules] = useState({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const data = loadData();
    if (data) {
      const emps = (data.employees || SEED_EMPLOYEES).map(e => {
        if (e.minHours === undefined) {
          if (e.role === "shift_lead") e.minHours = 18;
          else if (e.role === "regular") e.minHours = 12;
          else e.minHours = 0;
        }
        if (!e.guaranteedDays) e.guaranteedDays = [];
        return e;
      });
      const r = data.rules || SEED_RULES;
      if (r.mcRotation && !r.mcRotation.shiftLeadPool) {
        r.mcRotation.shiftLeadPool = [
          ...(r.mcRotation.thursdayLeaders || []),
          ...(r.mcRotation.sundayLeaderPool || []),
        ].filter((v, i, a) => a.indexOf(v) === i);
        r.mcRotation.assistantPool = r.mcRotation.helperPool || [];
        delete r.mcRotation.thursdayLeaders;
        delete r.mcRotation.sundayLeaderPool;
        delete r.mcRotation.helperPool;
      }
      // Migrate: add any new constraints that don't exist yet
      const seedConstraints = SEED_RULES.constraints;
      seedConstraints.forEach(sc => {
        if (!r.constraints.find(c => c.id === sc.id)) {
          r.constraints.push(sc);
        }
      });
      // Migrate: add swirl config if missing
      if (!r.swirl) r.swirl = SEED_RULES.swirl || { minPerShift: 2, weekendOnly: true, swirlers: [] };
      setEmployees(emps);
      setRules(r);
      setSchoolDates(data.schoolDates || SEED_SCHOOL_CALENDAR);
      setTimeOffs(data.timeOffs || []);
      setSavedSchedules(data.savedSchedules || {});
    } else {
      setEmployees(SEED_EMPLOYEES);
      setRules(SEED_RULES);
      setSchoolDates(SEED_SCHOOL_CALENDAR);
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded || !rules) return;
    saveData({ employees, rules, schoolDates, timeOffs, savedSchedules });
  }, [employees, rules, schoolDates, timeOffs, savedSchedules, loaded]);

  if (!loaded || !rules) return <div style={{ padding: 40, textAlign: "center", color: "#9CA3AF" }}>Loading...</div>;

  return (
    <div style={{ fontFamily: font, minHeight: "100vh", background: "#F3F4F6" }}>
      {/* Header - soft butter yellow */}
      <div style={{ background: "#F5E6B8", padding: "14px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #E8D5A0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 22 }}>{"\ud83c\udf66"}</span>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: "#4A3F2F", letterSpacing: -0.3 }}>SomiSomi Scheduler</div>
            <div style={{ fontSize: 10, color: "#8B7D65", fontWeight: 500 }}>The Woodlands</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 2 }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
              padding: "8px 16px", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: font,
              display: "flex", alignItems: "center", gap: 6,
              background: activeTab === t.id ? "#4A3F2F" : "transparent",
              color: activeTab === t.id ? "#F5E6B8" : "#6B5D45",
              fontSize: 12, fontWeight: activeTab === t.id ? 700 : 500,
              transition: "all 0.15s",
            }}>
              <span style={{ fontSize: 14 }}>{t.icon}</span>{t.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "schedule" && <ScheduleTab employees={employees} rules={rules} schoolDates={schoolDates} timeOffs={timeOffs} savedSchedules={savedSchedules} setSavedSchedules={setSavedSchedules} />}
      {activeTab === "employees" && <EmployeesTab employees={employees} setEmployees={setEmployees} />}
      {activeTab === "rules" && <RulesTab rules={rules} setRules={setRules} employees={employees} />}
      {activeTab === "calendar" && <SchoolCalendarTab schoolDates={schoolDates} setSchoolDates={setSchoolDates} />}
    </div>
  );
}
