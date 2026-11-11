// Nudge store — localStorage persistence + schedule engine
const KEY = "nudge.data.v1";
const SCHEMA = 1;

export const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export const DEFAULT_SCHEDULE = [
  { id: "wake", title: "기상 · 아침 준비 · 이동", time: "06:00–06:50", days: [1, 2, 3, 4, 5] },
  { id: "morning", title: "오전 자습 120분", time: "06:50–08:50", days: [1, 2, 3, 4, 5] },
  { id: "work", title: "복무 · 허용 시간 강의", time: "09:00–18:00", days: [1, 2, 3, 4, 5] },
  { id: "lunch", title: "점심 자습 60분", time: "11:50–12:50", days: [1, 2, 3, 4, 5], optional: true },
  { id: "evening", title: "저녁 자습 60분", time: "18:20–19:20", days: [0, 1, 2, 3, 4] },
  { id: "workout", title: "운동 또는 예정된 휴식", time: "19:20–20:50", days: [0, 1, 2, 3, 4, 5, 6] },
  { id: "shower", title: "샤워 · 이동", time: "20:50–21:20", days: [0, 1, 2, 3, 4, 5, 6] },
  { id: "winddown", title: "통화 · 저녁 식사", time: "21:20–22:50", days: [0, 1, 2, 3, 4, 5, 6] },
  { id: "bedtime", title: "취침 준비", time: "22:50–23:00", days: [0, 1, 2, 3, 4, 5, 6] },
  { id: "rest", title: "휴식", time: "하루 종일", days: [6] },
];

export const WORKOUT_PARTS = ["등", "가슴", "어깨", "팔", "하체", "상체", "하체·코어", "밀기", "당기기", "전신", "휴식"];
export const DEFAULT_ROUTINES = {
  "등": ["풀업", "랫풀다운", "시티드 케이블 로우", "바벨 로우"],
  "가슴": ["벤치프레스", "인클라인 덤벨 프레스", "케이블 체스트 프레스", "딥스"],
  "어깨": ["오버헤드 프레스", "덤벨 숄더 프레스", "레터럴 레이즈", "페이스 풀"],
  "팔": ["바벨 컬", "해머 컬", "트라이셉스 푸시다운", "킥백"],
  "하체": ["스쿼트", "레그 프레스", "런지", "레그 컬"],
  "상체": ["벤치프레스", "바벨 로우", "오버헤드 프레스", "렛풀다운"],
  "하체·코어": ["스쿼트", "레그 컬", "레그 레이즈", "플랭크"],
  "밀기": ["벤치프레스", "오버헤드 프레스", "딥스", "레터럴 레이즈"],
  "당기기": ["풀업", "랫풀다운", "바벨 로우", "바벨 컬"],
  "전신": ["스쿼트", "벤치프레스", "바벨 로우", "버피"],
  "휴식": []
};
export const WORKOUT_PRESETS = [
  { name: "부위별 5분할", desc: "등·가슴·어깨·팔·하체 각 1회 — 세트 여유 있는 중급자", assign: { 1: "등", 2: "가슴", 3: "어깨", 4: "팔", 5: "하체", 0: "휴식", 6: "휴식" } },
  { name: "PPL + 상하체", desc: "밀기·당기기·하체 + 상체·하체(하이브리드) — 회복·빈도 균형 추천", assign: { 1: "밀기", 2: "당기기", 3: "하체", 4: "상체", 5: "하체·코어", 0: "휴식", 6: "휴식" } },
  { name: "상하 2분할", desc: "상체/하체 교대 — 바쁜 초중급자에게 가장 효율적", assign: { 1: "상체", 2: "하체", 3: "휴식", 4: "상체", 5: "하체", 6: "휴식", 0: "휴식" } },
  { name: "풀바디 3일", desc: "전신 루틴 주 3회 — 초보자·시간 부족 시 최적", assign: { 1: "전신", 2: "휴식", 3: "전신", 4: "휴식", 5: "전신", 6: "휴식", 0: "휴식" } }
];

