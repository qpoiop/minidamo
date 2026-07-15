# minidamo — ROADMAP (live)

> **범위**: 서비스 안정화 · 완성도 · 자연스러운 flow. **신규 기능/룰 추가 금지.**
> 자율 사이클 (`/work-cycle`) 은 이 문서 §최우선 → §안정화 → §문서 순으로 소비.
>
> 각 사이클은 **작고 안전한 slice** 로 진행 (한 화면·한 요소·한 파일):
> 화면 flow / 노출 문구 / 이펙트 / 동작 / 인터랙션 자연스러움 검토 · 필요 시 수정.

---

## 🎯 서비스 안정화 원칙

1. **모든 노출 문구** — 오탈자 · 톤 · 정확성 · 상태 대비 정합.
2. **모든 이펙트** — 애니메이션 페이스 · 파티클 · 사운드 (있다면) · 딜레이.
3. **모든 기능 동작** — edge case · race · P2P divergence · restart/reconnect.
4. **모든 화면 플로우** — 진입 · 상태 · 이탈 · 재진입 자연스러운 흐름.
5. **모든 인터랙션** — 터치 반응 즉시성 · 피드백 명확성 · dead-end 없음.

---

## 🔥 최우선 (다음 사이클 후보 · 클라우드 실행 가능)

### 화면별 flow 검증 (스위프)

- [x] **SPLASH** — fadeout 타이밍 · 이후 HOME 진입 flicker 여부.
- [x] **HOME** — 게임 카드 슬라이더 · 드로어 · 규칙 보기 · 방 만들기 · 뒤로 진행 전체 flow.
- [x] **LOBBY (CREATE)** — QR 노출 · 상대 접속 · 옵션 동기화 · 시작 조건.
- [x] **LOBBY (JOIN)** — QR 스캔 · 근접 목록 · 접속 실패 · 재시도.
- [x] **GAME_PLAY (각 10 게임)** — 시작 애니 · 진행 상태 · 승패 판정 · 결과 화면.
- [x] **결과 화면** — 다시하기 · 대기방 · 다른 게임 · 나가기 각 4버튼 flow.
- [x] **재접속** — 3분 window · 재접속 성공/실패 · 상대측 UI 대응.
- [x] **재접속 — 호스트 콜드 리스토어** — `isHost` 무시하고 항상 guest 로 `joinRoom` 호출하던 결함 해소 (2026-07-14, 아래 로그 참조). 저장된 `screen`(GAME_PLAY) 을 무시하고 항상 LOBBY 로 복원하는 부분은 의도적으로 유지 — 어떤 게임도 도메인 상태를 콜드 리로드 너머로 들고 있지 않아 GAME_PLAY 로 직행하면 재로드 안 한 상대가 방금 새로 마운트된 컴포넌트를 상대로 리싱크되는 상황이라, 리싱크 프로토콜 없이는 LOBBY 착지(LOBBY_STATE 로 players/설정 재동기화)가 더 안전 — 별도 사이클(리싱크 프로토콜 설계) 필요.
- [x] **재접속 — 오버레이 이원화** — RECONNECTING 동안 App 레벨(`.reconnect-popup-overlay`)과 게임별 `GameConnectionOverlay` 가 동시 마운트되던 중복 해소 (2026-07-13, 아래 로그 참조).
- [x] **재접속 — 호스트 mid-game 세션 재구성** — GAME_PLAY 중 호스트측 연결이 끊겼을 때 게스트가 재접속할 방법이 실질적으로 없던 문제 해소 (2026-07-14, 아래 로그 참조).
- [x] **뒤로가기 · 이탈** — 각 스크린별 confirm · sentinel · session restore 정합 (2026-07-14, 아래 로그 참조).

### 노출 문구 정확성 스위프

- [x] **Bombhunt** 가이드 — rule engine 최신 반영 (parity/distance/relation 등 신규 타입 언급, 2026-07-14 아래 로그 참조).
- [x] **Escape** 가이드 — 열쇠 힌트 · minimap 사용법 · 아이템 (vision/speed/stun) 설명 (2026-07-14 아래 로그 참조).
- [x] **Memory** 가이드 — 라운드 옵션 (matchOption2) · 승리 조건 설명 보강 (2026-07-14 아래 로그 참조).
- [x] **Wavelength** 가이드 — targetScore 3/5/7 스케일 · tolerance 프리셋 실제 값 반영 (2026-07-14 아래 로그 참조).
- [x] **HiddenWord** 가이드 — 카드 종류별 효과 · 로그 표기법 명시 (2026-07-14 아래 로그 참조).
- [x] **Quorimo** 가이드 — 벽 배치 규칙 (경로 차단 금지) · 이동/점프 규칙 (2026-07-14 아래 로그 참조).
- [x] **Vinci** 가이드 — 조커 위치 선택 · 스톡 소진 · 검은 타일 처리 (2026-07-14 아래 로그 참조).
- [x] **Ditrick** 가이드 — 액션 세트 (check/call/raise/fold) · tie 팟 분배 (2026-07-14, 아래 로그 참조).
- [x] **Trumeon** 가이드 — Briscola 룰 · 무늬 강제 국면 (2026-07-14, 아래 로그 참조).
- [x] 전 게임 **토스트/라벨/에러 메시지** grep → 오탈자 · 톤 검토 (2026-07-14, 아래 로그 참조).

### 인터랙션 자연스러움

- [x] **연결/재접속 오버레이** — 재연결 문구 · 진행 표시 · 취소 옵션 (2026-07-14, 아래 로그 참조).
- [x] **애니메이션 페이스** — 카드 뒤집기 · 다이얼 회전 · 파티클 강도 (게임별 검토, 2026-07-14, 아래 로그 참조).
- [x] **햅틱/피드백** — 성공/실패 시 시각 피드백 즉시성 (2026-07-14, 아래 로그 참조).
- [x] **터치 정확도** — Quorimo 벽 슬롯 20px · Mastermind 팔레트 · HiddenWord 카드 (2026-07-14, 아래 로그 참조).

### 코드 위생 · 리팩터 · 최적화

- [x] **useRoom.ts** debug console.log → `debug()` 유틸 wrap · prod no-op (2026-07-14, 아래 로그 참조).
- [x] **Escape.css joystick** rgba 5건 (V1 감사 잔재) 토큰화 (2026-07-14, 아래 로그 참조).
- [x] **TurnTransitionToast.css** (common, 전 게임 공유) rgba/hex 7건 토큰화 (2026-07-14, 아래 로그 참조).
- [x] **GameGuideModal.css** (common, 전 게임 공유 가이드 오버레이) rgba/hex 8건 토큰화 (2026-07-14, 아래 로그 참조). 나머지 후보(wavelength.css/hiddenword.css/quorimo.css 다수 hex·rgba, escape.css 캐릭터 그라디언트 1건)는 이번 사이클 스코프 밖 — 후속 사이클로 이월.
- [x] **BombHunt 전용 turn-toast** — `bombhunt.css`에 `common/TurnTransitionToast.css`와 별개로 `.bombhunt-turn-toast`류 자체 정의 존재 (독립 리뷰 중 발견) · 공용 컴포넌트 재사용 가능 여부 검토 (2026-07-15, 아래 로그 참조 — 감사 결과 별도 유지가 안전, 변경 없음).
- [x] **Escape.tsx** 1000+ 줄 파일 분해 (캔버스 렌더 · 입력 · 상태 계층 분리) — `escapeEngine.ts`/`escapeRenderer.tsx`로 분리 완료 (2026-07-15, 아래 로그 참조).
- [x] **각 게임 rAF cleanup** 재검증 (unmount 시 애니메이션 stall 방지) — `Escape.tsx`(게임 루프) · `CanvasStage.tsx`(공용, 현재 미사용) · `effects/particles.ts`(전역 이펙트 엔진) 전수 확인, 모두 `cancelAnimationFrame`/`destroy()` 를 effect cleanup 에서 호출해 이상 없음. `MemoryMatch.tsx` 의 단발성 `requestAnimationFrame`(매치 셀레브레이션)은 루프가 아니라 stall 대상 아님 (2026-07-14, 아래 로그 참조).
- [x] 각 게임 `useEffect` deps 정합성 재감사 (audit 후 잔여) — 나머지 8개 게임(Escape/Wavelength/HiddenWord/Quorimo/Vinci/Ditrick/Trumeon/Mastermind) + 공유 훅(`useMatchRestart.ts`/`useRoom.ts`) 전수 재확인, BombHunt/MemoryMatch 와 동일 계열 stale-closure 결함 추가 발견 없음 — 각 파일이 이미 광범위 deps 재구독 · ref-mirror 메시지 핸들러 · 순수 리듀서 함수형 업데이트 세 방어 패턴 중 하나로 클린 (2026-07-14, 아래 로그 참조).
- [x] `sw.ts` 캐시 무효화 · 업데이트 프롬프트 flow 재검토 (2026-07-15, 아래 로그 참조 — `activate` 핸들러의 하드코딩 캐시 정리 로직을 workbox 표준 `cleanupOutdatedCaches()`로 교체).
- [x] `useAppNavigation.ts` sentinel · restore 로직 edge case 재확인 — 재확인 결과 실제 결함은 `useRoom.ts`(호스트 세션 수립 경로)에서 발견 (2026-07-15, 아래 로그 참조). 부수 발견(스코프 밖, 후속 후보로 기록): restoring 중 back-gesture exit confirm 은 `restorePrompt`/`restoreState` 를 정리하지 않아, HOME 복귀 직후 이번 수정으로 안전해진 재시도 프라미스가 정리될 때까지 짧게 재접속 프롬프트가 재노출될 수 있음(네트워크 세션 자체는 이번 수정으로 더 이상 되살아나지 않음 — 순수 UI 잔상).
- [x] **Escape** 매치 타이머 — host/guest 가 각자 로컬 `performance.now()` 로 독립 시작하던 만료 판정 편차를 완료 브로드캐스트로 동기화 (2026-07-15, 아래 로그 참조).
- [x] **restoring 중 back-gesture exit-confirm** 이 `restorePrompt`/`restoreState` 를 정리하지 않는 문제 — HOME 복귀 직후 재접속 프롬프트가 잠깐 재노출될 수 있음(2026-07-15, 아래 로그 참조).
- [x] **BombHunt** `applyRevealLocal` 의 `useCallback` deps(`[isHost, fire]`)가 클로저 내부에서 쓰는 `finishMatchByRole` 을 누락 — `players` 변경 시 stale 클로저 참조 문제 해소 (2026-07-14, 아래 로그 참조).
- [x] **MemoryMatch** `applyReveal`(`useCallback` deps `[]`)이 `resolveTwoPicks` 를 직접 클로저로 호출해, 매치 진행 중 라운드 종료 판정이 stale `currentRound` 로 굳어버리던 문제 해소 (2026-07-14, 아래 로그 참조).

### 문서 최신화

- [x] `planning/screen_spec.html` — 실제 라이브 게임 10종 반영 (3게임 제거 후 갱신 안 됨, 2026-07-15 아래 로그 참조).
- [x] `planning/service_spec.html` — GPS 매칭 · P2P · PWA 실제 구현 반영 (2026-07-15, 아래 로그 참조).
- [x] `planning/system_spec.html` — Cloudflare TURN · GitHub Actions 반영 (2026-07-15, 아래 로그 참조).
- [x] `planning/IMPLEMENTATION.md` — 최근 refactor (감사 후속) 반영 (2026-07-15, 아래 로그 참조).
- [x] `planning/TURN_SETUP.md` — 크레딧/폴백 정책 명시 (2026-07-15, 아래 로그 참조).
- [ ] `.claude/skills/agentic/protocols/` — minidamo 파일 경로 재정합 (감사 후 잔존).

---

## 🚫 하지 않을 것 (하드 룰)

- **신규 기능 추가** (사용자 명시 요청 있을 때만).
- **신규 룰 추가/변경** (예: Trumeon tiebreak · Ditrick raiseCount 조정 등은 사용자 결정 대기).
- **신규 게임 추가**.
- **룩앤필 대격변** (시안 유지).
- **`sw` 캐시 aggressive 무효화** (사용자 세션 데이터 유실 위험).
- **V1 위반 신규 도입** · `any` 남발 · 인라인 hex.
- `--no-verify` / `--force` 커밋.

---

## 🅿️ 파킹 (사용자 결정 대기 · 자율 사이클 X)

- Trumeon 마지막 트릭 tiebreak 룰 (Briscola 표준 도입 여부).
- Ditrick raiseCount ≥ 5 강제 쇼다운 (룰 튜닝 방향).
- 모바일 실기기 UX 검증 (Vinci/Ditrick/Trumeon iOS Safari · Android Chrome · Quorimo 20px slot · Mastermind/HiddenWord 그리드) — 실기기 필요.
- P2P 재접속 3분 window 실측 (실기기 필요).
- Playwright / Vitest 도입 여부 (ROI 판단).
- `tokens.css` 라이트/mono 테마 완성도 (현재 arcade only 실사용).

---

## ✅ 완료 로그

### 2026-07-15 · TURN_SETUP.md — 크레딧/폴백 정책 문서 정확성 감사 및 정정
- [x] **`planning/TURN_SETUP.md`(Cloudflare Realtime TURN 크레딧/쿼터/폴백 정책 문서)를 `worker/src/index.ts`(`issueTurnCredentials`)·`worker/wrangler.toml`·`src/services/signaling.ts`·`src/services/rtc.ts`·`src/hooks/useRoom.ts`·`src/components/common/DiagPanel.tsx`/`DiagButton.tsx` 실측 대조** — 독립 리뷰 에이전트로 재검증하여 3건 결함 발견 후 수정: ① §5 `buildIceConfigWithTurn()` 호출부를 존재하지 않는 함수명 `ingestOfflineOffer` 로 오기(실제로는 `establishHostSession`[`createRoom`/`restoreHostRoom` 호스트 콜드 리스토어 공용 헬퍼] / `joinRoom` / `ingestHostSignal` 3곳), ② §3 allowlist 미설정 시 "IP quota 만 남음" 오기(실제로는 global cap 도 allowlist 여부와 무관하게 항상 최우선 검사되어 IP quota + global cap 둘 다 남음), ③ §2 `ROOM_TTL_SECONDS` "기본값 1800" 표기가 배포값(`wrangler.toml [vars]`)과 코드 자체 fallback(300, 5분)을 구분하지 않던 문제 — 재검증 후 최종 PASS.
- `npm run lint`(tsc --noEmit)/`npm run build` 통과.

### 2026-07-15 · IMPLEMENTATION.md — 실제 게임 로스터(10종) 및 최근 refactor 반영 전면 재작성
- [x] **`planning/IMPLEMENTATION.md`(2026-07-08판)가 이미 제거된 구게임(우다다 대시/구 냥탈출/코드네임·모순/틱택토/컬러 브레이커/미니 탁구)을 서술하고 있어 실제 라이브 10종 게임(memory/bombhunt/mastermind/escape/wavelength/hiddenword/quorimo/vinci/ditrick/trumeon)과 완전히 어긋나 있던 문제, 그리고 최근 감사 후속 refactor(§System spec 감사에서 확인된 Cloudflare Worker/TURN, Escape 3계층 분해, sw.ts `cleanupOutdatedCaches()`, 호스트 콜드 리스토어 수정 등)가 전혀 반영돼 있지 않던 문제** — `src/games/registry.tsx` 전체 대조로 10종 게임 각각의 title/genre/turnType/matchOptions/P2P 메시지 타입/특이 UI를 실측 재작성, §0(방·로비·P2P 상수·P2PMessage 9종 타입·호스트 콜드 리스토어), §2(공통 컴포넌트 — `components/common/` vs `features/games/common/` vs `chat/` 3분할 현행화), §5(sw.ts/CI·CD) 신규.
- `npm run lint`(tsc --noEmit)/`npm run build` 통과. 독립 리뷰 에이전트 — `registry.tsx` 10종 게임 전 필드·10개 게임 각 P2P 메시지 상수(grep)·Escape 분해 라인 수(`wc -l`, git history 대조)·sw.ts/공통 컴포넌트 디렉터리 배치·테스트모드·토큰/팔레트·CI 워크플로 전 항목 소스 1:1 대조 검증 — **3건 결함 발견 후 수정**: ① `P2PMessage.payload`를 optional로 오기(실제로는 필수 필드, 내부 서브필드만 optional), ② "테스트모드" 버튼이 "헤더 로고 옆"이라는 오기(실제로는 HOME 활성 GameCard의 actionArea 내부), ③ 존재하지 않는 `light` 테마를 `mono`와 함께 파킹 항목으로 오기(실제로는 `arcade`/`mono` 2종뿐, `light` 미존재) — 재검증 후 최종 PASS.

