/* Nudge — Google Calendar 동기화 (Google Identity Services OAuth + Calendar API v3)
   정적 PWA에서 안전하게 쓰는 방식: 클라이언트 시크릿 없이 OAuth 토큰만 사용. */

let accessToken = null;

export function hasToken() { return !!accessToken; }

function loadGsi() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve();
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
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Google 로그인 스크립트를 불러오지 못했습니다"));
    document.head.appendChild(s);
  });
}

export async function login(clientId) {
  await loadGsi();
  return new Promise((resolve, reject) => {
    const tc = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: "https://www.googleapis.com/auth/calendar.events",
      callback: (resp) => {
        if (resp.error) reject(new Error("Google 로그인 실패: " + resp.error));
        else { accessToken = resp.access_token; resolve(); }
      },
    });
    tc.requestAccessToken();
  });
}

const API = "https://www.googleapis.com/calendar/v3";

async function api(path, opts = {}) {
  if (!accessToken) throw new Error("먼저 Google 계정에 연결해 주세요");
  const res = await fetch(API + path, {
    ...opts,
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  if (res.status === 401) { accessToken = null; throw new Error("Google 로그인이 만료되었습니다. 다시 연결해 주세요"); }
  if (res.status === 204) return null;
  if (!res.ok) throw new Error(`Google API 오류 (${res.status})`);
  return res.json();
}

export async function listCalendars() {
  const r = await api("/users/me/calendarList?minAccessRole=writer");
  return (r.items || []).map((c) => ({ id: c.id, title: c.summary }));
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
