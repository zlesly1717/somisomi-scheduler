export const DAYS = ["mon","tue","wed","thu","fri","sat","sun"];
export const DAY_LABELS = {mon:"M",tue:"T",wed:"W",thu:"Th",fri:"F",sat:"Sa",sun:"Su"};
export const DAY_FULL = {mon:"Monday",tue:"Tuesday",wed:"Wednesday",thu:"Thursday",fri:"Friday",sat:"Saturday",sun:"Sunday"};

export const ROLE_CONFIG = {
  shift_lead:{label:"Shift Lead",color:"#B45309",bg:"#FEF3C7",accent:"#F59E0B"},
  regular:{label:"Regular",color:"#1D4ED8",bg:"#DBEAFE",accent:"#3B82F6"},
  trainee:{label:"Trainee",color:"#6D28D9",bg:"#EDE9FE",accent:"#8B5CF6"},
};

export const TAG_OPTIONS = [
  {id:"can_mc",label:"Can MC"},
  {id:"good_weekend",label:"Good Weekend"},
  {id:"mc_rotation_sun",label:"MC Sun"},
  {id:"mc_rotation_thu",label:"MC Thu"},
  {id:"day_lead_eligible",label:"Day Lead"},
  {id:"no_weekday_nights",label:"No Wkday Nights"},
  {id:"second_day_priority",label:"2nd Day Priority"},
  {id:"fourth_shift_priority",label:"4th Shift Priority"},
];

export const newUnavail = () => Object.fromEntries(DAYS.map(d => [d,{allDay:false,start:"",end:""}]));

export const fmtTime = t => {
  if(!t) return "";
  const [h,m] = t.split(":");
  const hr = +h;
  const ap = hr >= 12 ? "pm" : "am";
  return `${hr > 12 ? hr-12 : hr || 12}${m !== "00" ? `:${m}` : ""}${ap}`;
};