### 2026-07-15 · system_spec.html — Cloudflare TURN/GitHub Actions 반영 및 나머지 fictional 아키텍처 정합
- [x] **`planning/system_spec.html`(시스템 기획서)가 PeerJS·자체 시그널링 서버·`GPS_ALERT` 프로토콜·하드코딩 `sw.js` 캐시 목록 등 실제로 존재하지 않는 아키텍처를 서술하고 있던 문제, Cloudflare TURN과 GitHub Actions CI/CD가 문서에 전혀 반영돼 있지 않던 문제** — Explore 조사로 `src/services/rtc.ts`/`src/services/signaling.ts`/`worker/wrangler.toml`/`worker/src/index.ts`/`src/hooks/useRoom.ts`/`src/sw.ts`/`vite.config.ts`/`.github/workflows/deploy.yml`/`src/utils/distance.ts` 대조.
  - §1(폴더 구조): PeerJS 없음(순수 `RTCPeerConnection` 래퍼)·존재하지 않는 `context/PeerContext.tsx`/`styles/variables.css` 제거, 실제 `src/` 트리(components/common·features/games+home/lobby/test·games/registry.tsx·hooks·services·chat/effects/theme·styles·utils·sw.ts)로 교체, 프론트엔드(Cloudflare Pages)와 완전히 분리 배포되는 Cloudflare Worker(`worker/`, KV+D1, `/room /rooms /join /answer /turn-credentials` 라우트)를 신규 반영.
  - §2(GPS 매칭): "시그널링 서버가 20m 반경 필터링"은 실제로는 거꾸로임 — Worker의 `GET /rooms`는 거리 계산 없이 원본 좌표를 그대로 반환하고, 실제 하버사인 필터는 **클라이언트**(`useRoom.ts`의 `searchNearbyRooms`, `NEARBY_RADIUS_M=20`)가 수행 — 정정. `RoomSummary` 응답 스키마를 `worker/src/index.ts` 실제 타입으로 교체.
  - §3(WebRTC): 가상 `ReconnectPacket`/`GPS_ALERT`/`RECONNECT_REQUEST` 타입을 실제 `P2PMessage`(`useRoom.ts`, 9종 타입 유니온 + `senderId`/`timestamp`/넓은 optional `payload`)로 교체, 실제 상수(`HEARTBEAT_INTERVAL_MS=2000`/`CONNECTION_LOSS_MS=6500`/`RECONNECT_WINDOW_S=180`/`JOIN_CONNECT_TIMEOUT_MS=20000`) 반영, GPS/RTT 임계값 기반 경고가 없고(`distance`/`rtt`는 계산만 되고 UI 미소비 — service_spec.html 감사에서 이미 확인된 사실과 일치) 실제 재접속 트리거는 ICE 상태/DataChannel close/하트비트 무응답임을 명시. Cloudflare Realtime TURN 자격증명 발급(`/turn-credentials`)·`buildIceConfigWithTurn()` 병합·정적 STUN/오픈릴레이 폴백 풀을 신규 반영(`planning/TURN_SETUP.md` 상호 참조).
  - §4(서비스 워커): 하드코딩 `CACHE_NAME`/`ASSETS_TO_CACHE`/`install`+`fetch` 캐시 우선 로직(실제로는 이런 리스너 자체가 없음)을 실제 `sw.ts`(Workbox `injectManifest`, `precacheAndRoute(self.__WB_MANIFEST)`, 모듈 최상단 `cleanupOutdatedCaches()`, `SKIP_WAITING` 메시지 리스너, `activate`→`clients.claim()`만)로 교체. `push`/`notificationclick` 리스너는 실재하지만 저장소 전체에 `PushManager.subscribe`/권한 요청 UI가 없어 미연동 상태임을 명시(서술은 유지하되 "발신 경로 없음" 정정 — service_spec.html 감사와 동일 결론). 정적 `manifest.json` 없음(vite-plugin-pwa가 빌드 시 생성) 반영.
  - §5(신규): GitHub Actions CI/CD 섹션 신설 — `.github/workflows/deploy.yml` 단일 워크플로(별도 lint/test 워크플로 없음), `production` push 트리거, `npm run lint`(실제로는 tsc --noEmit)+`npm run build`+`cloudflare/pages-action@v1`(Cloudflare Pages `minidamo` 프로젝트) 배포. Worker(`worker/`)는 이 워크플로에 포함되지 않고 `wrangler deploy` 수동 배포임을 명시.
- `npm run lint`(tsc --noEmit)/`npm run build` 통과(세션 최초 `npm ci` 필요). 독립 리뷰 에이전트 — §1~§5 전 항목을 소스와 1:1 대조 검증, **1건 결함 발견**: §3의 `P2PMessage` 코드 샘플이 실제 타입의 `senderId`/`timestamp` 필드를 누락하고 `payload`를 `unknown`으로 과단순화 — 실제 필드(`senderId: string`/`timestamp: number`/20+ optional 필드를 가진 `payload`)를 반영하도록 수정 후 재검증 — PASS.

### 2026-07-15 · service_spec.html — GPS 매칭/P2P/PWA 정책 문서를 실제 구현과 정합
- [x] **`planning/service_spec.html`(서비스 기획서)의 §2 P2P 연결 정책과 §3 PWA 정책이 실제 구현과 다수 어긋나 있던 문제, §4가 여전히 제거된 플레이스홀더 게임(틱택토/미니 탁구)을 예시로 참조하던 문제** — Explore 조사로 `src/hooks/useRoom.ts`/`src/App.tsx`/`src/components/common/PWAPrompt.tsx`/`src/sw.ts`/`src/games/registry.tsx` 대조.
  - §2: "재접속 대기 중 (5초)"·"물리 거리 25m 이상 시 경고 배너" 는 실제로 존재하지 않음(`distance`/`rtt` state는 `useRoom.ts`에 계산되지만 어떤 UI에도 소비되지 않는 죽은 값) — 실제 재접속 창은 `RECONNECT_WINDOW_S = 180`(3분), 트리거는 GPS/RTT가 아니라 WebRTC ICE 상태(`disconnected`/`failed`)·DataChannel close·하트비트 무응답. 실제 팝업 문구("상대방 연결 끊김"/"네트워크 연결 끊김"/"상대방과 재연결할 수 없어요")로 교체. 매칭 경로도 GPS 20m 반경(하버사인, `NEARBY_RADIUS_M = 20` — 이 부분은 기존 서술이 정확했음) 외에 QR 스캔·4자리 코드 수동 입력 폴백이 실제로 존재해 반영, 시그널링·TURN이 범용 서버가 아니라 Cloudflare Worker(+Cloudflare Realtime TURN)임을 명시.
  - §3: 설치 배너는 상시 노출 버튼이 아니라 `beforeinstallprompt` 이벤트 기반 플로팅 카드(+ iOS Safari 전용 수동 안내 카드)임을 반영, 근거 없는 "부팅 0.2초" 수치를 제거하고 실제 존재하는 "오프라인 준비 완료" 토스트로 교체, 업데이트 카드 문구를 실제 텍스트("새 버전 배포"/"업데이트 후 적용")로 교체. **웹 푸시 알림 섹션이 가장 큰 과장** — `src/sw.ts`에 `push`/`notificationclick` 리스너는 실재하지만, 저장소 전체에 `PushManager.subscribe`/알림 권한 요청 UI가 전혀 없어 실제로 푸시를 발신할 경로가 없는 미연동 상태였음(기존 문서는 "사용자 동의 시 정상 작동"처럼 서술) — "준비 단계, 발신 경로 미연결" 로 정정.
  - §4: "1. 틱택토"·"2. 미니 탁구" 절 전체(3판 2선승/15초 턴/호스트 물리 연산 등 존재하지 않는 룰)를 실제 10종 게임 중 대표 2종(턴제 그리드 `bombhunt`=룰셋 판도라, 실시간 캔버스 `escape`=협동 미로)의 실제 룰 개요로 교체 — 나머지 8종 상세 룰은 인게임 가이드 모달에 이미 존재해 문서 중복(V2 우려) 방지 위해 대표 사례만 유지.
- `npm run lint`(tsc --noEmit)/`npm run build` 통과(세션 최초 `npm ci` 필요 — `node_modules` 미설치 상태였음). 소스 직접 대조로 1차 검증(`grep`) 후 독립 리뷰 에이전트로 2차 검증 — `NEARBY_RADIUS_M`/`RECONNECT_WINDOW_S` 상수값, `App.tsx`의 재접속 팝업 문구, `PWAPrompt.tsx`의 설치/업데이트/오프라인 카드 문구, `sw.ts`의 push/notificationclick 리스너 존재 여부 및 저장소 전체 `PushManager.subscribe` 부재, `registry.tsx`의 bombhunt/escape 데이터, 틱택토/미니 탁구 잔존 0건·div 태그 밸런스(28/28) — 8개 항목 모두 소스와 일치 확인. **독립 리뷰에서 과장 표현 2건 발견 후 수정**: ① QR/코드 입력을 "위치 권한 거부·시그널링 장애 시 자동 폴백"으로 서술했으나 실제로는 JOIN 화면에 항상 노출되는 사용자 직접 선택 UI(`Lobby.tsx`)라 "상시 대안"으로 정정, ② "180초 초과 시 대기방 또는 메인으로 자동 이동"으로 서술했으나 실제로는 `connectionStatus`만 `IDLE`로 전환될 뿐 화면 전환은 사용자가 재접속 시도/방 나가기를 직접 선택해야 하고 "대기방" 목적지 자체가 없음(`exitToHome`→메인만 존재) — 자동 전환이 아님을 명시하도록 정정. 재검증 후 최종 PASS.

### 2026-07-15 · screen_spec.html — 제거된 플레이스홀더 게임(틱택토/미니 탁구) 참조를 실제 라이브 게임으로 교체
- [x] **`planning/screen_spec.html`의 화면 와이어프레임 6개 섹션이 전부 2026-07-10 감사 라운드에서 제거된 3게임(TicTacToe/PingPong/Runner) 중 TicTacToe·PingPong 예시를 그대로 참조하고 있던 문제** — 카드 슬라이더(§1) 타이틀/배지/설명, 드로어 목록(§2) 예시 아이템 2건 + 장르 필터 알약(실제 4분류 `실시간 액션/전략/추리/협동`과 불일치), 로비(§3) 방 제목·게임 옵션 예시값, 게임플레이(§4) 턴제/실시간 두 목업 전체(그리드·캔버스·안내문구), 결과 모달(§5)과 재접속 오버레이(§6)의 블러 처리된 배경 보드까지 총 6개 섹션·14곳이 존재하지 않는 게임명(Tic-Tac-Toe/Ping Pong)을 노출 중이었음.
- `src/games/registry.tsx`(실제 라이브 게임 정의 소스)를 대조해 그리드형 턴제 게임 대표로 **룰셋 판도라**(`bombhunt` — 추리 · 턴제 · 2인, 카드 뒤집기+폭탄 지목, 3×3 보드 옵션)를, 실시간 캔버스 게임 대표로 **협동 미로**(`escape` — 협동 · 실시간 · 2인, 원형 시야+안개+조이스틱 이동)를 선정 — 실제 `title`/`genre`/`turnType`/`desc`/`version`/`updateDate`/`matchOptions` 값을 그대로 반영. 게임플레이 목업은 각 게임의 실제 UI 개념(BombHunt 카드 오픈/폭탄 지목 그리드, Escape 원형 시야·미니맵·열쇠 힌트·조이스틱)에 맞춰 새로 그림 — 순수 정적 와이어프레임(인라인 style, JS 없음)이라 앱 빌드에는 영향 없음.
- 드로어 장르 필터 알약을 실제 4분류(`실시간 액션`/`전략`/`추리`/`협동`)로 교체 — 기존 `전략/액션/퍼즐` 알약은 코드베이스 genre 타입과 무관한 예시였음. "게임 라이브러리 (100)" 문구·§2 제목의 "100개 이상"은 실제 게임 수(10종)가 아니라 확장성 설계 의도(§2 본문에 명시)라 스코프 밖으로 유지.
- `npm run lint`(tsc --noEmit)/`npm run build` 통과 — `planning/` 정적 HTML은 빌드 대상 외.

### 2026-07-15 · Escape.tsx 1000+ 줄 파일 분해 — 엔진/렌더러/컴포넌트 3계층 분리
- [x] **`src/features/games/escape/Escape.tsx`(1219줄)가 미로 생성·엔티티 이동·캔버스 렌더·React 훅/JSX 전부를 한 파일에 담고 있던 문제** — 다른 최우선 후보(화면 flow·문구·인터랙션)가 모두 소진된 시점에 ROADMAP §코드위생의 마지막 항목(3순위 View 단독 리팩터, Feature-First 규칙상 다른 후보 0건일 때만 허용)으로 착수. React 의존이 전혀 없는 순수 로직(미로 생성 `generateMaze`/`pickFloor`, 엔티티 이동 `tryStep`/`frameLerp`/`moveEnt`/`wander`, 상태 초기화 `initialState`, 그리드 진입 이벤트 `onEnter`, `Entity`/`Pickup`/`EscapeState` 타입, 관련 상수)를 신규 `escapeEngine.ts`로, 캔버스 렌더 함수 `render()` + 미니맵 SVG 서브컴포넌트(`MinimapKey`/`MinimapExit`) + 모듈 싱글턴 `playerDirRef`를 신규 `escapeRenderer.tsx`로 기계적으로(순수 이동, 로직 변경 없음) 분리. `Escape.tsx`는 1219→748줄로 축소, React 훅/이펙트/입력/JSX 배선만 남김.
- 독립 리뷰 에이전트 — 리팩터 전(`git show HEAD:...`) 대비 이동된 모든 함수/상수/타입(`N`/`VISION_STACK_*`/`SPEED_STACK_MULT`/`BASE_MOVE_LERP`/`ITEM_DROP_INTERVAL_MS`/`POS_BROADCAST_MS`/`STAGE_W`/`STAGE_H`/`Entity`/`Pickup`/`EscapeState`/`generateMaze`/`pickFloor`/`makeEntity`/`initialState`/`tryStep`/`REF_FRAME_MS`/`frameLerp`/`moveEnt`/`wander`/`onEnter`/`render`/`playerDirRef`/`MinimapKey`/`MinimapExit`)가 `export` 추가 외 바이트 단위로 동일함을 확인, `Escape.tsx` 컴포넌트 본문(`export function Escape({...` 전체)이 리팩터 전과 100% 동일(diff 0)함을 확인, `Escape.tsx`에 고아/중복 코드 잔존 없음을 grep으로 확인 — PASS. 리뷰 중 `playerDirRef`가 불필요하게 `export`돼 있던 점(소비처가 `escapeRenderer.tsx` 내부뿐)을 발견해 모듈 비공개로 원복.
- `npm run lint`(tsc --noEmit)/`npm run build` 통과. 순수 코드-이동 리팩터라 런타임 동작 변경 없음.

### 2026-07-15 · Escape 매치 타이머 — host/guest 만료 판정 편차를 MAZE_TIMEOUT 브로드캐스트로 동기화
- [x] **`st.start`(매치 시작 기준 `performance.now()`)를 host 는 로컬 리셋 즉시, guest 는 HELLO→`MAZE_SEED` 핸드셰이크 왕복 이후에야 자신의 `performance.now()`로 개별 스탬프 — 이후 두 클라이언트는 완전히 독립적으로 `rem = MATCH_LIMIT_SEC_LOCAL - (performance.now()-st.start)/1000` 를 매 프레임 계산해 `rem<=0` 시 로컬에서만 `st.state='lost'`(결과 화면 전이)를 결정하고 있었음. 시작 시점이 핸드셰이크 지연만큼(대개 수백ms) 어긋나므로, 한쪽이 짧게 먼저 결과 화면에 도달하는 편차가 존재 — Explore 조사 결과 ROADMAP 상 "프로토콜 변경 범위" 라는 우려와 달리 실제로는 `Escape.tsx` 1개 파일에 한정된 작은 변경으로 확인, 이번 사이클에서 소화.**
- 이미 존재하는 `MAZE_ESCAPED`(탈출 성공 브로드캐스트) 와 동일한 패턴으로, 로컬 타이머가 먼저 만료를 감지한 쪽이 `MAZE_TIMEOUT` 액션을 상대에게 즉시 알리도록 브로드캐스트 추가(`requestAnimationFrame` 루프의 `rem<=0` 분기, `st.state='play'` 게이트 안에 있어 매치당 정확히 1회만 발신) — 두 클라이언트의 절대 시계를 동기화하는 대신, "먼저 만료를 감지한 쪽이 상대의 종료 시점을 즉시 앞당긴다"는 방식으로 편차를 실질적으로 제거. 수신측(`p2p_message` 핸들러)에 `MAZE_TIMEOUT` 브랜치 신설 — `st.state==='play'` 일 때만 `'lost'` 로 전이(내가 거의 동시에 탈출 성공(`'win'`)한 레이스에서 승리 상태를 패배로 덮어쓰지 않도록 방어).
- `npm run lint`(tsc --noEmit)/`npm run build` 통과. 독립 리뷰 에이전트 — `git diff` 로 변경이 정확히 이 두 블록(브로드캐스트 1곳 + 수신 핸들러 1곳)뿐임을 확인, `st.state==='play'` 가드가 win/timeout 동시발생 레이스에서 승리를 덮어쓰지 않음을 코드 추적으로 검증, 매치당 1회만 발신됨(재프레임 재진입 불가) 확인, `sendMessage`/`peerId` 가 이미 해당 `useEffect` deps 배열에 포함돼 있어 신규 stale-closure 위험 없음 확인, `MAZE_ESCAPED` 와 동일 메시지 포맷·가드 관례를 따름을 대조 — PASS.

