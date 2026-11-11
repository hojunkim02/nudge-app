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
    const sh = $(".sheet", root);
    sh.style.transition = "transform .3s cubic-bezier(.32,.72,0,1)";
    sh.style.transform = "translateY(100%)";
    $(".sheet-backdrop", root).style.opacity = "0";
    setTimeout(() => (root.innerHTML = ""), 300);
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
function viewToday() {
  const s = store.get();
  const key = store.dateKey();
  const checks = store.checksForDate();
  const done = store.dayChecks();
  const doneCount = checks.filter((c) => done[c.id]).length;
  const pct = Math.round((doneCount / checks.length) * 100);
  const todayMin = store.minutesOn(key);
  const dow = new Date().getDay();

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
    return `<div class="day-dot ${k === key ? "today" : all ? "done" : ""}">${store.WEEKDAYS[d.getDay()]}</div>`;
  }).join("");

  const timerHtml = s.timer
    ? `<div class="timer">
        <div class="timer-time" id="timer-clock">…</div>
        <p class="timer-meta">${esc(s.timer.label)} 측정 중</p>
        <div class="timer-actions">
          <button class="btn primary" id="btn-stop">종료</button>
        </div>
      </div>`
    : `<div class="timer">
        <div class="timer-time" style="color:var(--fg-tertiary)">00:00</div>
        <p class="timer-meta">측정 중인 자습이 없습니다</p>
        <div class="timer-actions">
          <button class="btn primary" id="btn-start">자습 시작</button>
        </div>
      </div>`;

  const lunchHtml = lunchCheck ? `
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
              <button class="btn primary" style="min-height:40px;padding:0 16px" id="lunch-yes" ${store.lunchAvailable() ? "" : "disabled"}>예</button>
            </div>`}
      </div>
      ${!store.lunchAvailable() && !lunchDecided ? `<p class="muted">이번 주 '예' 3회를 모두 사용했습니다. 다음 주 월요일에 초기화됩니다.</p>` : ""}
    </div>` : "";

  viewEl.innerHTML = `
    <div class="card">
      <div class="week-strip">${strip}</div>
      <div class="hero">
        <div class="ring">
          <svg width="108" height="108" viewBox="0 0 108 108">
            <circle class="track" cx="54" cy="54" r="47"></circle>
            <circle class="fill" cx="54" cy="54" r="47" stroke-dasharray="295.3" stroke-dashoffset="${295.3 * (1 - pct / 100)}"></circle>
          </svg>
          <div class="ring-label"><div>${pct}%<small>${doneCount}/${checks.length} 완료</small></div></div>
        </div>
        <div>
          <div style="font-size:16px;font-weight:700">${store.fmtDate(new Date())}</div>
          <p class="muted" style="padding:4px 0 0">오늘 자습 ${fmtMin(todayMin)}</p>
        </div>
      </div>
    </div>
    <div class="card">
      <p class="card-title">오늘의 일정</p>
      ${checks.map((c) => `
        <div class="row ${done[c.id] ? "done" : ""}" data-check="${c.id}" ${lunchCheck && c.id === "lunch" && lunchCheck.hidden ? 'style="display:none"' : ""}>
          <button class="check" aria-label="${esc(c.title)} 완료">${CHECK_SVG}</button>
          <div class="row-main">
            <div class="row-title">${esc(c.title)}</div>
            <div class="row-sub">${c.time}</div>
          </div>
        </div>`).join("")}
      <button class="btn danger block" id="btn-reset-day" style="margin:12px 0">오늘 체크 초기화</button>
    </div>
    ${lunchHtml}
    <div class="card">
      <p class="card-title">자습 타이머</p>
      ${timerHtml}
    </div>
  `;

  titleEl.textContent = "오늘";
  subEl.textContent = "하루를 조금씩 밀어보세요";

  $$("[data-check]").forEach((row) => {
    row.addEventListener("click", () => {
      const on = store.toggleCheck(key, row.dataset.check);
      row.classList.toggle("done", on);
      const pct2 = Math.round((checks.filter((c) => (c.id === row.dataset.check ? on : !!store.dayChecks()[c.id])).length / checks.length) * 100);
      const ring = $(".ring .fill", viewEl);
      if (ring) ring.style.strokeDashoffset = 295.3 * (1 - pct2 / 100);
      $(".ring-label > div", viewEl).childNodes[0].textContent = pct2 + "%";
    });
  });

  $("#btn-reset-day")?.addEventListener("click", () => {
    store.resetDay(key);
    render();
    toast("오늘의 체크를 초기화했습니다");
  });

  $("#lunch-yes")?.addEventListener("click", () => {
    if (!store.lunchAvailable()) return;
    store.setLunch(key, "yes");
    store.setCheck(key, "lunch", true);
    render();
    toast("점심 자습 예 — 11:50–12:50 일정이 활성화되었습니다");
  });
  $("#lunch-no")?.addEventListener("click", () => {
    store.setLunch(key, "no");
    render();
    toast("점심 자습 아니오 — 오늘은 쉬어가도 괜찮아요");
  });

  const startBtn = $("#btn-start");
  if (startBtn) startBtn.addEventListener("click", () => {
    const label = new Date().getHours() < 15 ? "오전 자습" : new Date().getDay() === 0 && new Date().getHours() >= 18 ? "저녁 자습" : "자습";
    store.startTimer(label);
    render();
  });

  const stopBtn = $("#btn-stop");
  if (stopBtn) stopBtn.addEventListener("click", () => {
    const t = store.get().timer;
    const elapsed = Math.max(0, Math.round((Date.now() - t.start) / 60000));
    openSheet(`
      <h2>자습 종료</h2>
      <p class="muted">측정된 시간은 ${fmtMin(elapsed)}입니다. 실제 공부시간을 조정하시겠습니까?</p>
      <div class="field"><label>실제 공부시간 (분)</label><input type="number" id="adj-min" value="${elapsed}" min="0" max="720"></div>
      <div class="field"><label>조정 사유 (선택)</label><input type="text" id="adj-reason" placeholder="예: 자리 비움"></div>
      <button class="btn primary block" id="btn-confirm-stop">기록하고 종료</button>
    `, (sheet, close) => {
      $("#btn-confirm-stop", sheet).addEventListener("click", () => {
        const v = parseInt($("#adj-min", sheet).value, 10);
        const reason = $("#adj-reason", sheet).value.trim();
        const s = store.stopTimer(isNaN(v) ? elapsed : Math.max(0, v));
        if (reason && s && s.finalMin !== s.measuredMin) {
          store.get().logs.push({ type: "time-correction", date: key, from: s.measuredMin, to: s.finalMin, reason, at: Date.now() });
          store.save();
        }
        close();
        render();
        toast(`자습 ${s.finalMin}분 기록 완료`);
      });
    });
    startTimerTick();
  });

  startTimerTick();
}

let tickTimer = null;
function startTimerTick() {
  clearInterval(tickTimer);
  tickTimer = setInterval(() => {
    const t = store.get().timer;
    const el = $("#timer-clock");
    if (!t || !el) { clearInterval(tickTimer); return; }
    const sec = Math.floor((Date.now() - t.start) / 1000);
    const p = (n) => String(n).padStart(2, "0");
    el.textContent = `${p(Math.floor(sec / 60))}:${p(sec % 60)}`;
  }, 500);
}

/* ═════════ VIEW: STUDY ═════════ */
function viewStudy() {
  const s = store.get();
  const stats = store.lectureStats();
  const pct = stats.total ? Math.round((stats.done / stats.total) * 100) : 0;
  const todayGoal = s.goal.daily;

  const STATUS_CHIP = { "미학습": "", "복습 필요": "red", "완료": "green" };

  viewEl.innerHTML = `
    <div class="card">
      <p class="card-title">오늘의 목표</p>
      <div class="row">
        <div class="row-main">
          <div class="row-title">강의 ${todayGoal}강</div>
          <div class="row-sub">복무 중 기본 학습 목표 · 필요 시 조정</div>
        </div>
        <button class="btn" style="min-height:40px;padding:0 16px" id="btn-adjust">조정</button>
      </div>
      <div style="padding:6px 0 14px"><div class="bar"><i style="width:${pct}%"></i></div>
      <p class="muted" style="padding-top:6px">전체 진도 ${stats.done}/${stats.total}강 (${pct}%)</p></div>
    </div>
    <div class="card">
      <p class="card-title">과목 · 강의</p>
      <div id="subject-list">
        ${s.subjects.length ? s.subjects.map((sub) => subjectHtml(sub)).join("") : `<p class="muted">아직 과목이 없습니다. 아래에서 추가하세요.</p>`}
      </div>
      <div style="display:flex;gap:10px;padding:10px 0 12px">
        <button class="btn block" id="btn-add-subject">과목 추가</button>
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
      <div class="row" data-subject="${sub.id}">
        <div class="row-main">
          <div class="row-title">${esc(sub.name)}</div>
          <div class="row-sub">${sub.chapters.reduce((a, c) => a + c.lectures.length, 0)}강</div>
        </div>
        <button class="btn" style="min-height:38px;padding:0 14px;font-size:14px" data-add-chapter="${sub.id}">챕터 +</button>
      </div>
      ${sub.chapters.map((ch) => `
        <div style="padding-left:14px">
          <div class="row">
            <div class="row-main"><div class="row-title" style="font-size:14px">${esc(ch.name)}</div></div>
            <button class="btn" style="min-height:34px;padding:0 12px;font-size:13px" data-add-lecture="${ch.id}">강의 +</button>
          </div>
          ${ch.lectures.map((l) => `
            <div class="row" style="min-height:44px">
              <button class="check ${l.status === "완료" ? "on" : ""}" style="${l.status === "완료" ? "background:var(--success);border-color:var(--success);color:#fff" : ""}" data-cycle="${l.id}">${CHECK_SVG}</button>
              <div class="row-main">
                <div class="row-title" style="font-size:14px;${l.status === "완료" ? "color:var(--fg-secondary);text-decoration:line-through" : ""}">${esc(l.name)}</div>
              </div>
              <button class="chip ${STATUS_CHIP[l.status]}" data-cycle="${l.id}" style="border:none">${esc(l.status)}</button>
            </div>`).join("")}
        </div>`).join("")}`;
  }

  $$("[data-cycle]", viewEl).forEach((b) => b.addEventListener("click", () => {
    const st = store.cycleLecture(b.dataset.cycle);
    if (st === "완료") {
      const name = findLectureName(b.dataset.cycle);
      store.logLectureDone(name);
      toast("완료로 기록했습니다");
    }
    render();
  }));

  function findLectureName(id) {
    for (const sub of s.subjects) for (const ch of sub.chapters) for (const l of ch.lectures) if (l.id === id) return l.name;
    return "";
  }

  $("#btn-add-subject").addEventListener("click", () => {
    openSheet(`
      <h2>과목 추가</h2>
      <div class="field"><label>과목명</label><input type="text" id="subj-name" placeholder="예: 재무회계론"></div>
      <button class="btn primary block" id="btn-save-subj">추가</button>
    `, (sheet, close) => {
      $("#btn-save-subj", sheet).addEventListener("click", () => {
        const v = $("#subj-name", sheet).value.trim();
        if (!v) return;
        store.addSubject(v);
        close(); render();
      });
    });
  });

  $$("[data-add-chapter]").forEach((b) => b.addEventListener("click", (e) => {
    e.stopPropagation();
    const sid = b.dataset.addChapter;
    openSheet(`
      <h2>챕터 추가</h2>
      <div class="field"><label>챕터명</label><input type="text" id="ch-name" placeholder="예: 제3장"></div>
      <button class="btn primary block" id="btn-save-ch">추가</button>
    `, (sheet, close) => {
      $("#btn-save-ch", sheet).addEventListener("click", () => {
        const v = $("#ch-name", sheet).value.trim();
        if (!v) return;
        store.addChapter(sid, v);
        close(); render();
      });
    });
  }));

  $$("[data-add-lecture]").forEach((b) => b.addEventListener("click", (e) => {
    e.stopPropagation();
    const cid = b.dataset.addLecture;
    openSheet(`
      <h2>강의 추가</h2>
      <div class="field"><label>강의명</label><input type="text" id="lec-name" placeholder="예: 1강 매매목적 부동산"></div>
      <button class="btn primary block" id="btn-save-lec">추가</button>
    `, (sheet, close) => {
      $("#btn-save-lec", sheet).addEventListener("click", () => {
        const v = $("#lec-name", sheet).value.trim();
        if (!v) return;
        store.addLecture(cid, v);
        close(); render();
      });
    });
  }));

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
        toast(v === 10 && !reason ? "원 목표로 되돌렸습니다" : `목표를 ${v}강으로 조정했습니다`);
      });
    });
  });
}

/* ═════════ VIEW: WORKOUT ═════════ */
function viewWorkout() {
  const s = store.get();
  const part = store.todayWorkout();
  const key = store.dateKey();
  const doneToday = store.workoutDoneOn(key);
  const week = store.startOfWeek();
  const weekDone = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(week); d.setDate(week.getDate() + i);
    return store.workoutDoneOn(store.dateKey(d));
  });
  const doneCount = weekDone.filter(Boolean).length;

  viewEl.innerHTML = `
    <div class="card">
      <p class="card-title">오늘의 운동 · ${store.WORKOUT_CYCLE[s.workout.index % 5]}day</p>
      <div class="timer">
        <div style="font-size:44px;font-weight:800;padding:8px 0">${part}</div>
        <p class="timer-meta">${doneToday ? "오늘 운동 완료 ✓ 다음은 " + store.WORKOUT_CYCLE[(s.workout.index + 1) % 5] : "순서: 등 → 가슴 → 어깨 → 팔 → 하체"}</p>
        <div class="timer-actions">
          ${doneToday
            ? `<span class="chip green" style="min-height:44px;padding:0 20px">완료</span>`
            : `<button class="btn primary" id="btn-workout-done" style="min-width:180px">운동 완료</button>`}
        </div>
      </div>
      <div class="week-strip">
        ${store.WEEKDAYS.map((w, i) => `<div class="day-dot ${weekDone[i] ? "done" : ""}">${w}</div>`).join("")}
      </div>
      <p class="muted" style="padding:0 4px 12px">이번 주 ${doneCount}회 완료 · 운동을 못 한 날은 같은 종목이 다음 날로 이월됩니다</p>
    </div>
    <div class="card">
      <p class="card-title">최근 기록</p>
      ${s.workout.history.slice(-8).reverse().map((h) => `
        <div class="row"><div class="row-main">
          <div class="row-title">${esc(h.part)}</div>
          <div class="row-sub">${h.date}</div>
        </div><span class="chip green">완료</span></div>`).join("") || `<p class="muted">아직 기록이 없습니다.</p>`}
    </div>
  `;

  titleEl.textContent = "운동";
  subEl.textContent = "5일 사이클로 균형 있게";

  $("#btn-workout-done")?.addEventListener("click", () => {
    const p = store.completeWorkout();
    render();
    toast(`${p} 운동 완료!`);
  });
}

/* ═════════ VIEW: STATS ═════════ */
function viewStats() {
  const week = store.startOfWeek();
  const fromKey = store.dateKey(week);
  const toKey = store.dateKey(new Date(week.getTime() + 6 * 864e5));
  const sessions = store.sessionsInRange(fromKey, toKey);
  const weekMin = sessions.reduce((a, x) => a + x.finalMin, 0);
  const stats = store.lectureStats();
  const goalMin = 18 * 60;
  const pct = stats.total ? Math.round((stats.done / stats.total) * 100) : 0;
  const wkDone = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(week); d.setDate(week.getDate() + i);
    return store.workoutDoneOn(store.dateKey(d));
  }).filter(Boolean).length;

  const bars = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(week); d.setDate(week.getDate() + i);
    const k = store.dateKey(d);
    const m = store.minutesOn(k);
    const h = Math.min(100, (m / 240) * 100);
    return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:6px">
      <div class="bar" style="flex:1;width:100%;display:flex;align-items:flex-end"><i style="width:100%;height:${h}%;border-radius:4px 4px 0 0"></i></div>
      <span style="font-size:11px;font-weight:700;color:var(--fg-secondary)">${store.WEEKDAYS[d.getDay()]}</span>
    </div>`;
  }).join("");

  viewEl.innerHTML = `
    <div class="card">
      <p class="card-title">이번 주 요약</p>
      <div class="stat-grid">
        <div class="stat-cell"><div class="v">${Math.round(weekMin / 60)}h</div><div class="k">자습 시간 (주 ${Math.round(goalMin / 60)}h 목표)</div></div>
        <div class="stat-cell"><div class="v">${pct}%</div><div class="k">전체 강의 진도 (${stats.done}/${stats.total})</div></div>
        <div class="stat-cell"><div class="v">${sessions.length}</div><div class="k">자습 세션</div></div>
        <div class="stat-cell"><div class="v">${wkDone}</div><div class="k">운동 완료</div></div>
      </div>
    </div>
    <div class="card">
      <p class="card-title">요일별 자습 시간</p>
      <div style="display:flex;gap:8px;height:150px;padding:14px 0">${bars}</div>
      <p class="muted" style="padding:0 4px 12px">막대는 하루 4시간 기준입니다. 미래 날짜는 실패로 계산하지 않습니다.</p>
    </div>
    <div class="card">
      <p class="card-title">주간 성취율</p>
      <div style="padding:12px 4px 16px">
        <div style="display:flex;justify-content:space-between;font-size:14px;font-weight:600;margin-bottom:8px">
          <span>정규 자습 목표</span><span>${Math.min(100, Math.round(weekMin / goalMin * 100))}%</span>
        </div>
        <div class="bar green"><i style="width:${Math.min(100, Math.round(weekMin / goalMin * 100))}%"></i></div>
      </div>
    </div>
  `;

  titleEl.textContent = "통계";
  subEl.textContent = "한 주를 한눈에";
}

