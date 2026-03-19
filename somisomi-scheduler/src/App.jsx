import { useState, useEffect } from "react";
import { EmployeesTab } from "./EmployeesTab";
import { ScheduleTab } from "./ScheduleTab";
import { RulesTab } from "./RulesTab";
import { SchoolCalendarTab } from "./SchoolCalendarTab";
import { SEED_EMPLOYEES, SEED_RULES } from "./seedData";
import { loadData, saveData } from "./storage";

import { HistoryTab } from "./HistoryTab";

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

// Pre-seeded MC history from Homebase screenshots (4 weeks prior to app adoption)
function buildMCHistorySeed() {
  const mcWeeks = [
    { key: "2026-02-16", // Feb 16-22
      // Thu Feb 19: Spencer(lead) + Crystal + Chan (3 = Lesly helped)
      // Sun Feb 22: Kaitlyn(lead) + Zoe + Susan + Abrar (4 = full crew)
      thu: { leader: "Spencer Losch", helpers: ["Crystal Guel", "Chan In"] },
      sun: { leader: "Kaitlyn Trevino", slHelper: null, helpers: ["Zoe Rains", "Susan Thai", "Abrar Uddin"] },
      breakSL: null, savedAt: "2026-02-22T20:00:00Z",
    },
    { key: "2026-02-23", // Feb 23-Mar 1
      // Thu Feb 26: Crystal(lead) + Kaitlyn + Kennedy (3 = Lesly helped)
      // Sun Mar 1: Spencer(lead) + Chan + Zoe + Kennedy (4 = full crew)
      thu: { leader: "Crystal Guel", helpers: ["Kaitlyn Trevino", "Kennedy Bean"] },
      sun: { leader: "Spencer Losch", slHelper: null, helpers: ["Chan In", "Zoe Rains", "Kennedy Bean"] },
      breakSL: null, savedAt: "2026-03-01T20:00:00Z",
    },
    { key: "2026-03-02", // Mar 2-8
      // Thu Mar 5: Crystal(lead) + Zoe + Sam (3 = Lesly helped)
      // Sun Mar 8: Kaitlyn(lead) + Spencer + Chan + Lena (4 = full crew)
      thu: { leader: "Crystal Guel", helpers: ["Zoe Rains", "Sam Castillo"] },
      sun: { leader: "Kaitlyn Trevino", slHelper: null, helpers: ["Spencer Losch", "Chan In", "Lena Maslak"] },
      breakSL: null, savedAt: "2026-03-08T20:00:00Z",
    },
    { key: "2026-03-09", // Mar 9-15
      // Thu Mar 12: Crystal(lead) + Spencer + Susan + Zoe (4 = full crew)
      // Sun Mar 15: Chan(lead) + Gwen (2 only — Lesly + David helped)
      thu: { leader: "Crystal Guel", helpers: ["Spencer Losch", "Susan Thai", "Zoe Rains"] },
      sun: { leader: "Chan In", slHelper: null, helpers: ["Gwen Ursua"] },
      breakSL: "Kaitlyn Trevino", savedAt: "2026-03-15T20:00:00Z",
    },
  ];

  const result = {};
  mcWeeks.forEach(w => {
    // Build minimal schedule structure with just MC slots so History tab can read them
    const dates = [];
    const d = new Date(w.key + "T12:00:00");
    for (let i = 0; i < 7; i++) {
      const dd = new Date(d); dd.setDate(d.getDate() + i);
      dates.push(dd.toISOString().split("T")[0]);
    }
    const thuDate = dates[3]; // Thursday
    const sunDate = dates[6]; // Sunday

    const schedule = {};
    dates.forEach(dt => { schedule[dt] = []; });

    // Thu MC slots
    schedule[thuDate] = [
      { type: "mc_leader", label: "MC Leader", start: "18:00", end: "23:45", hours: 5.75, isMC: true, empId: "seed", empName: w.thu.leader, empRole: "shift_lead" },
      ...w.thu.helpers.map((h, i) => ({ type: "mc_helper", label: "MC Helper", start: "18:00", end: "23:45", hours: 5.75, isMC: true, empId: "seed-h" + i, empName: h, empRole: "regular" })),
    ];

    // Sun MC slots
    const sunSlots = [
      { type: "mc_leader", label: "MC Leader", start: "18:00", end: "23:45", hours: 5.75, isMC: true, empId: "seed-sl", empName: w.sun.leader, empRole: "shift_lead" },
    ];
    if (w.sun.slHelper) {
      sunSlots.push({ type: "mc_sl_helper", label: "MC Helper (SL)", start: "18:00", end: "23:45", hours: 5.75, isMC: true, empId: "seed-sl2", empName: w.sun.slHelper, empRole: "shift_lead" });
    }
    w.sun.helpers.forEach((h, i) => {
      sunSlots.push({ type: "mc_helper", label: "MC Helper", start: "18:00", end: "23:45", hours: 5.75, isMC: true, empId: "seed-sh" + i, empName: h, empRole: "regular" });
    });
    schedule[sunDate] = sunSlots;

    result[w.key] = {
      schedule,
      savedAt: w.savedAt,
      notes: [],
      weeklyTOs: [],
      _source: "homebase-import",
    };
  });
  return result;
}

const tabs = [
  { id: "schedule", label: "Schedule", icon: "\ud83d\udcc5" },
  { id: "employees", label: "Employees", icon: "\ud83d\udc65" },
  { id: "settings", label: "Settings", icon: "\u2699\ufe0f" },
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
        // Auto-migrate: force specific employees inactive/promoted
        if ((e.name === "Christina Mullins" || e.id === "reg-8") && e.status !== "inactive") e.status = "inactive";
        if ((e.name === "Tiernan Hollister" || e.id === "tr-2") && e.status !== "inactive") e.status = "inactive";
        if ((e.name === "Yise Moya" || e.id === "tr-1") && e.role === "trainee") {
          e.role = "regular"; e.maxShifts = 4; e.minShifts = 3; e.maxHours = 20; e.minHours = 12;
          if (!(e.tags || []).includes("can_swirl")) e.tags = [...(e.tags || []), "can_swirl", "can_mc"];
        }
        if ((e.name === "Grae McKown" || e.id === "reg-7") && !(e.tags || []).includes("can_swirl")) {
          e.tags = [...(e.tags || []), "can_swirl"];
        }
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
      // Migrate: pre-seed MC rotation history from past 4 weeks if not already saved
      const existing = data.savedSchedules || {};
      if (!existing["2026-02-16"]) {
        const mcHistory = buildMCHistorySeed();
        Object.entries(mcHistory).forEach(([k, v]) => { if (!existing[k]) existing[k] = v; });
      }
      setSavedSchedules(existing);
    } else {
      setEmployees(SEED_EMPLOYEES);
      setRules(SEED_RULES);
      setSchoolDates(SEED_SCHOOL_CALENDAR);
      setSavedSchedules(buildMCHistorySeed());
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

      {activeTab === "schedule" && <ScheduleTab employees={employees} setEmployees={setEmployees} rules={rules} schoolDates={schoolDates} timeOffs={timeOffs} savedSchedules={savedSchedules} setSavedSchedules={setSavedSchedules} />}
      {activeTab === "employees" && <EmployeesTab employees={employees} setEmployees={setEmployees} />}
      {activeTab === "settings" && <RulesTab rules={rules} setRules={setRules} employees={employees} schoolDates={schoolDates} setSchoolDates={setSchoolDates} />}
    </div>
  );
}