### 2026-07-15 · sw.ts — activate 핸들러의 하드코딩 캐시 정리 로직을 workbox 표준 cleanupOutdatedCaches()로 교체
- [x] **`activate` 이벤트 핸들러가 `'workbox-precache'` 문자열을 포함하지 않는 모든 Cache Storage 버킷을 무조건 삭제하던 하드코딩 로직** — 현재는 `vite.config.ts`가 `injectManifest` 전략에 `workbox.runtimeCaching` 없이 precache 전용으로 구성돼 있어 당장은 무해하지만, 향후 어떤 PR이든 런타임 캐시(예: 이미지·API GET 응답 캐싱)를 추가하는 순간 이 핸들러가 배포마다(모든 `activate`) 그 캐시를 통째로 삭제해버리는 잠재 지뢰였음 — ROADMAP §하지 않을 것의 "`sw` 캐시 aggressive 무효화 금지" 원칙과도 어긋나는 범위(전용 대상 없는 전체 삭제)로 판단. `workbox-precaching`(7.4.1, 이미 의존성에 포함)이 정확히 이 목적으로 제공하는 `cleanupOutdatedCaches()`(이전 버전 SW가 남긴 precache 버킷만 정밀 타겟, 다른 캐시 버킷은 건드리지 않음)로 교체.
- **독립 리뷰 1라운드에서 실제 회귀 발견**: 최초 수정이 `cleanupOutdatedCaches()`를 이미 실행 중인 `activate` 핸들러 **내부**에서 호출했는데, 이 함수는 `precacheAndRoute`와 동일하게 자체 `self.addEventListener('activate', ...)`를 등록하는 방식으로 동작 — WHATWG DOM 스펙상 이미 디스패치 중인 이벤트에 도중 등록된 리스너는 그 디스패치에서 실행되지 않아, 새 캐시 정리 로직이 사실상 죽은 코드가 되는 결함을 Node `EventTarget` 실증 테스트 + 실제 빌드 산출물(`dist/sw.js`) 대조로 확인. `cleanupOutdatedCaches()` 호출을 `precacheAndRoute(self.__WB_MANIFEST)`와 동일하게 모듈 최상단(동기 실행)으로 이동, `activate` 리스너는 `clients.claim()`만 남기는 것으로 수정.
- `npm run lint`(tsc --noEmit)/`npm run build` 통과. 독립 리뷰 2라운드 — 수정된 구조(모듈 최상단 호출)가 `precacheAndRoute`와 동일한 등록 시점 패턴임을 확인, 빌드 산출물(`dist/sw.js`)에서 `cleanupOutdatedCaches`(minified `ae`)가 실제로 top-level에서 호출되고 `clients.claim()`이 별도 `activate` 리스너로 정상 배선됨을 재확인, `message`(SKIP_WAITING)/`push`/`notificationclick` 리스너 무변경 확인 — PASS. `PWAPrompt.tsx`의 업데이트 프롬프트/`updateServiceWorker`/`skipWaiting` flow는 이 activate 핸들러의 캐시 정리 내부 로직과 완전히 독립적(workbox-window 레이어)이라 무영향 — 변경 없음 확인.

### 2026-07-15 · BombHunt 전용 turn-toast — 공용 `TurnTransitionToast` 재사용 가능 여부 감사 (변경 없음)
- [x] **`bombhunt.css`/`BombHunt.tsx`의 `.bombhunt-turn-toast`류가 `common/TurnTransitionToast`(8개 게임이 공유하는 컴포넌트)와 별개로 자체 구현된 이유를 감사** — 안전한 드롭인 치환이 아님을 확인, 두 가지 실질적 동작 차이 발견:
  1. **트리거 조건 불일치**: BombHunt 는 `turnIsHost`(턴 소유자) 변화 자체에만 반응해 토스트를 띄우는 반면, 공용 컴포넌트는 `isMyTurn`(`turnIsHost === isHost && isOpponentOnline && !gameWinner`, `isOpponentOnline` 포함) 변화에 반응 — 치환 시 상대 재접속만으로도 실제 턴이 바뀌지 않았는데 토스트가 잘못 재발동하는 회귀 발생.
  2. **`passToast`/`turnToast` 동시 상태 겹침**: BombHunt 는 "턴 넘기기(pass)" 액션 시 `passToast`와 `turnToast`를 동시에 set 하고 렌더에서만 `passToast` 우선(`{turnToast && !passToast}`) — `turnToast`의 1.5초 타이머는 계속 내부에서 진행 중. 공용 컴포넌트는 자체 `useRef` 로 이전 `isMyTurn` 값을 들고 있어 마운트 상태에서만 플립을 감지하는데, `{!passToast && <TurnTransitionToast/>}` 형태로 감싸면 pass 발생마다 언마운트/리마운트되어 `prevRef`가 리셋 — 리마운트 시점의 `isMyTurn` 을 그대로 초기값으로 잡아버려 이후 정상 턴 전환 토스트를 놓치는 새 결함 발생.
- 두 결함 모두 공용 컴포넌트 자체의 구조 변경(마운트 상태 유지 · trigger prop 분리) 없이는 해소 불가 — 이는 8개 소비처(MemoryMatch/Mastermind/Ditrick/Trumeon/Vinci/HiddenWord/Wavelength/Quorimo) 전부의 호출부 재검토를 요구하는 스코프로, "one screen/one element" 안전 슬라이스 원칙을 벗어남. 시각 스타일(위치·폰트크기·보더·애니메이션 타이밍)도 이미 게임별로 의도적으로 다름(주석: "당신 턴 아님 을 위험색으로 알리는 게 UX 상 어색해서" 등) — 통일 시 룩앤필 변경 소지도 있어 이번 스코프 밖.
- 결론: 현행 유지가 안전 — 코드 변경 없음. `npm run lint`(tsc --noEmit)/`npm run build` 통과 재확인(문서 변경만이라 사이클 영향 없음).

### 2026-07-15 · useAppNavigation.ts — 방-이탈(백-제스처/명시적 나가기/원격 DISCONNECT) 이 진행 중이던 restore 제안을 정리하지 않던 문제 수정
- [x] **`restorePrompt`/`restoreState` 는 host 콜드 리스토어 제안이 아직 `acceptRestore()` 의 await 중일 때(screen 이 이미 낙관적으로 LOBBY 로 전환됨) 진행 중 상태를 들고 있는데, 이 상태에서 사용자가 하드웨어 back-제스처로 나가면(`onConfirm` 핸들러) `onExit()`+`setScreen('HOME')` 만 호출하고 `restorePrompt`/`restoreState` 는 그대로 남아있었음** — 다음 렌더에서 screen 이 HOME 이고 restorePrompt 가 여전히 truthy 라 "HOME 에서 restore 프롬프트 노출" 이펙트가 재발동해, 사용자가 방금 명시적으로 나간 세션의 재접속 프롬프트가 HOME 복귀 직후 잠깐 재노출됨. 같은 패턴이 명시적 "나가기" 버튼(`exitToHome`) 과 원격 DISCONNECT 수신(`applyRemoteDisconnect`) 두 곳에도 동일하게 존재 — 셋 다 동일 근본 원인(명시적 방-이탈 시 restore 제안을 정리하지 않음)이라 함께 수정.
- 세 지점 모두 `dismissRestore()`(`clearSession`+`setRestorePrompt(null)`+`setRestoreState('idle')`) 를 방-이탈 시 항상 호출하도록 통일. `exitToHome`/`applyRemoteDisconnect` 는 기존에 `if (!restorePrompt) consumeSentinel()` 로 진행 중 restore 시 sentinel 소비를 건너뛰고 있었는데(뒤이어 "HOME + restorePrompt" 이펙트가 같은 sentinel 을 replace 할 거라 가정한 lateral-transition 처리), `dismissRestore()` 를 함께 호출하면 그 이펙트가 더 이상 발동하지 않으므로(restorePrompt 가 이미 null) sentinel 을 대신 소비해줄 곳이 없어짐 — 그래서 두 함수 모두 `consumeSentinel()` 을 항상 호출하도록 변경(진행 중이던 restore 제안 자체를 이번 이탈로 완전히 취소하는 것이므로 lateral 처리가 더 이상 필요 없어짐). `dismissRestore` 는 원래 위치(acceptRestore/cancelRestore 근처)에서 back-gesture 이펙트/`exitToHome`/`applyRemoteDisconnect` 의 의존성 배열이 참조하는 지점보다 앞으로 이동(의존성 배열은 렌더 중 즉시 평가되므로 순방향 참조는 TDZ 에러).
- `npm run lint`(tsc --noEmit)/`npm run build` 통과. 변경은 `src/hooks/useAppNavigation.ts` 1개 파일, 순수 정리/재배선(신규 상태·신규 이펙트 없음) — 기존 `acceptRestore` catch 경로(재시도 제안 유지)는 그대로 보존.

### 2026-07-15 · useRoom.ts — createRoom/restoreHostRoom 이 abandoned-attempt 가드 없이 좀비 세션을 되살릴 수 있던 레이스 수정
- [x] **`establishHostSession`(host RTCPeerConnection 수립 공용 함수) 의 `opts.isStale` 콜백은 이미 존재하는 메커니즘** — `teardown()`(`leaveRoom()`/재접속/재생성 시 호출)이 매번 `connectAttemptRef` 를 증분시키고, `joinRoom`/`reconnectHostSession` 은 각각 자기 시도 시작 시점의 카운터 값을 캡처해 매 `await` 후 "내가 아직 최신 시도인가" 를 확인 — 하지만 `establishHostSession` 의 나머지 두 호출부인 `createRoom`(방 만들기) 과 `restoreHostRoom`(호스트 콜드 리스토어) 은 이 가드를 전혀 연결하지 않고 있었음. `useAppNavigation.ts` sentinel/restore 로직 edge case 재확인 과정에서, 호스트 콜드 리스토어(`acceptRestore`) 대기 중 back-gesture 로 exit-confirm 을 눌러 `leaveRoom()` 이 먼저 실행되어도 이미 진행 중이던 `restoreHostRoom` 의 `establishHostSession` 이 이를 감지하지 못하고 계속 완주해, 사용자가 명시적으로 나간 뒤에도 백그라운드에서 세션을 되살려 방을 재발행(answer poll 시작 포함)하는 레이스를 발견 — `createRoom` 도 "방 만들기" 직후 즉시 이탈 시 동일 클래스의 레이스에 노출.
- `createRoom`/`restoreHostRoom` 모두 `joinRoom`/`reconnectHostSession` 과 동일한 `myAttempt`/`stillCurrent()` 캡처 패턴을 적용, `establishHostSession` 에 `isStale: () => !stillCurrent()` 전달 + catch 블록 상단에 `if (!stillCurrent()) return` 가드 추가(오래된 시도의 실패 핸들러가 이미 성공한 새 시도의 상태를 덮어쓰지 못하도록, `joinRoom`의 `failJoin` 과 동일 이유). `restoreHostRoom` 은 `deleteRoom` 이후에도 `reconnectHostSession` 과 동일하게 한 번 더 확인.
- 부수 발견(스코프 밖, ROADMAP §최우선에 신규 항목으로 기록): back-gesture exit-confirm 경로가 `restorePrompt`/`restoreState` 를 정리하지 않아, restoring 중 이 경로로 나가면 HOME 복귀 직후 재접속 프롬프트가 잠깐 재노출될 수 있음(이번 수정으로 실제 세션이 되살아나진 않음 — 순수 UI 잔상, 해당 프라미스가 정리되며 자연 소멸).
- `npm run lint`(tsc --noEmit)/`npm run build` 통과. 독립 리뷰 에이전트 — `connectAttemptRef` 가 정말 모든 무효화 경로(`leaveRoom`→`teardown`, 재`createRoom`/`joinRoom`/`restoreHostRoom` 호출)에서 증분됨을 확인, `myAttempt` 캡처 시점이 `teardown()` 직후 동기 코드뿐이라 레이스 윈도우 없음을 확인, `restoreHostRoom` 의 stale-시 조용한 `return`(throw 아님) 이 `acceptRestore`(`useAppNavigation.ts`) 쪽에서 기존 동작(스테일 상태로 완주했을 때도 어차피 throw 하지 않았음) 대비 회귀가 아님을 확인, `joinRoom`/`reconnectHostSession` 과 동일 관용구로 불필요한 복잡도 추가 없음을 확인 — PASS.

### 2026-07-14 · GameGuideModal.css (common) rgba/hex 8건 토큰화
- [x] **`src/features/games/common/GameGuideModal.css`(전 게임 공유 가이드 오버레이) 에 남아있던 raw 색상 리터럴 8건** — `.game-guide-overlay`/`::before` 의 `rgba(15,56,15,0.96)`(신규 `--game-guide-overlay-bg`)·`rgba(0,0,0,0.14)`(기존 `--game-joystick-ring-scanline`과 값 동일 — 두 곳에서 쓰이게 되며 조이스틱 전용이 아닌 이름이라 `--game-scanline-tint`로 리네임, `escape.css` 소비처도 함께 갱신), `.game-guide-row--bomb`/`.guide-glyph--bomb` 의 `#ff8a70` 2곳(기존 `--game-bomb-accent`), `.game-guide-badge--bomb` 의 `#fff`(기존 `--fg-on-danger`), `.game-guide-badge-count` 의 `rgba(0,0,0,0.25)`(신규 `--game-guide-badge-count-bg`), `.game-guide-warning--bomb` 의 `#ffd7cf`/`#2a0f0d`(기존 `--game-bomb-text-light`/`--game-bomb-bg-deep`) — 전부 순수 리네임, 값 변화 없음.
- `npm run lint`(tsc --noEmit)/`npm run build` 통과. 독립 리뷰 에이전트 — 8곳 전부 대상 토큰이 원래 리터럴과 RGB/alpha 완전 동일함을 tokens.css 대조로 검증, 파일 내 잔여 raw 리터럴 0건 재grep 확인, `git diff --stat` 으로 스코프가 정확히 `tokens.css`+`GameGuideModal.css`(+`escape.css` 토큰 리네임 갱신) 뿐임을 확인, `--game-joystick-ring-scanline` 재사용이 이름과 실사용 맥락(조이스틱 전용 아님)이 어긋난다는 지적을 받아 `--game-scanline-tint`로 리네임 반영 — PASS.

### 2026-07-14 · TurnTransitionToast.css (common) rgba/hex 7건 토큰화
- [x] **`src/features/games/common/TurnTransitionToast.css`(전 게임 공유 턴 전환 토스트 + 보드 턴 halo) 에 남아있던 raw 색상 리터럴 7건** — `.turn-toast`/`::before` 의 `#0f380f` 3곳(border·box-shadow 2곳)은 기존 `--fg-inverse`(`#0f380f`)로, `.turn-toast--mine` 의 `#c7e06a`/`#0f380f`는 기존 `--fg-accent`/`--fg-inverse`로 치환(모두 이미 존재하는 토큰과 정확히 동일한 값이라 신규 토큰 불필요). `.turn-toast--opp` 의 `#1e3a1e`/`#a8c86e`(기존 토큰과 매칭되는 값 없음)와 `.game-screen[data-my-turn]` halo 의 `rgba(199,224,106,0.35|0.18)`/`rgba(0,0,0,0)`(기존 `--game-joystick-ring-*`와 다른 alpha라 별개 토큰 필요)는 `tokens.css`의 `:root, [data-theme='arcade']` 블록에 `--game-turn-toast-opp-{bg,fg}` · `--game-turn-halo-{strong,soft,off}` 5개 신규 토큰으로 추가 — 전부 순수 리네임, 값 변화 없음.
- 독립 리뷰 중 부수 발견(이번 스코프 밖, ROADMAP 신규 항목으로 기록): `bombhunt.css`가 이 공용 컴포넌트와 별개로 `.bombhunt-turn-toast` 류 자체 정의를 갖고 있어 잠재적 V2(중복) 후보. 저장소 전역 재grep으로 `wavelength.css`/`hiddenword.css`/`quorimo.css`/`GameGuideModal.css`에 남은 다수 raw hex·rgba(다수, 기존부터 있던 것)와 `escape.css` 캐릭터 그라디언트 1건(`#fff9c8`)은 이번 PR 스코프 밖으로 확인(후속 사이클 후보로 기록).
- `npm run lint`(tsc --noEmit)/`npm run build` 통과. 독립 리뷰 에이전트 — 7곳 전부 대상 토큰이 원래 리터럴과 RGB/alpha 완전 동일함을 tokens.css 대조로 검증, 파일 내 잔여 raw 리터럴 0건 재grep 확인, 터치된 6개 셀렉터 모두 선언값 치환뿐 셀렉터/명시도 변경 없음 확인, `git diff --stat` 으로 스코프가 정확히 `tokens.css`+`TurnTransitionToast.css` 2파일뿐임을 확인 — PASS.

