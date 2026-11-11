// Minimal CalDAV client for iCloud (best-effort from the browser).
// iCloud does not send CORS headers for CalDAV endpoints, so requests from a
// github.io origin may be blocked by the browser. Errors are surfaced clearly.
import { get, save, dateKey } from "./store.js";

function authHeader() {
  const { caldavUser, caldavPass } = get().settings;
  return "Basic " + btoa(unescape(encodeURIComponent(`${caldavUser}:${caldavPass}`)));
}

async function caldavFetch(method, url, body, ctype = "application/xml") {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: authHeader(),
      Depth: "0",
      ...(body ? { "Content-Type": ctype } : {})
    },
    body
  });
  if (!res.ok) throw new Error(`CalDAV ${method} ${res.status} ${res.statusText}`);
  return res;
}

export async function testConnection() {
  const { caldavUrl, caldavUser } = get().settings;
  const res = await caldavFetch("PROPFIND", caldavUrl.replace(/\/$/, "") + "/",
    `<?xml version="1.0"?>
<D:propfind xmlns:D="DAV:"><D:prop><D:current-user-principal/></D:prop></D:propfind>`);
  const xml = await res.text();
  const m = xml.match(/<[^>]*href[^>]*>([^<]+)<\/[^>]*href>/);
  return { ok: true, principal: m ? m[1] : caldavUser };
}

function icsDate(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}T${p(d.getHours())}${p(d.getMinutes())}00`;
}

function parseHHMM(str) {
  const m = str.match(/(\d{1,2}):(\d{2})/g);
  if (!m || !m[0]) return null;
  return m[0].split(":").map(Number);
}

function scheduleEvent(item, dateStr) {
  const st = parseHHMM(item.time);
  const [sh, sm] = st || [9, 0];
  const [eh, em] = (st && parseHHMM(item.time.split("[-–~]")[1] || "")) || [sh + 1, sm];
  const d = new Date(dateStr + "T00:00:00");
  const start = new Date(d); start.setHours(sh, sm, 0, 0);
  const end = new Date(d); end.setHours(eh, em, 0, 0);
  const uid = `nudge-sched-${dateStr}-${item.id}@nudge-app`;
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Nudge//KO",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(start)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:🗓 ${item.title}`,
    "END:VEVENT",
    "END:VCALENDAR"
  ].join("\r\n");
}

function sessionEvent(s) {
  const start = new Date(s.start);
  const end = new Date(s.end);
  const uid = `nudge-${s.id}@nudge-app`;
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Nudge//KO",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(start)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:📖 ${s.label} (${s.finalMin}분)`,
    "END:VEVENT",
    "END:VCALENDAR"
  ].join("\r\n");
}

export async function sync() {
  const st = get();
  const { caldavUrl } = st.settings;
  // Push study sessions from the last 7 days that were never synced.
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  const ck = dateKey(cutoff);
  const pending = st.sessions.filter((s) => s.date >= ck && s.status === "finalized" && !st.settings.caldavUids[s.id]);
  const todayKey = dateKey(new Date());
  const schedPending = get().schedule.filter((it) => it.days.includes(new Date().getDay()) && !st.settings.caldavUids[`sched-${todayKey}-${it.id}`]);
  if (!pending.length && !schedPending.length) return { pushed: 0 };
  // iCloud requires a per-event path; we PUT directly to the user's calendar
  // home derived from the principal. Without CORS, this will throw — caught in UI.
  const base = caldavUrl.replace(/\/$/, "");
  let pushed = 0;
  for (const s of pending) {
    const path = `${base}/${st.settings.caldavUser}/${s.id}.ics`;
    await caldavFetch("PUT", path, sessionEvent(s), "text/calendar");
    st.settings.caldavUids[s.id] = true;
    pushed++;
  }
  for (const it of schedPending) {
    const uidKey = `sched-${todayKey}-${it.id}`;
    const path = `${base}/${st.settings.caldavUser}/nudge-${todayKey}-${it.id}.ics`;
    await caldavFetch("PUT", path, scheduleEvent(it, todayKey), "text/calendar");
    st.settings.caldavUids[uidKey] = true;
    pushed++;
  }
  st.settings.caldavLastSync = new Date().toISOString();
  save();
  return { pushed };
}

export function friendlyError(e) {
  const msg = String(e && e.message || e);
  if (/Failed to fetch|NetworkError|load failed/i.test(msg)) {
    return "동기화 실패: 브라우저가 CalDAV 요청을 차단했습니다(CORS). iCloud는 브라우저 직접 호출을 허용하지 않으므로, CORS 프록시나 자체 서버를 경유해야 합니다. 자세한 내용은 README를 참고하세요.";
  }
  if (/401|403/.test(msg)) return "동기화 실패: 인증 정보가 올바르지 않습니다. iCloud 앱 전용 비밀번호(appleid.apple.com → 로그인 및 보안)를 사용하세요.";
  if (/404/.test(msg)) return "동기화 실패: CalDAV 경로를 찾을 수 없습니다. 서버 URL과 계정을 확인하세요.";
  return "동기화 실패: " + msg;
}
