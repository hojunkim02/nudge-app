/* Nudge — Google Calendar 동기화 (Google Identity Services OAuth + Calendar API v3)
   정적 PWA에서 안전하게 쓰는 방식: 클라이언트 시크릿 없이 OAuth 토큰만 사용. */

/* 배포자가 한 번만 채워 넣으면 사용자는 구글 로그인만으로 연결됩니다.
   (비워 두면 설정 화면의 클라이언트 ID 입력란이 표시됩니다) */
export const BUILTIN_CLIENT_ID = "938328198458-nbal2ejhmff2ec8j5fu2uo6spbc498o7.apps.googleusercontent.com";

const TOKEN_KEY = "nudge.gcal.token";
let accessToken = null;
let loggingIn = false;

function saveToken(token, expiresInSec) {
  accessToken = token;
  try {
    localStorage.setItem(TOKEN_KEY, JSON.stringify({ token, exp: Date.now() + (expiresInSec || 3600) * 1000 }));
  } catch {}
}
function loadToken() {
  if (accessToken) return accessToken;
  try {
    const raw = JSON.parse(localStorage.getItem(TOKEN_KEY) || "null");
    if (raw && raw.token && raw.exp > Date.now() + 60000) accessToken = raw.token;
    else if (raw) localStorage.removeItem(TOKEN_KEY);
  } catch {}
  return accessToken;
}
export function hasToken() { return !!loadToken(); }
export function isLoggingIn() { return loggingIn; }
export function clearToken() {
  accessToken = null;
  try { localStorage.removeItem(TOKEN_KEY); } catch {}
}

function loadGsi() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve();
    const ready = () => (window.google?.accounts?.oauth2 ? resolve() : reject(new Error("Google 로그인 스크립트를 불러오지 못했습니다")));
    if (document.querySelector('script[src*="accounts.google.com/gsi"]')) {
      const wait = setInterval(() => {
        if (window.google?.accounts?.oauth2) { clearInterval(wait); resolve(); }
      }, 100);
      setTimeout(() => { clearInterval(wait); reject(new Error("Google 로그인 스크립트를 불러오지 못했습니다")); }, 8000);
      return;
    }
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => ready();
    s.onerror = () => reject(new Error("Google 로그인 스크립트를 불러오지 못했습니다"));
    document.head.appendChild(s);
  });
}
/* 팝업은 사용자 탭 제스처 안에서 열려야 하므로, 설정 화면 진입 시 미리 스크립트를 로드해 둔다 */
export function preload() {
  loadGsi().catch(() => {});
}

export async function login(clientId) {
  await loadGsi();
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, arg) => { if (settled) return; settled = true; loggingIn = false; fn(arg); };
    const timeout = setTimeout(() => finish(reject, new Error("Google 로그인 응답이 없습니다. 다시 시도해 주세요")), 120000);
    loggingIn = true;
    const tc = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: "https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events",
      callback: (resp) => {
        if (resp.error) { finish(reject, new Error("Google 로그인 실패: " + resp.error)); return; }
        const granted = String(resp.scope || "").split(" ");
        if (!granted.includes("https://www.googleapis.com/auth/calendar")) {
          clearToken();
          finish(reject, new Error("캘린더 접근 동의가 필요합니다. 동의 화면에서 캘린더 권한을 허용해 주세요"));
          return;
        }
        saveToken(resp.access_token, resp.expires_in);
        finish(resolve);
      },
      error_callback: (err) => {
        const t = err && err.type;
        if (t === "popup_failed_to_open" || t === "popup_open_blocked") {
          finish(reject, new Error("로그인 창이 차단되었습니다. 사파리에서 페이지를 열어 다시 시도하세요"));
        } else if (t === "popup_closed_by_user" || t === "popup_closed") {
          finish(reject, new Error("Google 로그인이 취소되었습니다"));
        } else {
          finish(reject, new Error("Google 로그인을 시작하지 못했습니다"));
        }
      },
    });
    tc.requestAccessToken();
  });
}

const API = "https://www.googleapis.com/calendar/v3";

