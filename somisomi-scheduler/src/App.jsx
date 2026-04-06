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
      // Thu Feb 19: Chan MC Lead + Spencer + Crystal
      // Sun Feb 22: Zoe MC Lead + Kaitlyn + Abrar + Susan | Break: Spencer
      thu: { leader: "Chan In", helpers: ["Spencer Losch", "Crystal Guel"] },
      sun: { leader: "Zoe Rains", slHelper: null, helpers: ["Kaitlyn Trevino", "Abrar Uddin", "Susan Thai"] },
      breakSL: "Spencer Losch", savedAt: "2026-02-22T20:00:00Z",
    },
    { key: "2026-02-23", // Feb 23 - Mar 1
      // Thu Feb 26: Crystal MC Lead + Kennedy
      // Sun Mar 1: Chan MC Lead + Zoe + Spencer + Kennedy
      thu: { leader: "Crystal Guel", helpers: ["Kennedy Bean"] },
      sun: { leader: "Chan In", slHelper: null, helpers: ["Zoe Rains", "Spencer Losch", "Kennedy Bean"] },
      breakSL: null, savedAt: "2026-03-01T20:00:00Z",
    },
    { key: "2026-03-02", // Mar 2-8
      // Thu Mar 5: Crystal MC Lead + Zoe + Susan
      // Sun Mar 8: Kaitlyn MC Lead + Spencer + Chan + Gwen
      thu: { leader: "Crystal Guel", helpers: ["Zoe Rains", "Susan Thai"] },
      sun: { leader: "Kaitlyn Trevino", slHelper: "Spencer Losch", helpers: ["Chan In", "Gwen Ursua"] },
      breakSL: null, savedAt: "2026-03-08T20:00:00Z",
    },
    { key: "2026-03-09", // Mar 9-15
      // Thu Mar 12: Crystal MC Lead + Zoe + Spencer + Susan | Break: Kaitlyn (time off all week)
      // Sun Mar 15: Chan MC Lead + Gwen
      thu: { leader: "Crystal Guel", helpers: ["Zoe Rains", "Spencer Losch", "Susan Thai"] },
      sun: { leader: "Chan In", slHelper: null, helpers: ["Gwen Ursua"] },
      breakSL: "Kaitlyn Trevino", savedAt: "2026-03-15T20:00:00Z",
    },
    { key: "2026-03-16", // Mar 16-22
      // Thu Mar 19: Spencer MC Lead + Zoe + Yise | Break: Chan
      // Sun Mar 22: Kaitlyn MC Lead + Crystal + Abrar
      thu: { leader: "Spencer Losch", helpers: ["Zoe Rains", "Yise Moya"] },
      sun: { leader: "Kaitlyn Trevino", slHelper: null, helpers: ["Crystal Guel", "Abrar Uddin"] },
      breakSL: "Chan In", savedAt: "2026-03-22T20:00:00Z",
    },
    { key: "2026-03-23", // Mar 23-29
      // Thu Mar 26: Crystal MC Lead + Kennedy
      // Sun Mar 29: Spencer MC Lead + Kaitlyn + Kennedy + Zoe
      thu: { leader: "Crystal Guel", helpers: ["Kennedy Bean"] },
      sun: { leader: "Spencer Losch", slHelper: "Kaitlyn Trevino", helpers: ["Kennedy Bean", "Zoe Rains"] },
      breakSL: null, savedAt: "2026-03-29T20:00:00Z",
    },
    { key: "2026-03-30", // Mar 30 - Apr 5
      // Thu Apr 2: Kaitlyn MC Lead + Zoe + Nani | Break: Crystal
      // Sun Apr 5: Chan MC Lead + Spencer + Zoe + Alli
      thu: { leader: "Kaitlyn Trevino", helpers: ["Zoe Rains", "Nani Hoomes"] },
      sun: { leader: "Chan In", slHelper: null, helpers: ["Spencer Losch", "Zoe Rains", "Alli Campos"] },
      breakSL: "Crystal Guel", savedAt: "2026-04-05T20:00:00Z",
    },
    { key: "2026-04-06", // Apr 6-12
      // Thu Apr 9: Crystal MC Lead + Yise + Sam | Break: Spencer
      // Sun Apr 12: Chan MC Lead + Zoe (SL helper) + Abrar + Kaitlyn
      thu: { leader: "Crystal Guel", helpers: ["Yise Moya", "Sam Castillo"] },
      sun: { leader: "Chan In", slHelper: "Zoe Rains", helpers: ["Abrar Uddin", "Kaitlyn Trevino"] },
      breakSL: "Spencer Losch", savedAt: "2026-04-12T20:00:00Z",
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
      _mcVersion: 2,
    };
  });
  return result;
}