/* ═════════ VIEW: SETTINGS ═════════ */
function viewSettings() {
  const s = store.get();
  const st = s.settings;
  const standalone = window.navigator.standalone === true || matchMedia("(display-mode: standalone)").matches;

  viewEl.innerHTML = `
    <div class="card">
      <p class="card-title">설치</p>
      <div class="row"><div class="row-main">
        <div class="row-title">홈 화면에 추가</div>
        <div class="row-sub">${standalone ? "이미 홈 화면 앱으로 실행 중입니다 ✓" : "Safari 공유 버튼 → 홈 화면에 추가"}</div>
      </div></div>
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
    <div class="card">
      <p class="card-title">데이터 백업</p>
      <div class="row"><div class="row-main">
        <div class="row-title">JSON 내보내기 / 가져오기</div>
        <div class="row-sub">복원 전 자동 백업이 생성되며, 트랜잭션이 원자적입니다</div>
      </div></div>
      <div style="display:flex;gap:10px;padding:10px 0 14px">
        <button class="btn block" id="btn-export">내보내기</button>
        <button class="btn block" id="btn-import">가져오기</button>
        <input type="file" id="file-import" accept="application/json" style="display:none">
      </div>
    </div>
    <div class="card">
      <p class="card-title">정보</p>
      <div class="row"><div class="row-main"><div class="row-title">Nudge</div><div class="row-sub">PWA · v1.0 · Fluent 2 영감 디자인</div></div></div>
    </div>
  `;

  titleEl.textContent = "설정";
  subEl.textContent = "동기화와 백업";

  $("#sw-caldav").addEventListener("click", () => {
    st.caldavEnabled = !st.caldavEnabled;
    store.save();
    render();
    toast(st.caldavEnabled ? "CalDAV 동기화를 켰습니다" : "CalDAV 동기화를 껐습니다");
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

  $("#btn-export").addEventListener("click", () => {
    const blob = new Blob([store.exportJSON()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `nudge-backup-${store.dateKey()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast("백업 파일을 내보냈습니다");
  });

  $("#btn-import").addEventListener("click", () => $("#file-import").click());
  $("#file-import").addEventListener("change", async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const text = await f.text();
    try {
      store.importJSON(text);
      render();
      toast("복원 완료 — 이전 데이터는 백업으로 보존되었습니다");
    } catch (err) {
      toast("복원 실패: " + err.message, 5000);
    }
  });
}

/* ── router ─────────────────────────────── */
const VIEWS = { today: viewToday, study: viewStudy, workout: viewWorkout, stats: viewStats, settings: viewSettings };

export function render() {
  clearInterval(tickTimer);
  VIEWS[currentView]();
  viewEl.classList.remove("enter");
  void viewEl.offsetWidth;
  viewEl.classList.add("enter");
  $$(".tab").forEach((t) => t.classList.toggle("active", t.dataset.view === currentView));
  window.scrollTo({ top: 0 });
}

$$(".tab").forEach((t) => t.addEventListener("click", () => {
  if (t.dataset.view === currentView) { window.scrollTo({ top: 0, behavior: "smooth" }); return; }
  currentView = t.dataset.view;
  render();
}));

render();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