### 2026-07-14 · Escape.css joystick rgba 5건 (V1 감사 잔재) 토큰화
- [x] **`.escape-joystick-ring`/`::before` 에 남아있던 raw `rgba(...)` 리터럴 5건** — `radial-gradient` 2건(글로우·페이드), `repeating-linear-gradient` 스캔라인 1건, inset `box-shadow` 1건, 대시 `border` 1건. 프로젝트 규약(`tokens.css` 헤더: "Raw palette values only inside `[data-theme="…"]` blocks. Components reference `var(--*)` exclusively")을 위반하던 V1 감사 잔재 — `tokens.css`의 `[data-theme='arcade']` 블록에 `--game-joystick-ring-{glow,fade,scanline,inset-shadow,dash}` 5개 신규 토큰 추가(값은 기존 `--fg-accent`(`#c7e06a`=`rgb(199,224,106)`) 계열과 `--bg-surface`(`#0f380f`=`rgb(15,56,15)`) 계열 투명도 변형, 순수 리네임 — RGB/alpha·그라디언트 stop 순서/위치 전부 동일하게 보존), `escape.css` 5곳을 `var(--game-joystick-ring-*)` 참조로 교체.
- `npm run lint`(tsc --noEmit)/`npm run build` 통과. 독립 리뷰 에이전트 — 5곳 치환이 값 동일한 순수 리네임임을 diff 대조로 확인, 신규 토큰 네이밍이 기존 `--game-<feature>-<descriptor>` 관례와 일치함을 확인, 저장소 전역 재grep으로 이번 스코프(5건) 외 다른 raw rgba 잔존(다수, 기존부터 있던 것)은 이번 PR 스코프 밖으로 확인(후속 사이클 후보로 기록) — PASS.

### 2026-07-14 · 햅틱/피드백 — 성공/실패 시각 피드백 즉시성 전수 감사 (변경 대상 없음)
- [x] **전 10게임(BombHunt/Escape/MemoryMatch/Wavelength/HiddenWord/Quorimo/Vinci/Ditrick/Trumeon/Mastermind) 로컬 액션 핸들러 전수 추적** — 각 게임의 클릭/제출 핸들러(셀 클릭·추측 제출·카드 플레이·베팅·벽 배치 등)에서 로컬 시각 상태 갱신(보드 상태·파티클·토스트·햅틱)이 `sendMessage` P2P 전송 이전 또는 동시에 동기적으로 실행되는지 확인 — 10게임 전부 로컬 낙관적 업데이트가 네트워크 라운드트립을 기다리지 않고 즉시 실행됨을 확인(예: BombHunt `applyRevealLocal`, MemoryMatch `applyReveal`, Mastermind `evaluateGuess` 모두 전송 전/동시 로컬 반영).
- CSS 전환/애니메이션 중 결과 피드백을 게이팅하는 500ms 이상 지연 없음 확인(발견된 500ms+ 애니메이션은 전부 idle pulse 류로 결과 피드백과 무관), 성공/실패 편측 누락 케이스 없음, `src/features/games/` 전역 TODO/FIXME 없음.
- 코드 변경 대상 없음 — 감사 결과 클린. `npm run lint`(tsc --noEmit)/`npm run build` 통과(문서 변경만이라 사이클 영향 없음 재확인).

### 2026-07-14 · 터치 정확도 — Quorimo 벽 슬롯 20px → 28px, Mastermind 팔레트 40px → 44px
- [x] **Quorimo 벽 배치 슬롯이 20×20px 클릭 영역이라 프로젝트 자체 터치 타겟 관례(44px, `game-common.css`의 `.pixel-btn-arcade` `min-height: 44px`)를 크게 하회하던 문제** — 시각 표시 크기와 별개의 확장 히트박스(패딩/오버레이) 없이 DOM 엘리먼트 자체가 정확히 20×20px(`Quorimo.tsx` `slotStyle`)이었음. WCAG 2.5.8 최소 권장치(24px)에도 못 미쳐, 벽 배치처럼 실수 시 되돌리기 어려운 조작에 특히 불리. `slotStyle`을 28×28px로 확대(중심 좌표는 `calc(... - 10px)` → `calc(... - 14px)`로 동일 교차점 유지되도록 보정), 인접 슬롯 피치(9×9 보드 기준 일반 폰 너비에서 ~37–40px)와 겹치지 않음을 확인.
- [x] **Mastermind 색상 팔레트 스와치(`mastermind-palette-btn`)가 40×40px로 같은 44px 관례를 소폭 하회하던 문제** — 44×44px로 상향. 6개 스와치 + 기존 gap(7px) 기준 360px 이상 뷰포트에서 여유 있게 들어맞음 확인.
- [x] **HiddenWord 카드** — 5×5(최대 밀도) 레이아웃에서도 실제 셀 크기 ≈54px 이상으로 이미 44px 관례를 충족 — 조사 결과 변경 대상 없음.
- `npm run lint`(tsc --noEmit)/`npm run build` 통과. 독립 리뷰 에이전트 — 슬롯 중심 좌표 수식이 신·구 버전 동일 교차점으로 정확히 원복됨을 직접 계산 검증, 실기기 대응 뷰포트별(iPhone SE~Galaxy S21 등) 보드 피치 계산으로 겹침 없음 확인(극단적으로 짧은 뷰포트 1건은 보드 자체가 이미 플레이 불가 수준으로 축소되는 기존 한계로 이번 변경과 무관 판단), Mastermind 팔레트가 320px 초저폭 뷰포트에서만 `flex-shrink` 로 44px 밑으로 줄어들 수 있음을 발견했으나 기존 40px 버튼도 동일하게 미보호였던 기존 동작이라 회귀 아님(후속 개선 후보로 기록) — PASS.

### 2026-07-14 · 애니메이션 페이스 — 카드 뒤집기/파티클 정합 확인 + Escape 이동 보간 프레임레이트 종속 버그 수정
- [x] **카드 뒤집기** — `MemoryMatch.tsx`/`BombHunt.tsx` 모두 `src/index.css`의 공용 `.card-flip` 프리미티브(`transition: transform 0.42s cubic-bezier(0.55, 0, 0.25, 1)`)를 그대로 공유해 게임 간 duration/easing 불일치 없음 확인 — 변경 없음.
- [x] **다이얼 회전** — 실제 코드 대조 결과 항목 문구가 구현과 어긋남: Wavelength의 "다이얼"은 회전이 아닌 `left` 값을 옮기는 선형 슬라이더(`wavelength.css`, `transition: left 0.08s ease-out`)이고, Mastermind에는 다이얼/회전 UI 자체가 없음(grep 0건). 저장소 내 실제 `rotate()` 사용처는 Escape 캔버스 캐릭터 방향과 `particles.ts` 컨페티/꽃잎 회전뿐. 매칭되는 UI가 없어 이 하위 항목은 그대로 종결(코드 변경 대상 없음) — 변경 없음.
- [x] **파티클 강도** — `particles.ts`의 `fire()` 호출 지점(MemoryMatch/BombHunt/Escape/각 GameOver) 전수 대조 — `spark-burst` count 18~40, `confetti` 두 GameOver 모두 동일 90으로 일관적, 극단값 없음 — 변경 없음.
- [x] **(발견) Escape 이동/카메라 보간 프레임레이트 종속 버그** — 스코프 확장 조사 중 실제 버그 발견: `Escape.tsx`의 게임 루프는 `dt`(프레임 간 경과 ms)를 올바르게 계산하고 있었으나, 캐릭터·상대·몬스터의 위치 보간과 시야 반경 스무딩(`moveEnt`, `st.opp.fx/fy`, `st.mon.fx/fy`, `st.tile`/`st.vr`)이 전부 이 `dt`를 곱하지 않고 **프레임당 고정 비율**(예: `* 0.25`)을 그대로 적용하고 있어, 실제 수렴 속도가 프레임레이트에 종속됨 — 144Hz 모니터는 60Hz 대비 약 2.4배 빠르게 수렴하고, 저사양 기기에서 30fps로 떨어지면 그만큼 느려짐(동일 로직인데 기기/탭 성능에 따라 몬스터 회피 난이도가 달라지는 실질적 게임플레이 버그). `frameLerp(ratePerFrame, dt) = 1 - (1-rate)^(dt/REF_FRAME_MS)`(REF_FRAME_MS=1000/60) 헬퍼를 신설해 지수 감쇠를 dt 기준으로 정규화 — 60fps 기준 기존 튜닝값은 수학적으로 동일하게 보존, 다른 프레임레이트에서는 실제 시간 기준 동일 수렴 속도를 내도록 5곳(플레이어/몬스터 `moveEnt` 2곳, opponent 시각보간, guest monster tween, tile/vr 스무딩) 전부 교정. `wander()`는 이미 dt 기반이라 변경 없음.
- **독립 리뷰**에서 신규 도입된 경계 케이스 발견: `moveLerp`(speedCount 다중 스택 시 이론상 1 초과 가능)가 1 이상이면 `frameLerp` 내부 `Math.pow(음수, 분수)`가 NaN이 되어 캐릭터 좌표가 영구 고착되는 새 실패 모드(기존 코드는 오버슈트만 발생, 발산 안 함) — `frameLerp` 내부에 `rate = Math.min(ratePerFrame, 0.999)` 방어 클램프 추가로 원천 차단.
- `npm run lint`(tsc --noEmit)/`npm run build` 통과. 독립 리뷰 — `frameLerp` 공식이 표준 dt-보정 지수감쇠식임을 수학적으로 검증(`dt=REF_FRAME_MS`일 때 `k=rate`로 정확히 원복 확인), 파일 전체 재grep으로 미수정 잔여 보간 없음 확인, `moveEnt` 시그니처 변경 호출부 2곳 모두 정합, dt=0 엣지케이스(k=0, 정지 유지) 정상 확인 — PASS(NaN 클램프 반영 후).

### 2026-07-14 · 연결/재접속 오버레이 — GAME_PLAY 오프라인 폴백 문구가 재접속 시간 초과 상황과 불일치하던 문제 수정
- [x] **`GameConnectionOverlay`(GAME_PLAY 중 `isOpponentOnline=false && reconnecting` 모두 false 일 때 렌더)가 항상 "상대방과 데이터 채널이 닫혔어요. 재접속하거나 방을 나가 주세요."라는 고정 문구만 보여주던 문제** — `useRoom.ts`의 `setConnectionStatus` 전체 호출부를 추적해 GAME_PLAY 중 이 오버레이 렌더 조건에 실제로 도달하는 경로가 재접속 카운트다운(3분 window) 만료 단 하나(`RECONNECTING` → `IDLE`, `useRoom.ts:996-998`)뿐임을 확인 — 이 경로는 `peerState.error`에 "상대방과 재연결할 수 없어요."라는 구체적인 사유를 이미 세팅하고 있었지만, 이 값은 Lobby 화면에만 노출되고(`App.tsx` Lobby `error` prop) GAME_PLAY 오버레이에는 전달되지 않아 사용자는 "아직 재접속을 시도조차 안 한 것" 같은 오해를 주는 일반 문구만 보게 됨. `CommonGameProps`(`registry.tsx`)에 `reason?: string | null` 추가, `App.tsx` → 10개 게임 컴포넌트(BombHunt/Escape/MemoryMatch/Wavelength/HiddenWord/Quorimo/Vinci/Ditrick/Trumeon/Mastermind) → `GameConnectionOverlay`로 `peerState.error`를 그대로 관통시켜, 사유가 있으면 `"{reason} 재접속하거나 방을 나가 주세요."`로 실제 상황을 반영하고 없으면 기존 일반 문구로 폴백하도록 수정. 진행 표시(스피너·카운트다운·`DiagPanel`)와 취소 옵션(양쪽 오버레이 모두 "방 나가기" 버튼)은 검토 결과 이미 정확·충분해 변경 없음.
- `npm run lint`(tsc --noEmit)/`npm run build` 통과. 독립 리뷰 에이전트 — `useRoom.ts`의 모든 `setConnectionStatus` 경로를 추적해 오버레이 렌더 조건에 도달하는 유일한 경로가 카운트다운 만료임을 재검증(게스트/호스트 재접속 재시도 실패는 `RECONNECTING`에 고정돼 `IDLE`로 새지 않음), `teardown()`이 매번 `error`를 먼저 null 처리한 뒤 `IDLE`로 전환해 Lobby 등 무관한 이전 에러 문구가 GAME_PLAY 오버레이로 새어 들어올 위험이 없음을 확인, 10개 게임 컴포넌트 전수(인터페이스 필드·구조분해 기본값·`GameConnectionOverlay` 전달) 오탈자·누락 없음, 타입(`string | null`) 정합 확인 — PASS.

### 2026-07-14 · 전 게임 토스트/라벨/에러 메시지 그렙 — 오탈자·톤 정합화
- [x] **동적 플레이어 닉네임에 조사 `가` 를 고정 부착하던 5곳(BombHunt 전용)** — `${senderName}가`/`${myName}가`/`{passToast.who}가`(`BombHunt.tsx`)·`{opponentName}가`(`RuleRevealModal.tsx`)·`${loserName ?? '상대'}가`(`BombHuntGameOver.tsx`)는 닉네임이 받침 있는 글자로 끝나면("민준" 등) "민준가"처럼 비문법적 한국어가 됨 — Wavelength/HiddenWord/Vinci/Mastermind 등 나머지 게임은 이미 이 케이스(임의 닉네임 뒤 조사)에 안전한 `이(가)` 이중형을 쓰고 있어 BombHunt 만 예외였음. 5곳 모두 `이(가)` 로 통일. (보드 위치 라벨 `${pos}가`(`카드` 는 받침 없는 글자로 끝나 `가` 가 이미 정확)는 스코프 밖이라 그대로 유지.)
- [x] **BombHunt 힌트 문구 반말 명령형** — `hint="힌트를 캐고, 폭탄을 좁혀라"` 가 같은 `hint` prop 을 쓰는 Escape/MemoryMatch(둘 다 해요체)와 톤이 어긋남 → `"힌트를 캐고, 폭탄을 좁혀요"` 로 정정.
- [x] **Mastermind 선언 확인 카드 내 존댓말/반말 혼용** — 본문은 해요체("...즉시 승리, 틀리면...패배. 되돌릴 수 없어요.")인데 바로 아래 버튼 2개(`"이 조합으로 지른다"`/`"더 추측할게"`)만 반말 → `"이 조합으로 선언"`/`"더 추측하기"`(다른 버튼 라벨과 동일한 명사형)로 정정.
- [x] **Lobby 대기 문구 리터럴 점 3개** — `'참가자 연결 대기 중...'` 이 같은 파일의 다른 "진행 중" 라벨(`'설정 중…'`/`'상대 연결 중…'`) 및 프로젝트 전역 관례(단일 말줄임표 `…`, 36건)와 달리 리터럴 `...` 사용 → `…` 로 통일.
- 독립 Explore 에이전트로 전 10게임 + 공용 컴포넌트(Lobby/PWAPrompt/ConfirmModal/GameConnectionOverlay/GameOverModal) 토스트·라벨·에러 문구 전수 그렙 — 오탈자(맞춤법·띄어쓰기)는 발견 없음, 위 4건은 조사/톤/구두점 정합성 문제로 확인. Escape 결과화면의 "다시하기"/"대기방"(공용 `GameOverModal` 기본값 "같은 게임 다시"/"옵션 · 게임 변경" 과 용어 상이)은 코드 주석상 의도된 단순화 레이아웃으로 판단되어 이번 스코프에서 제외(변경 없음).
- `npm run lint`(tsc --noEmit)/`npm run build` 통과. 독립 리뷰 에이전트 — diff 각 라인이 서술과 정확히 일치·스코프 외 변경 없음, `이(가)` 무공백형이 이 코드베이스(Mastermind 기존 4곳)의 지배적 스타일과 일치, 변경된 리터럴 문자열에 대한 `===` 비교(로직 의존)가 코드베이스 어디에도 없음(순수 렌더 텍스트) 확인 — PASS.

### 2026-07-14 · useRoom.ts 디버그 로그 유틸화 + 나머지 8게임 useEffect deps 재감사(클린)
- [x] **`useRoom.ts` 의 5개 `console.log` 디버그 노이즈가 production 번들에도 그대로 남아있던 문제** — `[useRoom] ✅ data channel OPEN`/`⚠️ data channel CLOSED`/`🧊 ICE state`/`answer poll started`/`applying remote answer` 5곳 모두 이미 동일 정보를 사용자 노출용 `pushDiag()` 진단 로그로도 남기고 있어 순수 개발자용 콘솔 노이즈였음. `src/utils/debug.ts` 신설(`import.meta.env.PROD` 체크 후 no-op, 그 외엔 `console.log` 위임 — 옵션/로그레벨 없는 최소 구현) — 5곳 모두 `debug()` 로 교체, `console.warn`/`console.error` 12곳은 전부 그대로 유지(P6 — 실패 진단은 prod 에서도 노출돼야 함).
- **나머지 8개 게임 `useEffect`/`useCallback` deps 재감사** — 직전 사이클(BombHunt/MemoryMatch)에서 발견된 "narrow-deps 콜백이 broader-deps 콜백을 직접 클로저 참조"class 결함이 다른 게임에도 있는지 Escape/Wavelength/HiddenWord/Quorimo/Vinci/Ditrick/Trumeon/Mastermind + 공유 훅(`useMatchRestart.ts`) 전수 확인 — 추가 결함 없음. 각 파일이 이미 (1) 리스너 effect deps 에 사용하는 모든 값 포함(광범위 재구독), (2) ref-mirror 메시지 핸들러(BombHunt/MemoryMatch 에 사후 적용한 패턴을 애초부터 내장), (3) `setState(prev => ...)` 순수 함수형 업데이트(외부 클로저 staleness 자체가 무관) 세 방어 패턴 중 하나로 이미 하드닝돼 있음을 확인.
- `npm run lint`(tsc --noEmit)/`npm run build` 통과. 독립 리뷰 — diff 범위(정확히 스펙 기술 5곳 치환) · P1/P2/P3/P6 · `import.meta.env.PROD` 가 기존 코드베이스 관례(`VITE_TURN_URL` 등)와 일치하는 유효한 Vite 플래그인지 · 실제 production 번들(`dist/assets/*.js`)을 grep 해 debug 문자열은 제거되고 error 문자열은 유지됨을 직접 확인 — PASS(이슈 없음).

