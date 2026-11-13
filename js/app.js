// Nudge — app shell: router, views, sheets, toasts
import * as store from "./store.js";
import * as gcal from "./gcal.js";

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const viewEl = $("#view");
const titleEl = $("#view-title");
const subEl = $("#view-subtitle");
let currentView = "today";

/* ── toast ─────────────────────────────── */
export function toast(msg, ms = 2600) {
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  $("#toast-root").appendChild(t);
  setTimeout(() => {
    t.style.transition = "opacity .3s, transform .3s";
    t.style.opacity = "0";
    t.style.transform = "translateY(8px)";
    setTimeout(() => t.remove(), 320);
  }, ms);
}

/* ── sheet (stacked: backdrop tap pops one level) ── */
const sheetStack = [];
export function openSheet(html, onMount) {
  const root = $("#sheet-root");
  const layer = document.createElement("div");
  layer.innerHTML = `<div class="sheet-backdrop"></div><div class="sheet" role="dialog"><div class="grabber"></div>${html}</div>`;
  root.appendChild(layer);
  const close = () => {
    layer.remove();
    const i = sheetStack.indexOf(close);
    if (i >= 0) sheetStack.splice(i, 1);
    render();
  };
  sheetStack.push(close);
  const layers = root.querySelectorAll(":scope > div");
  layers.forEach((el, i) => { if (i < layers.length - 1) el.style.display = "none"; });
  const wrappedClose = () => {
    close();
    const rest = root.querySelectorAll(":scope > div");
    if (rest.length) rest[rest.length - 1].style.display = "";
  };
  $(".sheet-backdrop", layer).addEventListener("click", wrappedClose);
  if (onMount) onMount($(".sheet", layer), wrappedClose);
  return wrappedClose;
}

