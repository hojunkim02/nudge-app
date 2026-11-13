// Nudge store — localStorage persistence + schedule engine
const KEY = "nudge.data.v1";
const SCHEMA = 1;

export const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

const DEFAULT_SCHEDULE = [
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

export const WORKOUT_CYCLE = ["등", "가슴", "어깨", "팔", "하체"];
const DEFAULT_ROUTINES = {
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
      successMin: 80
    },
    logs: []
  };
}


/* ── demo seed: 한 달간 사용한 것 같은 예시 데이터 (demo 브랜치 전용) ── */
function demoState() {
  const st = defaultState();
  const today = new Date();
  const dk = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const day = (n) => { const d = new Date(today); d.setDate(d.getDate() - n); return d; };
  let uid = 0;
  const id = () => `demo-${++uid}`;

  // 과목/챕터/강의 (약 60% 완료)
  const mkSub = (name, chapters) => ({
    id: id(), name,
    chapters: chapters.map(([cn, n, doneUpTo]) => ({
      id: id(), name: cn,
      lectures: Array.from({ length: n }, (_, i) => ({ id: id(), name: `${i + 1}강`, status: i < doneUpTo ? "완료" : "미학습" }))
    }))
  });
  st.subjects = [
    mkSub("재무회계론", [["ch01 회계의 기본개념", 12, 12], ["ch02 재무제표", 14, 12], ["ch03 유동자산", 10, 5], ["ch04 유동부채", 8, 0]]),
    mkSub("원가회계", [["ch01 원가의 개념", 10, 10], ["ch02 원가배분", 12, 7], ["ch03 표준원가", 9, 2]]),
    mkSub("경제학", [["ch01 미시경제", 16, 16], ["ch02 거시경제", 14, 9], ["ch03 국제경제", 8, 1]])
  ];

  // 최근 35일 자습 세션 + 체크 + 점심 + 운동 기록
  for (let n = 35; n >= 1; n--) {
    const d = day(n);
    const key = dk(d);
    const dow = d.getDay();
    if (dow === 0) continue;
    const rnd = (n * 37) % 10;
    if (dow === 6 && rnd < 5) continue;
    const reg = 150 + ((n * 53) % 6) * 25;
    st.sessions.push({ id: id(), date: key, label: dow === 6 ? "추가 자습" : (n % 3 === 0 ? "저녁 자습" : "오전 자습"), kind: "regular", start: `08:${String((n * 17) % 60).padStart(2, "0")}`, end: "22:00", measuredMin: reg, finalMin: reg, status: "finalized" });
    if (rnd >= 7) st.sessions.push({ id: id(), date: key, label: "추가 자습", kind: "extra", start: "22:10", end: "23:00", measuredMin: 50, finalMin: 50, status: "finalized" });
    if (dow >= 1 && dow <= 5) {
      st.checks[key] = {};
      for (const c of st.schedule) if (c.days.includes(dow) && !c.optional) st.checks[key][c.id] = rnd >= 3;
      st.lunch[key] = rnd >= 4 ? "yes" : "no";
    }
    if (dow >= 1 && dow <= 5 && rnd >= 3) {
      const part = st.workout.assign[dow];
      st.workout.history.push({ date: key, part, done: true, rest: part === "휴식" });
    }
  }
  // 오늘: 일부 진행 중인 상태
  const tKey = dk(today);
  if ([1, 2, 3, 4, 5].includes(today.getDay())) {
    st.checks[tKey] = {};
    for (const c of st.schedule) if (c.days.includes(today.getDay()) && !c.optional) st.checks[tKey][c.id] = true;
    st.checks[tKey][st.schedule[0].id] = true;
  }
  st.sessions.push({ id: id(), date: tKey, label: "오전 자습", kind: "regular", start: "08:00", end: "11:00", measuredMin: 180, finalMin: 180, status: "finalized" });
  st.sessions.push({ id: id(), date: tKey, label: "점심 자습", kind: "regular", start: "12:10", end: "12:50", measuredMin: 40, finalMin: 40, status: "pending" });
  st.goal.adjustLog = [
    { date: dk(day(12)), from: 10, to: 6, reason: "업무 지시로 야근", at: Date.now() - 12 * 864e5 },
    { date: dk(day(5)), from: 10, to: 8, reason: "재무회계 시험 대비", at: Date.now() - 5 * 864e5 }
  ];
  st.workout.progress = { date: tKey, done: 2 };
  return st;
}

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return demoState();
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
  const order = ["미학습", "완료"];
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
export function reorderRoutine(part, from, to) {
  const r = state.workout.routines[part];
  if (!r || from === to || from < 0 || from >= r.length) return;
  const [item] = r.splice(from, 1);
  r.splice(Math.max(0, Math.min(r.length, to)), 0, item);
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
  if (done >= list.length) {
    state.workout.progress = { date: null, done: 0 };
    completeWorkout();
    return { finished: true };
  }
  state.workout.progress.done = done + 1;
  save();
  return { finished: false, next: list[done + 1] || null, allDone: done + 1 >= list.length };
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
/* ── backup / restore ──────────────────── */
