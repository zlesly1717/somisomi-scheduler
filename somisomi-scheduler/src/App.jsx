import { useState, useEffect } from "react";
import { EmployeesTab } from "./EmployeesTab";
import { ScheduleTab } from "./ScheduleTab";
import { RulesTab } from "./RulesTab";
import { SchoolCalendarTab } from "./SchoolCalendarTab";
import { SEED_EMPLOYEES, SEED_RULES } from "./seedData";
import { loadData, saveData } from "./storage";

import { HistoryTab } from "./HistoryTab";

const SEED_SCHOOL_CALENDAR = [
  // --- Conroe ISD 2025-2026 Student Holidays ---
  {date:"2025-09-01",label:"Labor Day",type:"holiday"},
  // Oct 10-13 holiday (Oct 10 = Teacher Exchange, Oct 11-13 = Holiday)
  {date:"2025-10-10",label:"Holiday",type:"holiday"},
  {date:"2025-10-13",label:"Holiday",type:"holiday"},
  // Nov 3 = Teacher Exchange, Nov 4 = Teacher Professional Learning — both no students
  {date:"2025-11-03",label:"Holiday",type:"holiday"},
  {date:"2025-11-04",label:"Holiday",type:"holiday"},
  // Thanksgiving Nov 24-28
  {date:"2025-11-24",label:"Thanksgiving Break",type:"holiday"},
  {date:"2025-11-25",label:"Thanksgiving Break",type:"holiday"},
  {date:"2025-11-26",label:"Thanksgiving Break",type:"holiday"},
  {date:"2025-11-27",label:"Thanksgiving Day",type:"holiday"},
  {date:"2025-11-28",label:"Thanksgiving Break",type:"holiday"},
  // Winter Break Dec 22 - Jan 5
  {date:"2025-12-22",label:"Winter Break",type:"holiday"},
  {date:"2025-12-23",label:"Winter Break",type:"holiday"},
  {date:"2025-12-24",label:"Winter Break",type:"holiday"},
  {date:"2025-12-25",label:"Winter Break",type:"holiday"},
  {date:"2025-12-26",label:"Winter Break",type:"holiday"},
  {date:"2025-12-29",label:"Winter Break",type:"holiday"},
  {date:"2025-12-30",label:"Winter Break",type:"holiday"},
  {date:"2025-12-31",label:"Winter Break",type:"holiday"},
  {date:"2026-01-01",label:"New Year's Day",type:"holiday"},
  {date:"2026-01-02",label:"Winter Break",type:"holiday"},
  {date:"2026-01-05",label:"Winter Break",type:"holiday"},
  {date:"2026-01-19",label:"Martin Luther King Jr. Day",type:"holiday"},
  {date:"2026-02-13",label:"Holiday",type:"holiday"},
  {date:"2026-02-16",label:"Presidents Day",type:"holiday"},
  // Spring Break Mar 9-13
  {date:"2026-03-09",label:"Spring Break",type:"holiday"},
  {date:"2026-03-10",label:"Spring Break",type:"holiday"},
  {date:"2026-03-11",label:"Spring Break",type:"holiday"},
  {date:"2026-03-12",label:"Spring Break",type:"holiday"},
  {date:"2026-03-13",label:"Spring Break",type:"holiday"},
  // Apr 3-6 holiday (Apr 3 = Good Friday, Apr 6 = Teacher Exchange — both no students)
  {date:"2026-04-03",label:"Good Friday",type:"holiday"},
  {date:"2026-04-06",label:"Holiday",type:"holiday"},
  {date:"2026-05-25",label:"Memorial Day",type:"holiday"},
  {date:"2026-06-05",label:"Summer Break",type:"summer"},
];

const font = "'DM Sans',sans-serif";

