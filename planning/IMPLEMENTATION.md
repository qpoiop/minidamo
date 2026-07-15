# minidamo 구현 상태 · 최신화 (2026-07-15)

> 각 게임 · 공통 컴포넌트의 현재 구현 상태 실측 기반 정리. `src/games/registry.tsx` 및 실제 소스와 대조.
> 2026-07-08판 대비 게임 로스터 전면 교체(우다다/냥탈출-구/모순/틱택토/브레이커/미니탁구 → 현재 10종) 및 최근 리팩터(§0, §1-escape, 공통 컴포넌트) 반영.

---

## 0. 방 · 로비 · P2P

### 방코드 = roomId (게임 무관)

- **4자리 숫자 roomId** — 게임 종류 안 박힘
- Guest가 아무 코드 입력 → 해당 방의 offer 수신 → 초기 gameId 세팅
- Host가 대기방에서 게임 바꿔도 `LOBBY_STATE` 브로드캐스트로 자동 sync
- QR 스캔 · 4자리 코드 직접 입력이 항상 노출되는 대안 입장 경로 (GPS 20m 반경 매칭의 보조 수단, 자동 폴백 아님)

### 시그널링 파이프

- **Cloudflare Worker** (`worker/`, KV+D1) — `/room /rooms /join /answer /turn-credentials` 라우트. 프론트엔드(Cloudflare Pages)와 완전히 분리 배포.
- **GPS 매칭**: Worker `GET /rooms`는 원본 좌표를 그대로 반환 — 하버사인 20m 반경 필터링은 **클라이언트**(`useRoom.ts`의 `searchNearbyRooms`)가 수행.
- **STUN**: `stun.l.google.com:19302` + 백업.
- **TURN**: Cloudflare Realtime 자격증명(`/turn-credentials`, `buildIceConfigWithTurn()`)을 발급받아 병합, 실패 시 정적 STUN/오픈릴레이 폴백 풀로 대체 (`planning/TURN_SETUP.md` 상호 참조).
- **P2P**: PeerJS 없음 — 순수 `RTCPeerConnection` 래퍼(`src/services/rtc.ts`) + 자체 시그널링 클라이언트(`src/services/signaling.ts`).
- **연결 상수** (`src/hooks/useRoom.ts`):
  - `ANSWER_POLL_INTERVAL_MS = 3000` / `ANSWER_POLL_MAX_MS = 300000` (호스트 answer 대기)
  - `HEARTBEAT_INTERVAL_MS = 2000`
  - `CONNECTION_LOSS_MS = 6500`
  - `JOIN_CONNECT_TIMEOUT_MS = 20000`
  - `RECONNECT_WINDOW_S = 180` (3분)
  - `NEARBY_RADIUS_M = 20`
- **재접속 트리거**: GPS/RTT 임계값이 아니라 ICE 상태(`disconnected`/`failed`) · DataChannel close · 하트비트 무응답. `distance`/`rtt` state는 계산되지만 소비하는 UI 없음(죽은 값).
- **`P2PMessage`** (9종 타입 유니온): `LOBBY_STATE | GAME_START | GAME_ACTION | GAME_RESET | HEARTBEAT | HEARTBEAT_ACK | GPS_UPDATE | DISCONNECT | CHAT` + `senderId`/`timestamp`/optional `payload`. 신규 4종 게임(쿼리모/모빈치/모디언트릭/모루먼쇼)은 `GAME_ACTION`의 `payload.gameData: unknown` 자유 필드로 라우팅, 구게임 잔재 필드(`cellIdx`/`symbol`/`ballX`/`ballY`/`hostScore`/`guestScore`)는 옵셔널 사장(死藏) 필드로 타입에만 남음.
- **호스트 콜드 리스토어**: `useAppNavigation.ts`의 `acceptRestore`가 `restorePrompt.isHost`로 분기해 `restoreHostRoom`/`joinRoom`을 정확히 호출(과거엔 항상 guest 경로 호출 결함 — 2026-07-14 해소). 저장된 `screen`(예: GAME_PLAY)은 의도적으로 무시하고 항상 LOBBY로 복원 — 어떤 게임도 도메인 상태를 콜드 리로드 너머로 들고 있지 않기 때문.

### DiagPanel · DiagDrawer

- 헤더 옆 시계 아이콘 (모든 게임 · 로비 공통)
- Bottom-sheet 팝업: 상태 3-tile grid (상태·ICE·DC) + ICE 후보 4-tile grid (host/srflx/prflx/relay) + 스크롤 로그 리스트
- ICE `failed/disconnected` 시 헤더 아이콘 빨강 border + `!` 뱃지

