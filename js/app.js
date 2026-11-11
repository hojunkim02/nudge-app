// Nudge — app shell: router, views, sheets, toasts
import * as store from "./store.js";
import { testConnection, sync, friendlyError } from "./caldav.js";

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

/* ── sheet ─────────────────────────────── */
export function openSheet(html, onMount) {
  const root = $("#sheet-root");
  root.innerHTML = `<div class="sheet-backdrop"></div><div class="sheet" role="dialog"><div class="grabber"></div>${html}</div>`;
  const close = () => {
    root.innerHTML = "";
    render();
  };
  $(".sheet-backdrop", root).addEventListener("click", close);
  if (onMount) onMount($(".sheet", root), close);
  return close;
}

/* ── helpers ───────────────────────────── */
const CHECK_SVG = `<svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const fmtMin = (m) => `${Math.floor(m / 60)}시간 ${m % 60}분`;
const nowHM = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
};

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
  const lunchCheck = checks.find((c) => c.id === "lunch");
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
          ${isToday ? `<p class="muted" style="padding:4px 0 0">지금: ${nowItem ? esc(nowItem.title) : "일정 없음"}${nextItem ? ` · 다음: ${esc(nextItem.title)}` : ""}</p>` : ""}
          <p class="muted" style="padding:2px 0 0">자습 ${fmtMin(todayMin)}</p>
          ${isToday && !s.timer ? `
          <div style="display:flex;gap:8px;padding:10px 0 0">
            <button class="btn primary" style="min-height:42px;padding:0 18px;font-size:14px" id="btn-start">자습 시작</button>
            <button class="btn" style="min-height:42px;padding:0 18px;font-size:14px" id="btn-start-extra">추가 자습</button>
          </div>` : ""}
        </div>
        <div class="ring">
          <svg width="108" height="108" viewBox="0 0 108 108">
            <circle class="track" cx="54" cy="54" r="47"></circle>
            <circle class="fill" cx="54" cy="54" r="47" stroke-dasharray="295.3" stroke-dashoffset="${295.3 * (1 - pct / 100)}"></circle>
          </svg>
          <div class="ring-label"><div>${pct}%<small>${doneCount}/${checks.length} 완료</small></div></div>
        </div>
      </div>
    </div>
    <div class="card">
      <p class="card-title">${isToday ? "오늘의 일정" : "일정"} · 요일을 눌러 이동</p>
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
      const pct2 = Math.round((checks.filter((c) => (c.id === row.dataset.check ? on : !!store.dayChecks(key)[c.id])).length / Math.max(1, checks.length)) * 100);
      const ring = $(".ring .fill", viewEl);
      if (ring) ring.style.strokeDashoffset = 295.3 * (1 - pct2 / 100);
      $(".ring-label > div", viewEl).childNodes[0].textContent = pct2 + "%";
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
    store.setCheck(key, "lunch", true);
    render();
  });
  $("#lunch-no")?.addEventListener("click", () => {
    store.setLunch(key, "no");
    render();
  });

  const startBtn = $("#btn-start");
  if (startBtn) startBtn.addEventListener("click", () => {
    const h = new Date().getHours();
    const label = h < 12 ? "오전 자습" : h < 15 ? "점심 자습" : h >= 18 ? "저녁 자습" : "자습";
    store.startTimer(label);
    render();
  });

  const extraBtn = $("#btn-start-extra");
  if (extraBtn) extraBtn.addEventListener("click", () => {
    store.startTimer("추가 자습", "extra");
    render();
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
    const el = $("#pill-clock");
    if (!t || !el) { clearInterval(tickTimer); return; }
    const sec = store.timerElapsedSec();
    const p = (n) => String(n).padStart(2, "0");
    el.textContent = `${p(Math.floor(sec / 60))}:${p(sec % 60)}`;
  }, 500);
}

function renderPill() {
  document.querySelector(".timer-pill")?.remove();
  const t = store.get().timer;
  if (!t) return;
  const pill = document.createElement("button");
  pill.className = "timer-pill";
  pill.id = "timer-pill";
  pill.innerHTML = `
    <div class="pill-main">
      <div class="pill-label">${esc(t.label)}${t.kind === "extra" ? " (추가)" : ""}</div>
      <div class="pill-sub">${t.pausedAt ? "일시정지 중 · 눌러서 관리" : "측정 중 · 눌러서 관리"}</div>
    </div>
    <div class="pill-clock" id="pill-clock">00:00</div>`;
  pill.addEventListener("click", openTimerSheet);
  document.body.appendChild(pill);
  startTimerTick();
}

function openTimerSheet() {
  const t = store.get().timer;
  if (!t) return;
  const elapsed = Math.round(store.timerElapsedSec() / 60);
  openSheet(`
    <h2>${esc(t.label)}${t.kind === "extra" ? " (추가 자습)" : ""}</h2>
    <p class="muted">측정된 시간: ${fmtMin(elapsed)}${t.pausedAt ? " · 일시정지 중" : ""}</p>
    <div style="display:flex;gap:10px;padding:10px 0 4px">
      ${t.pausedAt
        ? `<button class="btn block" id="pt-resume">재개</button>`
        : `<button class="btn block" id="pt-pause">일시정지</button>`}
      <button class="btn primary block" id="pt-stop">종료</button>
    </div>
  `, (sheet, close) => {
    $("#pt-pause", sheet)?.addEventListener("click", () => { store.pauseTimer(); close(); });
    $("#pt-resume", sheet)?.addEventListener("click", () => { store.resumeTimer(); close(); });
    $("#pt-stop", sheet).addEventListener("click", () => {
      const el2 = Math.round(store.timerElapsedSec() / 60);
      const sess = store.stopTimer();
      close();
      openAdjustSheet(sess, el2);
    });
  });
}

/* ── theme ─────────────────────────────── */
function applyTheme() {
  const { bw, theme } = store.get().settings;
  const root = document.documentElement;
  root.classList.toggle("bw", !!bw);
  root.classList.toggle("theme-dark", theme === "dark");
  root.classList.toggle("theme-light", theme === "light");
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    const dark = theme === "dark" || (theme !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
    meta.setAttribute("content", dark ? "#1C1C1E" : "#F76729");
  }
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

/* ═════════ VIEW: STUDY (Things 3 style) ═════════ */
const expanded = { subject: null, chapter: null };

function viewStudy() {
  const s = store.get();
  const stats = store.lectureStats();
  const pct = stats.total ? Math.round((stats.done / stats.total) * 100) : 0;
  const todayGoal = s.goal.daily;
  const STATUS_CHIP = { "미학습": "", "복습 필요": "red", "완료": "green" };
  const origGoal = s.goalBase;
  const doneToday = store.lecturesDoneOn(store.dateKey());
  const goalPct = Math.min(100, Math.round((doneToday / Math.max(1, todayGoal)) * 100));
  const origPct = Math.min(100, Math.round((doneToday / origGoal) * 100));
  const waived = todayGoal === 0;

  viewEl.innerHTML = `
    <div class="card">
      <p class="card-title">오늘의 목표</p>
      <div class="row">
        <div class="row-main">
          <div class="row-title">강의 ${todayGoal}강 ${waived ? '<span class="chip red" style="margin-left:6px">면제</span>' : ""}</div>
          <div class="row-sub">복무 중 기본 학습 목표 · 업무지시 시에만 당일 0~${origGoal}강 조정</div>
        </div>
        <button class="btn" style="min-height:40px;padding:0 16px" id="btn-adjust">조정</button>
      </div>
      <div style="padding:6px 0 14px">
        <div class="bar"><i style="width:${waived ? 0 : goalPct}%"></i></div>
        <p class="muted" style="padding-top:6px">오늘 ${doneToday}강 완료 · ${waived ? "업무로 인한 목표 면제" : `원 목표 대비 ${origPct}% · 조정 목표(${todayGoal}강) 대비 ${goalPct}%`}</p>
        <div class="bar" style="margin-top:8px"><i style="width:${pct}%"></i></div>
        <p class="muted" style="padding-top:6px">전체 진도 ${stats.done}/${stats.total}강 (${pct}%)</p>
      </div>
    </div>
    <div class="card">
      <p class="card-title">과목 · 강의</p>
      <div style="display:flex;gap:8px;padding:8px 0;margin:0 0 4px">
        <input type="text" id="qa-subject" placeholder="새 과목 추가…" style="min-height:44px">
        <button class="btn primary" id="qa-subject-add" style="min-height:44px;min-width:52px;font-size:20px">+</button>
      </div>
      ${s.subjects.length ? s.subjects.map((sub) => subjectHtml(sub)).join("") : `<p class="muted">위 입력란에 과목명을 적고 + 를 누르세요.</p>`}
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
    const open = expanded.subject === sub.id;
    const lecCount = sub.chapters.reduce((a, c) => a + c.lectures.length, 0);
    const doneCount = sub.chapters.reduce((a, c) => a + c.lectures.filter((l) => l.status === "완료").length, 0);
    return `
      <div class="row" style="min-height:56px">
        <button class="disc" data-expand-subject="${sub.id}" aria-label="${esc(sub.name)} 열기">${open ? "▾" : "▸"}</button>
        <div class="row-main">
          <div class="row-title">${esc(sub.name)}</div>
          <div class="row-sub">${doneCount}/${lecCount}강 완료</div>
          <div class="bar" style="margin-top:6px;height:5px"><i style="width:${lecCount ? Math.round(doneCount / lecCount * 100) : 0}%"></i></div>
        </div>
        <button class="btn" style="min-height:38px;padding:0 12px;font-size:15px" data-edit-subject="${sub.id}">⋯</button>
      </div>
      ${open ? sub.chapters.map((ch) => chapterHtml(sub, ch)).join("") + `
      <div style="display:flex;gap:8px;padding:8px 0 8px 34px">
        <input type="text" id="qa-chapter-${sub.id}" placeholder="새 챕터 추가…" style="min-height:40px">
        <button class="btn" data-qa-chapter-add="${sub.id}" style="min-height:40px;min-width:48px;font-size:18px">+</button>
      </div>` : ""}`;
  }

  function chapterHtml(sub, ch) {
    const open = expanded.chapter === ch.id;
    return `
      <div style="padding-left:34px">
        <div class="row" style="min-height:48px">
          <button class="disc" data-expand-chapter="${ch.id}">${open ? "▾" : "▸"}</button>
          <div class="row-main"><div class="row-title" style="font-size:15px">${esc(ch.name)}</div>
            <div class="row-sub">${ch.lectures.length}강</div>
          </div>
          <button class="btn" style="min-height:34px;padding:0 10px;font-size:14px" data-edit-chapter="${ch.id}">⋯</button>
        </div>
        ${open ? ch.lectures.map((l) => `
          <div class="row" style="min-height:44px;padding-left:26px">
            <button class="check ${l.status === "완료" ? "on" : ""}" style="${l.status === "완료" ? "background:var(--success);border-color:var(--success);color:#fff" : ""}" data-cycle="${l.id}">${CHECK_SVG}</button>
            <div class="row-main">
              <div class="row-title" style="font-size:14px;${l.status === "완료" ? "color:var(--fg-secondary);text-decoration:line-through" : ""}">${esc(l.name)}</div>
            </div>
            <button class="btn" style="min-height:32px;padding:0 10px;font-size:14px;color:var(--fg-secondary)" data-edit-lecture="${l.id}">⋯</button>
            <button class="chip ${STATUS_CHIP[l.status]}" data-cycle="${l.id}" style="border:none">${esc(l.status)}</button>
          </div>`).join("") + `
          <div style="display:flex;gap:8px;padding:8px 0 8px 26px">
            <input type="text" id="qa-lecture-${ch.id}" placeholder="새 강의 추가…" style="min-height:40px">
            <button class="btn" data-qa-lecture-add="${ch.id}" style="min-height:40px;min-width:48px;font-size:18px">+</button>
          </div>` : ""}
      </div>`;
  }

  // quick add (Things 3 style inline)
  const addSubjectInline = () => {
    const el = $("#qa-subject", viewEl);
    const v = el.value.trim();
    if (!v) return;
    store.addSubject(v);
    expanded.subject = store.get().subjects.at(-1).id;
    render();
  };
  $("#qa-subject-add", viewEl).addEventListener("click", addSubjectInline);
  $("#qa-subject", viewEl).addEventListener("keydown", (e) => { if (e.key === "Enter") addSubjectInline(); });

  $$("[data-qa-chapter-add]", viewEl).forEach((b) => b.addEventListener("click", () => {
    const el = $(`#qa-chapter-${b.dataset.qaChapterAdd}`, viewEl);
    const v = el.value.trim();
    if (!v) return;
    store.addChapter(b.dataset.qaChapterAdd, v);
    render();
  }));
  $$("[data-qa-lecture-add]", viewEl).forEach((b) => b.addEventListener("click", () => {
    const el = $(`#qa-lecture-${b.dataset.qaLectureAdd}`, viewEl);
    const v = el.value.trim();
    if (!v) return;
    store.addLecture(b.dataset.qaLectureAdd, v);
    render();
  }));
  $$("input[id^='qa-chapter-']", viewEl).forEach((el) => el.addEventListener("keydown", (e) => {
    if (e.key === "Enter") $(`[data-qa-chapter-add="${el.id.replace("qa-chapter-", "")}"]`, viewEl)?.click();
  }));
  $$("input[id^='qa-lecture-']", viewEl).forEach((el) => el.addEventListener("keydown", (e) => {
    if (e.key === "Enter") $(`[data-qa-lecture-add="${el.id.replace("qa-lecture-", "")}"]`, viewEl)?.click();
  }));

  // accordion
  $$("[data-expand-subject]", viewEl).forEach((b) => b.addEventListener("click", () => {
    expanded.subject = expanded.subject === b.dataset.expandSubject ? null : b.dataset.expandSubject;
    if (expanded.subject !== b.dataset.expandSubject) expanded.chapter = null;
    render();
  }));
  $$("[data-expand-chapter]", viewEl).forEach((b) => b.addEventListener("click", () => {
    expanded.chapter = expanded.chapter === b.dataset.expandChapter ? null : b.dataset.expandChapter;
    render();
  }));

  // cycle status
  $$("[data-cycle]", viewEl).forEach((b) => b.addEventListener("click", () => {
    const st = store.cycleLecture(b.dataset.cycle);
    if (st === "완료") {
      const name = findLectureName(b.dataset.cycle);
      store.logLectureDone(b.dataset.cycle, name);
    }
    render();
  }));

  function findLectureName(id) {
    for (const sub of s.subjects) for (const ch of sub.chapters) for (const l of ch.lectures) if (l.id === id) return l.name;
    return "";
  }

  // edit sheets (rename/delete)
  $$("[data-edit-subject]", viewEl).forEach((b) => b.addEventListener("click", () => {
    const sub = s.subjects.find((x) => x.id === b.dataset.editSubject);
    openSheet(`
      <h2>과목 편집</h2>
      <div class="field"><label>과목명</label><input type="text" id="es-name" value="${esc(sub.name)}"></div>
      <button class="btn primary block" id="es-save">이름 저장</button>
      <button class="btn danger block" id="es-del" style="margin-top:10px">과목 삭제</button>
    `, (sheet, close) => {
      $("#es-save", sheet).addEventListener("click", () => {
        const v = $("#es-name", sheet).value.trim();
        if (v) store.renameSubject(sub.id, v);
        close();
      });
      $("#es-del", sheet).addEventListener("click", () => {
        store.deleteSubject(sub.id);
        close();
        toast("과목을 삭제했습니다");
      });
    });
  }));

  $$("[data-edit-chapter]", viewEl).forEach((b) => b.addEventListener("click", () => {
    let ch = null;
    for (const sub of s.subjects) { const f = sub.chapters.find((x) => x.id === b.dataset.editChapter); if (f) { ch = f; break; } }
    if (!ch) return;
    openSheet(`
      <h2>챕터 편집</h2>
      <div class="field"><label>챕터명</label><input type="text" id="ec-name" value="${esc(ch.name)}"></div>
      <button class="btn primary block" id="ec-save">이름 저장</button>
      <button class="btn danger block" id="ec-del" style="margin-top:10px">챕터 삭제</button>
    `, (sheet, close) => {
      $("#ec-save", sheet).addEventListener("click", () => {
        const v = $("#ec-name", sheet).value.trim();
        if (v) store.renameChapter(ch.id, v);
        close();
      });
      $("#ec-del", sheet).addEventListener("click", () => {
        store.deleteChapter(ch.id);
        close();
        toast("챕터를 삭제했습니다");
      });
    });
  }));

  $$("[data-edit-lecture]", viewEl).forEach((b) => b.addEventListener("click", () => {
    let lec = null;
    for (const sub of s.subjects) for (const c of sub.chapters) { const f = c.lectures.find((x) => x.id === b.dataset.editLecture); if (f) { lec = f; break; } }
    if (!lec) return;
    openSheet(`
      <h2>강의 편집</h2>
      <div class="field"><label>강의명</label><input type="text" id="el-name" value="${esc(lec.name)}"></div>
      <button class="btn primary block" id="el-save">이름 저장</button>
      <button class="btn danger block" id="el-del" style="margin-top:10px">강의 삭제</button>
    `, (sheet, close) => {
      $("#el-save", sheet).addEventListener("click", () => {
        const v = $("#el-name", sheet).value.trim();
        if (v) store.renameLecture(lec.id, v);
        close();
      });
      $("#el-del", sheet).addEventListener("click", () => {
        store.deleteLecture(lec.id);
        close();
        toast("강의를 삭제했습니다");
      });
    });
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
  const assign = store.workoutAssign();
  const todayKey = store.dateKey();
  const key = selDay || todayKey;
  const selDate = new Date(key + "T00:00:00");
  const part = store.todayWorkout(selDate);
  const doneToday = store.workoutDoneOn(key);
  const week = store.startOfWeek();
  const weekDone = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(week); d.setDate(week.getDate() + i);
    return store.workoutDoneOn(store.dateKey(d));
  });
  const doneCount = weekDone.filter(Boolean).length;
  const isRest = part === "휴식";
  const selDow = selDate.getDay();
  const restDays = Object.entries(assign).filter(([, p]) => p === "휴식").map(([d]) => +d);
  const activeDows = store.WEEKDAYS.map((_, i) => i).filter((d) => !restDays.includes(d));
  const pos = activeDows.indexOf(selDow);
  const nextDow = pos >= 0 && pos < activeDows.length - 1 ? activeDows[pos + 1] : null;
  const nextPart = nextDow != null ? assign[nextDow] : null;
  const isLast = nextDow == null;

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
      <p class="card-title">${store.fmtDate(selDate)} · 오늘의 운동</p>
      <div class="timer">
        <div style="font-size:44px;font-weight:800;padding:8px 0">${part}</div>
        <p class="timer-meta">${isRest ? "예정된 휴식입니다" : "주간 사이클: " + Object.values(assign).filter((x, i, a) => a.indexOf(x) === i).join(" → ")}</p>
        <div class="timer-actions">
          ${doneToday
            ? `<button class="btn primary" id="btn-workout-undo" style="min-width:150px">이 날짜 기록 취소</button>`
            : isRest
              ? `<button class="btn primary" id="btn-workout-rest" style="min-width:180px">휴식 완료</button>`
              : `<button class="btn primary" id="btn-workout-done" style="min-width:200px">${isLast ? "운동 완료" : "다음 운동: " + nextPart}</button>`}
        </div>
      </div>
      <p class="muted" style="padding:0 4px 12px">이번 주 ${doneCount}회 완료 · 요일별 배정은 설정에서 변경할 수 있습니다</p>
    </div>
    <div class="card">
      <p class="card-title">요일별 배정</p>
      ${store.WEEKDAYS.map((w, i) => `
        <div class="row" style="min-height:44px">
          <div class="row-main"><div class="row-title" style="font-size:15px">${w}</div></div>
          <span class="chip ${assign[i] === "휴식" ? "" : "accent"}">${assign[i]}</span>
        </div>`).join("")}
    </div>
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
  subEl.textContent = "요일별 사이클로 균형 있게";

  $("#btn-workout-done")?.addEventListener("click", () => {
    store.completeWorkout();
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

/* ═════════ VIEW: STATS ═════════ */
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
        <div class="stat-cell"><div class="v">${Math.round(weekMin / 60)}h</div><div class="k">자습 시간 (주 ${Math.round(goalMin / 60)}h 목표)</div></div>
        <div class="stat-cell"><div class="v">${pct}%</div><div class="k">전체 강의 진도 (${stats.done}/${stats.total})</div></div>
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
          return `<p class="muted" style="padding:8px 0 0">판정: ${label} (성공 기준 ${succMin}%)</p>`;
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
    ${store.WEEKDAYS.map((w, i) => `<button type="button" class="btn" data-toggle-day="${i}" style="min-height:38px;padding:0 13px;font-size:13px;${days.includes(i) ? "background:var(--accent);color:#fff" : ""}">${w}</button>`).join("")}
  </div>`;
}

function openScheduleEdit() {
  const items = store.scheduleItems();
  openSheet(`
    <h2>일정 항목 편집</h2>
    <p class="muted">반복 시간표를 수정합니다. 변경은 저장 즉시 반영되며, 체크 기록은 날짜별로 그대로 유지됩니다.</p>
    ${items.map((it) => `
      <div class="row">
        <div class="row-main">
          <div class="row-title">${esc(it.title)}</div>
          <div class="row-sub">${esc(it.time)} · ${it.days.map((d) => store.WEEKDAYS[d]).join(" ")}</div>
        </div>
        <button class="btn" style="min-height:38px;padding:0 12px;font-size:14px" data-sched-edit="${it.id}">⋯</button>
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

function viewSettings() {
  const s = store.get();
  const st = s.settings;

  viewEl.innerHTML = `
    <div class="card">
      <p class="card-title">화면 모드</p>
      <div class="row">
        <div class="row-main">
          <div class="row-title">테마</div>
          <div class="row-sub">라이트 / 다크 / 시스템 설정</div>
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
          <div class="row-sub">강조색을 제거하고 무채색 톤으로 표시합니다</div>
        </div>
        <button class="switch ${st.bw ? "on" : ""}" id="sw-bw" role="switch" aria-checked="${st.bw}"></button>
      </div>
    </div>
    <div class="card">
      <p class="card-title">알림</p>
      <div class="row">
        <div class="row-main">
          <div class="row-title">일정 알림</div>
          <div class="row-sub">오늘의 일정 시작 시각에 알림을 표시합니다 (앱 사용 중 · 홈 화면 앱 설치 필요)</div>
        </div>
        <button class="switch ${st.notify ? "on" : ""}" id="sw-notify" role="switch" aria-checked="${st.notify}"></button>
      </div>
    </div>
    <div class="card">
      <p class="card-title">일정 · 목표</p>
      <div class="row">
        <div class="row-main">
          <div class="row-title">일정 항목 편집</div>
          <div class="row-sub">반복 시간표의 제목·시간·요일 추가/수정/삭제</div>
        </div>
        <button class="btn" style="min-height:40px;padding:0 16px" id="btn-sched">편집</button>
      </div>
      <div class="row">
        <div class="row-main">
          <div class="row-title">기본 학습 목표</div>
          <div class="row-sub">평일 하루 강의 목표 · 현재 ${s.goalBase}강</div>
        </div>
        <button class="btn" style="min-height:40px;padding:0 16px" id="btn-goal">편집</button>
      </div>
      <div class="row">
        <div class="row-main">
          <div class="row-title">운동 요일 설정</div>
          <div class="row-sub">추천 루틴 프리셋 + 요일별 종목 배정</div>
        </div>
        <button class="btn" style="min-height:40px;padding:0 16px" id="btn-wassign">편집</button>
      </div>
      <div class="row">
        <div class="row-main">
          <div class="row-title">자습 성공 기준</div>
          <div class="row-sub">주간 달성률 기준 · 현재 ${st.successMin}%</div>
        </div>
        <button class="btn" style="min-height:40px;padding:0 16px" id="btn-succ">편집</button>
      </div>
    </div>
    <div class="card">
      <p class="card-title">iCloud 캘린더 동기화 (CalDAV)</p>
      <div class="row">
        <div class="row-main"><div class="row-title">동기화</div>
        <div class="row-sub">${st.caldavLastSync ? "마지막 동기화: " + new Date(st.caldavLastSync).toLocaleString("ko-KR") : "기본적으로 모든 데이터는 이 브라우저에만 저장됩니다"}</div></div>
        <button class="switch ${st.caldavEnabled ? "on" : ""}" id="sw-caldav" role="switch" aria-checked="${st.caldavEnabled}"></button>
      </div>
      <div id="caldav-fields" style="${st.caldavEnabled ? "" : "display:none"}">
        <div class="field"><label>CalDAV 서버</label><input type="url" id="cd-url" value="${esc(st.caldavUrl)}"></div>
        <div class="field"><label>Apple ID</label><input type="text" id="cd-user" value="${esc(st.caldavUser)}" placeholder="example@icloud.com" autocomplete="off"></div>
        <div class="field"><label>앱 전용 비밀번호</label><input type="password" id="cd-pass" value="${esc(st.caldavPass)}" placeholder="appleid.apple.com에서 생성"></div>
        <div style="display:flex;gap:10px;padding:8px 0 14px">
          <button class="btn" id="btn-cd-test">연결 테스트</button>
          <button class="btn primary" id="btn-cd-sync">지금 동기화</button>
        </div>
      </div>
    </div>
  `;

  titleEl.textContent = "설정";
  subEl.textContent = "화면 · 일정 · 동기화";

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

  $("#btn-wassign").addEventListener("click", () => {
    const assign = { ...store.workoutAssign() };
    openSheet(`
      <h2>운동 요일 설정</h2>
      <p class="muted">추천 루틴을 골라 적용하거나, 각 요일을 직접 선택할 수 있습니다. '휴식'으로 배정한 날은 휴식 완료로 기록합니다.</p>
      ${store.WORKOUT_PRESETS.map((p, i) => `
        <div class="row">
          <div class="row-main">
            <div class="row-title" style="font-size:15px">${p.name}</div>
            <div class="row-sub">${p.desc}</div>
          </div>
          <button class="btn" style="min-height:38px;padding:0 14px;font-size:14px" data-wpreset="${i}">적용</button>
        </div>`).join("")}
      <p class="card-title" style="padding-top:14px">요일별 직접 설정</p>
      ${store.WEEKDAYS.map((w, i) => `
        <div class="row">
          <div class="row-main"><div class="row-title" style="font-size:15px">${w}</div><div class="row-sub" id="wa-cur-${i}">${assign[i]}</div></div>
          <select id="wa-sel-${i}" style="width:140px;min-height:40px">
            ${store.WORKOUT_PARTS.map((p) => `<option value="${p}" ${assign[i] === p ? "selected" : ""}>${p}</option>`).join("")}
          </select>
        </div>`).join("")}
      <button class="btn primary block" id="wa-save" style="margin-top:10px">저장</button>
    `, (sheet, close) => {
      $$("[data-wpreset]", sheet).forEach((b) => b.addEventListener("click", () => {
        const preset = store.WORKOUT_PRESETS[+b.dataset.wpreset];
        Object.assign(assign, preset.assign);
        store.WEEKDAYS.forEach((_, i) => {
          $("#wa-sel-" + i, sheet).value = assign[i];
          $("#wa-cur-" + i, sheet).textContent = assign[i];
        });
      }));
      $("#wa-save", sheet).addEventListener("click", () => {
        store.WEEKDAYS.forEach((_, i) => { assign[i] = $("#wa-sel-" + i, sheet).value; });
        for (const [i, p] of Object.entries(assign)) store.setWorkoutAssign(+i, p);
        close();
      });
    });
  });

  $("#sw-caldav").addEventListener("click", () => {
    st.caldavEnabled = !st.caldavEnabled;
    store.save();
    render();
  });

  const persistFields = () => {
    st.caldavUrl = $("#cd-url").value.trim() || st.caldavUrl;
    st.caldavUser = $("#cd-user").value.trim();
    st.caldavPass = $("#cd-pass").value;
    store.save();
  };
  ["cd-url", "cd-user", "cd-pass"].forEach((id) => $("#" + id)?.addEventListener("change", persistFields));

  $("#btn-cd-test")?.addEventListener("click", async () => {
    persistFields();
    toast("연결을 시도하는 중…", 1500);
    try {
      const r = await testConnection();
      toast(`연결 성공: ${r.principal}`);
    } catch (e) {
      toast(friendlyError(e), 6000);
    }
  });

  $("#btn-cd-sync")?.addEventListener("click", async () => {
    persistFields();
    toast("동기화 중…", 1500);
    try {
      const r = await sync();
      toast(r.pushed ? `캘린더에 ${r.pushed}개 항목을 동기화했습니다` : "새로 동기화할 항목이 없습니다");
      render();
    } catch (e) {
      toast(friendlyError(e), 7000);
    }
  });
}

/* ── router ─────────────────────────────── */
const VIEWS = { today: viewToday, study: viewStudy, workout: viewWorkout, stats: viewStats, settings: viewSettings };

export function render(scrollTop = false) {
  clearInterval(tickTimer);
  VIEWS[currentView]();
  $$(".tab").forEach((t) => t.classList.toggle("active", t.dataset.view === currentView));
  renderPill();
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