### 2026-07-14 · MemoryMatch — applyReveal stale resolveTwoPicks 클로저 + currentRound 이중 staleness 수정
- [x] **라운드제(3/5라운드) 매치가 동률이 반복되면 마지막 라운드를 지나도 종료되지 않을 수 있던 문제** — `applyReveal`(`useCallback`, deps `[]`, 파일 하단 `p2p_message` 리스너 effect 의 deps 에 포함돼 있어 리스너 재바인딩을 피하려 의도적으로 deps 를 비워둠)이 `setTimeout` 안에서 `resolveTwoPicks`(`useCallback`, deps `[players]`)를 **직접 클로저 참조**로 호출하고 있었음 — `resolveTwoPicks` 는 이 파일 유일한 호출부인 `applyReveal` 을 통해서만 실행되는데, `applyReveal` 자체는 deps `[]` 라 절대 재실행되지 않으므로 컴포넌트 첫 렌더 시점의 `resolveTwoPicks` 인스턴스를 영구히 붙들고 있었음. 1차 수정으로 `resolveTwoPicksRef`(useRef + `[resolveTwoPicks]` 동기화 useEffect, 파일 기존 `tilesRef`/`scoreRef` 패턴과 동일)를 신설해 `applyReveal` 이 `resolveTwoPicksRef.current(...)` 를 호출하도록 교정했으나, **독립 리뷰 1라운드에서 이 수정만으로는 불충분함을 발견** — `resolveTwoPicks` 자체가 `[players]` 로만 재메모이즈되는데, 매치 진행 중 라운드가 바뀌어도(`startNextRound` 의 `setCurrentRound`) `players` 는 갱신되지 않으므로 `resolveTwoPicks` 는 라운드가 넘어가도 재생성되지 않고, 그 안에서 직접 읽던 `currentRound` 가 매치-오버 판정(`currentRound + 1 > preset.rounds`, "마지막 라운드까지 아무도 승수를 못 채우면 그때까지 더 많이 이긴 쪽 승리" 폴백)에서 항상 라운드 1 시점 값으로 고정돼, 동률이 반복돼 어느 쪽도 `winsNeeded` 를 못 채우는 매치는 실제 마지막 라운드가 지나도 이 폴백이 발동하지 않아 다음 라운드가 무한히 이어질 수 있었음. `currentRoundRef`(동일 ref-미러 패턴)를 추가로 신설해 판정부가 `currentRoundRef.current` 를 읽도록 교정 — `resolveTwoPicks` 가 언제 재메모이즈되는지와 무관하게 항상 살아있는 라운드 값을 읽도록 두 계층(클로저 바인딩 + 내부 라운드값) 모두 해소.
- `npm run lint`(tsc --noEmit)/`npm run build` 통과. 독립 리뷰 2라운드 — 1라운드에서 `resolveTwoPicksRef` 단독 수정이 근본 원인(`resolveTwoPicks` 가 `currentRound` 변화와 무관하게 재생성됨)을 해소하지 못함을 정확히 지적(Veto)해 `currentRoundRef` 추가 수정, 2라운드에서 두 ref 의 커밋 타이밍(라운드 종료 판정 read 가 항상 다음 라운드 진입 write 보다 인과적으로 선행) 및 `resolveTwoPicks` 내 다른 직접 클로저 참조(`preset`/`winsNeeded`/`isHost`/`myName`/`opponentName`/`sendMessage`/`peerId`) 전수 재검토(동일 계열 staleness 위험 없음 확인) — PASS.

### 2026-07-14 · BombHunt — applyRevealLocal stale finishMatchByRole 클로저 수정
- [x] **폭탄 공개 시 승자 이름이 오래된 `players` 스냅샷으로 판정될 수 있던 문제** — `finishMatchByRole`(`useCallback`, deps `[players]`)은 `players`가 바뀔 때마다 새로 만들어지지만, `applyRevealLocal`(`useCallback`, deps `[isHost, fire]`)은 이벤트 리스너 재바인딩을 줄이려 일부러 가벼운 deps 를 유지해 `finishMatchByRole`을 deps 에 넣지 않았음(파일 내 `rulesLogRef`/`opponentNameRef` 와 동일한 기존 패턴). 그 결과 `applyRevealLocal`은 처음 만들어질 때 캡처한 `finishMatchByRole` 인스턴스를 계속 들고 있다가, 폭탄이 뒤집혀 매치가 끝날 때 그 오래된 클로저를 호출 — 그사이 `players`가 갱신(재접속·LOBBY_STATE 동기화 등, `useRoom.ts`)됐다면 승자 이름이 오래된 값으로 표시될 수 있었음. `finishMatchByRoleRef`(useRef + `[finishMatchByRole]` 동기화 useEffect)를 신설해 파일의 기존 ref-미러 패턴을 그대로 따르고, `applyRevealLocal` 내부 호출부를 `finishMatchByRoleRef.current(...)`로 교체(deps 배열은 변경 없음 — 리스너 재바인딩 최소화 의도 유지).
- `npm run lint`(tsc --noEmit)/`npm run build` 통과. 독립 리뷰 에이전트가 `finishMatchByRole`의 나머지 2개 호출부(`commitBombGuess`는 매 렌더 재생성되는 일반 함수라 무관, `p2p_message` 리스너의 `useEffect`는 deps 에 `players`/`finishMatchByRole` 모두 포함돼 무관)엔 동일 결함이 없음을 확인, ref 동기화 타이밍(effect 커밋 후 실행 vs `applyRevealLocal`은 항상 이벤트 핸들러에서만 호출되므로 렌더 중 동시 발생 불가) 및 `players` 가 실제로 매치 진행 중 갱신될 수 있는 경로(`useRoom.ts`의 `LOBBY_STATE`/재접속 흐름)를 코드로 추적 — 실재하는 재현 가능한 버그였음을 검증, 동일 패턴의 다른 콜백 존재 여부도 함께 스캔(추가 발견 없음) — PASS.

### 2026-07-14 · Trumeon 가이드 — 종반 무늬 강제 국면 트릭 수 오류 정정
- [x] **"더미 마르면 손패 3장으로 6트릭 마무리"가 실제 트릭 수와 다르던 문제** — 덱 40장 = 총 20트릭(트릭당 2장 소모). 초기 손패 3+3, 더미 34장(짝수) → 매 트릭 승자·패자 각 1장씩 보충되며 17트릭 동안 더미가 소진(34÷2). 더미 소진 후에는 보충 없이 손패 3장이 트릭당 1장씩 줄어 3트릭(3+3=6장÷2)만 남음 — 17+3=20 으로 정확히 일치. "6트릭"은 "남은 손패 6장(양쪽 3+3)"과 "남은 트릭 수"를 혼동한 오기로 판단, "3트릭"으로 정정. 같은 step에 "리드는 이 국면에도 계속 아무 카드나 자유 선택(강제는 후에게만 적용)" 문구를 추가 — `legalCardsInHand`(`Trumeon.tsx`) 확인 결과 무늬 강제는 `leadCard`가 설정된 후(=팔로우 차례)에만 적용되고 리드는 국면·더미 상태와 무관하게 항상 전체 손패가 legal이라 이 구분이 없으면 오해 소지가 있었음.
- `npm run lint`(tsc --noEmit)/`npm run build` 통과. 독립 리뷰 에이전트가 `briscola.ts`(`deal` 손패/더미 크기)와 `Trumeon.tsx`(`playAction` 트릭당 소모/보충 로직 · `legalCardsInHand` 리드/팔로우 분기)를 코드와 대조해 트릭 수 재계산(17+3=20) 및 리드 무제한 클레임 모두 독립적으로 재검증 — PASS.

### 2026-07-14 · Ditrick 가이드 — 카드 추첨 · 레이즈 상한 · 동률 팟 분배 정확화
- [x] **가이드가 "기본 1~10 각 4장(40장)" 공유 덱을 서술했지만 실제로는 덱이 없던 문제** — `Ditrick.tsx` 의 `startRound` 는 매 판 호스트/게스트 카드를 각각 독립적인 `Math.floor(Math.random()*10)+1` 로 뽑음(공유 덱·중복 방지·판간 기억 전무). "덱 · 옵션" step 을 "카드 · 옵션"으로 개명, "공유 덱 없이 매 판 각자 1~10 중 무작위 1장을 독립 추첨(중복 가능) — 이전 판·상대 카드와 무관"으로 재작성.
- [x] **"상대 카드 낮음 → 내 카드 높을 확률↑" · "베이지안 추론 · 상대 카드 + 남은 덱" 배지가 통계적으로 틀린 주장이던 문제** — 카드가 완전히 독립 추첨이므로(공유 덱 없음), 상대 카드 값 자체는 내 카드에 대해 수학적으로 아무 정보도 주지 않음(독립 확률변수). 반면 "상대가 내 카드를 보고 취하는 베팅 행동"은 유효한 신호(내 카드를 실제로 보는 쪽이 상대이므로). 두 배지와 "심리 추론" step 을 "카드 값 직접 예측 불가 · 상대의 베팅 강도/행동을 읽는 것만 유효"로 재작성해 두 추론 메커니즘을 명확히 구분.
- [x] **레이즈 상한 문구 자기모순** — "베팅 액션" row 는 "상한 3회 왕복 후 강제 쇼다운", "베팅 상한" step 은 "레이즈 왕복 최대 3회 (5회 이상 강제 쇼다운)"로 서로 다른 숫자를 서술. 실제 코드(`applyBet` raise 분기, `raiseCount>=5`)는 5번째 레이즈에서 즉시 강제 쇼다운 — 양쪽 모두 "레이즈는 5회째에 자동으로 강제 쇼다운"으로 통일.
- [x] **동률 시 홀수 팟 분배 "선공 +1" 이 실제 동작과 다르던 문제** — `finalizeRound` 호출 시점의 `r.toAct` 를 콜/2차 체크/레이즈상한 강제종료 세 경로 모두 추적: 콜·2차체크로 종료된 경우엔 "그 판을 매듭지은 쪽(마지막 콜/체크한 사람)"이 홀수 칩을 받고(선공 여부와 무관 — 라운드 내 액션 횟수 홀짝에 따라 선공/후공 둘 다 가능), 레이즈 상한(5회)으로 강제 종료된 경우엔 예외적으로 "마지막 레이즈한 사람의 상대"가 받음(코드가 강제종료 직전 `toAct` 를 레이즈어 상대로 먼저 플립하기 때문). "쇼다운"/"동률 처리" 두 항목 모두 이 두 갈래를 명시하도록 재작성.
- [x] **승리 조건에 칩까지 동률인 매치 무승부 케이스 누락** — `nextIdx > totalRounds` 분기의 `hc===gc → 'tie'`(=매치 DRAW) 를 "승리 조건" step 에 "(칩까지 동률이면 매치 무승부)" 로 보강.
- `npm run lint`(tsc --noEmit)/`npm run build` 통과. 독립 리뷰 2라운드 — 1라운드에서 동률 팟 분배 문구가 레이즈상한 강제종료 경로에서 부정확함을 발견(콜/체크로 안 끝난 판인데 "매듭지은 쪽"이라 서술) → 해당 경로 전용 예외 문구 추가로 수정, 2라운드에서 수정 정확성·전체 클레임 재검증·문구 길이/레이아웃 영향 확인 — PASS.

### 2026-07-14 · 재접속 — 호스트 mid-game 세션 재구성
- [x] **GAME_PLAY 중 호스트측 P2P 연결이 끊겼을 때 게스트가 재접속할 방법이 실질적으로 없던 문제** — 기존 guest 전용 "재접속 시도" 버튼(`joinRoom(peerState.peerId, true)`)은 호스트가 새 offer 를 재발행하지 않는 한 `fetchRoomOffer` 가 이미 오래전(원래 `/join` 처리 시) 삭제된 room 레코드를 조회해 항상 404 로 실패했고, 호스트 쪽은 애초에 재연결 버튼 자체가 없었음(`restartWait()` 는 handshake 이전 전용이라 이미 협상 완료된 `RTCPeerConnection` 에 새 answer 를 적용하면 `InvalidStateError`). `useRoom.ts` 에 호스트 전용 `reconnectHostSession()` 신설 — 기존 `establishHostSession(roomId, gameId)` 헬퍼(createRoom/restoreHostRoom 공유)를 재사용해 동일 roomId 로 새 `RTCPeerConnection` 을 만들고 offer 를 재발행하되, cold-restore(`restoreHostRoom`, Lobby 로 착지)와 달리 GAME_PLAY 가 마운트된 채로 진행되므로 **기존 2인 players roster 를 보존**(establishHostSession 이 기본으로 호스트 1인으로 리셋하는 부분을 재발행 후 원복) — 게임 컴포넌트가 상대방이 로스터에서 사라지는 걸 보지 않도록 함. `App.tsx` 의 RECONNECTING 오버레이에 호스트용 실제 동작하는 "재접속 시도" 버튼 신설(기존엔 "호스트는 아직 mid-game 재핸드셰이크 경로가 없다"는 주석과 함께 버튼 자체가 없었음).
- **게스트측 자기파괴 레이스도 함께 발견·수정**: 게스트의 "재접속 시도"가 호출하는 `joinRoom` 은 내부 `teardown()` 이 항상 `peerIdRef.current`(=재접속하려는 그 roomId) 를 서버에서 `deleteRoom` 하는데, mid-game 재접속은 자기 자신이 이미 그 roomId 에 있는 상태에서 재시도하는 것이라 이 삭제가 호스트가 방금 재발행한 room 을 게스트 자신이 fetch 하기도 전에 지워버리는 자기파괴 경쟁이었음 — `joinRoom(targetRoomId, viaCode?, keepRemoteRoom?)` 에 3번째 파라미터 신설, GAME_PLAY 재접속 호출 시에만 `true` 로 전달해 `teardown({ skipRemoteDelete: true })` 로 원격 삭제를 건너뛰도록(방 삭제는 호스트 쪽 책임으로 통일) 하고, 실패 시에도 `IDLE`(막다른 길) 대신 `RECONNECTING`(재시도 가능) 으로 유지하도록 교정.
- **3라운드 독립 리뷰**에서 실제 회귀 2건 발견 후 수정: (1) `joinRoom` 의 오프라인 사전 분기가 `keepRemoteRoom` 시 `joinTimeoutRef` 워치독을 정리하지 않아, 20초 뒤 스테일 타임아웃이 올바른 "오프라인 참가는 QR 스캔으로" 메시지를 엉뚱한 "연결이 지연되고 있어요" 로 덮어쓰는 문제 → 해당 분기에서 명시적으로 워치독 clear. (2) `reconnectHostSession` 의 재진입 가드(`connectAttemptRef`/`stillCurrent`)가 자기 자신의 사후 체크포인트만 지켜, 정작 `establishHostSession` 내부의 실제 mutation(`sessionRef`/`answerPollRef`/`publishRoom`)은 무방비였음(더블탭 시 두 세션이 동시에 진행돼 하나가 고아 RTCPeerConnection 이 되거나, "방 나가기" 로 나간 뒤에도 재구성이 완주해 이미 떠난 room 을 유령처럼 재발행) → `establishHostSession` 에 `opts.isStale?: () => boolean` 콜백을 추가해 세션 생성 직후·ICE 수집 직후 두 지점에서 정지 여부를 재확인하도록(호출자가 없는 콜백 전달 시 `createRoom`/`restoreHostRoom` 은 동작 불변) 하고 `reconnectHostSession` 이 자신의 `stillCurrent` 를 그대로 연결 — 4라운드째 재검증에서 더블탭·"방 나가기" 도중 이탈 두 시나리오 모두 안전 확인(PASS).
- `npm run lint`(tsc --noEmit)/`npm run build` 통과.

