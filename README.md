# Nudge 🍊

CPA 수험생을 위한 개인 학습·생활 관리 **PWA**. GitHub Pages(`github.io`)에 배포하여 iOS Safari에서 "홈 화면에 추가"로 네이티브 앱처럼 사용합니다. 디자인은 [Fluent 2 (iOS)](https://fluent2.microsoft.design/components/ios) 패턴을 참고했습니다.

## 기능

- **오늘** — 요일별 반복 일정 체크리스트(요일 탭으로 다른 날 조회), 진행 링, 자습 타이머(일시정지/재개, 측정값 조정 + 사유 로그, 미확정 세션 확정), 점심 자습 예/아니오 결정(주 3회 제한, 11:50 마감)
- **학습** — 과목 → 챕터 → 강의 계층 관리, 미학습/복습 필요/완료 상태 순환, 평일 10강 목표 및 조정 로그, 전체 진도율
- **운동** — 등 → 가슴 → 어깨 → 팔 → 하체 5일 사이클, 완료 시 자동 진행, 주간 완료 스트립
- **통계** — 주간 자습 시간, 세션 수, 강의 진도율, 요일별 막대 차트
- **설정** — 화면 모드(라이트/다크/시스템 + 흑백), 일정 알림(Notification API, 앱 사용 중), 일정 항목 편집, 기본 학습 목표, 운동 요일별 종목 배정, iCloud CalDAV 동기화(기본 OFF, 설정 시 오늘의 일정·자습 세션을 캘린더에 업로드)
- **자습 타이머** — 실행 중 하단에 플로팅 바로 표시되어 어떤 탭에서든 시간 확인·일시정지·종료 가능

## 데이터 저장

기본적으로 모든 데이터는 브라우저 **localStorage**에만 저장됩니다. 설정에서 CalDAV 동기화를 켜면 최근 7일간의 자습 세션을 iCloud 캘린더에 VEVENT로 업로드합니다(중복 방지 UID).

### iCloud CalDAV 주의사항

iCloud의 CalDAV 서버(`caldav.icloud.com`)는 CORS 헤더를 제공하지 않아, 브라우저에서 github.io 페이지가 직접 요청하면 차단될 수 있습니다. 이 경우:

1. [appleid.apple.com](https://appleid.apple.com) → 로그인 및 보안 → **앱 전용 비밀번호** 생성
2. 설정에 Apple ID와 앱 전용 비밀번호 입력 후 "연결 테스트"
3. CORS 오류(`Failed to fetch`)가 발생하면, 자체 서버 또는 CORS 프록시를 통해 CalDAV 요청을 중계해야 합니다. 프록시를 쓸 경우 `설정 → CalDAV 서버`에 프록시 URL을 입력하세요.

## 배포 (GitHub Pages)

1. 이 저장소를 fork 또는 push
2. `Settings → Pages → Source: Deploy from a branch` → `master` /(root) 선택
3. `https://<username>.github.io/nudge-app/` 접속

### iOS 설치

1. Safari로 위 URL 접속
2. 공유 버튼 → **홈 화면에 추가**
3. 홈 화면의 Nudge 아이콘으로 전체 화면 앱 실행 (서비스 워커가 오프라인 지원)

## 아이콘

앱 아이콘은 책 *Nudge*(Thaler & Sunstein) 표지를 참조한 주황색 바탕 + 흰색 화살표 디자인입니다. 재생성:

```bash
python3 icons/generate.py   # numpy 필요
```

## 기술

- 의존성 없는 바닐라 JS(ES 모듈) + CSS — 빌드 단계 없음
- `manifest.webmanifest` + 서비스 워커(`sw.js`) 캐싱
- iOS Safari 최적화: safe-area inset, `100dvh`, `backdrop-filter` blur, spring 애니메이션(`cubic-bezier(.32,.72,0,1)`), 다크 모드, 44px+ 터치 타깃, `touch-action: manipulation`