---

## 1. 게임별 구현 (10종, `src/games/registry.tsx`)

### 1a. 메모리 매치 (memory)

- 8쌍 카드, 결정론적 seed 보드 공유, 매치 성공 시 한 번 더
- matchOptions2: 단판/3라운드(2선승)/5라운드(3선승)
- P2P: `BOARD_HELLO`, `BOARD_SEED`, `FLIP`, `MEMORY_NEXT_ROUND`

### 1b. 룰셋 판도라 (bombhunt)

- N×N(3/4/5) 그리드, 턴제 카드 뒤집기/턴 넘기기/폭탄 지목
- 관계형/조건형/소거형/배제형 4종 규칙으로 힌트 좁히기
- P2P: `BOMBHUNT_HELLO`, `BOMBHUNT_SEED`, `BOMBHUNT_FLIP`, `BOMBHUNT_PASS`, `BOMBHUNT_BOMB_GUESS`, `BOMBHUNT_SCORE_SYNC`
- `RuleRevealModal`/`BombHuntConfirm`(2-step 확인)/전용 `BombHuntGameOver` · 자체 `.bombhunt-turn-toast`(공용 토스트와 별개로 유지 — 2026-07-15 감사 결과 안전)

### 1c. 코드 심볼 (mastermind)

- 4칸 숨은 기호 암호, 정확/포함 피드백 페그로 추리
- matchOptions: 훔쳐보기(1/2/3회) × 교란(1/2/3회)
- P2P (내부 코드네임 `NYANG` 잔존): `NYANG_HELLO`, `NYANG_SEED`, `NYANG_PEEK`, `NYANG_DISRUPT`, `NYANG_PROGRESS`, `NYANG_WIN`

### 1d. 협동 미로 (escape · 실시간)

- 원형 시야 + 안개 시스템, 조이스틱 이동, 열쇠 획득 → 출구 공개 3단계 게이팅
- 시야/속도 스택형 아이템, 몬스터 스턴
- P2P: `MAZE_HELLO`, `MAZE_SEED`, `MAZE_POS`, `MAZE_KEY`, `MAZE_DROP`, `MAZE_MON`, `MAZE_WIN`, `MAZE_ESCAPED`, `MAZE_TIMEOUT`(2026-07-15 신규 — host/guest 만료 판정 편차 해소, 먼저 감지한 쪽이 브로드캐스트), `MAZE_NOOP`
- **파일 분해** (2026-07-15, 1219줄 → 3계층): `Escape.tsx`(748줄, React 훅/입력/JSX) + `escapeEngine.ts`(293줄, 순수 로직 — 미로 생성/엔티티 이동/상수) + `escapeRenderer.tsx`(207줄, 캔버스 render + 미니맵 SVG, `playerDirRef`는 모듈 비공개)
- 결과 화면: 전용 `EscapeGameOver`, 커스텀 `DragJoystick`

### 1e. 모레파시 (wavelength)

- 매 라운드 출제자/추측자 역할 교대, 출제자는 숨은 목표 지점을 한 줄 단서로 설명, 추측자는 다이얼로 근접 추측
- matchOptions × matchOptions2 (첫 2축 옵션 게임): 오차 허용(±1/±2/±4/±6) × 승리 점수(3/5/7)
- P2P: `WAVE_HELLO`, `WAVE_SEED`, `WAVE_CLUE`, `WAVE_GUESS`, `WAVE_RECLUE`, `WAVE_SCORE`, `WAVE_NEXT`, `WAVE_WIN`

### 1f. 모드네임 (hiddenword)

- 협동형 코드네임 류 — 출제자가 정답/함정/일반 카드를 보고 단서 제시, 추측자가 카드 지목(함정 지목 시 즉시 공동 실패)
- matchOptions: 보드 크기(3×3/4×4/5×5) × 목표 점수(1/3/5 정답)
- P2P: `HW_HELLO`, `HW_SEED`, `HW_CLUE`, `HW_PICK`, `HW_NEXT_ROUND`
- "기록" 버튼 — 라운드별 단서/지목 히스토리(결과별 색상 배지)

### 1g. 쿼리모 (quorimo)

- Quoridor류 — 매 턴 이동 또는 벽 배치(BFS로 완전 차단 벽 클라이언트 검증), 인접 상대 점프
- matchOptions: 7×7(빠른 판)/9×9(기본)
- P2P: `QM_INIT`, `QM_MOVE`, `QM_WALL`
- 이동/벽 세우기 모드 토글, 벽 슬롯 하이라이트(라임=유효/빨강=무효), 20px 터치 슬롯 튜닝