### 2026-07-14 · 재접속 — 호스트 콜드 리스토어 role 미지원 해소
- [x] **재접속 세션 복원 프롬프트가 저장된 `isHost` 를 무시하고 항상 guest 로 `joinRoom` 호출하던 문제** (2026-07-13 재접속 flow 사이클에서 발견 후 "세션 재구성 범위" 라 이관된 항목) — `useAppNavigation.ts` 의 `acceptRestore()` 는 role 과 무관하게 항상 guest 전용 `onJoinRoom` 흐름을 탔는데, 호스트의 콜드 리로드(새로고침/PWA 재실행)는 자신의 `RTCPeerConnection` 자체가 완전히 사라진 상태라 "기존 offer 에 answer" 하는 guest 흐름이 애초에 대응할 대상이 없어 항상 실패. `useRoom.ts` 에 호스트 전용 복원 경로 `restoreHostRoom(roomId, gameId)` 신설 — `createRoom()` 의 본문에서 세션 수립·offer 발행·answer poll 시작 로직을 `establishHostSession(roomId, gameId)` 로 추출해 재사용(순수 리팩터, 동작 불변), `restoreHostRoom` 은 새 `roomId` 를 생성하는 대신 **저장된 roomId 를 그대로 재사용**해 새 `RTCPeerConnection` 으로 세션을 재수립 — 게스트가 함께 콜드 리스토어해 동일 roomId 로 `joinRoom` 을 재시도할 때 실제로 발견 가능하도록. 재수립 직전 `deleteRoom(roomId)` 로 재로드 이전의 room/answer 레코드를 worker 에서 먼저 삭제 — 그렇지 않으면 (a) 게스트의 재제출 answer 가 `/join` 의 기존-answer 체크(`worker/src/index.ts`)에 걸려 409("이미 참가자가 있는 방")로 거부되고, (b) 우리 자신의 answer poll 이 SDP 가 안 맞는 그 stale answer 를 새 세션에 잘못 적용할 수 있었음. `useAppNavigation.ts` 의 `acceptRestore()` 가 `restorePrompt.isHost` 로 분기해 호스트는 신규 `onRestoreHost` 콜백(`App.tsx` 에서 `peerState.restoreHostRoom` 로 연결)을, 게스트는 기존 `onJoinRoom` 을 타도록 교정.
- **독립 리뷰 1라운드**에서 실제 회귀 발견: `acceptRestore` 의 호스트 분기가 `setLobbyMode('CREATE')` 로 `<Lobby mode="CREATE">` 를 마운트시키는데, `Lobby.tsx` 의 부트스트랩 `useEffect`("Host CREATE: kick off room creation exactly once per mount")는 role/복원 여부와 무관하게 `mode === 'CREATE'` 인 모든 마운트에서 무조건 자체 `createRoom()`(신규 roomId 발급)을 호출해, `restoreHostRoom` 이 막 재수립한 세션(저장된 roomId)과 완전히 다른 새 세션이 동시에 같은 `sessionRef`/`peerIdRef` 를 두고 경합 — 결국 항상 방금 고친 그 버그가 그대로 재발하는 구조였음(둘 다 `stillCurrent()` 세대 가드가 없어 나중에 끝나는 쪽이 조용히 덮어씀). `useAppNavigation.ts` 에 `skipLobbyAutoCreate` 플래그 신설 — 호스트 복원 분기에서 `setScreen('LOBBY')`/`setLobbyMode('CREATE')` 와 **같은 배치**로 `true` 설정(React 18 자동 배칭으로 Lobby 첫 마운트가 이미 `true` 로 관측), `onRestoreHost` await 완료 후 `finally` 에서 `false` 로 리셋(이후 무관한 재진입에 새지 않도록) · `enterCreate`(평범한 "방 만들기")도 방어적으로 `false` 리셋. `Lobby.tsx` 부트스트랩 effect 에 `skipAutoCreate` prop 추가해 해당 조건이면 자체 `createRoom()` 을 건너뛰도록 교정, `App.tsx` 가 `nav.skipLobbyAutoCreate` 를 연결.
- **독립 리뷰 2라운드**(배칭 타이밍 · `bootRef`/StrictMode 이중 호출 상호작용 · 게스트 경로 무영향 · `enterCreate` 리셋 순서 · 이후 "대기방" 재진입 시 플래그 미잔존 · deps 배열 · P1/P2/P6)에서 회귀 없음 확인 — PASS.
- 저장된 `screen`(GAME_PLAY) 을 무시하고 항상 LOBBY 로 복원하는 부분은 이번 슬라이스에서 의도적으로 유지 — 어떤 게임도 도메인 상태(보드/라운드 등)를 콜드 리로드 너머로 들고 있지 않아, GAME_PLAY 로 직행하면 재로드하지 않은 상대가 방금 새로 마운트되어 아무 진행 상태도 없는 컴포넌트를 상대로 리싱크되는 셈 — 리싱크 프로토콜(모든 게임의 상태 재전송) 없이는 LOBBY 착지(호스트/게스트 모두 `LOBBY_STATE` 로 players·설정만 재동기화)가 유일하게 안전한 결과. 별도 사이클 필요.
- `npm run lint`(tsc --noEmit)/`npm run build` 통과 (2건 모두).

### 2026-07-14 · Quorimo 가이드 검증 + Vinci 가이드 — 조커 위치 선택 정확화
- [x] **Quorimo 가이드 검증** — §최우선 "노출 문구 정확성 스위프" 항목. `board.ts`(`isBlocked`/`legalMoves`/`hasPathToGoal`/`validateWallPlacement`)와 `Quorimo.tsx`(보드 크기별 벽 재고 9×9=10·7×7=7)를 코드와 전수 대조: 이동/점프/대각 우회 규칙, BFS 완전 봉쇄 검증과 거부 토스트 문구("이 벽은 상대의 길을 완전히 막아요"), 벽 모드 라임/빨강 슬롯 색상(`quorimo.css`) 등 가이드의 모든 클레임이 이미 정확함을 확인 — 변경 없음. 항목 체크 완료.
- [x] **Vinci 가이드 — "조커는 소유자가 원하는 rank 에 숨김" 무조건 서술이 실제로는 [멈춤] 경로에만 해당하던 문제** — `Vinci.tsx`의 `jokerRanks`(`Map<tileId, rank>`)는 정답을 맞힌 뒤 [멈춤]을 눌러 손에 든 조커의 위치를 다이얼로그로 직접 고르는 `confirmJokerStop` 경로에서만 값이 채워짐. `deck.ts`의 `sortTiles`는 이 맵에 없는 조커를 기본값 999(="맨 뒤"와 동일 순위)로 정렬 — 즉 (1) 게임 시작 시 초기 손패에 포함된 조커, (2) 오답으로 강제 공개·삽입되는 조커는 소유자가 위치를 전혀 선택하지 못하고 항상 자동으로 맨 뒤에 놓이는데, 가이드는 이 구분 없이 "소유자가 원하는 rank 에 숨김"이라 서술해 실제보다 자유도를 과장하고 있었음. `registry.tsx` vinci `guide`의 배지 2곳·'정렬 규칙' step 1곳을 "[멈춤]으로 넣을 때만 소유자가 위치 직접 선택 / 시작 손패·오답 강제공개는 자동으로 맨 뒤"로 재작성.
- `npm run lint`(tsc --noEmit)/`npm run build` 통과. 독립 리뷰 에이전트가 `Vinci.tsx`(`jokerRanks` 기록 지점 2곳 — `confirmJokerStop`·인바운드 `VC_STOP` 핸들러 — 와 `applyGuess` 오답 분기·`deal()` 초기 딜에 기록 경로 부재)와 `deck.ts`(`sortTiles` 기본값 999)를 코드와 대조해 신규 문구 3개 클레임 모두 PASS 확인. 건드리지 않은 나머지 Vinci 가이드 문구(골드 outline · 스톡 소진 스킵 · 숫자패드 0~11 · 조커 위치 선택 다이얼로그 UI)도 기존에 이미 정확함을 재확인.

### 2026-07-14 · HiddenWord 가이드 — 카드 종류별 효과 · 로그 표기법 명시
- [x] **"개요" step이 "3×3 또는 4×4 단어 보드"로 5×5 옵션 누락 서술하던 문제** — 실제 `matchOptions`(`registry.tsx`)와 `HIDDENWORD_PRESETS`(`HiddenWord.tsx`)는 3×3/4×4/5×5 3종인데 가이드는 4×4까지만 언급. "3×3 · 4×4 · 5×5 단어 보드"로 수정.
- [x] **기록(로그) 화면의 표기법이 가이드에 전혀 설명돼 있지 않던 문제** — `HiddenWord.tsx`의 로그는 라운드마다 단서 줄("R{라운드} 단서" 배지 + 작성자·단서 문구)과 지목 줄("R{라운드} 지목" 배지 + 지목자 → 지목한 단어 + 결과 정답/함정/일반, 결과별 색 구분)로 쌓이는데 이 구조가 가이드에 없어 "기록" 버튼을 눌러도 표기를 해석할 수 없었음. `guide.sections`에 '기록 표기' badges 섹션 신설, `guide.steps`에 '기록 표기' step 신설(배지·문구 구조를 프로즈로 설명 — 리터럴 문자열 그대로 렌더링된다고 오인시키지 않도록 실제 JSX 구조에 맞춰 서술). 카드 종류 섹션에도 색상 단서(정답=라임, 함정=빨강) 추가.
- `npm run lint`(tsc --noEmit)/`npm run build` 통과. 독립 리뷰 에이전트가 `words.ts`(`generateBoard`의 정답 1장/함정 3장/나머지 일반 배분)와 `HiddenWord.tsx`(`resolveRound`의 점수·승패 판정, 로그 JSX의 실제 배지·문구 구조), `hiddenword.css`(카드 색상 토큰)를 코드와 대조해 보드 크기·카드 효과·색상·승리 조건 클레임 모두 PASS 확인. 로그 표기 문구의 가운뎃점(·)이 실제 DOM에 리터럴로 렌더링되지 않는다는 정밀도 지적을 반영해 배지/화살표 중심의 프로즈 서술로 재작성 후 재검증.

### 2026-07-14 · Wavelength 가이드 — 승리 점수 3/5/7 스케일 반영
- [x] **가이드 '승리 조건' step이 "방 옵션의 목표 점수(8/10/12/15/20)에 먼저 도달한 쪽 매치 승"이라는 옛 스케일을 그대로 서술하던 문제** — 실제 방 옵션(`matchOptions2`, `registry.tsx`)은 3/5/7점 3종뿐이고(`DEFAULT_TARGET_BY_TOL`·`Wavelength.tsx` 주석에도 "이전 8-20 스케일은 라운드 당 3점 획득 정책과 결합해 매치가 너무 짧아짐" 이라 3/5/7로 축소했다고 명시돼 있음), 가이드 문구만 리밸런싱 이전 값으로 방치돼 있었음. `registry.tsx` wavelength `guide.steps`의 '승리 조건' step을 "방 옵션 '승리 점수'(3·5·7점) 중 고른 목표에 먼저 도달한 쪽 매치 승. 맞히면 3점씩 오르므로 3점 목표는 1문제, 5점은 2문제, 7점은 3문제째에 승부가 갈려요."로 재작성.
- `npm run lint`(tsc --noEmit)/`npm run build` 통과. 독립 리뷰 에이전트가 `Wavelength.tsx`(`matchOption2`/`targetScore` 소비 · 승부 판정 조건)와 `cards.ts`(`scoreGuess` 3/0 이진 채점)를 코드와 대조해 신규 문구의 모든 클레임(3/5/7 스케일 · 3점 고정 채점 · 목표별 필요 정답 수 1/2/3문제 · 오차 허용 ±1/±2/±4/±6 회귀 없음) PASS 확인.

### 2026-07-14 · Memory 가이드 — 라운드 옵션 · 승리 조건 설명 보강
- [x] **`matchOption2`(라운드 옵션: 단판/3라운드/5라운드)가 가이드에 전혀 언급되지 않고, 기존 "승리 조건" 문구도 단판 기준(획득 쌍 비교)만 서술해 멀티 라운드 매치의 실제 승패 결정 방식(라운드별 승자 → best-of 라운드 승수)을 설명하지 못하던 문제** — `MemoryMatch.tsx` 는 `matchOption2`(1/3/5)로 `MEMORY_PRESETS`를 선택해 `winsNeeded = Math.ceil(rounds/2)`(1/2/3)를 계산하고, 라운드마다(`startNextRound`) 새 보드로 재시작하며 쌍 획득 수(`score`)를 0으로 리셋 — 한 라운드는 8쌍이 모두 열리면 종료되고 그 라운드의 쌍 획득 수 비교로 라운드 승자(`roundWinnerRole`, 동률이면 `'tie'`로 누구도 라운드 승 획득 못함)를 결정, 라운드 승수가 `winsNeeded`에 도달하거나 마지막 라운드가 끝나면 매치 종료 — 이 모든 로직이 가이드에 전혀 반영돼 있지 않았음. `registry.tsx` memory `guide.steps`에 `'라운드 옵션'` step 신설(단판/3라운드/5라운드 선택지 · 단판 아니면 매 라운드 재시작+점수 리셋) · `'승리 조건'` step을 라운드제 best-of 로직(라운드 승리 조건 · 4-4 무승부 · 단판 즉시 종료 · 라운드 승수 도달 시 즉시 매치 승리 · 아무도 못 채운 채 마지막 라운드 종료 시 그때까지 더 많이 이긴 쪽 승리(동률이면 마지막 라운드 승자, 그마저 비기면 매치 전체 무승부))으로 전면 재작성.
- `npm run lint`(tsc --noEmit)/`npm run build` 통과. 독립 리뷰 에이전트가 `MemoryMatch.tsx`(`MEMORY_PRESETS`/`winsNeeded`/`startNextRound`/`applyMatchReset`/`resolveTwoPicks`의 라운드 종료·승자 판정·매치 종료 분기)를 코드와 대조해 5개 클레임 모두 PASS 확인 — 1건 표현 정밀도 지적("정해진 라운드 승수를 먼저 채운 쪽이 승리"가 마지막 라운드에 미달 상태로도 승리 가능한 엣지케이스를 함축적으로만 다룬다는 지적) 반영해 "라운드 승수를 먼저 채운 쪽이 즉시 승리 / 아무도 못 채운 채 마지막 라운드까지 가면 그때까지 더 많이 이긴 쪽 승리"로 재작성 후 재검증.
- headless Chromium(Playwright, pre-installed)으로 홈 → 메모리 매치 카드 → "규칙 보기" → 가이드 모달 진입 후 스크롤하여 신규 '라운드 옵션' step 및 재작성된 '승리 조건' step이 레이아웃 안에서 정상 렌더링(줄바꿈 정상 · 잘림 없음)됨을 스크린샷으로 확인. 콘솔 에러 없음.

### 2026-07-14 · Escape 가이드 — 열쇠 힌트 · minimap 사용법 반영
- [x] **미니맵의 "열쇠 힌트" 노란 점 · 자기 위치 초록 점 · 벽 비노출 사양이 가이드에 전혀 설명돼 있지 않던 문제** — `Escape.tsx` 는 `flags.met && !flags.hasKey && stateRef.current?.key` 조건일 때 `MinimapKey`(노란 점, `--game-warn-gold`)로 열쇠 위치를 미니맵에 힌트로 노출하는 기능이 이미 구현돼 있었지만(합류 후 열쇠 미획득 상태에서만), 가이드(`registry.tsx` escape `guide.steps`)에는 이 메커닉이 전혀 언급되지 않았고 기존 `warning` 문구도 "미니맵은 위치만 표시"라는 뭉뚱그린 문구만 있어 실제 힌트 조건을 알 수 없었음 — 신규 `'미니맵'` step 추가("내 위치는 항상 초록 점 · 벽·구조는 안 보임 · 합류 후 열쇠 미획득이면 열쇠 위치가 노란 점 힌트") · `warning` 문구는 이제 step 과 중복되는 "위치만 표시" 구절을 제거하고 "미로 전체는 안 보임 · 소통이 곧 실력" 프레이밍만 유지하도록 정리.
- 아이템(시야/속도/스턴) 설명은 `VISION_STACK_VR/TILE`·`SPEED_STACK_MULT`·`st.stun = 2000`·`ITEM_DROP_INTERVAL_MS`(15s)·초기 2+2 배치 코드와 대조해 이미 정확함을 확인 — 변경 없음.
- `npm run lint`(tsc --noEmit)/`npm run build` 통과. 독립 리뷰 — `MinimapKey` 조건·색상(`--game-warn-gold` 골드/옐로), 플레이어 pip 색상(`--fg-accent`, arcade 테마 라임그린), 미니맵 SVG 에 벽 geometry 미포함, `GameGuideStep` 타입 정합성, 변경 범위(`src/games/registry.tsx` 1개 파일) 모두 대조 확인 — PASS.