// Pre-seeded MC history from Homebase screenshots (4 weeks prior to app adoption)
function buildMCHistorySeed() {
  const mcWeeks = [
    { key: "2026-02-16", // Feb 16-22
      // Thu Feb 19: Chan SL + Spencer + Crystal
      // Sun Feb 22: Zoe SL + Kaitlyn + Abrar + Susan
      thu: { leader: "Chan In", helpers: ["Spencer Losch", "Crystal Guel"] },
      sun: { leader: "Zoe Rains", slHelper: null, helpers: ["Kaitlyn Trevino", "Abrar Uddin", "Susan Thai"] },
      breakSL: null, savedAt: "2026-02-22T20:00:00Z",
    },
    { key: "2026-02-23", // Feb 23-Mar 1
      // Thu Feb 26: Kaitlyn SL + Crystal + Kennedy
      // Sun Mar 1: Chan SL + Zoe + Spencer + Kennedy
      thu: { leader: "Kaitlyn Trevino", helpers: ["Crystal Guel", "Kennedy Bean"] },
      sun: { leader: "Chan In", slHelper: null, helpers: ["Zoe Rains", "Spencer Losch", "Kennedy Bean"] },
      breakSL: null, savedAt: "2026-03-01T20:00:00Z",
    },
    { key: "2026-03-02", // Mar 2-8
      // Thu Mar 5: Zoe SL + Crystal + Sam
      // Sun Mar 8: Kaitlyn SL + Spencer + Chan + Lena
      thu: { leader: "Zoe Rains", helpers: ["Crystal Guel", "Sam Castillo"] },
      sun: { leader: "Kaitlyn Trevino", slHelper: null, helpers: ["Spencer Losch", "Chan In", "Lena Maslak"] },
      breakSL: null, savedAt: "2026-03-08T20:00:00Z",
    },
    { key: "2026-03-09", // Mar 9-15
      // Thu Mar 12: Zoe SL + Spencer + Crystal + Susan
      // Sun Mar 15: Chan SL + Gwen
      thu: { leader: "Zoe Rains", helpers: ["Spencer Losch", "Crystal Guel", "Susan Thai"] },
      sun: { leader: "Chan In", slHelper: null, helpers: ["Gwen Ursua"] },
      breakSL: "Kaitlyn Trevino", savedAt: "2026-03-15T20:00:00Z",
    },
    { key: "2026-03-16", // Mar 16-22
      // Thu Mar 19: Spencer SL + Zoe + Yise
      // Sun Mar 22: Kaitlyn SL + Crystal + Abrar + Sam
      thu: { leader: "Spencer Losch", helpers: ["Zoe Rains", "Yise Moya"] },
      sun: { leader: "Kaitlyn Trevino", slHelper: null, helpers: ["Crystal Guel", "Abrar Uddin", "Sam Castillo"] },
      breakSL: "Chan In", savedAt: "2026-03-22T20:00:00Z",
    },
    { key: "2026-03-23", // Mar 23-29
      // Thu Mar 26: Crystal SL + Chan + Marissa (trainee)
      // Sun Mar 29: Spencer SL + Kaitlyn + Kennedy + Susan
      thu: { leader: "Crystal Guel", helpers: ["Chan In", "Marissa Shelton"] },
      sun: { leader: "Spencer Losch", slHelper: "Kaitlyn Trevino", helpers: ["Kennedy Bean", "Susan Thai"] },
      breakSL: null, savedAt: "2026-03-29T20:00:00Z",
    },
    { key: "2026-03-30", // Mar 30 - Apr 5
      // Thu Apr 2: Kaitlyn SL + Zoe + Nani (trainee) — Crystal's break week
      // Sun Apr 5: Spencer SL + Chan + Gwen + Alli (trainee)
      thu: { leader: "Kaitlyn Trevino", helpers: ["Zoe Rains", "Nani Hoomes"] },
      sun: { leader: "Spencer Losch", slHelper: null, helpers: ["Chan In", "Gwen Ursua", "Alli Campos"] },
      breakSL: "Crystal Guel", savedAt: "2026-04-05T20:00:00Z",
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
      { type: "mc_leader", label: "MC Leader (Eve SL)", start: "18:00", end: "23:45", hours: 5.75, isMC: true, order: 20, empId: "seed", empName: w.thu.leader, empRole: "shift_lead" },
      ...w.thu.helpers.map((h, i) => ({ type: "mc_helper", label: "MC Helper", start: "18:00", end: "23:45", hours: 5.75, isMC: true, order: 22 + i, empId: "seed-h" + i, empName: h, empRole: "regular" })),
    ];

    // Sun MC slots
    const sunSlots = [
      { type: "mc_leader", label: "MC Leader (Eve SL)", start: "18:00", end: "23:45", hours: 5.75, isMC: true, order: 20, empId: "seed-sl", empName: w.sun.leader, empRole: "shift_lead" },
    ];
    if (w.sun.slHelper) {
      sunSlots.push({ type: "mc_sl_helper", label: "MC Helper (SL)", start: "18:00", end: "23:45", hours: 5.75, isMC: true, order: 21, empId: "seed-sl2", empName: w.sun.slHelper, empRole: "shift_lead" });
    }
    w.sun.helpers.forEach((h, i) => {
      sunSlots.push({ type: "mc_helper", label: "MC Helper", start: "18:00", end: "23:45", hours: 5.75, isMC: true, order: 22 + i, empId: "seed-sh" + i, empName: h, empRole: "regular" });
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
  { id: "history", label: "History", icon: "\ud83d\udcca" },
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
    loadData().then(data => {
    if (data) {
      const emps = (data.employees || SEED_EMPLOYEES).map(e => {
        if (e.minHours === undefined) {
          if (e.role === "shift_lead") e.minHours = 18;
          else if (e.role === "regular") e.minHours = 12;
          else e.minHours = 0;
        }
        if (!e.guaranteedDays) e.guaranteedDays = [];
        // Migrate: regulars max 3 shifts (not 4)
        if (e.role === "regular" && e.maxShifts === 4) { e.maxShifts = 3; e.minShifts = 3; }
        // Migrate: Nani unavailable Monday
        if ((e.name === "Nani Hoomes" || e.id === "tr-4") && !e.unavailability?.mon?.allDay) {
          if (!e.unavailability) e.unavailability = {};
          e.unavailability.mon = { allDay: true, start: "", end: "" };
        }
        // Auto-migrate: force specific employees inactive/promoted
        if ((e.name === "Christina Mullins" || e.id === "reg-8") && e.status !== "inactive") e.status = "inactive";
        if ((e.name === "Tiernan Hollister" || e.id === "tr-2") && e.status !== "inactive") e.status = "inactive";
        if ((e.name === "Lena Maslak" || e.id === "reg-3") && e.status !== "inactive") e.status = "inactive";
        if ((e.name === "Yise Moya" || e.id === "tr-1") && e.role === "trainee") {
          e.role = "regular"; e.maxShifts = 4; e.minShifts = 3; e.maxHours = 20; e.minHours = 12;
          if (!(e.tags || []).includes("can_swirl")) e.tags = [...(e.tags || []), "can_swirl", "can_mc"];
        }
        if ((e.name === "Grae McKown" || e.id === "reg-7") && !(e.tags || []).includes("can_swirl")) {
          e.tags = [...(e.tags || []), "can_swirl"];
        }
        if ((e.name === "Grae McKown" || e.id === "reg-7") && !(e.tags || []).includes("mc_exempt")) {
          e.tags = [...(e.tags || []), "mc_exempt"];
        }
        return e;
      });
      // Migrate: add Cesia Garcia if not already present
      if (!emps.find(e => e.name === "Cesia Garcia" || e.id === "tr-6")) {
        emps.push({
          id:"tr-6", name:"Cesia Garcia", role:"trainee", status:"active",
          maxShifts:2, minShifts:1, maxHours:10, minHours:0,
          tags:[], guaranteedDays:[], traineeCumulative:4.0,
          notes:"High schooler. Max 1-2 shifts per week, evenings/weekends preferred.",
          unavailability:{
            mon:{allDay:false,start:"06:00",end:"15:00"},
            tue:{allDay:false,start:"06:00",end:"15:00"},
            wed:{allDay:false,start:"06:00",end:"15:00"},
            thu:{allDay:false,start:"06:00",end:"15:00"},
            fri:{allDay:false,start:"06:00",end:"15:00"},
            sat:{allDay:false,start:"",end:""},
            sun:{allDay:false,start:"",end:""},
          },
        });
      }
      const r = data.rules || SEED_RULES;
      if (!r.mcRotation) r.mcRotation = SEED_RULES.mcRotation;
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
      if (!r.constraints) r.constraints = [];
      seedConstraints.forEach(sc => {
        if (!r.constraints.find(c => c.id === sc.id)) {
          r.constraints.push(sc);
        }
      });
      // Migrate: add swirl config if missing
      if (!r.swirl) r.swirl = SEED_RULES.swirl || { minPerShift: 2, weekendOnly: true, swirlers: [] };
      setEmployees(emps);
      setRules(r);
      // Migrate: force school calendar to Conroe ISD if it has outdated entries
      const savedCal = data.schoolDates || [];
      const hasOutdated = savedCal.some(d => d.date === "2026-04-02") || !savedCal.some(d => d.date === "2026-02-13");
      setSchoolDates(hasOutdated ? SEED_SCHOOL_CALENDAR : savedCal);
      setTimeOffs(data.timeOffs || []);
      // Migrate: pre-seed MC rotation history from past 4 weeks if not already saved
      const existing = data.savedSchedules || {};
      // Remove Apr 6 test week ONLY if it has no real schedule data (just seeded MC history)
      if (existing["2026-04-06"] && existing["2026-04-06"]._source === "homebase-import") {
        delete existing["2026-04-06"];
      }
      if (!existing["2026-02-16"] || !existing["2026-03-23"] || !existing["2026-03-30"]) {
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
    });
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
      {activeTab === "history" && <HistoryTab employees={employees} savedSchedules={savedSchedules} rules={rules} />}
      {activeTab === "settings" && <RulesTab rules={rules} setRules={setRules} employees={employees} schoolDates={schoolDates} setSchoolDates={setSchoolDates} />}
    </div>
  );
}