### 1h. 모빈치코드 (vinci)

- 26타일(흑백 0-11 + 조커 2) 오름차순 숨은 순서 추리, 뽑기→선언 루프
- 정답 추리 시 상대 타일 공개(계속 진행 가능), 오답 시 자신이 뽑은 타일 공개
- P2P: `VC_HELLO`, `VC_INIT`, `VC_DRAW`, `VC_GUESS`, `VC_STOP`
- 조커 위치 선택 모달(정답 후 조커에서 멈췄을 때만), 0-11+조커 숫자 키패드

### 1i. 모디언트릭 (ditrick)

- 인디언 포커류 — 자신 카드는 못 보고 상대 카드만 보임, 앤티+순차 베팅(체크/콜/레이즈/폴드)
- matchOptions: 판 수(9/15/21) × 시작 칩(20/30/50)
- P2P: `DT_DEAL`, `DT_BET` (규칙/덱 모듈 분리 없이 `Ditrick.tsx`에 인라인)
- 레이즈 5회 상한 시 강제 쇼다운, tie 팟은 라운드를 마감한 쪽(또는 강제 쇼다운 패자)에게 홀수 칩 분배

### 1j. 모루먼쇼 (trumeon)

- 40장 Briscola 파생 트릭테이킹, 3장 핸드, 덱 마지막 카드로 으뜸패 결정
- 랭크 순서 A>3>K>Q>J>7>6>5>4>2(숫자순 아님), 덱 소진 후 무늬 강제 국면
- matchOptions: 승점 기준(41/61/81)
- P2P: `TM_HELLO`, `TM_INIT`, `TM_PLAY`
- 점수 카드 A=11/3=10/K=4/Q=3/J=2, 으뜸패 칩 상시 노출

---

## 2. 공통 컴포넌트

두 디렉터리로 분리 — 앱 레벨 vs 게임 공유:

### `src/components/common/` (앱 레벨)

- **PWAPrompt** — `beforeinstallprompt` 기반 설치 카드(+iOS Safari 수동 안내) · 업데이트 카드 · 오프라인 준비 완료 토스트
- **GameConnectionOverlay** — App 레벨 `.reconnect-popup-overlay`(App.tsx, RECONNECTING 동안 노출)와 역할 분담: `reconnecting`이 회복 없이 해제된 이후에만 노출되는 잔여 오프라인 케이스 전용 fallback (2026-07-13 중복 마운트 해소)
- **DiagButton/DiagPanel** — 연결 진단 drawer/패널
- **GameOverModal** — 공용 결과 모달, **RoundBanner** — 라운드 전환 배너, **QrScanner**, **GameCard**, **GameParticipants**, **LibraryThumb**, **OfflineBanner**, **ConfirmModal**, **Splash**

### `src/features/games/common/` (게임 공유)

- **GameHeader** — Chip 3개(code·인원·rule tag) + ChatButton/DiagButton/LogButton(옵션)/HelpButton
- **GameTurnStrip** — `isMyTurn` accent-primary pulse, 상대 턴 idle variant
- **GameGuideModal** + **RegistryGuide** — 각 게임 `registry.tsx`의 `guide`(oneLine/sections/steps/warning) 데이터 기반 렌더, 인게임 룰 카피의 단일 소스
- **TurnTransitionToast** — 전 게임 공유 턴 전환 토스트 (BombHunt만 자체 `.bombhunt-turn-toast` 병행 유지)
- **GamePlayerHud**, **useRoleParticipants**, **useGameConfirm**, **confirmCopy**, **useMatchRestart** — 지원 훅/HUD
- **CanvasStage** — 범용 캔버스 래퍼, 현재 미사용
- **sprites/spriteSheets** — Escape 스프라이트 자산

### 채팅 (`src/chat/`, common과 별도 모듈)

- **ChatDrawer** — bottom sheet + 반투명 blur, 68dvh, 발신자 색상(senderId hash → 6색 팔레트) + 퀵리플라이 칩
- **ChatProvider**, **ChatButton**

### 오버레이 계층 (z-index)

- `--z-game-modal = 8000` — 가이드 · 규칙 · 채팅 · 진단 · 라운드 전환 · 각 게임 confirm 모달
- `--z-game-over = 10000` — 결과 화면

---

## 3. 테스트 모드