### 2026-07-14 · Bombhunt 가이드 — rule engine 최신 반영
- [x] **"나오는 규칙 4종" 섹션이 하드코딩된 카운트(×2/×2/×1/×1)로 실제 룰 엔진과 어긋나 있던 문제** — `rules.ts` 는 `RuleType` 이 여전히 4종(relation/conditional/elimination/exclusion)이지만, 그 아래에서 실제로 후보를 만들어내는 템플릿 함수는 `enumerateRelation`/`enumerateConditional` 외에 `enumeratePositional`(모서리·가장자리·대각선·중앙행열)·`enumerateParityMath`(짝/홀 행열·반쪽 영역)·`enumerateDistance`(참조 카드 기준 최대 N칸)·`enumerateRelativeToReveal`(방금 뒤집은 카드 기준 인접/사분면/거리) 까지 확장돼 있어, 고정 카운트 배지가 실제 다양성을 전혀 반영하지 못하고 있었음(보드 크기별 조성도 다름) — `src/games/registry.tsx` 의 bombhunt `guide.sections`에서 해당 섹션을 `kind: 'badges'`(숫자 칩) → `kind: 'rows'`(설명 문구)로 교체, 4개 타입 각각이 실제로 어떤 패턴을 포함하는지(인접·같은행/열·거리·방금 카드 기준 / 영역·사분면·짝홀 / 모서리·중앙 소거 / 매치당 1회 광역 배제) 서술.
- 다른 섹션(뒤집기/턴 넘기기/폭탄 찾기 동작 설명, 보드 크기·진행방식·승리조건 steps)은 실제 컴포넌트 로직(`BombHunt.tsx` PASS_ALLOWANCE=1, declare-bomb 승패 판정, ME-scope 비공개 처리)과 대조해 이미 정확함을 확인 — 이번 사이클에서는 변경 없음.
- `npm run lint`(tsc --noEmit)/`npm run build` 통과. 독립 리뷰(rules.ts 대조 · GuideItem 타입 정합성 · 스코프 확인) 통과 — 버그 미발견, 순수 콘텐츠 변경(`src/games/registry.tsx` 1개 파일).