function buildApr6Schedule() {
  const EMP = {
    "Kaitlyn Trevino": { id: "sl-3", role: "shift_lead" },
    "Chan In":         { id: "sl-1", role: "shift_lead" },
    "Zoe Rains":       { id: "sl-2", role: "shift_lead" },
    "Crystal Guel":    { id: "sl-5", role: "shift_lead" },
    "Spencer Losch":   { id: "sl-4", role: "shift_lead" },
    "Abrar Uddin":     { id: "reg-6", role: "regular" },
    "Yise Moya":       { id: "tr-1",  role: "regular" },
    "Sam Castillo":    { id: "reg-2", role: "regular" },
    "Kennedy Bean":    { id: "reg-1", role: "regular" },
    "Susan Thai":      { id: "reg-5", role: "regular" },
    "Marissa Shelton": { id: "tr-3",  role: "trainee" },
    "Gwen Ursua":      { id: "reg-4", role: "regular" },
    "Nani Hoomes":     { id: "tr-4",  role: "trainee" },
    "Alli Campos":     { id: "tr-5",  role: "trainee" },
    "Grae McKown":     { id: "reg-7", role: "regular" },
    "Cesia Garcia":    { id: "tr-6",  role: "trainee" },
  };
  const s = (name, type, label, start, end, hours, opts = {}) => {
    const e = EMP[name] || { id: "unknown", role: "regular" };
    return { type, label, start, end, hours, slOnly: !!opts.slOnly, isMC: !!opts.isMC,
             isTraineeSlot: !!opts.traineeSlot, order: opts.order || 0,
             empId: e.id, empName: name, empRole: e.role };
  };
  return {
    // MONDAY 4/6 (Holiday): Crystal day lead, Abrar+Susan day, Zoe+Kaitlyn eve SL, Gwen+Alli eve
    "2026-04-06": [
      s("Crystal Guel",    "day_lead",    "Day Lead (SL)", "12:00","18:00", 6,    {slOnly:true, order:0}),
      s("Abrar Uddin",     "day",         "Day / 2nd Day", "12:00","18:00", 6,    {order:1}),
      s("Susan Thai",      "day",         "Day / 2nd Day", "12:00","18:00", 6,    {order:2}),
      s("Zoe Rains",       "evening_sl",  "Evening SL",    "18:00","22:30", 4.5,  {slOnly:true, order:20}),
      s("Kaitlyn Trevino", "evening_sl2", "Evening SL",    "18:30","22:30", 4,    {slOnly:true, order:21}),
      s("Gwen Ursua",      "evening",     "Evening",       "18:00","22:30", 4.5,  {order:22}),
      s("Alli Campos",     "evening",     "Evening",       "18:15","22:30", 4.25, {order:23}),
    ],
    // TUESDAY 4/7: Kaitlyn day lead, Sam+Gwen day, Chan eve SL, Marissa+Alli+Grae eve
    "2026-04-07": [
      s("Kaitlyn Trevino", "day_lead",    "Day Lead (SL)", "12:00","18:00", 6,    {slOnly:true, order:0}),
      s("Sam Castillo",    "day",         "Day / 2nd Day", "12:00","18:00", 6,    {order:1}),
      s("Chan In",         "evening_sl",  "Evening SL",    "18:00","22:30", 4.5,  {slOnly:true, order:20}),
      s("Marissa Shelton", "evening",     "Evening",       "18:00","22:30", 4.5,  {order:21}),
      s("Alli Campos",     "evening",     "Evening",       "18:15","22:30", 4.25, {order:22}),
      s("Grae McKown",     "evening",     "Evening",       "18:30","22:30", 4,    {order:23}),
    ],
    // WEDNESDAY 4/8: Spencer day lead, Gwen day, Crystal eve SL, Yise+Susan+Cesia eve
    "2026-04-08": [
      s("Spencer Losch",   "day_lead",    "Day Lead (SL)", "12:00","18:00", 6,    {slOnly:true, order:0}),
      s("Gwen Ursua",      "day",         "Day / 2nd Day", "12:00","18:00", 6,    {order:1}),
      s("Crystal Guel",    "evening_sl",  "Evening SL",    "18:00","22:30", 4.5,  {slOnly:true, order:20}),
      s("Yise Moya",       "evening",     "Evening",       "18:00","22:30", 4.5,  {order:21}),
      s("Susan Thai",      "evening",     "Evening",       "18:15","22:30", 4.25, {order:22}),
      s("Cesia Garcia",    "evening",     "Evening",       "18:30","22:30", 4,    {order:23, isTraineeSlot:true}),
    ],
    // THURSDAY 4/9 (MC): Chan day lead, Kennedy day, Crystal MC lead, Yise+Sam MC helpers, Nani floor
    "2026-04-09": [
      s("Chan In",         "day_lead",    "Day Lead (SL)", "12:00","18:00", 6,    {slOnly:true, order:0}),
      s("Kennedy Bean",    "day",         "Day / 2nd Day", "12:00","18:00", 6,    {order:1}),
      s("Crystal Guel",    "mc_leader",   "MC Lead",       "18:00","23:45", 5.75, {slOnly:true, isMC:true, order:20}),
      s("Yise Moya",       "mc_helper",   "MC Helper",     "18:30","23:45", 5.25, {isMC:true, order:21}),
      s("Sam Castillo",    "mc_helper",   "MC Helper",     "18:15","23:45", 5.5,  {isMC:true, order:22}),
      s("Nani Hoomes",     "evening",     "Evening",       "18:00","22:30", 4.5,  {order:30}),
    ],
    // FRIDAY 4/10: Zoe day lead, Marissa day, Kaitlyn+Chan eve SL, Kennedy+Gwen+Nani eve
    "2026-04-10": [
      s("Zoe Rains",       "day_lead",    "Day Lead (SL)", "11:30","18:00", 6.5,  {slOnly:true, order:0}),
      s("Marissa Shelton", "day",         "Day / 2nd Day", "11:30","18:00", 6.5,  {order:1}),
      s("Kaitlyn Trevino", "evening_sl",  "Evening SL",    "18:00","23:30", 5.5,  {slOnly:true, order:20}),
      s("Chan In",         "evening_sl2", "Evening SL",    "19:00","23:30", 4.5,  {slOnly:true, order:21}),
      s("Kennedy Bean",    "evening",     "Evening",       "18:30","23:30", 5,    {order:22}),
      s("Gwen Ursua",      "evening",     "Evening",       "18:00","23:30", 5.5,  {order:23}),
      s("Nani Hoomes",     "evening",     "Evening",       "18:15","23:30", 5.25, {order:24}),
    ],
    // SATURDAY 4/11: Zoe day lead, Abrar+Susan day, Cesia mid, Spencer eve SL, Crystal+Sam+Yise+Marissa eve
    "2026-04-11": [
      s("Zoe Rains",       "day_lead",    "Day Lead (SL)", "11:30","18:00", 6.5,  {slOnly:true, order:0}),
      s("Abrar Uddin",     "day",         "Day / 2nd Day", "11:30","18:00", 6.5,  {order:1}),
      s("Susan Thai",      "day",         "Day / 2nd Day", "11:30","18:00", 6.5,  {order:2}),
      s("Cesia Garcia",    "mid",         "Mid Shift",     "15:00","19:00", 4,    {traineeSlot:true, order:10}),
      s("Spencer Losch",   "evening_sl",  "Evening SL",    "18:00","23:30", 5.5,  {slOnly:true, order:20}),
      s("Crystal Guel",    "evening",     "Evening",       "19:00","23:30", 4.5,  {order:22}),
      s("Sam Castillo",    "evening",     "Evening",       "18:15","23:30", 5.25, {order:23}),
      s("Yise Moya",       "evening",     "Evening",       "19:00","23:30", 4.5,  {order:24}),
      s("Marissa Shelton", "evening",     "Evening",       "18:00","23:30", 5.5,  {order:25}),
    ],
    // SUNDAY 4/12 (MC): Spencer+Kaitlyn day lead, Yise+Nani day, Kennedy mid, Chan MC lead, Zoe MC SL, Abrar MC helper, Alli floor eve
    "2026-04-12": [
      s("Spencer Losch",   "day_lead",    "Day Lead (SL)", "11:30","18:00", 6.5,  {slOnly:true, order:0}),
      s("Yise Moya",       "day",         "Day / 2nd Day", "11:30","18:00", 6.5,  {order:1}),
      s("Nani Hoomes",     "day",         "Day / 2nd Day", "11:30","18:00", 6.5,  {order:2}),
      s("Kennedy Bean",    "mid",         "Mid Shift",     "15:00","19:00", 4,    {order:10}),
      s("Chan In",         "mc_leader",   "MC Lead",       "18:00","23:45", 5.75, {slOnly:true, isMC:true, order:20}),
      s("Zoe Rains",       "mc_sl_helper","MC Crew (SL)",  "19:00","23:45", 4.75, {slOnly:true, isMC:true, order:21}),
      s("Abrar Uddin",     "mc_helper",   "MC Helper",     "18:15","23:45", 5.5,  {isMC:true, order:22}),
      s("Kaitlyn Trevino", "mc_helper",   "MC Helper",     "19:00","23:45", 4.75, {isMC:true, order:23}),
      s("Alli Campos",     "evening",     "Evening",       "18:00","23:30", 5.5,  {order:30}),
    ],
  };
}