async function api(path, opts = {}) {
  if (!loadToken()) throw new Error("먼저 Google 계정에 연결해 주세요");
  const res = await fetch(API + path, {
    ...opts,
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  if (res.status === 401) { accessToken = null; throw new Error("Google 로그인이 만료되었습니다. 다시 연결해 주세요"); }
  if (res.status === 204) return null;
  if (!res.ok) {
    let j = null;
    try { j = await res.json(); } catch {}
    const status = j?.error?.status || "";
    const msg = j?.error?.message || "";
    if (status === "SERVICE_DISABLED" || /has not been used|is disabled/i.test(msg)) {
      throw new Error("이 프로젝트에서 Calendar API가 꺼져 있습니다. Google Cloud Console → API 및 서비스 → 라이브러리 → 'Google Calendar API' → 사용");
    }
    if (/insufficient authentication scopes|PERMISSION_DENIED/i.test(status + " " + msg)) {
      clearToken();
      throw new Error("캘린더 권한이 부족합니다. 스위치를 다시 켜어 로그인을 다시 해주세요");
    }
    if (/quota/i.test(status + " " + msg)) {
      throw new Error("Google API 사용 한도를 초과했습니다. 잠시 후 다시 시도해 주세요");
    }
    throw new Error(`Google API 오류 ${res.status}${msg ? ` — ${msg}` : ""}`);
  }
  return res.json();
}

export async function calendarExists(calendarId) {
  try {
    const cal = await api(`/calendars/${encodeURIComponent(calendarId)}`);
    return !cal.deleted; // 삭제 보류(trash) 상태면 없는 것으로 취급
  } catch (e) {
    if (/Google API 오류 4\d\d/.test(e.message)) return false;
    throw e;
  }
}
export async function findCalendarByName(name) {
  const r = await api("/users/me/calendarList?minAccessRole=writer");
  return (r.items || []).find((c) => !c.deleted && !c.hidden && (c.summaryOverride || c.summary) === name) || null;
}
export async function createCalendar(name) {
  const cal = await api("/calendars", { method: "POST", body: JSON.stringify({ summary: name, timeZone: "Asia/Seoul" }) });
  try { await api("/users/me/calendarList", { method: "POST", body: JSON.stringify({ id: cal.id }) }); } catch {}
  return cal;
}
export async function makePublic(calendarId) {
  try {
    await api(`/calendars/${encodeURIComponent(calendarId)}/acl`, { method: "POST", body: JSON.stringify({ scope: { type: "default" }, role: "reader" }) });
    return true;
  } catch { return false; }
}
export function publicIcsUrl(calendarId) {
  return `https://calendar.google.com/calendar/ical/${encodeURIComponent(calendarId)}/public/basic.ics`;
}

export async function upsertEvent(calendarId, eventId, body) {
  if (eventId) {
    try {
      return await api(`/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, { method: "PATCH", body: JSON.stringify(body) });
    } catch (e) {
      if (!/오류 \(4\d\d\)/.test(e.message)) throw e;
    }
  }
  return api(`/calendars/${encodeURIComponent(calendarId)}/events`, { method: "POST", body: JSON.stringify(body) });
}

export async function deleteEvent(calendarId, eventId) {
  try {
    await api(`/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, { method: "DELETE" });
    return true;
  } catch (e) {
    return /오류 \(4\d\d\)/.test(e.message);
  }
}

/* ── 이벤트 본문 생성 (순수 함수) ── */
const GCAL_DOW = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

export function buildScheduleEvent(it, now = new Date()) {
  const m = String(it.time).match(/(\d{1,2}):(\d{2})\D+(\d{1,2}):(\d{2})/);
  if (!m || !it.days.length) return null;
  const start = new Date(now);
  start.setDate(start.getDate() + ((Math.min(...it.days) - start.getDay() + 7) % 7 || 7));
  start.setHours(+m[1], +m[2], 0, 0);
  const end = new Date(start);
  end.setHours(+m[3], +m[4], 0, 0);
  return {
    summary: it.title,
    start: { dateTime: start.toISOString(), timeZone: "Asia/Seoul" },
    end: { dateTime: end.toISOString(), timeZone: "Asia/Seoul" },
    recurrence: [`RRULE:FREQ=WEEKLY;BYDAY=${it.days.map((d) => GCAL_DOW[d]).join(",")}`],
    extendedProperties: { private: { nudgeId: "sched:" + it.id } },
  };
}

export function buildSessionEvent(sess) {
  if (sess.status !== "finalized") return null;
  return {
    summary: `${sess.label || "자습"} ${sess.finalMin}분`,
    start: { date: sess.date },
    end: { date: sess.date },
    extendedProperties: { private: { nudgeId: "sess:" + sess.id } },
  };
}