### 2026-07-14 · 뒤로가기·이탈 flow 조사 — sentinel history entry 미소비 누적 (3/3 해소, §최우선 항목 완료)
- [x] **LOBBY/GAME_PLAY/HOME(재접속 프롬프트) 진입마다 쌓이는 `pushState` sentinel 을 명시적 이탈 경로가 pop 하지 않아 죽은 back 프레스가 누적** — `useAppNavigation.ts` 의 화면별 back-gesture effect 가 LOBBY/GAME_PLAY 전환마다 매번 새 `pushState` 를 호출했고, `exitToHome`/`returnToLobby`/`startGame` 등 어떤 명시적 이탈·전환 경로도 이를 pop 하지 않아 세션이 길어질수록 하드웨어 back 이 여러 번 눌러야("dead back press") 반응하다 결국 앱 자체를 이탈시키는 문제(PR#37 이 추가한 HOME 재접속 프롬프트 전용 sentinel 도 동일 계열로 새로 취약했음). `sentinelPushedRef`(살아있는 sentinel 이 최대 1개라는 불변식 추적) + `pushOrReplaceSentinel`(LOBBY↔GAME_PLAY↔HOME-재접속프롬프트 간 레터럴 전환은 `replaceState`, depth 0→1 진입만 `pushState`) + `consumeSentinel`(명시적 depth 1→0 이탈 시 `history.go(-1)` 로 pop) 로 재설계 — `exitToHome`/`applyRemoteDisconnect`/`cancelRestore`(신설, 기존 `dismissRestore` 를 대체해 App.tsx 에 연결) 세 경로가 각각 올바른 시점에 consume. 프로그래매틱 `go(-1)` 이 발생시키는 합성 `popstate` 를 화면별 리스너가 실제 사용자 back 제스처로 오인하지 않도록 마운트 시 1회 등록되는 전역 `ignorePopRef` 가드 리스너(등록 순서상 항상 화면별 리스너보다 먼저 실행)를 추가.
- **3라운드 독립 리뷰**에서 실제 회귀 2건 발견 후 수정: (1) `acceptRestore` 의 join 실패 catch 분기가 `consumeSentinel()` 을 호출하고 있었는데, 이 경로는 `restorePrompt` 를 그대로 유지한 채(재시도 제공 의도) `screen` 만 HOME 으로 되돌리는 **레터럴** 전환이라 — accept 성공 경로(HOME-프롬프트→LOBBY)와 대칭— consume 이 아니라 `pushOrReplaceSentinel` 의 자연스러운 replace 에 맡겨야 했음; consume 호출 시 그 비동기 `go(-1)` 이 restore-prompt effect 의 동기 재-push 와 경쟁(race)해 sentinel 상태 불일치 가능성 확인 → 해당 분기에서 `consumeSentinel()` 호출 자체를 제거. (2) 동일 레이스가 `exitToHome`(LOBBY 의 CONNECTING 상태에서도 노출되는 뒤로/나가기 버튼)에서도 재현 가능함을 재검증 라운드에서 확인 → `applyRemoteDisconnect` 와 동일하게 `if (!restorePrompt) consumeSentinel()` 가드 적용. `cancelRestore`(명시적 취소)는 `dismissRestore()` 로 `restorePrompt` 를 같은 tick 에 null 처리해 restore-prompt effect 가 early-return 분기를 타므로 가드 불필요함을 3라운드 리뷰에서 트레이스 확인.
- `npm run lint`(tsc --noEmit)/`npm run build` 통과. Playwright(headless Chromium, pre-installed) 로 직접 검증: HOME 재접속 프롬프트가 back 제스처로 닫히는지(PR#37 회귀 없음), 프롬프트 5회 반복 open/취소 사이클 후에도 단 1회 back 만으로 baseline(`history.state === null`)에 도달하는지(= sentinel 미누적) 확인. §최우선 "뒤로가기 · 이탈" 항목의 알려진 3개 하위 이슈(LOBBY 버튼 confirm/PR#35, HOME 재접속 back/PR#37, sentinel 누적/본 PR) 모두 해소되어 항목 체크 완료.

### 2026-07-13 · 뒤로가기·이탈 flow 검증 착수 중 발견 — DISCONNECT 핑퐁 회귀 (PR#33 직후)
- [x] **인바운드 DISCONNECT 수신 시 `nav.exitToHome()` 재사용으로 상대에게 DISCONNECT 되쏘기** — 직전 사이클(PR#33)이 로컬 이탈 전용 `leaveRoom()`(DC open 이면 DISCONNECT 전송 후 teardown)을 신설하며 `App.tsx` 의 인바운드 `DISCONNECT` 처리를 `nav.exitToHome()` 에 연결했는데, `exitToHome` 이 내부적으로 `onExit`(=`peerState.leaveRoom`)을 호출해 원인이 같은 핑퐁 버그가 새로 생김 — `dispatchInbound`(`useRoom.ts`)의 `window.dispatchEvent('p2p_message', …)` 가 실제 teardown 을 수행하는 `case 'DISCONNECT': handleDisconnect()` 보다 먼저 실행되므로, `App.tsx` 리스너가 처리되는 시점엔 로컬 DC 가 여전히 `open` 상태라 `leaveRoom()` 이 상대가 방금 보낸 DISCONNECT 에 대해 DISCONNECT 를 도로 전송함(GAME_START/GAME_RESET 핑퐁과 동일 계열). `useAppNavigation.ts` 에 navigate-only `applyRemoteDisconnect`(기존 `applyRemoteGameStart`/`applyRemoteReturnToLobby` 패턴과 동일)를 신설해 `App.tsx` 인바운드 핸들러가 이를 사용하도록 교정 — 실제 teardown 은 `dispatchInbound` 의 switch-case 가 별도로 수행하므로 정리 유실 없음(오히려 기존엔 `leaveRoom()` 자체 teardown + switch-case teardown 이 중복 실행되던 것도 함께 해소).
- `npm run lint`(tsc --noEmit)/`npm run build` 통과 + 2-agent 독립 리뷰(회귀 없음 확인, 실행 순서 재검증 포함) 통과. §최우선 "뒤로가기 · 이탈" 항목의 본 조사(화면별 confirm/sentinel/session-restore 정합 전수) 는 착수 중 이 회귀를 최우선 수정하느라 이번 슬라이스에서 완료하지 못함 — 항목 미체크 유지, 다음 사이클에서 계속.

### 2026-07-13 · 뒤로가기·이탈 flow 조사 — HOME 재접속 프롬프트 back 미대응 (2/3 해소)
- [x] **HOME 의 재접속 세션 복원 프롬프트가 back 제스처에 반응 안 함** — `HOME` 은 popstate 리스너를 등록하지 않는 설계(사용자 요청으로 종료 confirm 제거, 네이티브 back 통과 정책)인데, 복원 프롬프트 모달이 `HOME` 위에 뜨는 동안에도 이 정책이 그대로 적용돼 하드웨어 back 이 모달을 닫는 대신 그대로 통과(=탭 이탈)해버리던 문제. `useAppNavigation.ts` 에 `restorePrompt` 가 열려 있을 때만 활성화되는 별도 popstate effect 를 추가 — sentinel push 후 back 수신 시 "취소" 버튼과 동일한 `dismissRestore()` 호출. 기존 LOBBY/GAME_PLAY back-confirm effect(`screen === 'SPLASH' || 'HOME'` 이면 skip)와는 `screen` 값 기준 상호 배타적이라 리스너 중복 부착 없음. `acceptRestore()` 경로(스크린이 즉시 LOBBY 로 전환)에서도 같은 React commit 내에서 이 effect 의 cleanup → LOBBY effect 의 setup 순으로 실행돼 겹침 없음.
- `npm run lint`/`npm run build` 통과 + 독립 리뷰 통과(버그 미발견). §최우선 "뒤로가기 · 이탈" 항목의 나머지 1건(sentinel history entry 미소비 누적)은 히스토리 로직 전반에 영향이라 이번에도 범위 밖 유지 — 항목 미체크 유지, 다음 사이클에서 계속.

### 2026-07-13 · 뒤로가기·이탈 flow 조사 — LOBBY 온스크린 버튼 confirm 누락 (1/3 해소)
- [x] **LOBBY 화면 3곳의 온스크린 뒤로/방 나가기 버튼이 confirm 없이 즉시 `onBack` 호출** — `useAppNavigation.ts` 는 브라우저 back 제스처 시 `대기방을 나가시겠어요?` confirm 을 띄우는데, `Lobby.tsx` 의 동일 동작 온스크린 버튼(연결 중 화면의 뒤로 화살표·방 나가기, JOIN 스캔 화면의 뒤로 화살표, 참가자 화면의 방 나가기 — 4개 지점)은 확인 없이 즉시 이탈시켜 같은 액션이 트리거 경로에 따라 다르게 동작하던 불일치. 카피 중복도 함께 있었음 — `confirmCopy.ts` 는 원래 "GameHeader 와 useAppNavigation 이 카피를 공유"한다는 주석이 있었지만 실제로는 LOBBY 케이스가 인라인 문자열이었고, GAME_PLAY 케이스도 `CONFIRM_EXIT_GAME` 과 줄바꿈이 다른 별도 인라인 문자열이라 주석과 실제 코드가 어긋나 있었음. `confirmCopy.ts` 에 `CONFIRM_EXIT_LOBBY` 신설 후 `useAppNavigation.ts` 의 `BACK_CONFIRM_MSG`(문자열+삼항연산자)를 `BACK_CONFIRM`(설정 객체, `CONFIRM_EXIT_LOBBY`/`CONFIRM_EXIT_GAME` 재사용)으로 교체, `Lobby.tsx` 온스크린 버튼 4곳도 동일 `ConfirmModal`+`CONFIRM_EXIT_LOBBY` 로 연결 — 이제 하드웨어 back 과 온스크린 버튼이 완전히 같은 코드 경로.
- `npm run lint`/`npm run build` 통과. 조사에서 함께 발견된 나머지 2건은 이번 슬라이스 밖으로 분리(더 넓은 범위 · 별도 검증 필요) — 항목 미체크 유지, 다음 사이클에서 계속:
  - **sentinel history entry 미소비 누적** — `useAppNavigation.ts` 가 LOBBY/GAME_PLAY 진입마다 `history.pushState` 로 sentinel 을 쌓지만 `exitToHome`/`returnToLobby` 등 명시적 이탈 경로가 이를 pop 하지 않아, 세션이 길어질수록 하드웨어 back 을 여러 번 눌러야 실제로 반응하는 "죽은 back 프레스" 가 누적. `pushState`→`replaceState` 전환 또는 스킵한 레벨만큼 `history.go(-n)` 호출 필요 — 히스토리 로직 전반에 영향이라 별도 사이클.
  - **HOME 의 재접속 세션 복원 프롬프트가 back 제스처에 반응 안 함** — `HOME` 은 popstate 리스너를 등록하지 않는데(의도된 설계, 위 주석 참조) 복원 프롬프트 모달이 `HOME` 위에 뜨는 동안엔 하드웨어 back 이 모달을 닫는 대신 그대로 통과해버림 — HOME 자체의 "back = 그대로 통과" 정책과 모달이 열린 상태의 "back = 모달 닫기" 를 구분하는 조건부 리스너 설계 필요.

### 2026-07-13 · 재접속 flow 검증 (3분 window · 성공/실패 · 상대측 UI 대응)
- [x] **GAME_PLAY 재접속 버튼이 호스트에게도 노출돼 self-sabotage** — `App.tsx` 의 RECONNECTING 오버레이 "재접속 시도" 버튼이 `isHost` 구분 없이 항상 guest 전용 `joinRoom(peerState.peerId, true)` 를 호출하고 있었음. 호스트가 이 버튼을 누르면: `joinRoom` 내부 `teardown()` 이 `peerIdRef.current`(=호스트 자신의 방 id) 를 `deleteRoom` 으로 삭제 → 이어서 그 방을 대상으로 `fetchRoomOffer` 를 호출해 방금 자신이 지운 방을 조회 → 실패 → 탈출 경로가 사실상 없어짐. 최초 교정안은 `Lobby.tsx` 의 `isHost → restartWait()` 분기를 그대로 옮기는 것이었으나, 2-agent 독립 리뷰에서 `restartWait()` 가 GAME_PLAY 시점엔 이미 협상 완료(`signalingState: 'stable'`)된 **동일** `RTCPeerConnection` 을 재사용해 예전 SDP 를 재발행할 뿐이라, 재접속한 게스트의 새 answer 를 적용하는 순간 `setRemoteDescription` 이 `InvalidStateError` 로 실패해(매번 조용히 실패) 호스트는 여전히 복구 불가 상태에 머무는 **새 회귀**를 발견 — Lobby 의 동일 분기는 handshake **이전**(`!hasGuestJoined`)에만 쓰여 전제가 다름을 확인. 게임 중 세션을 실제로 재구성하는 경로가 없는 현재 상태에서는 버튼을 잘못된 함수에 연결하는 대신 **호스트에게는 노출하지 않도록** 교정(guest 만 "재접속 시도" 노출, 호스트는 "방 나가기"만) — 호스트 mid-game 재핸드셰이크는 세션 재구성을 동반하는 별도 사이클로 분리(ROADMAP 신규 항목).
- [x] **"나가기" 시 DISCONNECT P2P 메시지 미전송으로 상대측 오버레이 지연 노출** (결과 화면 사이클에서 발견 후 이관된 항목) — `P2PMessage` 프로토콜에 `DISCONNECT` 타입과 수신 처리(`dispatchInbound` · `App.tsx` p2p_message 리스너)는 이미 존재했지만, 실제로 이를 전송하는 코드 경로가 전무해 상대는 heartbeat 타임아웃(`CONNECTION_LOSS_MS`=6.5s)이나 ICE 상태 변화로만 이탈을 간접 감지하고 있었음. `useRoom.ts` 에 로컬 이탈 전용 `leaveRoom()`(DC open 이면 DISCONNECT 전송 후 `teardown()`)을 신설하고 `App.tsx` 의 `onExit` 을 기존 `handleDisconnect`(teardown 만, 인바운드 DISCONNECT 수신 시 재사용됨) 에서 `leaveRoom` 으로 교체 — 두 함수를 분리한 이유는 `handleDisconnect` 가 인바운드 DISCONNECT 처리 시에도 호출되는데, 여기서 재전송까지 하면 상대에게 DISCONNECT 를 도로 쏘는 핑퐁이 발생(결과 화면 사이클의 GAME_START/GAME_RESET 핑퐁 버그와 동일 원칙으로 분리).
- [x] **데이터채널 예기치 못한 close 가 RECONNECTING 대신 WAITING 으로 분류돼 오버레이·카운트다운 미노출** — `useRoom.ts` 의 `dc.onclose` 핸들러(ICE `disconnected`/`failed` 핸들러 바로 옆에 위치)만 유독 `setConnectionStatus('WAITING')` 을 쓰고 있어, 상대측이 갑자기 끊겼을 때(명시적 나가기가 아닌 네트워크 단절) 재접속 오버레이·카운트다운이 뜨지 않고 다음 heartbeat 판정까지 조용히 대기하는 경로가 별도로 존재했음 — `rtc.ts` 의 `close()` 가 `dc.onclose` 를 null 처리 후 닫으므로 이 핸들러는 우리 쪽 명시적 teardown 이 아닌 "상대측 예기치 못한 단절"에만 반응한다는 점을 확인, ICE 핸들러와 동일한 RECONNECTING+countdown seed 패턴으로 통일.
- 위 3건 모두 `npm run lint`(tsc --noEmit)/`npm run build` 통과 확인 + 2-agent 독립 리뷰(1건 회귀 발견 → 수정 반영, 재검증 통과). 조사 과정에서 추가로 발견된 세 건(호스트 콜드 리스토어 role 미지원, App/게임 이중 오버레이 + `reconnecting` soft-copy 미배선, 호스트 mid-game 세션 재구성 부재)은 각각 세션 재구성·9개 게임 호출부 변경을 동반하는 별도 범위라 이번 슬라이스 밖으로 분리, ROADMAP 신규 항목으로 등록.
- "3분 window 가 tab 포그라운드 전환마다 무제한 리셋되는" 동작(`useRoom.ts` visibilitychange 핸들러)은 코드 주석상 의도된 완화(백그라운드 정지 대비)로 판단해 이번 사이클에서는 유지 — 변경 시 사용자 판단 필요한 UX 결정이라 파킹 후보.

### 2026-07-13 · 결과 화면 4버튼 flow 검증 (다시하기 · 대기방 · 다른 게임 · 나가기)
- [x] **GAME_START / GAME_RESET(LOBBY) 무한 P2P 핑퐁** — `useAppNavigation.ts`의 `startGame`/`returnToLobby`가 "P2P 전송 + 화면 전환"을 한 함수로 묶어놨는데, `App.tsx`의 인바운드 `p2p_message` 리스너가 상대에게서 받은 메시지를 처리할 때도 이 **동일 함수**를 호출하고 있었음 — 즉 메시지를 수신만 해도 무조건 상대에게 같은 메시지를 되쏘고, 상대도 수신 시 다시 되쏘길 반복해 데이터채널이 열려있는 한 무한 반복될 수 있었던 구조적 버그. 결과 화면의 "대기방"/"다른 게임" 버튼과 로비의 "시작" 버튼이 정확히 이 경로를 탐 → 로컬 클릭용(전송+전환)과 원격 수신 적용용(전환만) 함수를 분리(`applyRemoteGameStart`/`applyRemoteReturnToLobby` 신설), `App.tsx` 인바운드 핸들러가 후자만 사용하도록 교정. `useMatchRestart.ts`(다시하기 버튼)는 이미 이 패턴(수신 시 `applyMatchReset`만, 전송 함수는 별도)으로 올바르게 짜여 있었음 — 동일 원칙을 나머지 두 전환에도 적용.
- [x] **게스트가 "다시하기" 클릭 시 게스트만 빈 보드로 남는 데슁크** — `useMatchRestart.ts`의 공유 훅이 `onHostPostReset`(호스트가 새 시드를 상대에게 재전송)을 로컬 클릭 경로에서만 호출하고, 인바운드 RESTART 수신 시엔 호출하지 않았음. 호스트가 "다시하기"를 누르면 정상 동작하지만, **게스트**가 누르면: 게스트는 시드 없는 리셋을 보내고, 호스트는 수신 시 새 시드로 보드를 재계산하지만 이를 상대에게 재전송하지 않아 게스트만 영구히 빈/이전 보드에 머무름 (Wavelength/HiddenWord/BombHunt/Trumeon/Vinci/Mastermind/MemoryMatch/Escape 8개 게임 영향, `onHostPostReset` 사용). 인바운드 리스너에서도 `isHost` 이면 `onHostPostReset` 을 호출하도록 수정 — 공유 훅 한 곳만 고쳐 8개 게임 모두 적용. Quorimo/Ditrick 은 리셋이 완전 결정적(양측이 동일하게 재계산)이라 `onHostPostReset` 자체를 안 씀 — 무관.
- [x] **Escape 결과 화면 잔존 4번째 버튼** — 다른 8개 게임은 이미 "다른 게임" 버튼을 "대기방"과 동일 동작이라는 이유로 3버튼으로 통합했는데(`GameOverModal`/`BombHuntGameOver` 참조), Escape 전용 결과 화면(`EscapeGameOver.tsx`)만 교정 누락되어 여전히 동일 핸들러를 가리키는 중복 버튼 노출 중이었음 → 동일 패턴으로 제거, `onChooseOther` prop 은 기존 패턴과 동일하게 back-compat 용 옵셔널로 유지.
- 2-agent 독립 리뷰(정합성 · 정리정돈) 통과 — 버그 미발견.
- "나가기" 클릭 시 `DISCONNECT` P2P 메시지가 실제로는 한 번도 전송되지 않아(상대는 heartbeat 타임아웃으로만 이탈을 간접 감지) 재접속 오버레이가 즉시 아닌 지연 노출되는 점을 확인했으나, 이는 §최우선 다음 항목인 "재접속" 플로우 검증 범위로 분리(프로토콜/UX 설계 변경 포함이라 이번 슬라이스 밖).

### 2026-07-13 · GAME_PLAY 승패 판정 검증 (10 게임 전수 스윕)
- [x] **Wavelength — "다음 라운드" 버튼 양측 노출로 인한 stale-score 경쟁** — `reveal` 단계에서 두 플레이어 모두 `다음 라운드` 를 클릭할 수 있었는데, 출제자 쪽은 자신의 `WAVE_GUESS` 수신 시점엔 아직 `WAVE_SCORE`(별도 메시지)가 도착 전이라 stale `scores` 로 `nextRound()` 를 평가 — 승패 오판정 · `WAVE_NEXT`/`WAVE_WIN` 경쟁 발신 가능성 확인 → 버튼을 추측자(확정 직후 로컬에 최신 점수를 보유한 쪽) 전용으로 제한, 출제자 쪽엔 대기 힌트 노출. 추가로 `gameWinnerRef`(mirror-via-effect, 기존 `seedRef` 패턴과 동일)로 `nextRound()`/`WAVE_NEXT`/`WAVE_WIN` 핸들러에 승자-확정 후 가드 추가 — 결과 모달 노출 후 뒤늦게 도착하는 stale 메시지가 상태를 되돌리지 않도록 방어.
- [x] **Quorimo — 순수 리듀서에 승자 확정 가드 누락** — `applyMove`/`applyWall`(`board.ts`) 이 Trumeon 의 `playAction` 과 달리 `state.winner` 가드가 없어, 승부 확정 후 도착한 stale/중복 P2P 이동·벽 메시지가 수신측에서 `winner` 를 재계산해 덮어쓸 수 있었음 → 두 함수 모두 최상단에 조기 반환 가드 추가. 로컬 클릭은 이미 `canAct`(=`!winner`) 로 게이팅돼 있어 영향 없음 — UI 상 무반응 클릭이 아니라 순수 네트워크 stale 메시지에만 적용.
- [x] **BombHunt — 죽은 `finishMatch(winnerId)` (id 기반 승자 조회) 제거** — `useRoleParticipants.ts` 가 문서화한 과거 게스트측 승자/이름 스왑 버그의 정확한 재발 패턴이 호출 0건 상태로 방치돼 있던 footgun. 제거 과정에서 실제 버그도 함께 발견: `p2p_message` 리스너 `useEffect` 의 deps 배열이 (호출되지 않는) `finishMatch` 를 나열하고 실제로 호출하는 `finishMatchByRole` 은 누락돼 있던 exhaustive-deps 위반 → `finishMatchByRole` 로 교정.
- 2-agent 독립 리뷰(정합성 · 정리정돈) 통과 — 정리정돈 패스에서 신규 대기 힌트 CSS(`wave-reveal-waiting`)가 기존 미사용 `.wave-hint` 클래스와 중복 확인돼 재사용으로 교체.
- 나머지 6 게임(MemoryMatch/Trumeon/Vinci/Ditrick/HiddenWord/Mastermind)은 이전 감사에서 이미 하드닝된 패턴(role 기반 승자 판정 · turn-exclusive 게이팅 · cleanup 가드) 유지 중으로 이번 패스 클린. Escape 매치 타이머 host/guest 개별 클럭 기동으로 인한 만료 시점 미세 어긋남은 자체 수렴하는 저위험 관찰로 별도 코드 위생 항목으로 분리(브로드캐스트 동기화는 프로토콜 변경 범위). MemoryMatch 만 실제 시작 애니(2s 카드 프리뷰)를 갖는 점은 장르별 의도된 설계로 판단.

### 2026-07-13 · LOBBY (JOIN) flow 검증
- [x] **온라인 참가 `CONNECTING` 무한 대기** — `joinRoom` 이 online 참가 성공(`CONNECTED`) 또는 ICE 실패(`RECONNECTING`) 콜백에만 기대어 상태를 벗어났고, ICE 가 `checking` 에서 멈추는 케이스(제한적 NAT · iOS Safari 등)에 대한 클라이언트 측 상한이 전혀 없어 "보안 연결 설정 중" 스피너가 무기한 지속될 수 있었음 → 호스트측 `ANSWER_POLL_MAX_MS` 패턴과 동일하게 `JOIN_CONNECT_TIMEOUT_MS`(20s) 워치독 추가, 초과 시 에러 메시지와 함께 재시도 가능한 화면으로 복귀.
- [x] **참가 시도 중 이탈 시 레이스** — `joinRoom`/`ingestHostSignal` 진행 중("방 나가기" 등으로) `teardown()` 이 먼저 끝나면, 이미 시작된 이전 시도가 그대로 계속돼 이미 초기화된 화면에 stale `players`/`session` 을 덮어쓰거나, 심하면 이미 나간 방에 `submitAnswer` 를 POST 해 그 방의 유일한 게스트 슬롯을 헛되이 소비하는 문제 확인 → `connectAttemptRef` 세대 카운터로 각 시도를 식별, `teardown()` 이후 재개된 이전 시도의 이후 단계를 모두 무시(중간에 생성된 세션은 close)하도록 가드.
- [x] **`joinRoom`/`createRoom` 예외 처리 시 에러 메시지 무음 소실** — 두 함수 모두 catch 블록에서 `setError(msg)` 호출 직후 `teardown()` 을 호출했는데, `teardown()` 내부가 `setError(null)` 을 포함해 React 배치 업데이트상 마지막 호출이 이겨 에러가 항상 null 로 덮여씀 — 즉 예외 발생 시 사용자에게 실패 사유가 전혀 표시되지 않던 잠재 버그. `teardown()` → `setError(msg)` 순서로 교정.
- [x] **QR/링크 스캔 경로의 방 코드 미검증** — 수동 코드 입력은 `^\d{4}$` 검증을 거치지만, 초대 링크(`?room=`)에서 추출한 값은 검증 없이 곧바로 `joinRoom` 에 전달돼 손상된 QR/링크가 불필요한 전체 접속 왕복을 유발하던 문제 → 동일한 패턴으로 검증 후 실패 시 즉시 명확한 에러.
- 근접 목록 폴링·GPS 매칭·거리 필터(`NEARBY_RADIUS_M`) 로직 자체는 코드 리딩으로 정상 동작 확인. iOS Safari 에서 ICE `checking` 이 실제로 얼마나 오래 정체되는지는 실기기 필요 항목으로 파킹.

### 2026-07-13 · LOBBY (CREATE) flow 검증
- [x] 참가자 슬롯 placeholder — `!hasGuestJoined && !showOfflineHostQr` 조건 중 `!showOfflineHostQr` 가 항상 거짓(오프라인 QR 은 방 생성과 거의 동시에 항상 생성됨)이라 "상대가 QR 스캔 or 링크로 참가할 때까지 대기해요" 문구가 사실상 노출되지 않던 문제 → 조건에서 제거.
- [x] "재연결 시도"/"방 재발행" 버튼이 `connectionStatus !== 'CONNECTED'` 로만 게이팅돼 정상 대기 상태(호스트가 첫 참가자를 기다리는 WAITING · 오프라인 게스트가 호스트의 QR 스캔을 기다리는 WAITING)에서도 즉시 노출되던 문제. 특히 오프라인 게스트가 핸드셰이크 도중 이 버튼을 누르면 `joinRoom()` 이 기존 세션을 teardown 한 뒤 온라인 시그널링 부재로 실패해 진행 중이던 정상 연결을 스스로 끊어버리는 self-sabotage 케이스 확인 → 실제 재연결이 필요한 `RECONNECTING` 상태에서만 노출하도록 조건 축소.
- [x] `useRoom.ts` 의 `gameSettings` 초기값이 레지스트리에서 제거된 `'tictactoe'` 를 참조 — 현재는 `App.tsx` 가 방 생성 직전 항상 덮어써서 가려져 있지만, 향후 이를 거치지 않는 진입 경로(세션 복원 등)에 대비해 유효한 기본값(`'memory'`)으로 교체.
- [x] `toggleReady` 의 `useCallback` deps 에 `enqueueOut` 누락 (exhaustive-deps 위반) — 추가.
- 검토 결과 QR 노출 타이밍 · 옵션 동기화(host-only write, guest mirror) · 시작 버튼 게이팅 로직 자체는 정상. 오프라인 호스트의 5분 대기만료 타이머가 시그널링 유무와 무관하게 항상 작동하는 점은 코드상 의도적 설계로 보여 이번 사이클에서는 유지(변경 시 사용자 판단 필요).

### 2026-07-13 · 재접속 오버레이 이원화 해소
- [x] `GameConnectionOverlay` 가 RECONNECTING 동안 App 레벨 `.reconnect-popup-overlay` 와 동시에 풀스크린으로 마운트되던 중복 제거 — App.tsx 가 이미 계산해 둔 `connectionStatus === 'RECONNECTING'` 을 `reconnecting` prop 으로 10개 게임 전부에 실제로 전달, `GameConnectionOverlay` 는 `isOpponentOnline || reconnecting` 이면 렌더 안 함(App 레벨이 role-aware retry 를 전담). RECONNECTING 중 뒤에 숨어있던 포커스 가능한 하드-리로드 버튼(키보드/스크린리더 포커스 순서로 도달 시 진행상황 파괴 가능한 a11y 트랩)도 함께 제거. 이전엔 `reconnecting` prop 이 죽은 코드였음(soft-copy 분기 도달 불가) — ERROR 등 RECONNECTING 이 아닌 잔여 오프라인 케이스는 기존 하드 리로드 폴백 그대로 유지.

### 2026-07-13 · HOME flow 검증
- [x] HOME 드로어 닫기 버튼 — `<span onClick>` → `<button>` 전환 (키보드/스크린리더 접근 불가 상태였음).
- [x] HOME LIBRARY 독 핸들 — `role="button"` 인데 keydown 미대응 → Enter/Space 로도 드로어 오픈 가능하도록 보강.
- [x] 드로어 검색/장르 필터 — 닫을 때(X · 항목 선택) 리셋 누락 → 재오픈 시 이전 필터가 남아 게임이 "사라진 것처럼" 보이던 문제 해소.
- [x] `.bottom-drawer` z-index 인라인 `100` → 기존 `--z-drawer`(800) 토큰 사용 (V1 하드코드 잔재).
- 검토 결과 방 만들기·규칙 보기·슬라이더 flow 자체는 정상. HOME 뒤로가기의 popstate 미등록은 버그가 아니라 의도된 결정(`useAppNavigation.ts` 주석: 사용자 요청으로 종료 confirm 제거) — 유지.

### 2026-07-13 · SPLASH flow 검증
- [x] SPLASH fadeout flicker — `Splash.tsx` FADE_MS(400ms) 와 `index.css` transition(0.8s) 불일치로 페이드 중간(50%)에 DOM unmount → HOME 진입 시 flicker. CSS duration 을 FADE_MS 소스로 인라인 지정해 단일 소스화.

### 2026-07-10 · 감사 라운드 · PR#25
- [x] 3 fork 감사 (전 게임 · 동작 · 룰 · 디자인 축)
- [x] PR#1 룰/race 6건 (bombhunt rule engine · escape offline drop · ditrick 3건 · hiddenword setTimeout)
- [x] PR#2 V1 하드코드 hex/rgba → 시맨틱 토큰 (~60 매핑 · tokens.css 확장 · palette.ts mirror)
- [x] PR#3 useEffect deps (3 게임 ref 패턴) · setTimeout cleanup · dead code · doc 스탈
- [x] 자율 사이클 skill 3종 (cowork/review-bot/work) 등록 · cloud routine 2종 (minidamo-agentic · minidamo code-reviewer)
- [x] README/TODO 실제 프로젝트 반영해 재작성 (Vite 보일러플레이트 정리)

### 이전 사이클
- [x] 신규 4종 라이브 (Quorimo/Vinci/Ditrick/Trumeon)
- [x] 3게임 제거 (TicTacToe/PingPong/Runner) + 공통 코드 정리
- [x] 하드코딩 hex → design token 일괄 치환 (`game-common.css` 신설)
- [x] Legacy 명명 (NYANGHO → MASTERMIND, NYANGWAVE → WAVELENGTH)
- [x] hostRestartRoute 12게임 일괄 제거 · 다시하기 즉시 · onLobby 별도
- [x] Escape 다시하기 게스트 blank canvas 해소 + MAZE_SEED 원자 교체
- [x] Escape 타이머 상단 이동 · MinimapKey 힌트
- [x] BombHunt rule engine · exclusion ALL 전용 · parity/distance 신규 규칙
- [x] Vinci 조커 위치 선택 다이얼로그
- [x] HOME 종료 confirm 제거 (브라우저/PWA 특성상 강제 종료 불가)
- [x] 4종 가이드 대폭 확장
