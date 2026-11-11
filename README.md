# Nudge 🍊

CPA 수험생을 위한 개인 학습·생활 관리 **PWA**. GitHub Pages(`github.io`)에 배포하여 iOS Safari에서 "홈 화면에 추가"로 네이티브 앱처럼 사용합니다. 디자인은 [Fluent 2 (iOS)](https://fluent2.microsoft.design/components/ios) 패턴을 참고했습니다.

## 기능

- **오늘** — 요일별 반복 일정 체크리스트(요일 탭으로 다른 날 조회), 현재/다음 일정 표시, 상단 자습 시작 버튼, 진행 링(일정 카드와 통합), 자습 타이머 플로팅 바(일시정지/재개, 측정값 조정 + 사유 로그, 미확정 세션 확정), 점심 자습 예/아니오 결정(주 3회 제한, 11:50 마감 + 미응답 자동 '아니오')
- **학습** — 과목 → 챕터 → 강의 계층(인라인 추가), 항목을 왼쪽으로 밀어 삭제(확인 단계), 연필 아이콘으로 인라인 이름 변경, 강의 상태 2단계(미학습↔완료), 재수강 중복 집계 방지
- **운동** — 요일별 분할(기본 6종: 등/가슴/어깨/팔/하체/휴식) + 종목별 매일 루틴 편집, '다음 운동' 단계 진행 후 마지막 종목 완료 시 '운동 완료', 단계 되돌리기·당일 기록 취소
- **통계** — 주간/월간 자습 시간·세션 수·진도율, 요일별 막대(정규/추가 색상 구분), 성공 기준(60~100%) 기반 성공/완전 수행 판정, 과목별 진행률
- **설정** — 화면 모드(라이트/다크/시스템 + 흑백), 일정 알림(Notification API, 앱 사용 중), 일정 항목 편집, 기본 학습 목표, 요일별 분할 + 매일 루틴 편집, iCloud 캘린더 동기화(기본 OFF, 설정 시 오늘의 일정·자습 세션을 캘린더에 업로드). 편집 시트는 바깥 터치 시 한 단계씩 닫힘
- **자습 타이머** — 실행 중 하단에 플로팅 바로 표시되어 어떤 탭에서든 시간 확인·일시정지·종료 가능

## 데이터 저장

기본적으로 모든 데이터는 브라우저 **localStorage**에만 저장됩니다. 설정에서 CalDAV 동기화를 켜면 최근 7일간의 자습 세션을 iCloud 캘린더에 VEVENT로 업로드합니다(중복 방지 UID).

### iCloud CalDAV 주의사항

iCloud의 CalDAV 서버(`caldav.icloud.com`)는 CORS 헤더를 제공하지 않아, 브라우저에서 github.io 페이지가 직접 요청하면 차단될 수 있습니다. 이 경우:

1. [appleid.apple.com](https://appleid.apple.com) → 로그인 및 보안 → **앱 전용 비밀번호** 생성
2. 설정에 Apple ID와 앱 전용 비밀번호 입력 후 "연결 테스트"
3. CORS 오류(`Failed to fetch`)가 발생하면, 자체 서버 또는 CORS 프록시를 통해 CalDAV 요청을 중계해야 합니다. (설정 화면에서는 Apple ID와 앱 전용 비밀번호만 입력합니다.)

## 배포 (GitHub Pages)

1. 이 저장소를 fork 또는 push
2. `Settings → Pages → Source: Deploy from a branch` → `master` /(root) 선택
3. `https://<username>.github.io/nudge-app/` 접속

### iOS 설치

1. Safari로 위 URL 접속
2. 공유 버튼 → **홈 화면에 추가**
3. 홈 화면의 Nudge 아이콘으로 전체 화면 앱 실행 (서비스 워커가 오프라인 지원)

### iOS 상태바 안내

iOS 26+의 Liquid Glass는 `black-translucent` 상태바에서 강제 블러를 그립니다. Nudge는 `apple-mobile-web-app-status-bar-style: default`(불투명) + theme-color 메타 2개(라이트/다크)를 사용해 이를 회피합니다. 변경 사항 반영을 위해 홈 화면 앱을 삭제 후 재설치하세요.

## 아이콘

앱 아이콘은 책 *Nudge*(Thaler & Sunstein) 표지를 참조한 주황색 바탕 + 흰색 화살표 디자인입니다. 재생성:

```bash
python3 icons/generate.py   # numpy 필요
```

## 기술

- 의존성 없는 바닐라 JS(ES 모듈) + CSS — 빌드 단계 없음
- `manifest.webmanifest` + 서비스 워커(`sw.js`) 캐싱
- iOS Safari 최적화: safe-area inset, `100dvh`, `backdrop-filter` blur, spring 애니메이션(`cubic-bezier(.32,.72,0,1)`), 다크 모드, 44px+ 터치 타깃, `touch-action: manipulation`