/* ── helpers ───────────────────────────── */
const CHECK_SVG = `<svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const UNDO_SVG = `<svg viewBox="0 0 24 24" width="20" height="20"><path d="M9 14 4 9l5-5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 9h9a7 7 0 1 1 0 14h-3" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>`;
const PLUS_SVG = `<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>`;
const PENCIL_SVG = `<svg viewBox="0 0 24 24"><path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M13.5 6.5l4 4" fill="none" stroke="currentColor" stroke-width="2"/></svg>`;
const TRASH_SVG = `<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m3 0v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 11v6M14 11v6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
const GRIP_SVG = `<svg viewBox="0 0 24 24"><path d="M9 5.5h.01M9 12h.01M9 18.5h.01M15.5 5.5h.01M15.5 12h.01M15.5 18.5h.01" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/></svg>`;
const fmtMin = (m) => `${Math.floor(m / 60)}시간 ${m % 60}분`;
let openSwipe = null;
function makeSwipeable(row, onDelete) {
  const wrap = row.parentElement;
  let startX = null, dx = 0, open = false;
  const delBtn = document.createElement("button");
  delBtn.className = "swipe-del";
  delBtn.innerHTML = TRASH_SVG;
  delBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    row.style.transition = "transform .25s var(--spring), opacity .2s";
    row.style.transform = "translateX(-140px)";
    row.style.opacity = "0";
    setTimeout(onDelete, 180);
  });
  wrap.insertBefore(delBtn, row);
  const close = () => { open = false; row.style.transition = "transform .28s cubic-bezier(.32,.72,0,1)"; row.style.transform = ""; };
  const setOpen = (v) => {
    open = v;
    row.style.transition = "transform .28s cubic-bezier(.32,.72,0,1)";
    row.style.transform = v ? "translateX(-84px)" : "";
    if (v) { if (openSwipe && openSwipe.row !== row) openSwipe.close(); openSwipe = { row, close }; }
    else if (openSwipe && openSwipe.row === row) openSwipe = null;
  };
  const begin = (x) => {
    startX = x; dx = open ? -84 : 0;
    row.style.transition = "none";
  };
  const move = (x) => {
    if (startX == null) return;
    dx = Math.min(0, Math.max(-140, x - startX + (open ? -0 : 0)));
    if (open && dx > -84) dx = Math.min(0, dx);
    row.style.transform = `translateX(${dx}px)`;
  };
  const finish = () => {
    if (startX == null) return;
    setOpen(dx < -50);
    startX = null;
  };
  row.addEventListener("touchstart", (e) => { if (e.target.closest(".drag-handle")) return; begin(e.touches[0].clientX); }, { passive: true });
  row.addEventListener("touchmove", (e) => move(e.touches[0].clientX), { passive: true });
  row.addEventListener("touchend", finish);
  row.addEventListener("mousedown", (e) => {
    if (e.target.closest(".drag-handle")) return;
    begin(e.clientX);
    const mm = (ev) => move(ev.clientX);
    const mu = () => { finish(); window.removeEventListener("mousemove", mm); window.removeEventListener("mouseup", mu); };
    window.addEventListener("mousemove", mm);
    window.addEventListener("mouseup", mu);
  });
  row.addEventListener("click", () => { if (open) setOpen(false); }, true);
}

const nowHM = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
};

/* ── screen wake lock (타이머 실행 중 화면 꺼짐 방지) ── */
let wakeLock = null;
async function keepAwake() {
  try { wakeLock = await navigator.wakeLock?.request("screen"); } catch { wakeLock = null; }
}
function releaseAwake() {
  try { wakeLock?.release(); } catch {}
  wakeLock = null;
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && store.get().timer && !store.get().timer.pausedAt) keepAwake();
});

/* ═════════ VIEW: TODAY ═════════ */
let selDay = null;

function viewToday() {
  store.autoResolveLunch();
  const s = store.get();
  const todayKey = store.dateKey();
  const key = selDay || todayKey;
  const isToday = key === todayKey;
  const selDate = new Date(key + "T00:00:00");
  const checks = store.checksForDate(selDate);
  const done = store.dayChecks(key);
  const doneCount = checks.filter((c) => done[c.id]).length;
  const pct = checks.length ? Math.round((doneCount / checks.length) * 100) : 0;
  const todayMin = store.minutesOn(key);

  const todayLunch = s.lunch[key];
  const lunchCheck = checks.find((c) => c.id === "lunch" || c.title.includes("점심"));
  const lunchId = lunchCheck ? lunchCheck.id : "lunch";
  const lunchYes = store.lunchThisWeek();
  const lunchDecided = todayLunch !== undefined;
  if (lunchCheck) lunchCheck.hidden = !lunchDecided && todayLunch !== "yes";

  const week = store.startOfWeek();
  const strip = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(week); d.setDate(week.getDate() + i);
    const k = store.dateKey(d);
    const cs = store.checksForDate(d);
    const dn = store.dayChecks(k);
    const all = cs.length && cs.every((c) => dn[c.id] || (c.optional && s.lunch[k] === "no"));
    const cls = ["day-dot", k === key ? "today" : "", all ? "done" : "", k === todayKey ? "is-today" : ""].filter(Boolean).join(" ");
    return `<button class="${cls}" data-day="${k}">${store.WEEKDAYS[d.getDay()]}</button>`;
  }).join("");

  const pending = store.pendingSessions();
  const pendingHtml = pending.length ? `
    <div class="card">
      <p class="card-title">확정 대기 ${pending.length}건</p>
      ${pending.map((p) => `
        <div class="row">
          <div class="row-main">
            <div class="row-title">${esc(p.label)}</div>
            <div class="row-sub">${p.date} · 측정 ${p.measuredMin}분 · 미확정</div>
          </div>
          <button class="btn" style="min-height:38px;padding:0 14px;font-size:14px" data-finalize="${p.id}">확정</button>
        </div>`).join("")}
      <p class="muted">미확정 세션은 통계에 포함되지 않습니다.</p>
    </div>` : "";

  const lunchHtml = (lunchCheck && isToday) ? `
    <div class="card">
      <p class="card-title">점심 자습 · 이번 주 예 ${lunchYes}/3</p>
      <div class="row">
        <div class="row-main">
          <div class="row-title">오늘은 점심 자습이 가능한가요?</div>
          <div class="row-sub">11:50까지 응답이 없으면 '아니오'로 기록됩니다</div>
        </div>
        ${lunchDecided
          ? `<span class="chip ${todayLunch === "yes" ? "accent" : ""}">${todayLunch === "yes" ? "예" : "아니오"}</span>`
          : `<div style="display:flex;gap:8px">
              <button class="btn" style="min-height:40px;padding:0 16px" id="lunch-no" ${store.lunchAvailable() ? "" : "disabled"}>아니오</button>
              <button class="btn primary" style="min-height:40px;padding:0 16px" id="lunch-yes" ${store.lunchAvailable() && nowHM() < "11:50" ? "" : "disabled"}>예</button>
            </div>`}
      </div>
      ${!store.lunchAvailable() && !lunchDecided ? `<p class="muted">이번 주 '예' 3회를 모두 사용했습니다. 다음 주 월요일에 초기화됩니다.</p>` : ""}
      ${store.lunchAvailable() && !lunchDecided && nowHM() >= "11:50" ? `<p class="muted">11:50이 지나 '예' 선택이 마감되었습니다. 미응답은 '아니오'로 기록됩니다.</p>` : ""}
    </div>` : "";

  const hmNow = nowHM();
  let nowItem = null, nextItem = null;
  if (isToday) {
    const mins = hmNow.split(":").map(Number);
    const cur = mins[0] * 60 + mins[1];
    for (const c of checks) {
      const m = c.time.match(/(\d{1,2}):(\d{2})/g);
      if (!m || m.length < 2) continue;
      const [sh, sm] = m[0].split(":").map(Number);
      const [eh, em] = m[1].split(":").map(Number);
      if (cur >= sh * 60 + sm && cur < eh * 60 + em) nowItem = c;
      else if (cur < sh * 60 + sm && !nextItem) nextItem = c;
    }
  }

  viewEl.innerHTML = `
    <div class="card">
      <div class="week-strip">${strip}</div>
      <div class="hero">
        <div>
          <div style="font-size:16px;font-weight:700">${store.fmtDate(selDate)}${isToday ? "" : ' <span class="chip" style="margin-left:4px">열람</span>'}</div>
          <p class="muted" style="padding:2px 0 0">자습 ${fmtMin(todayMin)}</p>

        </div>
        <div class="ring">
          <svg width="108" height="108" viewBox="0 0 108 108">
            <circle class="track" cx="54" cy="54" r="47"></circle>
            <circle class="fill" cx="54" cy="54" r="47" stroke-dasharray="295.3" stroke-dashoffset="${295.3 * (1 - pct / 100)}"></circle>
          </svg>
          <div class="ring-label"><div id="ring-label">${pct}%<small id="ring-count">${doneCount}/${checks.length} 완료</small></div></div>
        </div>
      </div>
      ${isToday ? `
      <div style="margin:8px 0 4px;border-radius:14px;background:rgba(var(--accent-rgb), 0.12);padding:12px 14px">
        <div style="font-size:12px;font-weight:700;color:var(--accent);letter-spacing:0.3px">지금</div>
        <div style="font-size:16px;font-weight:700">${nowItem ? esc(nowItem.title) : "일정 없음"}</div>
        ${nowItem ? `<div class="row-sub" style="color:var(--fg-secondary)">${nowItem.time}</div>` : ""}
      </div>
      ${nextItem ? `
      <div style="margin:4px 0 8px;border-radius:14px;background:var(--bg-secondary);padding:10px 14px">
        <div style="font-size:12px;font-weight:700;color:var(--fg-secondary)">다음</div>
        <div style="font-size:15px;font-weight:600">${esc(nextItem.title)}</div>
        <div class="row-sub" style="color:var(--fg-secondary)">${nextItem.time}</div>
      </div>` : ""}` : ""}
    </div>
    ${isToday ? `<div class="card">
      <p class="card-title">자습 타이머</p>
      ${s.timer
        ? `<div class="timer">
            <div class="timer-time" id="timer-clock">…</div>
            <p class="timer-meta">${esc(s.timer.label)}${s.timer.pausedAt ? " · 일시정지" : " 측정 중"}${s.timer.kind === "extra" ? " (추가 자습)" : ""}</p>
            <div class="timer-actions">
              ${s.timer.pausedAt
                ? `<button class="btn" id="btn-resume">재개</button>`
                : `<button class="btn" id="btn-pause">일시정지</button>`}
              <button class="btn primary" id="btn-stop">종료</button>
            </div>
          </div>`
        : `<div class="timer">
            <div class="timer-time" style="color:var(--fg-tertiary)">00:00</div>
            <p class="timer-meta">측정 중인 자습이 없습니다</p>
            <div class="timer-actions">
              <button class="btn primary" id="btn-start">자습 시작</button>
              <button class="btn" id="btn-start-extra">추가 자습</button>
            </div>
          </div>`}
    </div>` : ""}
    <div class="card">
      <p class="card-title">${isToday ? "오늘의 일정" : "일정"}</p>
      ${checks.map((c) => `
        <div class="row ${done[c.id] ? "done" : ""}" data-check="${c.id}" data-date="${key}" ${lunchCheck && c.id === "lunch" && lunchCheck.hidden ? 'style="display:none"' : ""}>
          <button class="check" aria-label="${esc(c.title)} 완료">${CHECK_SVG}</button>
          <div class="row-main">
            <div class="row-title">${esc(c.title)}</div>
            <div class="row-sub">${c.time}</div>
          </div>
        </div>`).join("") || `<p class="muted">이 요일에는 일정 항목이 없습니다. 설정 → 일정 항목 편집에서 추가할 수 있습니다.</p>`}
      <button class="btn danger block" id="btn-reset-day" style="margin:12px 0">이 날짜 체크 초기화</button>
    </div>
    ${lunchHtml}
    ${isToday ? pendingHtml : ""}
  `;

  titleEl.textContent = "오늘";
  subEl.textContent = isToday ? "하루를 조금씩 밀어보세요" : `${store.fmtDate(selDate)} 열람 중`;

  $$("[data-day]").forEach((b) => b.addEventListener("click", () => {
    selDay = b.dataset.day === todayKey ? null : b.dataset.day;
    render();
  }));

  $$("[data-check]").forEach((row) => {
    row.addEventListener("click", (e) => {
      if (!e.target.closest(".check")) return;
      const on = store.toggleCheck(key, row.dataset.check);
      row.classList.toggle("done", on);
      const snap = store.dayChecks(key);
      const done2 = checks.reduce((a, c) => a + (c.id === row.dataset.check ? on : !!snap[c.id]), 0);
      const pct2 = Math.round((done2 / Math.max(1, checks.length)) * 100);
      const ring = $(".ring .fill", viewEl);
      if (ring) ring.style.strokeDashoffset = 295.3 * (1 - pct2 / 100);
      const lbl = $("#ring-label", viewEl);
      if (lbl) lbl.innerHTML = `${pct2}%<small id="ring-count">${done2}/${checks.length} 완료</small>`;
    });
  });

  $("#btn-reset-day")?.addEventListener("click", () => {
    store.resetDay(key);
    render();
    toast("체크를 초기화했습니다");
  });

  $("#lunch-yes")?.addEventListener("click", () => {
    if (!store.lunchAvailable()) return;
    store.setLunch(key, "yes");
    store.setCheck(key, lunchId, true);
    render();
  });
  $("#lunch-no")?.addEventListener("click", () => {
    store.setLunch(key, "no");
    store.setCheck(key, lunchId, false);
    render();
  });

  const startBtn = $("#btn-start");
  if (startBtn) startBtn.addEventListener("click", () => {
    const h = new Date().getHours();
    const label = h < 12 ? "오전 자습" : h < 15 ? "점심 자습" : h >= 18 ? "저녁 자습" : "자습";
    store.startTimer(label);
    keepAwake();
    render();
  });

  const extraBtn = $("#btn-start-extra");
  if (extraBtn) extraBtn.addEventListener("click", () => {
    store.startTimer("추가 자습", "extra");
    keepAwake();
    render();
  });

  const stopBtn = $("#btn-stop");
  if (stopBtn) stopBtn.addEventListener("click", () => {
    releaseAwake();
    const elapsed = Math.round(store.timerElapsedSec() / 60);
    const sess = store.stopTimer();
    openAdjustSheet(sess, elapsed);
  });
  const pauseBtn = $("#btn-pause") || $("#btn-resume");
  pauseBtn?.addEventListener("click", (e) => {
    const paused = !!store.get().timer.pausedAt;
    const t = paused ? (store.resumeTimer(), keepAwake(), store.get().timer) : (store.pauseTimer(), releaseAwake(), store.get().timer);
    e.currentTarget.id = t.pausedAt ? "btn-resume" : "btn-pause";
    e.currentTarget.textContent = t.pausedAt ? "재개" : "일시정지";
    const meta = $(".timer-meta", viewEl);
    if (meta) meta.textContent = `${t.label}${t.pausedAt ? " · 일시정지" : " 측정 중"}${t.kind === "extra" ? " (추가 자습)" : ""}`;
  });

  $$("[data-finalize]", viewEl).forEach((b) => b.addEventListener("click", () => {
    const sess = store.get().sessions.find((x) => x.id === b.dataset.finalize);
    openAdjustSheet(sess, sess.measuredMin);
  }));

  startTimerTick();
}

function openAdjustSheet(sess, measured) {
  openSheet(`
    <h2>자습 종료</h2>
    <p class="muted">측정된 시간은 ${fmtMin(measured)}입니다. 실제 공부시간을 조정하시겠습니까?</p>
    <div class="field"><label>실제 공부시간 (분)</label><input type="number" id="adj-min" value="${measured}" min="0" max="720"></div>
    <div class="field"><label>조정 사유 (선택)</label><input type="text" id="adj-reason" placeholder="예: 자리 비움"></div>
    <button class="btn primary block" id="btn-confirm-stop">기록하고 종료</button>
  `, (sheet, close) => {
    $("#btn-confirm-stop", sheet).addEventListener("click", () => {
      const v = parseInt($("#adj-min", sheet).value, 10);
      const reason = $("#adj-reason", sheet).value.trim();
      const s = store.finalizeSession(sess.id, isNaN(v) ? measured : Math.max(0, v), reason);
      close();
    });
  });
}

let tickTimer = null;
function startTimerTick() {
  clearInterval(tickTimer);
  tickTimer = setInterval(() => {
    const t = store.get().timer;
    const el = $("#timer-clock");
    if (!t || !el) { clearInterval(tickTimer); return; }
    const sec = store.timerElapsedSec();
    const p = (n) => String(n).padStart(2, "0");
    el.textContent = `${p(Math.floor(sec / 60))}:${p(sec % 60)}`;
  }, 500);
}

/* ── theme ─────────────────────────────── */
function applyTheme() {
  const { bw, theme } = store.get().settings;
  const root = document.documentElement;
  root.classList.toggle("bw", !!bw);
  root.classList.toggle("theme-dark", theme === "dark");
  root.classList.toggle("theme-light", theme === "light");
  const dark = theme === "dark" || (theme !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
  const metas = document.querySelectorAll('meta[name="theme-color"]');
  metas.forEach((m) => m.setAttribute("content", dark ? "#1C1C1E" : "#F2F2F7"));
}

/* ── schedule notifications (foreground) ── */
let notifyTimers = [];
function scheduleNotifications() {
  notifyTimers.forEach(clearTimeout);
  notifyTimers = [];
  const { notify } = store.get().settings;
  if (!notify || !("Notification" in window) || Notification.permission !== "granted") return;
  const now = new Date();
  for (const it of store.checksForDate(now)) {
    const m = it.time.match(/(\d{1,2}):(\d{2})/);
    if (!m) continue;
    const at = new Date(now);
    at.setHours(+m[1], +m[2], 0, 0);
    const delay = at - now;
    if (delay > 0 && delay < 12 * 3600e3) {
      notifyTimers.push(setTimeout(() => {
        try { new Notification("Nudge", { body: `${it.title} 시간입니다 (${it.time})` }); } catch {}
      }, delay));
    }
  }
}

/* ═════════ VIEW: STUDY ═════════ */
const adding = { level: null, id: null };
const editing = { level: null, id: null };
const ADD_ROW = (id) => `
  <div style="display:flex;gap:8px;padding:8px 0">
    <input type="text" id="${id}" placeholder="입력 후 Enter 또는 +" style="min-height:42px">
    <button class="btn primary" data-add-confirm="${id}" style="min-height:42px;min-width:52px;font-size:20px">+</button>
  </div>`;

function viewStudy() {
  const s = store.get();
  const stats = store.lectureStats();
  const pct = stats.total ? Math.round((stats.done / stats.total) * 100) : 0;
  const todayGoal = s.goal.daily;
  const doneToday = store.lecturesDoneOn(store.dateKey());
  const goalPct = Math.min(100, Math.round((doneToday / Math.max(1, todayGoal)) * 100));
  const waived = todayGoal === 0;

  viewEl.innerHTML = `
    <div class="card">
      <p class="card-title">오늘의 목표</p>
      <div class="row">
        <div class="row-main">
          <div class="row-title">강의 ${todayGoal}강 ${waived ? '<span class="chip red" style="margin-left:6px">면제</span>' : ""}</div>
        </div>
        <button class="btn" style="min-height:40px;padding:0 16px" id="btn-adjust">조정</button>
      </div>
      <div style="padding:6px 0 14px">
        <div class="bar"><i style="width:${waived ? 0 : goalPct}%"></i></div>
        <p class="muted" style="padding-top:6px">오늘 ${doneToday}강 완료${waived ? " · 목표 면제" : ""}</p>
        <div class="bar" style="margin-top:8px"><i style="width:${pct}%"></i></div>
        <p class="muted" style="padding-top:6px">전체 진도 ${stats.done}/${stats.total}강 (${pct}%)</p>
      </div>
    </div>
    <div class="card">
      <p class="card-title">과목 · 강의</p>
      <div id="subject-list">
        ${adding.level === "subject" ? ADD_ROW("qa-subject") : ""}
        ${s.subjects.length ? s.subjects.map((sub) => subjectHtml(sub)).join("") : `<p class="muted">아직 과목이 없습니다. 아래 버튼으로 추가하세요.</p>`}
      </div>
      <div style="display:flex;gap:10px;padding:10px 0 12px">
        <button class="btn primary block" id="btn-add-subject" aria-label="과목 추가">${adding.level === "subject" ? "취소" : PLUS_SVG + " 과목 추가"}</button>
      </div>
    </div>
    ${s.goal.adjustLog.length ? `
    <div class="card">
      <p class="card-title">목표 조정 이력</p>
      ${s.goal.adjustLog.slice(-5).reverse().map((l) => `
        <div class="row"><div class="row-main">
          <div class="row-title">${l.from}강 → ${l.to}강</div>
          <div class="row-sub">${esc(l.reason)} · ${l.date}</div>
        </div></div>`).join("")}
    </div>` : ""}
  `;

  titleEl.textContent = "학습";
  subEl.textContent = "강의 진도와 목표를 관리합니다";

  function subjectHtml(sub) {
    return `
      <div class="swipe-wrap">
        <div class="row" data-swipe="subject:${sub.id}">
          <div class="row-main">
            ${editing.level === "subject" && editing.id === sub.id
              ? `<input type="text" class="ren" id="ren-subject" value="${esc(sub.name)}">`
              : `<div class="row-title edit-tap" data-edit-subject="${sub.id}">${esc(sub.name)}</div>`}
            <div class="row-sub">${sub.chapters.reduce((a, c) => a + c.lectures.length, 0)}강</div>
          </div>
          <button class="btn icon-btn" aria-label="챕터 추가" data-add-chapter="${sub.id}" style="background:var(--accent);color:var(--on-fill)">${adding.level === "chapter" && adding.id === sub.id ? "취소" : PLUS_SVG}</button>
        </div>
      </div>
      ${adding.level === "chapter" && adding.id === sub.id ? `<div style="padding-left:14px">${ADD_ROW("qa-chapter")}</div>` : ""}
      ${sub.chapters.map((ch) => `
        <div style="padding-left:14px">
          <div class="swipe-wrap">
            <div class="row" data-swipe="chapter:${ch.id}">
              <div class="row-main">${editing.level === "chapter" && editing.id === ch.id
                ? `<input type="text" class="ren" id="ren-chapter" value="${esc(ch.name)}" style="font-size:14px">`
                : `<div class="row-title edit-tap" style="font-size:14px" data-edit-chapter="${ch.id}">${esc(ch.name)}</div>`}</div>
              <button class="btn icon-btn" style="min-width:34px;min-height:34px;background:var(--accent);color:var(--on-fill)" aria-label="강의 추가" data-add-lecture="${ch.id}">${adding.level === "lecture" && adding.id === ch.id ? "취소" : PLUS_SVG}</button>
            </div>
          </div>
          ${adding.level === "lecture" && adding.id === ch.id ? `<div style="padding-left:14px">${ADD_ROW("qa-lecture")}</div>` : ""}
          ${ch.lectures.map((l) => `
            <div class="swipe-wrap" style="padding-left:14px">
              <div class="row" style="min-height:44px" data-swipe="lecture:${l.id}">
                <button class="check ${l.status === "완료" ? "on" : ""}" style="${l.status === "완료" ? "background:var(--success);border-color:var(--success);color:var(--on-fill)" : ""}" data-cycle="${l.id}">${CHECK_SVG}</button>
                <div class="row-main">
                  ${editing.level === "lecture" && editing.id === l.id
                    ? `<input type="text" class="ren" id="ren-lecture" value="${esc(l.name)}" style="font-size:14px">`
                    : `<div class="row-title edit-tap" style="font-size:14px;${l.status === "완료" ? "color:var(--fg-secondary);text-decoration:line-through" : ""}" data-edit-lecture="${l.id}">${esc(l.name)}</div>`}
                </div>
              </div>
            </div>`).join("")}
        </div>`).join("")}`;
  }

  // swipe-to-delete
  $$("[data-swipe]", viewEl).forEach((row) => {
    const [kind, id] = row.dataset.swipe.split(":");
    makeSwipeable(row, () => {
      if (kind === "subject") store.deleteSubject(id);
      else if (kind === "chapter") store.deleteChapter(id);
      else store.deleteLecture(id);
      render();
      toast("삭제했습니다");
    });
  });

  // cycle status
  $$("[data-cycle]", viewEl).forEach((b) => b.addEventListener("click", (e) => {
    if (e.target.closest("[data-swipe]") && !e.target.closest("[data-cycle]")) return;
    const st = store.cycleLecture(b.dataset.cycle);
    if (st === "완료") {
      let name = "";
      for (const sub of s.subjects) for (const ch of sub.chapters) for (const l of ch.lectures) if (l.id === b.dataset.cycle) name = l.name;
      store.logLectureDone(b.dataset.cycle, name);
    }
    render();
  }));

  // inline add (no sheet)
  const wireAddRow = (inputId, onAdd) => {
    const input = $("#" + inputId, viewEl);
    if (!input) return;
    input.focus();
    const confirm = $(`[data-add-confirm="${inputId}"]`, viewEl);
    confirm?.addEventListener("click", onAdd);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") onAdd(); });
  };

  $("#btn-add-subject").addEventListener("click", () => {
    if (adding.level === "subject") { adding.level = null; render(); return; }
    adding.level = "subject"; adding.id = null;
    render();
    wireAddRow("qa-subject", () => {
      const v = $("#qa-subject", viewEl).value.trim();
      if (!v) return;
      store.addSubject(v);
      adding.level = null;
      render();
    });
  });

  $$("[data-add-chapter]").forEach((b) => b.addEventListener("click", (e) => {
    e.stopPropagation();
    const sid = b.dataset.addChapter;
    if (adding.level === "chapter" && adding.id === sid) { adding.level = null; render(); return; }
    adding.level = "chapter"; adding.id = sid;
    render();
    wireAddRow("qa-chapter", () => {
      const v = $("#qa-chapter", viewEl).value.trim();
      if (!v) return;
      store.addChapter(sid, v);
      adding.level = null;
      render();
    });
  }));

  $$("[data-add-lecture]").forEach((b) => b.addEventListener("click", (e) => {
    e.stopPropagation();
    const cid = b.dataset.addLecture;
    if (adding.level === "lecture" && adding.id === cid) { adding.level = null; render(); return; }
    adding.level = "lecture"; adding.id = cid;
    render();
    wireAddRow("qa-lecture", () => {
      const v = $("#qa-lecture", viewEl).value.trim();
      if (!v) return;
      store.addLecture(cid, v);
      adding.level = null;
      render();
    });
  }));

  // inline rename (pencil → in-place input)
  const wireRename = (inputId, save) => {
    const input = $("#" + inputId, viewEl);
    if (!input) return;
    input.focus();
    input.select();
    input.addEventListener("focus", () => setTimeout(() => input.scrollIntoView({ block: "center", behavior: "smooth" }), 350));
    const done = () => {
      const v = input.value.trim();
      if (v) save(v);
      editing.level = null; editing.id = null;
      render();
    };
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") done(); if (e.key === "Escape") { editing.level = null; editing.id = null; render(); } });
    input.addEventListener("blur", done);
  };

  $$("[data-edit-subject]", viewEl).forEach((b) => b.addEventListener("click", () => {
    editing.level = "subject"; editing.id = b.dataset.editSubject;
    render();
    wireRename("ren-subject", (v) => store.renameSubject(editing.id, v));
  }));

  $$("[data-edit-chapter]", viewEl).forEach((b) => b.addEventListener("click", () => {
    editing.level = "chapter"; editing.id = b.dataset.editChapter;
    render();
    wireRename("ren-chapter", (v) => store.renameChapter(editing.id, v));
  }));

  $$("[data-edit-lecture]", viewEl).forEach((b) => b.addEventListener("click", () => {
    editing.level = "lecture"; editing.id = b.dataset.editLecture;
    render();
    wireRename("ren-lecture", (v) => store.renameLecture(editing.id, v));
  }));

  // goal adjust
  $("#btn-adjust").addEventListener("click", () => {
    openSheet(`
      <h2>목표 조정</h2>
      <p class="muted">정말 업무지시로 수행하지 못했습니까? 사유가 목표 조정 로그에 기록됩니다.</p>
      <div class="field"><label>오늘의 목표 강의 수</label>
        <div class="stepper" style="justify-content:center;padding:6px 0">
          <button id="g-minus">−</button><span class="val" id="g-val">${todayGoal}</span><button id="g-plus">+</button>
        </div>
      </div>
      <div class="field"><label>사유</label><input type="text" id="g-reason" placeholder="업무지시로 인해 수행하지 못함"></div>
      <button class="btn primary block" id="btn-save-goal">조정 저장</button>
    `, (sheet, close) => {
      let v = todayGoal;
      const upd = () => ($("#g-val", sheet).textContent = v);
      $("#g-minus", sheet).addEventListener("click", () => { v = Math.max(0, v - 1); upd(); });
      $("#g-plus", sheet).addEventListener("click", () => { v = Math.min(20, v + 1); upd(); });
      $("#btn-save-goal", sheet).addEventListener("click", () => {
        const reason = $("#g-reason", sheet).value.trim();
        store.setDailyGoal(v, reason);
        close(); render();
      });
    });
  });
}

/* ═════════ VIEW: WORKOUT ═════════ */
function viewWorkout() {
  const s = store.get();
  const todayKey = store.dateKey();
  const key = selDay || todayKey;
  const selDate = new Date(key + "T00:00:00");
  const part = store.todayWorkout(selDate);
  const doneToday = store.workoutDoneOn(key);
  const isToday = key === todayKey;
  const isRest = part === "휴식";
  const routine = store.workoutRoutine(part);
  const doneCount = isToday ? store.routineDoneToday() : (doneToday ? routine.length : 0);
  const effDone = doneToday ? routine.length : doneCount;
  const week = store.startOfWeek();
  const weekDone = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(week); d.setDate(week.getDate() + i);
    return store.workoutDoneOn(store.dateKey(d));
  });
  const allDone = routine.length > 0 && doneCount >= routine.length;
  const nextExercise = routine[doneCount] || null;

  viewEl.innerHTML = `
    <div class="card">
      <div class="week-strip">
        ${store.WEEKDAYS.map((w, i) => {
          const d = new Date(week); d.setDate(week.getDate() + i);
          const k = store.dateKey(d);
          const cls = ["day-dot", k === key ? "today" : "", weekDone[i] ? "done" : "", k === todayKey ? "is-today" : ""].filter(Boolean).join(" ");
          return `<button class="${cls}" data-wday="${k}">${w}</button>`;
        }).join("")}
      </div>
      <p class="card-title">${store.fmtDate(selDate)} · ${part}${isRest ? "" : " 데이"}</p>
      <div class="timer">
        <div style="font-size:40px;font-weight:800;padding:6px 0">${part}</div>
        ${isRest
          ? `<p class="timer-meta">예정된 휴식입니다</p>`
          : `<p class="timer-meta">루틴 ${effDone}/${routine.length} 완료</p>
             <div class="bar${doneToday ? " green" : ""}" style="max-width:240px;margin:10px auto 0"><i style="width:${routine.length ? Math.round(effDone / routine.length * 100) : 0}%"></i></div>`}
        <div class="timer-actions">
          ${!isToday ? "" : doneToday
            ? `<button class="btn" id="btn-workout-undo" style="min-width:170px">오늘 기록 취소</button>`
            : isRest
              ? `<button class="btn primary" id="btn-workout-rest" style="min-width:180px">휴식 완료</button>`
              : `<button class="btn primary" id="btn-next-ex" style="min-width:230px">${allDone ? "운동 완료" : "다음 운동: " + esc(nextExercise || "")}</button>
                 ${doneCount > 0 ? `<button class="btn" id="btn-undo-step" aria-label="한 운동 되돌리기" style="min-width:52px;padding:0">${UNDO_SVG}</button>` : ""}`}
        </div>
      </div>
      <p class="muted" style="padding:0 4px 12px">이번 주 ${weekDone.filter(Boolean).length}회 완료</p>
    </div>
    ${doneToday ? (() => {
      const now = new Date();
      const y = now.getFullYear(), m = now.getMonth();
      const daysInMonth = new Date(y, m + 1, 0).getDate();
      const lead = new Date(y, m, 1).getDay();
      const cells = [];
      for (let i = 0; i < lead; i++) cells.push(`<span class="cal-cell"></span>`);
      let monthDone = 0;
      for (let d = 1; d <= daysInMonth; d++) {
        const k = store.dateKey(new Date(y, m, d));
        const done = store.workoutDoneOn(k);
        if (done) monthDone++;
        cells.push(`<span class="cal-cell${done ? " on" : ""}${k === todayKey ? " today" : ""}">${done ? CHECK_SVG : d}</span>`);
      }
      return `
    <div class="card">
      <p class="card-title">${m + 1}월 운동 기록 · ${monthDone}회 완료</p>
      <div class="cal-grid">
        ${["일", "월", "화", "수", "목", "금", "토"].map((w) => `<span class="cal-head">${w}</span>`).join("")}
        ${cells.join("")}
      </div>
    </div>`; })() : (!isRest && routine.length ? `
    <div class="card">
      <p class="card-title">오늘의 루틴</p>
      ${routine.map((ex, i) => `
        <div class="row ${i < effDone ? "done" : ""}" style="min-height:46px">
          <button class="check" tabindex="-1">${CHECK_SVG}</button>
          <div class="row-main">
            <div class="row-title" style="font-size:15px">${esc(ex)}</div>
            ${i === doneCount && isToday && !doneToday && !allDone ? `<div class="row-sub">다음 운동</div>` : ""}
          </div>
        </div>`).join("")}
    </div>` : "")}
    <div class="card">
      <p class="card-title">최근 기록</p>
      ${s.workout.history.slice(-8).reverse().map((h) => `
        <div class="row"><div class="row-main">
          <div class="row-title">${esc(h.part)}${h.rest ? " (예정된 휴식)" : ""}</div>
          <div class="row-sub">${h.date}</div>
        </div><span class="chip green">완료</span></div>`).join("") || `<p class="muted">아직 기록이 없습니다.</p>`}
    </div>
  `;

  titleEl.textContent = "운동";
  subEl.textContent = "요일별 분할 + 매일 루틴";

  $("#btn-next-ex")?.addEventListener("click", () => {
    const r = store.advanceRoutine();
    render();
    if (r.finished) toast("오늘의 운동을 완료했습니다");
  });
  $("#btn-undo-step")?.addEventListener("click", () => {
    store.undoRoutineStep();
    render();
  });
  $("#btn-workout-rest")?.addEventListener("click", () => {
    store.completeWorkout(true);
    render();
  });
  $("#btn-workout-undo")?.addEventListener("click", () => {
    if (key !== todayKey) { toast("기록 취소는 오늘 날짜만 가능합니다"); return; }
    if (store.undoWorkoutToday()) {
      render();
      toast("오늘의 운동 기록을 취소했습니다");
    }
  });
  $$("[data-wday]", viewEl).forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.wday === key) return;
    selDay = b.dataset.wday === todayKey ? null : b.dataset.wday;
    render();
  }));
}

let statsRange = "week";
function viewStats() {
  const week = store.startOfWeek();
  let from, to, days;
  if (statsRange === "month") {
    from = new Date(); from.setDate(1); from.setHours(0, 0, 0, 0);
    to = new Date(from.getFullYear(), from.getMonth() + 1, 0);
    days = to.getDate();
  } else {
    from = week;
    to = new Date(week.getTime() + 6 * 864e5);
    days = 7;
  }
  const fromKey = store.dateKey(from);
  const toKey = store.dateKey(to);
  const sessions = store.sessionsInRange(fromKey, toKey);
  const weekMin = sessions.reduce((a, x) => a + x.finalMin, 0);
  const stats = store.lectureStats();
  const goalMin = 18 * 60 * Math.ceil(days / 7);
  const pct = stats.total ? Math.round((stats.done / stats.total) * 100) : 0;
  const wkDone = Array.from({ length: days }, (_, i) => {
    const d = new Date(from); d.setDate(from.getDate() + i);
    return store.workoutDoneOn(store.dateKey(d));
  }).filter(Boolean).length;

  const bars = Array.from({ length: days }, (_, i) => {
    const d = new Date(from); d.setDate(from.getDate() + i);
    const k = store.dateKey(d);
    const { reg, extra } = store.minutesOnSplit(k);
    const rh = Math.min(100, (reg / 240) * 100);
    const eh = Math.min(100, (extra / 240) * 100);
    return `<div style="flex:1 0 16px;display:flex;flex-direction:column;align-items:center;gap:6px;min-width:14px">
      <div class="bar" style="flex:1;width:100%;display:flex;align-items:flex-end;position:relative">
        <i style="width:100%;height:${eh}%;border-radius:4px 4px 0 0;background:var(--success);position:absolute;bottom:0;left:0"></i>
        <i style="width:100%;height:${rh}%;border-radius:4px 4px 0 0;position:relative;z-index:1;opacity:${rh ? 1 : 0}"></i>
      </div>
      <span style="font-size:11px;font-weight:700;color:var(--fg-secondary)">${d.getDate()}</span>
    </div>`;
  }).join("");

  viewEl.innerHTML = `
    <div class="segment">
      <button class="${statsRange === "week" ? "active" : ""}" id="seg-week">주간</button>
      <button class="${statsRange === "month" ? "active" : ""}" id="seg-month">월간</button>
    </div>
    <div class="card">
      <p class="card-title">${statsRange === "week" ? "이번 주" : "이번 달"} 요약</p>
      <div class="stat-grid">
        <div class="stat-cell"><div class="v">${Math.round(weekMin / 60)}h</div><div class="k">자습 시간</div></div>
        <div class="stat-cell"><div class="v">${pct}%</div><div class="k">전체 강의 진도</div></div>
        <div class="stat-cell"><div class="v">${sessions.length}</div><div class="k">자습 세션</div></div>
        <div class="stat-cell"><div class="v">${wkDone}</div><div class="k">운동 완료</div></div>
      </div>
    </div>
    <div class="card">
      <p class="card-title">날짜별 자습 시간</p>
      <div style="display:flex;gap:4px;height:150px;padding:14px 0;overflow-x:auto;-webkit-overflow-scrolling:touch">${bars}</div>
      <p class="muted" style="padding:0 4px 12px">막대는 하루 4시간 기준 · 주황 정규 자습, 초록 추가 자습 · 미확정 세션은 제외되며 미래 날짜는 실패로 계산하지 않습니다.</p>
    </div>
    <div class="card">
      <p class="card-title">${statsRange === "week" ? "주간" : "월간"} 성취율</p>
      <div style="padding:12px 4px 16px">
        <div style="display:flex;justify-content:space-between;font-size:14px;font-weight:600;margin-bottom:8px">
          <span>정규 자습 목표</span><span>${Math.min(100, Math.round(weekMin / goalMin * 100))}%</span>
        </div>
        <div class="bar green"><i style="width:${Math.min(100, Math.round(weekMin / goalMin * 100))}%"></i></div>
        ${(() => {
          const r = Math.round(weekMin / goalMin * 100);
          const succMin = store.get().settings.successMin;
          const label = r >= 100 ? '<span class="chip green">완전 수행</span>' : r >= succMin ? '<span class="chip accent">성공</span>' : '<span class="chip red">미달</span>';
          return `<p class="muted" style="padding:8px 0 0">판정: ${label}</p>`;
        })()}
      </div>
    </div>
    <div class="card">
      <p class="card-title">과목별 진행률</p>
      ${store.get().subjects.map((sub) => {
        const total = sub.chapters.reduce((a, c) => a + c.lectures.length, 0);
        const done = sub.chapters.reduce((a, c) => a + c.lectures.filter((l) => l.status === "완료").length, 0);
        const p = total ? Math.round(done / total * 100) : 0;
        return `<div style="padding:10px 0">
          <div style="display:flex;justify-content:space-between;font-size:14px;font-weight:600;margin-bottom:6px">
            <span>${esc(sub.name)}</span><span style="color:var(--fg-secondary)">${done}/${total}</span>
          </div>
          <div class="bar"><i style="width:${p}%"></i></div>
        </div>`;
      }).join("") || `<p class="muted">과목을 추가하면 여기에 표시됩니다.</p>`}
    </div>
  `;

  titleEl.textContent = "통계";
  subEl.textContent = statsRange === "week" ? "한 주를 한눈에" : "이번 달을 한눈에";
  $("#seg-week").addEventListener("click", () => { statsRange = "week"; render(); });
  $("#seg-month").addEventListener("click", () => { statsRange = "month"; render(); });
}

/* ═════════ VIEW: SETTINGS ═════════ */
function dayToggles(days) {
  return `<div style="display:flex;gap:6px;flex-wrap:wrap;padding:4px 0">
    ${store.WEEKDAYS.map((w, i) => `<button type="button" class="btn" data-toggle-day="${i}" style="min-height:38px;padding:0 13px;font-size:13px;${days.includes(i) ? "background:var(--accent);color:var(--on-fill)" : ""}">${w}</button>`).join("")}
  </div>`;
}

function openScheduleEdit() {
  const items = store.scheduleItems();
  openSheet(`
    <h2>일정 항목</h2>
    <p class="muted">반복 시간표를 수정합니다. 변경은 저장 즉시 반영되며, 체크 기록은 날짜별로 그대로 유지됩니다.</p>
    ${items.map((it) => `
      <div class="row">
        <div class="row-main">
          <div class="row-title">${esc(it.title)}</div>
          <div class="row-sub">${esc(it.time)} · ${it.days.map((d) => store.WEEKDAYS[d]).join(" ")}</div>
        </div>
        <button class="btn icon-btn" style="min-width:36px;min-height:36px" aria-label="일정 항목 수정" data-sched-edit="${it.id}">${PENCIL_SVG}</button>
      </div>`).join("")}
    <button class="btn primary block" id="btn-sched-add" style="margin-top:10px">일정 항목 추가</button>
  `, (sheet) => {
    $$("[data-sched-edit]", sheet).forEach((b) => b.addEventListener("click", () => {
      const it = store.scheduleItems().find((x) => x.id === b.dataset.schedEdit);
      let days = [...it.days];
      openSheet(`
        <h2>일정 항목 수정</h2>
        <div class="field"><label>제목</label><input type="text" id="si-title" value="${esc(it.title)}"></div>
        <div class="field"><label>시간</label><input type="text" id="si-time" value="${esc(it.time)}" placeholder="예: 19:20–20:50"></div>
        <div class="field"><label>반복 요일</label>${dayToggles(days)}</div>
        <button class="btn primary block" id="si-save">저장</button>
        <button class="btn danger block" id="si-del" style="margin-top:10px">이 항목 삭제</button>
      `, (sheet2, close2) => {
        $$("[data-toggle-day]", sheet2).forEach((t) => t.addEventListener("click", () => {
          const i = parseInt(t.dataset.toggleDay, 10);
          days = days.includes(i) ? days.filter((x) => x !== i) : [...days, i];
          t.style.background = days.includes(i) ? "var(--accent)" : "";
          t.style.color = days.includes(i) ? "#fff" : "";
        }));
        $("#si-save", sheet2).addEventListener("click", () => {
          const title = $("#si-title", sheet2).value.trim();
          const time = $("#si-time", sheet2).value.trim();
          if (title) store.updateScheduleItem(it.id, { title, time: time || it.time, days });
          close2();
        });
        $("#si-del", sheet2).addEventListener("click", () => {
          store.deleteScheduleItem(it.id);
          close2();
          toast("일정 항목을 삭제했습니다");
        });
      });
    }));
    $("#btn-sched-add", sheet).addEventListener("click", () => {
      let days = [1, 2, 3, 4, 5];
      openSheet(`
        <h2>일정 항목 추가</h2>
        <div class="field"><label>제목</label><input type="text" id="sa-title" placeholder="예: 복습 정리 30분"></div>
        <div class="field"><label>시간</label><input type="text" id="sa-time" placeholder="예: 22:00–22:30"></div>
        <div class="field"><label>반복 요일</label>${dayToggles(days)}</div>
        <button class="btn primary block" id="sa-save">추가</button>
      `, (sheet2, close2) => {
        $$("[data-toggle-day]", sheet2).forEach((t) => t.addEventListener("click", () => {
          const i = parseInt(t.dataset.toggleDay, 10);
          days = days.includes(i) ? days.filter((x) => x !== i) : [...days, i];
          t.style.background = days.includes(i) ? "var(--accent)" : "";
          t.style.color = days.includes(i) ? "#fff" : "";
        }));
        $("#sa-save", sheet2).addEventListener("click", () => {
          const title = $("#sa-title", sheet2).value.trim();
          const time = $("#sa-time", sheet2).value.trim() || "하루 종일";
          if (title && days.length) {
            store.addScheduleItem({ title, time, days });
            close2();
            }
        });
      });
    });
  });
}

function downloadICS() {
  const s = store.get();
  const escIcs = (v) => String(v).replace(/\\,/g, "").replace(/[,;]/g, " ").replace(/\n/g, " ");
  const GCAL_DOW = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Nudge//PWA//KO", "CALSCALE:GREGORIAN"];
  for (const it of s.schedule) {
    const m = it.time.match(/(\d{1,2}):(\d{2})\D+(\d{1,2}):(\d{2})/);
    if (!m || !it.days.length) continue;
    const start = new Date();
    start.setDate(start.getDate() + ((Math.min(...it.days) - start.getDay() + 7) % 7 || 7));
    start.setHours(+m[1], +m[2], 0, 0);
    const end = new Date(start.getTime());
    end.setHours(+m[3], +m[4], 0, 0);
    lines.push("BEGIN:VEVENT",
      `UID:nudge-sched-${it.id}@nudge`,
      `DTSTAMP:${icsStamp(new Date())}`,
      `DTSTART;TZID=Asia/Seoul:${icsStamp(start)}`,
      `DTEND;TZID=Asia/Seoul:${icsStamp(end)}`,
      `SUMMARY:${escIcs(it.title)}`,
      `RRULE:FREQ=WEEKLY;BYDAY=${it.days.map((d) => GCAL_DOW[d]).join(",")}`,
      "END:VEVENT");
  }
  for (const sess of s.sessions) {
    if (sess.status !== "finalized") continue;
    lines.push("BEGIN:VEVENT",
      `UID:nudge-sess-${sess.id}@nudge`,
      `DTSTAMP:${icsStamp(new Date())}`,
      `DTSTART;VALUE=DATE:${sess.date.replace(/-/g, "")}`,
      `SUMMARY:${escIcs((sess.label || "자습") + " " + sess.finalMin + "분")}`,
      "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  const blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "nudge.ics";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
function icsStamp(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}T${p(d.getHours())}${p(d.getMinutes())}00`;
}

