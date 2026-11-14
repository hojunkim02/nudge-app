# Nudge 개발 규칙

개발·배포에 필요한 규칙을 모은 문서입니다. (사용자용 소개는 [README.md](README.md))

## 기술 스택

- 디자인 컨셉: [Fluent 2](https://fluent2.microsoft.design/)([iOS 컴포넌트](https://fluent2.microsoft.design/components/ios)) 참고

- 의존성 없는 바닐라 JS(ES 모듈) + CSS, 빌드 단계 없음
- `manifest.webmanifest` + 서비스 워커(`sw.js`) 캐싱(앱 셸 네트워크-우선)
- iOS Safari 최신 버전 대상 (ES2020+ 문법, Pointer Events, `?.`/`??` 등 사용 가능)

## 브랜치 운영

### master — 개발 브랜치

- 모든 기능 개발·수정의 기준 브랜치. 항상 여기서 작업하고 커밋한다.
- **github.io가 master를 직접 서빙**하므로, 수정 후 별도 배포 작업 없이 push만 하면 사이트에 반영된다.
- 소스는 사람이 읽는 원본 그대로 유지 (minify 금지, 필요한 주석 허용).
- 산출물: `index.html`, `js/`(원본 ES 모듈), `css/`, `icons/`, `manifest.webmanifest`, `sw.js`, `privacy.html`, `terms.html`, `README.md`, `BRANCHES 문서`, `icons/generate.py` 등 개발 자산 전부.

### deploy — 배포(용량 최소화) 브랜치

- master를 기준으로 **재빌드**해서 만든다: `git checkout deploy && git reset --hard master`
- 빌드 방식:
  1. `js/app.js`를 esbuild로 번들(IIFE)한 뒤 **terser 고급 압축**(`--compress passes=3 --mangle`)해 `js/app.js`를 덮어쓴다. 결과물만 남기고 `js/store.js`, `js/gcal.js`는 **삭제**(번들에 포함됨).
  2. `css/app.css` esbuild minify.
  3. `index.html`, `privacy.html`, `terms.html` HTML 공백 축약.
  4. `sw.js` terser minify + 캐시 이름 범프(`nudge-vN+1`) — 캐시 이름은 master의 현재 값에서 +1.
  5. `manifest.webmanifest` 한 줄 축소.
- **삭제 파일**: `README.md`, `DEVELOPMENT.md`, `icons/generate.py`, `.gitignore`
- 완료 후 `git push --force-with-lease origin deploy`.
- 빌드 후 반드시 스모크 테스트를 minify 산출물로 수행해 정상 동작을 확인한다.
- 필요할 때만 갱신한다 (요청 없으면 매 커밋마다 재빌드하지 않음).

### demo — 예시 데이터 시드 브랜치

- master를 병합(`git merge master`)해 최신 코드를 반영한다.
- `js/store.js`의 `demoState()`로 한 달 사용 예시 데이터를 시드하고, `st.demo = true` 플래그를 설정한다.
  - `demo` 플래그가 있으면 앱에 **"하루 경과" 플로팅 버튼**이 노출된다.
  - 캐시 키가 분리되어 있다(`nudge-demo-v*`) — 실사용 데이터와 충돌하지 않음.
- **배포에 필요 없는 파일 제거**: `README.md`, `DEVELOPMENT.md`, `icons/generate.py`
- **주석 전량 제거** (줄/블록/인라인; 문자열 내 URL은 보존). **minify는 하지 않는다.**
- 병합 시 master의 주석이 되살아나므로, 병합 후 주석 제거 스크립트를 다시 실행한다.

### 공통 규칙

- master → (필요 시) deploy 재빌드, master → demo 병합은 각각 독립적으로 수행한다.
- deploy는 항상 master의 스냅샷에서 다시 만든다 (deploy에서 직접 기능 수정 금지).
- demo도 기능 수정 금지 — master에서 고친 뒤 병합. 예외는 demo 전용 요소(demoState, 데모 배너)뿐.

## 테스트

- 스모크 테스트: jsdom 기반 (`/tmp/smoke.js`, 번들 산출물로 실행). 캐시/모듈은 세션 간 초기화될 수 있으므로 jsdom 재설치 필요.
- 기능 변경 시 관련 회귀 테스트를 스모크에 추가한다.

## 구글 캘린더 연동

- `설정 → 동기화` 스위치 ON 시: Google 로그인(항상 새 로그인) → "Nudge" 캘린더 확인/생성(공개) → 연결 확인. 일정 업로드는 연결 시 하지 않고, **하루가 지나면 어제의 완료 일정을 시간대에 맞는 타임 이벤트로** Nudge 캘린더에 기입한다.
- Apple 캘린더 구독: "캘린더 구독 → 이동" 버튼(`webcal://`).
- 클라이언트 ID: `js/gcal.js`의 `BUILTIN_CLIENT_ID`에 내장(시크릿 미사용·미저장).
- 발급(최초 1회): Google Cloud Console → Calendar API 사용 설정 → OAuth 동의 화면(외부, 테스트 사용자에 본인 계정 추가) → OAuth 클라이언트 ID(웹 애플리케이션, 승인된 JavaScript 원본 `https://<username>.github.io`).

## iOS PWA 주의사항

- iOS 26+ Liquid Glass는 `black-translucent` 상태바에서 강제 블러를 그린다. Nudge는 `apple-mobile-web-app-status-bar-style: default`(불투명) + theme-color 메타 2개(라이트/다크)로 회피한다. 변경 사항 반영을 위해 홈 화면 앱은 삭제 후 재설치해야 한다.
- 로그인 팝업(GIS)은 사용자 탭 제스처 안에서만 열어야 차단되지 않는다. `await` 이후 팝업 금지.

## 아이콘 재생성

앱 아이콘은 책 *Nudge* 표지 참고(주황 바탕 + 흰 화살표):

```bash
python3 icons/generate.py   # numpy 필요
```