- URL `?test=1&game=<id>` 진입 (`src/features/test/TestMode.tsx`)
- 헤더 로고 옆 `테스트모드` 버튼, 역할 토글(host/guest) — 동일 인메모리 상태 공유, `sendMessage` no-op
- matchOption/matchOption2 선택 드롭다운(변경 시 게임 컴포넌트 remount, `myRole`은 key에서 제외해 역할 토글이 보드 상태를 지우지 않음)
- `soloMode` prop — P2P 핸드셰이크(HELLO) 의존 게임(memory/mastermind/bombhunt 등)이 상대 없이 자가 시드하도록 신호
- ChatDrawer / DiagDrawer 활성 (echo bot 응답)

---

## 4. 팔레트 · 하드코딩 정책

### CSS 토큰 (`src/styles/tokens.css`)

- 기존: `--bg-*`, `--fg-*`, `--accent-*`, `--border-*`, `--shadow-*`, `--radius-*`, `--space-*`, `--anim-*`, 타이포(`--font-*`/`--fs-*`), 게임 공용 accent(`--game-color-r/g/b/y/bomb/safe/all/me`)
- 신규 4종 게임(쿼리모/모빈치/모디언트릭/모루먼쇼) 전용 토큰 블록 추가: `--game-gold(-dark/-text/-bg)`, `--game-cream(-light)`, `--game-purple(-light)`, `--game-red-pink/-deep/-darkest`, `--game-pink-light`, `--game-teal(-dark)`, `--game-blue`, `--game-black(-outline)`, `--fg-placeholder`, `--btn-disabled-bg/fg`, `--piece-shadow-lime/red`
- 현재 실사용 테마는 `[data-theme='arcade']`뿐 (light/mono는 스캐폴딩 — 파킹 항목)

### JS/Canvas 팔레트 (`src/styles/palette.ts`)

- `PALETTE` — CSS 토큰의 mirror, 변경 시 수동 동기 필요(헤더 코멘트에 명시)
- Escape 전용 캔버스 전용 블록(CSS 변수 없이 canvas draw에만 쓰임): `mazeTileFogHigh/Low`, `mazeWallHigh/Low`, `mazeSeenPath`, `mazeUnknownPath`, `mazeVoid`, `stunFlash`, `winFade`, `keyPip`, `exitMagenta`

### 잔여 하드코딩 (의도적)

- `src/features/games/common/sprites.ts` — 픽셀 스프라이트 팔레트 (spec verbatim)
- `src/components/common/LibraryThumb.tsx` — 게임별 미니 썸네일 (그래픽 자산)
- `src/features/lobby/parts/QrZoomModal.tsx` — QR 흑백 (기술 요구)
- `src/chat/ChatDrawer.tsx` — `SENDER_PALETTE` 채팅 이름 색 6종

---

## 5. 서비스 워커 · CI/CD

- `src/sw.ts` — Workbox `injectManifest` 기반. 모듈 최상단에서 `precacheAndRoute(self.__WB_MANIFEST)` + `cleanupOutdatedCaches()` 호출(2026-07-15, 과거 `activate` 핸들러 내 하드코딩 캐시명 정리 로직 교체). `activate`는 `clients.claim()`만 수행. `message`(`SKIP_WAITING`)/`push`/`notificationclick` 리스너 존재하나, 저장소 전체에 `PushManager.subscribe`/권한 요청 UI가 없어 푸시는 수신 경로만 있고 발신 경로 미연동.
- `.github/workflows/deploy.yml` — `production` push 트리거 → `npm run lint`(tsc --noEmit) + `npm run build` → Cloudflare Pages 배포. Worker(`worker/`)는 별도 `wrangler deploy` 수동 배포로 이 워크플로에 미포함.

---

## 6. 남은 개선점

- [ ] Ditrick — 별도 `rules.ts`/`deck.ts` 분리 없이 로직이 `Ditrick.tsx`에 인라인 (다른 게임과 구조 불일치, 리팩터 후보)
- [ ] `CanvasStage.tsx` 미사용 상태 — 제거 또는 실제 채택 여부 결정 필요
- [ ] `P2PMessage` payload의 구게임 잔재 필드(`cellIdx`/`symbol`/`ballX`/`ballY`/`hostScore`/`guestScore`) 정리 여부 검토
- [ ] `mastermind` 내부 메시지 타입 접두사가 `NYANG_*`(구 코드네임) — 표시 타이틀(코드 심볼)과 불일치, 리네이밍 여부는 스코프 밖 결정 필요
- [ ] TURN 서버 자체 운영 검토 (Cloudflare Realtime 크레딧/오픈릴레이 폴백 의존성 최소화, `planning/TURN_SETUP.md` 참조)
- [ ] `tokens.css` 라이트/mono 테마 완성도 (현재 arcade only 실사용 — 파킹)