let gcalCals = [];
async function syncGoogle() {
  const s = store.get();
  const calId = s.settings.gcalCalendarId;
  if (!calId) throw new Error("캘린더를 선택해 주세요");
  const map = s.gcalMap;
  const keep = new Set();
  let pushed = 0;
  for (const it of s.schedule) {
    const nid = "sched:" + it.id;
    const body = gcal.buildScheduleEvent(it);
    if (!body) continue;
    keep.add(nid);
    const ev = await gcal.upsertEvent(calId, map[nid], body);
    map[nid] = ev.id; pushed++;
  }
  for (const sess of s.sessions) {
    const nid = "sess:" + sess.id;
    const body = gcal.buildSessionEvent(sess);
    if (!body) continue;
    keep.add(nid);
    const ev = await gcal.upsertEvent(calId, map[nid], body);
    map[nid] = ev.id; pushed++;
  }
  for (const [nid, eid] of Object.entries({ ...map })) {
    if (!keep.has(nid) && await gcal.deleteEvent(calId, eid)) delete map[nid];
  }
  s.settings.gcalSyncedAt = Date.now();
  store.save();
  return pushed;
}

function viewSettings() {
  const s = store.get();
  const st = s.settings;

  viewEl.innerHTML = `
    <div class="card">
      <p class="card-title">화면 모드</p>
      <div class="row">
        <div class="row-main">
          <div class="row-title">테마</div>
        </div>
        <div class="segment" style="margin:0;width:180px">
          <button class="${st.theme === "system" ? "active" : ""}" id="th-system">시스템</button>
          <button class="${st.theme === "light" ? "active" : ""}" id="th-light">라이트</button>
          <button class="${st.theme === "dark" ? "active" : ""}" id="th-dark">다크</button>
        </div>
      </div>
      <div class="row">
        <div class="row-main">
          <div class="row-title">흑백 모드</div>
        </div>
        <button class="switch ${st.bw ? "on" : ""}" id="sw-bw" role="switch" aria-checked="${st.bw}"></button>
      </div>
    </div>
    <div class="card">
      <p class="card-title">알림</p>
      <div class="row">
        <div class="row-main">
          <div class="row-title">일정 알림</div>
        </div>
        <button class="switch ${st.notify ? "on" : ""}" id="sw-notify" role="switch" aria-checked="${st.notify}"></button>
      </div>
    </div>
    <div class="card">
      <p class="card-title">학습 설정</p>
      <div class="row">
        <div class="row-main">
          <div class="row-title">일정 항목</div>
        </div>
        <button class="btn" style="min-height:40px;padding:0 16px" id="btn-sched">편집</button>
      </div>
      <div class="row">
        <div class="row-main">
          <div class="row-title">기본 학습 목표</div>
        </div>
        <button class="btn" style="min-height:40px;padding:0 16px" id="btn-goal">편집</button>
      </div>
      <div class="row">
        <div class="row-main">
          <div class="row-title">자습 성공 기준</div>
        </div>
        <button class="btn" style="min-height:40px;padding:0 16px" id="btn-succ">편집</button>
      </div>
      <div class="row">
        <div class="row-main">
          <div class="row-title">캘린더로 내보내기</div>
        </div>
        <button class="btn" style="min-height:40px;padding:0 16px" id="btn-ics">.ics</button>
      </div>
    </div>
    <div class="card">
      <p class="card-title">운동 설정</p>
      <div class="row">
        <div class="row-main">
          <div class="row-title">요일별 분할</div>
        </div>
        <button class="btn" style="min-height:40px;padding:0 16px" id="btn-wassign">편집</button>
      </div>
      <div class="row">
        <div class="row-main">
          <div class="row-title">매일 루틴</div>
        </div>
        <button class="btn" style="min-height:40px;padding:0 16px" id="btn-routine">편집</button>
      </div>
    </div>
    <div class="card">
      <p class="card-title">구글 캘린더 동기화</p>
      <div class="field"><label>OAuth 클라이언트 ID</label><input type="text" id="gc-id" value="${esc(st.gcalClientId)}" placeholder="Google Cloud Console에서 발급" autocomplete="off"></div>
      <div class="field"><label>캘린더</label>
        <select id="gc-cal" style="width:100%;min-height:42px">
          <option value="">연결 후 선택</option>
          ${gcalCals.map((c) => `<option value="${esc(c.id)}" ${st.gcalCalendarId === c.id ? "selected" : ""}>${esc(c.title)}</option>`).join("")}
        </select>
      </div>
      <div style="display:flex;gap:10px;padding:8px 0 6px">
        <button class="btn" id="btn-gc-connect">연결</button>
        <button class="btn primary" id="btn-gc-sync">지금 동기화</button>
      </div>
      ${st.gcalSyncedAt ? `<p class="muted">마지막 동기화: ${new Date(st.gcalSyncedAt).toLocaleString("ko-KR")}</p>` : `<p class="muted">일정 항목은 주간 반복 일정으로, 자습 세션은 종일 일정으로 업데이트됩니다.</p>`}
    </div>
  `;

  titleEl.textContent = "설정";
  subEl.textContent = "화면 · 학습 · 운동";

  ["system", "light", "dark"].forEach((mode) => {
    $("#th-" + mode).addEventListener("click", () => {
      st.theme = mode;
      store.save();
      applyTheme();
      render();
    });
  });

  $("#sw-bw").addEventListener("click", () => {
    st.bw = !st.bw;
    store.save();
    applyTheme();
    render();
  });

  $("#sw-notify").addEventListener("click", async () => {
    if (!st.notify) {
      if (!("Notification" in window)) { toast("이 브라우저는 알림을 지원하지 않습니다"); return; }
      let perm = Notification.permission;
      if (perm !== "granted") perm = await Notification.requestPermission();
      if (perm !== "granted") { toast("알림 권한이 거부되었습니다. 설정에서 허용해주세요"); return; }
      st.notify = true;
    } else {
      st.notify = false;
    }
    store.save();
    scheduleNotifications();
    render();
  });

  $("#btn-sched").addEventListener("click", openScheduleEdit);
  $("#btn-ics").addEventListener("click", () => { downloadICS(); toast("캘린더 파일을 내보냈습니다. 구글 캘린더에서 가져오세요"); });

  $("#gc-id")?.addEventListener("change", () => { st.gcalClientId = $("#gc-id").value.trim(); store.save(); });
  $("#gc-cal")?.addEventListener("change", () => { st.gcalCalendarId = $("#gc-cal").value; store.save(); });
  $("#btn-gc-connect")?.addEventListener("click", async () => {
    const cid = $("#gc-id").value.trim();
    if (!cid) { toast("OAuth 클라이언트 ID를 입력해 주세요"); return; }
    st.gcalClientId = cid; store.save();
    try {
      await gcal.login(cid);
      gcalCals = await gcal.listCalendars();
      if (!st.gcalCalendarId && gcalCals[0]) st.gcalCalendarId = gcalCals[0].id;
      store.save();
      render();
      toast("Google 계정에 연결했습니다");
    } catch (e) { toast(e.message, 5000); }
  });
  $("#btn-gc-sync")?.addEventListener("click", async () => {
    const cid = $("#gc-id")?.value.trim() || st.gcalClientId;
    if (!cid) { toast("OAuth 클라이언트 ID를 입력해 주세요"); return; }
    if (!st.gcalCalendarId) { toast("캘린더를 선택해 주세요"); return; }
    toast("동기화 중…", 1500);
    try {
      if (!gcal.hasToken()) await gcal.login(cid);
      const n = await syncGoogle();
      render();
      toast(`구글 캘린더에 ${n}개 항목을 업데이트했습니다`);
    } catch (e) { toast(e.message, 6000); render(); }
  });

  $("#btn-goal").addEventListener("click", () => {
    let gb = store.get().goalBase;
    openSheet(`
      <h2>기본 학습 목표</h2>
      <p class="muted">평일 하루 학습할 강의 수를 설정합니다. 업무지시로 인한 당일 조정은 학습 탭에서 기록됩니다.</p>
      <div class="field"><label>하루 강의 목표</label>
        <div class="stepper" style="justify-content:center;padding:6px 0">
          <button id="g2-minus">−</button><span class="val" id="g2-val">${gb}</span><button id="g2-plus">+</button>
        </div>
      </div>
      <button class="btn primary block" id="g2-save">저장</button>
    `, (sheet, close) => {
      const upd = () => { $("#g2-val", sheet).textContent = gb; };
      $("#g2-minus", sheet).addEventListener("click", () => { gb = Math.max(0, gb - 1); upd(); });
      $("#g2-plus", sheet).addEventListener("click", () => { gb = Math.min(20, gb + 1); upd(); });
      $("#g2-save", sheet).addEventListener("click", () => {
        store.setGoalBase(gb);
        close();
      });
    });
  });

  $("#btn-succ").addEventListener("click", () => {
    let sv = store.get().settings.successMin;
    openSheet(`
      <h2>자습 성공 기준</h2>
      <p class="muted">주간 자습 달성률이 이 값 이상이면 '성공', 100%는 '완전 수행'으로 별도 표시됩니다. 60~100% 범위에서 설정하세요.</p>
      <div class="field"><label>성공 기준 (%)</label>
        <div class="stepper" style="justify-content:center;padding:6px 0">
          <button id="sv-minus">−</button><span class="val" id="sv-val">${sv}</span><button id="sv-plus">+</button>
        </div>
      </div>
      <button class="btn primary block" id="sv-save">저장</button>
    `, (sheet, close) => {
      const upd = () => { $("#sv-val", sheet).textContent = sv; };
      $("#sv-minus", sheet).addEventListener("click", () => { sv = Math.max(60, sv - 5); upd(); });
      $("#sv-plus", sheet).addEventListener("click", () => { sv = Math.min(100, sv + 5); upd(); });
      $("#sv-save", sheet).addEventListener("click", () => {
        store.get().settings.successMin = sv;
        store.save();
        close();
      });
    });
  });

  $("#btn-routine").addEventListener("click", () => {
    let part = store.todayWorkout();
    const renderRoutine = (sheet) => {
      const list = store.workoutRoutine(part);
      $("#routine-body", sheet).innerHTML = `
        ${list.map((ex, i) => `
          <div class="swipe-wrap">
            <div class="row" style="min-height:46px" data-rt-swipe="${i}">
              <button class="drag-handle" data-rt-drag="${i}" aria-label="순서 변경">${GRIP_SVG}</button>
              <div class="row-main"><div class="row-title" style="font-size:15px">${esc(ex)}</div></div>
            </div>
          </div>`).join("") || `<p class="muted">운동이 없습니다. 아래에서 추가하세요.</p>`}
        <div style="display:flex;gap:8px;padding:10px 0">
          <input type="text" id="rt-new" placeholder="새 운동 추가…" style="min-height:42px">
          <button class="btn primary" id="rt-add" style="min-height:42px;min-width:52px;font-size:20px">+</button>
        </div>`;
      $$("[data-rt-swipe]", sheet).forEach((row) => {
        makeSwipeable(row, () => {
          store.setRoutineItem(part, +row.dataset.rtSwipe, null);
          renderRoutine(sheet);
        });
      });
      $$(".drag-handle", sheet).forEach((h) => {
        h.addEventListener("pointerdown", (e) => {
          e.preventDefault();
          const wrap = h.closest(".swipe-wrap");
          const wraps = [...$("#routine-body", sheet).querySelectorAll(":scope > .swipe-wrap")];
          const from = wraps.indexOf(wrap);
          const startY = e.clientY;
          const step = wrap.offsetHeight + 6;
          wrap.style.zIndex = "10";
          wrap.style.transition = "none";
          const mv = (ev) => { wrap.style.transform = `translateY(${ev.clientY - startY}px)`; };
          const up = (ev) => {
            window.removeEventListener("pointermove", mv);
            window.removeEventListener("pointerup", up);
            const shift = Math.round((ev.clientY - startY) / step);
            const to = Math.max(0, Math.min(wraps.length - 1, from + shift));
            wrap.style.transform = "";
            wrap.style.zIndex = "";
            wrap.style.transition = "";
            if (to !== from) { store.reorderRoutine(part, from, to); renderRoutine(sheet); }
          };
          window.addEventListener("pointermove", mv);
          window.addEventListener("pointerup", up);
        });
      });
      $("#rt-add", sheet).addEventListener("click", () => {
        const v = $("#rt-new", sheet).value.trim();
        if (!v) return;
        store.setRoutineItem(part, -1, v);
        renderRoutine(sheet);
      });
    };
    openSheet(`
      <h2>매일 루틴 편집</h2>
      <p class="muted">종목을 선택해 그 날의 운동 순서를 편집합니다. 항목을 왼쪽으로 밀면 삭제됩니다.</p>
      <div class="segment" id="rt-parts">
        ${store.WORKOUT_CYCLE.map((p) => `<button class="${p === part ? "active" : ""}" data-rt-part="${p}">${p}</button>`).join("")}
      </div>
      <div id="routine-body"></div>
    `, (sheet, close) => {
      renderRoutine(sheet);
      $$("[data-rt-part]", sheet).forEach((b) => b.addEventListener("click", () => {
        part = b.dataset.rtPart;
        $$("[data-rt-part]", sheet).forEach((x) => x.classList.toggle("active", x === b));
        renderRoutine(sheet);
      }));
    });
  });

  $("#btn-wassign").addEventListener("click", () => {
    const assign = { ...store.workoutAssign() };
    const BASIC_PARTS = ["등", "가슴", "어깨", "팔", "하체", "휴식"];
    openSheet(`
      <h2>요일별 분할</h2>
      ${store.WEEKDAYS.map((w, i) => `
        <div class="row">
          <div class="row-main"><div class="row-title" style="font-size:15px">${w}</div></div>
          <select id="wa-sel-${i}" style="width:140px;min-height:40px">
            ${BASIC_PARTS.map((p) => `<option value="${p}" ${assign[i] === p ? "selected" : ""}>${p}</option>`).join("")}
          </select>
        </div>`).join("")}
      <button class="btn primary block" id="wa-save" style="margin-top:10px">저장</button>
    `, (sheet, close) => {
      $("#wa-save", sheet).addEventListener("click", () => {
        store.WEEKDAYS.forEach((_, i) => { assign[i] = $("#wa-sel-" + i, sheet).value; });
        for (const [i, p] of Object.entries(assign)) store.setWorkoutAssign(+i, p);
        close();
      });
    });
  });

}

/* ── router ─────────────────────────────── */
const VIEWS = { today: viewToday, study: viewStudy, workout: viewWorkout, stats: viewStats, settings: viewSettings };

const TAB_ORDER = ["today", "study", "workout", "stats", "settings"];
let prevTab = "today";

export function render(scrollTop = false) {
  clearInterval(tickTimer);
  VIEWS[currentView]();
  if (currentView !== prevTab) {
    viewEl.classList.remove("slide-next", "slide-prev");
    void viewEl.offsetWidth;
    viewEl.classList.add(TAB_ORDER.indexOf(currentView) > TAB_ORDER.indexOf(prevTab) ? "slide-next" : "slide-prev");
    prevTab = currentView;
  }
  $$(".tab").forEach((t) => t.classList.toggle("active", t.dataset.view === currentView));
  if (store.get().timer) startTimerTick();
  if (scrollTop) window.scrollTo({ top: 0 });
}

$$(".tab").forEach((t) => t.addEventListener("click", () => {
  if (t.dataset.view === currentView) { window.scrollTo({ top: 0, behavior: "smooth" }); return; }
  currentView = t.dataset.view;
  render(true);
}));

applyTheme();
store.autoResolveLunch();
scheduleNotifications();
render();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