function defaultState() {
  return {
    schema: SCHEMA,
    created: Date.now(),
    schedule: DEFAULT_SCHEDULE.map((c) => ({ ...c })),
    goalBase: 10,
    checks: {},            // { "YYYY-MM-DD": { [checkId]: true } }
    lunch: {},             // { "YYYY-MM-DD": "yes" | "no" }
    sessions: [],          // study sessions { id, date, label, start, end, measuredMin, finalMin }
    timer: null,           // { label, start }
    subjects: [],          // { id, name, chapters: [{ id, name, lectures: [{ id, name, status }] }] }
    goal: { daily: 10, adjustedToday: null, adjustLog: [] },
    workout: {
      assign: { 1: "등", 2: "가슴", 3: "어깨", 4: "팔", 5: "하체", 0: "휴식", 6: "휴식" },
      routines: JSON.parse(JSON.stringify(DEFAULT_ROUTINES)),
      progress: { date: null, done: 0 },
      history: []
    },
    settings: {
      bw: false,
      theme: "system",
      notify: false,
      successMin: 80,
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
    const st = { ...base, ...data, settings: { ...base.settings, ...(data.settings || {}) }, goal: { ...base.goal, ...(data.goal || {}) }, workout: { ...base.workout, ...(data.workout || {}) } };
    if (!Array.isArray(st.schedule) || !st.schedule.length) st.schedule = base.schedule;
    if (typeof st.goalBase !== "number") st.goalBase = 10;
    if (!st.workout || typeof st.workout !== "object") st.workout = base.workout;
    if (!st.workout.assign) st.workout.assign = base.workout.assign;
    if (!st.workout.routines || typeof st.workout.routines !== "object") st.workout.routines = base.workout.routines;
    if (!st.workout.progress) st.workout.progress = { date: null, done: 0 };
    if (!Array.isArray(st.workout.history)) st.workout.history = [];
    return st;
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
  return state.schedule.filter((c) => c.days.includes(dow));
}
export function scheduleItems() {
  return state.schedule;
}
export function updateScheduleItem(id, patch) {
  const it = state.schedule.find((c) => c.id === id);
  if (!it) return;
  Object.assign(it, patch);
  save();
}
export function addScheduleItem({ title, time, days }) {
  state.schedule.push({ id: crypto.randomUUID(), title, time, days, optional: false });
  save();
}
export function deleteScheduleItem(id) {
  state.schedule = state.schedule.filter((c) => c.id !== id);
  save();
}
export function setGoalBase(n) {
  state.goalBase = Math.max(0, Math.min(20, n));
  save();
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
export function autoResolveLunch() {
  const now = new Date();
  const dow = now.getDay();
  if (dow < 1 || dow > 5) return;
  const key = dateKey(now);
  if (state.lunch[key] !== undefined) return;
  const hm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  if (hm >= "11:50") state.lunch[key] = "no";
  save();
}
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

/* ── timer / sessions (Idle→Running→Paused→Pending→Finalized) ── */
export function startTimer(label, kind = "regular") {
  if (state.timer) return false;
  state.timer = { label, kind, start: Date.now(), pausedAt: null, pauseAccum: 0 };
  save();
  return true;
}
export function pauseTimer() {
  const t = state.timer;
  if (!t || t.pausedAt) return false;
  t.pausedAt = Date.now();
  save();
  return true;
}
export function resumeTimer() {
  const t = state.timer;
  if (!t || !t.pausedAt) return false;
  t.pauseAccum += Date.now() - t.pausedAt;
  t.pausedAt = null;
  save();
  return true;
}
export function timerElapsedSec() {
  const t = state.timer;
  if (!t) return 0;
  const end = t.pausedAt || Date.now();
  return Math.max(0, Math.floor((end - t.start - t.pauseAccum) / 1000));
}
export function stopTimer() {
  const t = state.timer;
  if (!t) return null;
  state.timer = null;
  const measured = Math.max(0, Math.round(timerElapsedSecOf(t) / 60));
  const s = {
    id: crypto.randomUUID(),
    date: dateKey(new Date(t.start)),
    label: t.label,
    kind: t.kind,
    start: t.start,
    end: Date.now(),
    measuredMin: measured,
    finalMin: measured,
    status: "pending"
  };
  state.sessions.push(s);
  save();
  return s;
}
function timerElapsedSecOf(t) {
  const end = t.pausedAt || Date.now();
  return Math.max(0, end - t.start - t.pauseAccum);
}
export function finalizeSession(id, finalMin, reason = "") {
  const s = state.sessions.find((x) => x.id === id);
  if (!s) return null;
  s.finalMin = Math.max(0, finalMin);
  s.status = "finalized";
  if (reason && s.finalMin !== s.measuredMin) {
    state.logs.push({ type: "time-correction", date: s.date, from: s.measuredMin, to: s.finalMin, reason, at: Date.now() });
  }
  save();
  return s;
}
export function pendingSessions() {
  return state.sessions.filter((s) => s.status === "pending");
}
export function sessionsInRange(fromKey, toKey) {
  return state.sessions.filter((s) => s.date >= fromKey && s.date <= toKey && s.status === "finalized");
}
export function minutesOn(key) {
  return state.sessions.filter((s) => s.date === key && s.status === "finalized").reduce((a, s) => a + s.finalMin, 0);
}
export function minutesOnSplit(key) {
  let reg = 0, extra = 0;
  for (const s of state.sessions) {
    if (s.date !== key || s.status !== "finalized") continue;
    if (s.kind === "extra") extra += s.finalMin; else reg += s.finalMin;
  }
  return { reg, extra };
}

/* ── lectures ───────────────────────────── */
export function addSubject(name) {
  state.subjects.push({ id: crypto.randomUUID(), name, chapters: [] });
  save();
}
export function renameSubject(id, name) {
  const s = state.subjects.find((x) => x.id === id);
  if (s) { s.name = name; save(); }
}
export function deleteSubject(id) {
  state.subjects = state.subjects.filter((x) => x.id !== id);
  save();
}
export function renameChapter(id, name) {
  for (const s of state.subjects) {
    const c = s.chapters.find((x) => x.id === id);
    if (c) { c.name = name; save(); return; }
  }
}
export function deleteChapter(id) {
  for (const s of state.subjects) {
    const n = s.chapters.length;
    s.chapters = s.chapters.filter((x) => x.id !== id);
    if (s.chapters.length !== n) { save(); return; }
  }
}
export function renameLecture(id, name) {
  for (const s of state.subjects) for (const c of s.chapters) {
    const l = c.lectures.find((x) => x.id === id);
    if (l) { l.name = name; save(); return; }
  }
}
export function deleteLecture(id) {
  for (const s of state.subjects) for (const c of s.chapters) {
    const n = c.lectures.length;
    c.lectures = c.lectures.filter((x) => x.id !== id);
    if (c.lectures.length !== n) { save(); return; }
  }
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
          const prev = l.status;
          l.status = order[(order.indexOf(l.status) + 1) % order.length];
          state.logs.push({ type: "lecture-status", date: dateKey(), lectureId, name: l.name, from: prev, to: l.status, at: Date.now() });
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
  const ids = new Set(state.logs.filter((e) => e.type === "lecture-done" && e.date === key).map((e) => e.lectureId));
  return ids.size;
}
export function logLectureDone(id, name) {
  const dup = state.logs.some((e) => e.type === "lecture-done" && e.date === dateKey() && e.lectureId === id);
  if (!dup) {
    state.logs.push({ type: "lecture-done", date: dateKey(), lectureId: id, name, at: Date.now() });
    save();
  }
}
export function setDailyGoal(n, reason = "") {
  const prev = state.goal.daily;
  state.goal.daily = n;
  if (reason) state.goal.adjustLog.push({ date: dateKey(), from: prev, to: n, reason, at: Date.now() });
  save();
}

/* ── workout cycle ─────────────────────── */
export function todayWorkout(d = new Date()) {
  return state.workout.assign[d.getDay()] || "휴식";
}
export function completeWorkout(rest = false) {
  const part = todayWorkout();
  state.workout.history.push({ date: dateKey(), part: rest ? "휴식" : part, done: true, rest });
  state.workout.progress = { date: null, done: 0 };
  save();
  return part;
}
export function workoutAssign() {
  return state.workout.assign;
}
export function workoutRoutine(part) {
  return state.workout.routines[part] || [];
}
export function setRoutineItem(part, idx, name) {
  const r = state.workout.routines[part];
  if (!r) return;
  if (name === null) r.splice(idx, 1);
  else if (idx === -1) r.push(name);
  else r[idx] = name;
  save();
}
export function routineDoneToday() {
  const p = state.workout.progress;
  const today = dateKey();
  if (p.date !== today) { p.date = today; p.done = 0; }
  return p.done;
}
export function advanceRoutine() {
  const part = todayWorkout();
  const list = workoutRoutine(part);
  const done = routineDoneToday();
  if (done >= list.length - 1) {
    state.workout.progress = { date: null, done: 0 };
    completeWorkout();
    return { finished: true };
  }
  state.workout.progress.done = done + 1;
  save();
  return { finished: false, next: list[done + 1] };
}
export function undoRoutineStep() {
  const p = state.workout.progress;
  if (p.date === dateKey() && p.done > 0) { p.done--; save(); }
}
export function setWorkoutAssign(dow, part) {
  state.workout.assign[dow] = part;
  save();
}
export function workoutDoneOn(key) {
  return state.workout.history.some((h) => h.date === key && h.done);
}
export function undoWorkoutToday() {
  const key = dateKey();
  const idx = state.workout.history.findIndex((h) => h.date === key);
  if (idx === -1) return false;
  state.workout.history.splice(idx, 1);
  save();
  return true;
}
export function workoutOn(key) {
  return state.workout.history.find((h) => h.date === key && h.done) || null;
}

/* ── backup / restore ──────────────────── */