// Full Mar 30 - Apr 5 schedule from Homebase screenshots
function buildMar30Schedule() {
  const EMP = {
    "Kaitlyn Trevino": { id: "sl-3", role: "shift_lead" },
    "Chan In":         { id: "sl-1", role: "shift_lead" },
    "Zoe Rains":       { id: "sl-2", role: "shift_lead" },
    "Crystal Guel":    { id: "sl-5", role: "shift_lead" },
    "Spencer Losch":   { id: "sl-4", role: "shift_lead" },
    "Abrar Uddin":     { id: "reg-6", role: "regular" },
    "Yise Moya":       { id: "tr-1",  role: "regular" },
    "Sam Castillo":    { id: "reg-2", role: "regular" },
    "Kennedy Bean":    { id: "reg-1", role: "regular" },
    "Susan Thai":      { id: "reg-5", role: "regular" },
    "Marissa Shelton": { id: "tr-3",  role: "trainee" },
    "Gwen Ursua":      { id: "reg-4", role: "regular" },
    "Nani Hoomes":     { id: "tr-4",  role: "trainee" },
    "Alli Campos":     { id: "tr-5",  role: "trainee" },
    "Grae McKown":     { id: "reg-7", role: "regular" },
    "Cesia Garcia":    { id: "tr-6",  role: "trainee" },
  };
  const s = (name, type, label, start, end, hours, opts = {}) => {
    const e = EMP[name] || { id: "unknown", role: "regular" };
    return { type, label, start, end, hours, slOnly: !!opts.slOnly, isMC: !!opts.isMC,
             isTraineeSlot: !!opts.traineeSlot, order: opts.order || 0,
             empId: e.id, empName: name, empRole: e.role };
  };
  return {
    // MONDAY 3/30: Crystal day lead, Abrar day, Spencer eve SL, Kennedy+Gwen eve, Alli trainee
    "2026-03-30": [
      s("Crystal Guel",    "day_lead",   "Day Lead (SL)", "12:00","18:00", 6,    {slOnly:true, order:0}),
      s("Abrar Uddin",     "day",        "Day / 2nd Day", "12:00","18:00", 6,    {order:1}),
      s("Spencer Losch",   "evening_sl", "Evening SL",    "18:00","22:30", 4.5,  {slOnly:true, order:20}),
      s("Kennedy Bean",    "evening",    "Evening",       "18:00","22:30", 4.5,  {order:21}),
      s("Gwen Ursua",      "evening",    "Evening",       "18:15","22:30", 4.25, {order:22}),
      s("Alli Campos",     "evening",    "Evening",       "18:30","22:30", 4,    {order:23}),
    ],
    // TUESDAY 3/31: Spencer day lead, Marissa day, Sam eve, Grae+Cesia eve
    "2026-03-31": [
      s("Spencer Losch",   "day_lead",   "Day Lead (SL)", "12:00","18:00", 6,    {slOnly:true, order:0}),
      s("Marissa Shelton", "day",        "Day / 2nd Day", "12:00","18:00", 6,    {order:1}),
      s("Sam Castillo",    "evening",    "Evening",       "18:00","22:30", 4.5,  {order:20}),
      s("Grae McKown",     "evening",    "Evening",       "18:15","22:30", 4.25, {order:21}),
      s("Cesia Garcia",    "evening",    "Evening",       "18:30","22:30", 4,    {order:22}),
    ],
    // WEDNESDAY 4/1: Kaitlyn day lead, Susan day, Zoe eve SL, Marissa+Yise eve, Nani trainee
    "2026-04-01": [
      s("Kaitlyn Trevino", "day_lead",   "Day Lead (SL)", "12:00","18:00", 6,    {slOnly:true, order:0}),
      s("Susan Thai",      "day",        "Day / 2nd Day", "12:00","18:00", 6,    {order:1}),
      s("Zoe Rains",       "evening_sl", "Evening SL",    "18:00","22:30", 4.5,  {slOnly:true, order:20}),
      s("Marissa Shelton", "evening",    "Evening",       "18:00","22:30", 4.5,  {order:21}),
      s("Yise Moya",       "evening",    "Evening",       "18:15","22:30", 4.25, {order:22}),
      s("Nani Hoomes",     "evening",    "Evening",       "18:30","22:30", 4,    {order:23}),
    ],
    // THURSDAY 4/2 (MC): Chan day lead, Yise day, Kaitlyn MC lead, Zoe+Nani MC helpers, Susan floor
    "2026-04-02": [
      s("Chan In",         "day_lead",   "Day Lead (SL)", "12:00","18:00", 6,    {slOnly:true, order:0}),
      s("Yise Moya",       "day",        "Day / 2nd Day", "12:00","18:00", 6,    {order:1}),
      s("Kaitlyn Trevino", "mc_leader",  "MC Lead",       "18:00","23:45", 5.75, {slOnly:true, isMC:true, order:20}),
      s("Zoe Rains",       "mc_helper",  "MC Helper",     "18:15","23:45", 5.5,  {isMC:true, order:21}),
      s("Nani Hoomes",     "mc_helper",  "MC Helper",     "18:30","23:45", 5.25, {isMC:true, order:22}),
      s("Susan Thai",      "evening",    "Evening",       "18:00","22:30", 4.5,  {order:30}),
    ],
    // FRIDAY 4/3 (Good Friday Holiday): Crystal day SL, Sam+Yise day, Abrar+Gwen eve, Crystal eve SL
    "2026-04-03": [
      s("Crystal Guel",    "day_lead",   "Day Lead (SL)", "11:30","18:00", 6.5,  {slOnly:true, order:0}),
      s("Sam Castillo",    "day",        "Day / 2nd Day", "11:30","18:00", 6.5,  {order:1}),
      s("Yise Moya",       "day",        "Day / 2nd Day", "11:30","18:00", 6.5,  {order:2}),
      s("Crystal Guel",    "evening_sl", "Evening SL",    "18:30","23:30", 5,    {slOnly:true, order:20}),
      s("Abrar Uddin",     "evening",    "Evening",       "18:00","23:30", 5.5,  {order:21}),
      s("Gwen Ursua",      "evening",    "Evening",       "18:15","23:30", 5.25, {order:22}),
    ],
    // SATURDAY 4/4: Chan day SL, Abrar+Kennedy+Susan+Nani day, Sam mid, Spencer eve SL, Yise eve
    "2026-04-04": [
      s("Chan In",         "day_lead",   "Day Lead (SL)", "11:30","18:00", 6.5,  {slOnly:true, order:0}),
      s("Abrar Uddin",     "day",        "Day / 2nd Day", "11:30","18:00", 6.5,  {order:1}),
      s("Kennedy Bean",    "day",        "Day / 2nd Day", "11:30","18:00", 6.5,  {order:2}),
      s("Susan Thai",      "day",        "Day / 2nd Day", "11:30","18:00", 6.5,  {order:3}),
      s("Sam Castillo",    "mid",        "Mid Shift",     "15:00","19:00", 4,    {order:10}),
      s("Spencer Losch",   "evening_sl", "Evening SL",    "18:00","23:30", 5.5,  {slOnly:true, order:20}),
      s("Yise Moya",       "evening",    "Evening",       "18:15","23:30", 5.25, {order:21}),
      s("Nani Hoomes",     "day",        "Day / 2nd Day", "11:30","18:00", 6.5,  {order:4}),
    ],
    // SUNDAY 4/5 (MC): Kaitlyn day SL, Marissa+Yise day, Sam mid, Spencer MC lead, Chan+Gwen+Alli MC, Susan floor
    "2026-04-05": [
      s("Kaitlyn Trevino", "day_lead",   "Day Lead (SL)", "11:30","18:00", 6.5,  {slOnly:true, order:0}),
      s("Marissa Shelton", "day",        "Day / 2nd Day", "11:30","18:00", 6.5,  {order:1}),
      s("Yise Moya",       "day",        "Day / 2nd Day", "11:30","18:00", 6.5,  {order:2}),
      s("Sam Castillo",    "mid",        "Mid Shift",     "15:00","19:00", 4,    {order:10}),
      s("Spencer Losch",   "mc_leader",  "MC Lead",       "18:00","23:45", 5.75, {slOnly:true, isMC:true, order:20}),
      s("Chan In",         "mc_helper",  "MC Helper",     "18:00","23:45", 5.75, {isMC:true, order:21}),
      s("Gwen Ursua",      "mc_helper",  "MC Helper",     "18:15","23:45", 5.5,  {isMC:true, order:22}),
      s("Alli Campos",     "mc_helper",  "MC Helper",     "19:00","23:45", 4.75, {isMC:true, order:23}),
      s("Susan Thai",      "evening",    "Evening",       "18:00","22:30", 4.5,  {order:30}),
    ],
  };
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
      if (!existing["2026-02-16"] || !existing["2026-03-23"] || !existing["2026-03-30"] || !existing["2026-04-06"] || existing["2026-02-16"]?._mcVersion !== 2) {
        const mcHistory = buildMCHistorySeed();
        Object.entries(mcHistory).forEach(([k, v]) => { if (!existing[k]) existing[k] = v; });
      }
      // Seed full Apr 6-12 schedule — force replace if version is old
      if (!existing["2026-04-06"] || existing["2026-04-06"]._source === "homebase-import" || 
          !existing["2026-04-06"].schedule?.["2026-04-06"]?.length ||
          existing["2026-04-06"]._schedVersion !== 4) {
        existing["2026-04-06"] = {
          schedule: buildApr6Schedule(),
          savedAt: "2026-04-12T20:00:00Z",
          notes: [], weeklyTOs: [], weekStart: "2026-04-06",
          label: "Week of Apr 6 (Homebase)", _source: "homebase-full", _schedVersion: 4,
        };
      }
      // Seed full Mar 30 - Apr 5 schedule — Spencer removed from Sun MC (owner covered)
      if (!existing["2026-03-30"] || existing["2026-03-30"]._source === "homebase-import" ||
          !existing["2026-03-30"].schedule?.["2026-03-30"]?.length ||
          (existing["2026-03-30"]._schedVersion || 0) < 5) {
        const mar30Sched = buildMar30Schedule();
        // Spencer covered by owner on Sun Apr 5 — remove him from MC lead slot
        if (mar30Sched["2026-04-05"]) {
          mar30Sched["2026-04-05"] = mar30Sched["2026-04-05"].map(slot =>
            slot.isMC && slot.empName === "Spencer Losch"
              ? { ...slot, empId: null, empName: null, empRole: null }
              : slot
          );
        }
        existing["2026-03-30"] = {
          schedule: mar30Sched,
          savedAt: "2026-04-05T20:00:00Z",
          notes: [], weeklyTOs: [], weekStart: "2026-03-30",
          label: "Week of Mar 30 (Homebase)", _source: "homebase-full", _schedVersion: 5,
        };
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
      {activeTab === "history" && <HistoryTab employees={employees} savedSchedules={savedSchedules} setSavedSchedules={setSavedSchedules} rules={rules} />}
      {activeTab === "settings" && <RulesTab rules={rules} setRules={setRules} employees={employees} schoolDates={schoolDates} setSchoolDates={setSchoolDates} />}
    </div>
  );
}
