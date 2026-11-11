// Nudge store — localStorage persistence + schedule engine
const KEY = "nudge.data.v1";
const SCHEMA = 1;

export const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export const CHECKS = [
  { id: "morning", title: "오전 자습 120분", time: "06:50–08:50", days: [0, 1, 2, 3, 4, 5, 6] },
  { id: "work", title: "복무 · 허용 시간 강의", time: "09:00–18:00", days: [0, 1, 2, 3, 4, 5, 6] },
  { id: "lunch", title: "점심 자습 60분", time: "11:50–12:50", days: [1, 2, 3, 4, 5], optional: true },
  { id: "evening", title: "퇴근 후 자습 60분", time: "18:20–19:20", days: [0, 1, 2, 3, 4, 5] },
  { id: "workout", title: "운동 또는 휴식", time: "19:20–20:50", days: [0, 1, 2, 3, 4, 5, 6] },
  { id: "winddown", title: "통화 · 식사", time: "21:20–22:50", days: [0, 1, 2, 3, 4, 5, 6] },
];

export const WORKOUT_CYCLE = ["등", "가슴", "어깨", "팔", "하체"];

function defaultState() {
  return {
    schema: SCHEMA,
    created: Date.now(),
    checks: {},            // { "YYYY-MM-DD": { [checkId]: true } }
    lunch: {},             // { "YYYY-MM-DD": "yes" | "no" }
    sessions: [],          // study sessions { id, date, label, start, end, measuredMin, finalMin }
    timer: null,           // { label, start }
    subjects: [],          // { id, name, chapters: [{ id, name, lectures: [{ id, name, status }] }] }
    goal: { daily: 10, adjustedToday: null, adjustLog: [] },
    workout: { index: 0, history: [] }, // history: { date, part, done }
    settings: {
      caldavEnabled: false,
      caldavUrl: "https://caldav.icloud.com",
      caldavUser: "",
      caldavPass: "",
      caldavLastSync: null,
      caldavUids: {}
    },
    logs: []
  };
}

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultState();
    const data = JSON.parse(raw);
    const base = defaultState();
    return { ...base, ...data, settings: { ...base.settings, ...(data.settings || {}) }, goal: { ...base.goal, ...(data.goal || {}) }, workout: { ...base.workout, ...(data.workout || {}) } };
  } catch {
    return defaultState();
  }
}

let saveTimer = null;
export function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { console.warn("save failed", e); }
  }, 120);
}

export function get() { return state; }

export function reset() {
  state = defaultState();
  save();
}

/* ── dates ─────────────────────────────── */
export function dateKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function startOfWeek(d = new Date()) {
  const x = new Date(d);
  const day = x.getDay();
  x.setDate(x.getDate() - ((day + 6) % 7)); // Monday
  x.setHours(0, 0, 0, 0);
  return x;
}
export function fmtDate(d) {
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAYS[d.getDay()]})`;
}

/* ── daily checklist ───────────────────── */
export function checksForDate(d = new Date()) {
  const dow = d.getDay();
  return CHECKS.filter((c) => c.days.includes(dow));
}
export function dayChecks(key = dateKey()) {
  return state.checks[key] || {};
}
export function toggleCheck(key, id) {
  if (!state.checks[key]) state.checks[key] = {};
  if (state.checks[key][id]) delete state.checks[key][id];
  else state.checks[key][id] = true;
  save();
  return !!state.checks[key][id];
}
export function setCheck(key, id, val) {
  if (!state.checks[key]) state.checks[key] = {};
  if (val) state.checks[key][id] = true;
  else delete state.checks[key][id];
  save();
}
export function resetDay(key) {
  delete state.checks[key];
  save();
}

/* ── lunch decision (max 3 "yes" per Mon–Fri week) ── */
export function lunchThisWeek() {
  const start = startOfWeek();
  let n = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    if (state.lunch[dateKey(d)] === "yes") n++;
  }
  return n;
}
export function setLunch(key, val) {
  state.lunch[key] = val;
  save();
}
export function lunchAvailable() {
  return lunchThisWeek() < 3;
}

/* ── timer / sessions ──────────────────── */
export function startTimer(label) {
  if (state.timer) return false;
  state.timer = { label, start: Date.now() };
  save();
  return true;
}
export function stopTimer(finalMin = null) {
  const t = state.timer;
  if (!t) return null;
  state.timer = null;
  const measured = Math.max(0, Math.round((Date.now() - t.start) / 60000));
  const s = {
    id: crypto.randomUUID(),
    date: dateKey(new Date(t.start)),
    label: t.label,
    start: t.start,
    end: Date.now(),
    measuredMin: measured,
    finalMin: finalMin == null ? measured : finalMin
  };
  state.sessions.push(s);
  save();
  return s;
}
export function sessionsInRange(fromKey, toKey) {
  return state.sessions.filter((s) => s.date >= fromKey && s.date <= toKey);
}
export function minutesOn(key) {
  return state.sessions.filter((s) => s.date === key).reduce((a, s) => a + s.finalMin, 0);
}

/* ── lectures ───────────────────────────── */
export function addSubject(name) {
  state.subjects.push({ id: crypto.randomUUID(), name, chapters: [] });
  save();
}
export function addChapter(subjectId, name) {
  const s = state.subjects.find((x) => x.id === subjectId);
  if (!s) return;
  s.chapters.push({ id: crypto.randomUUID(), name, lectures: [] });
  save();
}
export function addLecture(chapterId, name) {
  for (const s of state.subjects)
    for (const c of s.chapters)
      if (c.id === chapterId) {
        c.lectures.push({ id: crypto.randomUUID(), name, status: "미학습" });
        save();
        return;
      }
}
export function cycleLecture(lectureId) {
  const order = ["미학습", "복습 필요", "완료"];
  for (const s of state.subjects)
    for (const c of s.chapters)
      for (const l of c.lectures)
        if (l.id === lectureId) {
          l.status = order[(order.indexOf(l.status) + 1) % order.length];
          save();
          return l.status;
        }
}
export function lectureStats() {
  let total = 0, done = 0;
  for (const s of state.subjects)
    for (const c of s.chapters)
      for (const l of c.lectures) {
        total++;
        if (l.status === "완료") done++;
      }
  return { total, done };
}
export function lecturesDoneOn(key) {
  return (state.logs.filter((e) => e.type === "lecture-done" && e.date === key)).length;
}
export function logLectureDone(name) {
  state.logs.push({ type: "lecture-done", date: dateKey(), name, at: Date.now() });
  save();
}
export function setDailyGoal(n, reason = "") {
  const prev = state.goal.daily;
  state.goal.daily = n;
  if (reason) state.goal.adjustLog.push({ date: dateKey(), from: prev, to: n, reason, at: Date.now() });
  save();
}

/* ── workout cycle ─────────────────────── */
export function todayWorkout() {
  return WORKOUT_CYCLE[state.workout.index % WORKOUT_CYCLE.length];
}
export function completeWorkout() {
  const part = todayWorkout();
  state.workout.history.push({ date: dateKey(), part, done: true });
  state.workout.index = (state.workout.index + 1) % WORKOUT_CYCLE.length;
  save();
  return part;
}
export function workoutDoneOn(key) {
  return state.workout.history.some((h) => h.date === key && h.done);
}

/* ── backup / restore ──────────────────── */
export function exportJSON() {
  return JSON.stringify({ ...state, exported: new Date().toISOString() }, null, 2);
}
export function importJSON(text) {
  const data = JSON.parse(text);
  if (typeof data !== "object" || !Array.isArray(data.subjects) || typeof data.settings !== "object") {
    throw new Error("유효하지 않은 Nudge 백업 파일입니다.");
  }
  const backup = localStorage.getItem(KEY) || "";
  localStorage.setItem(KEY + ".backup", backup);
  state = { ...defaultState(), ...data };
  save();
  return true;
}
