# minidamo 구현 상태 · 최신화 (2026-07-08)

> 각 게임 · 공통 컴포넌트의 현재 구현 상태 실측 기반 정리. Spec (planning/design/*.dc.html)과 대조.

---

## 0. 방 · 로비 · P2P

### 방코드 = roomId (게임 무관)

- **4자리 숫자 roomId** — 게임 종류 안 박힘
- Guest가 아무 코드 입력 → 해당 방의 offer 수신 → 초기 gameId 세팅
- Host가 대기방에서 게임 바꿔도 `LOBBY_STATE` 브로드캐스트로 자동 sync
- Guest READY 상태: 게임 변경 시 자동 리셋 (Match-option 변경은 유지)

### 시그널링 파이프

- **Cloudflare Workers + KV/D1** — 커스텀 signaling
- **STUN**: `stun.l.google.com:19302` + 백업 3개
- **TURN**: `openrelay.metered.ca` (fallback · CGNAT용)
- **ICE 튜닝**:
  - `ICE_GATHER_TIMEOUT_MS = 8000`
  - `ICE_EARLY_CANDIDATES = 3`
  - `ICE_EARLY_PUBLISH_MS = 5000`

### DiagPanel · DiagDrawer

- 헤더 옆 시계 아이콘 (모든 게임 · 로비 공통)
- Bottom-sheet 팝업: 상태 3-tile grid (상태·ICE·DC) + ICE 후보 4-tile grid (host/srflx/prflx/relay) + 스크롤 로그 리스트
- ICE `failed/disconnected` 시 헤더 아이콘 빨강 border + `!` 뱃지

---

## 1. 게임별 구현

### 1a. 우다다 대시 (Wudada · 크래시 관전 · 500m 마일스톤)

- **5레인** 러너 · L/R 버튼
- **3모드** (registry `matchOptions`):
  - `1` 서바이벌 — 1충돌 종료 · 거리 승부
  - `2` 타임어택 — 60s + 충돌 시 1.5s 페널티 누적 (400ms 무적)
  - `3` 스프린트 — 1200m 선착
- P2P: `RUN_TICK` (거리 미러), `RUN_CRASH` (종료 신호), `GAME_RESET` (리매치)
- Turn strip 표시:
  - 서바이벌 `Nm`
  - 타임어택 `Ss · Nm`
  - 스프린트 `N / 1200m`
- **크래시 관전 오버레이** (`WudadaCrashOverlay`)
  - 모달: `CRASH!` + `이번 판 기록 Nm` + 상대 라이브 거리 + `관전하기` 버튼
  - `관전하기` 탭 → 우상단 pill로 축소. 상대 거리 실시간 표시
  - 상대도 크래시 → 버튼 `결과 대기 중…` (disabled) · `WudadaGameOver` 인계
- **500m 마일스톤**: 매 500m 시점에 `speed += 0.55`, `spawnFloor -= 40ms` (하한 260ms), `fg-accent` 스파크 발화. 상한: `speed 7.5`, `spawnFloor 260ms`
- **아이템 효과 (거리 기여)**:
  - `fish` = 2.1s 무적 (점수 X)
  - `yarn` = +8m 거리 보너스
- 결과 화면: `WudadaGameOver` — 트로피 + `YOU WIN/LOSE/DRAW` + 거리 rows + `다시하기` primary + `대기방/다른 게임/나가기` trio

### 1b. 냥탈출 (Escape · 규칙 개정 2026-07-08)

- 미로 · **3-col × 2-row D-pad** (SVG 화살표)
- 시야 · 안개 시스템:
  - 원형 반경 2칸 밝음
  - 지나온 길 반투명 (fog)
  - 미탐사 완전 암흑
  - 시야 아이템 15s 확장
- 이벤트 토스트 (1.8s auto-dismiss + 색·SVG):
  - `key` gold — 열쇠 획득
  - `vision` cyan — 시야 확장
  - `meet` lime — 친구 만남
  - `stun` bomb-red — 몬스터 접촉 (+`navigator.vibrate(120)`)
- 몬스터 슬로우:
  - Wander cadence dt × 0.35
  - Move lerp 0.09
  - 방향 dwell 800-2400ms
- **팀 탈출 규칙**: 두 사람이 각자 출구 밟아야 팀 승리. 먼저 나온 쪽 → `myEscaped=true`, 캐릭터 숨김, 조작 잠금, 카메라 상대 팔로우. `MAZE_ESCAPED` 브로드캐스트로 상대에게 알림
- **결과 액션**: `다시하기` primary + `대기방/다른 게임/나가기` secondary trio (모든 게임과 일관)
- **30초 카운트다운**: 남은 시간 ≤30s → 화면 중앙 큰 타이머 pulse + 미니맵에 **출구 자홍색 별** 공개
- **아이템 드랍**: 초기 4개 (vision 2 · speed 2) + 15초마다 host 권위 랜덤 드랍 (`MAZE_DROP` 브로드캐스트)
- **미니맵**: 좌측 상단 원형. 라임 border · 라임 pip. 30초 이내에 출구 자홍색 별 추가 표시
- **조이스틱**: 우측 하단. 라임 double border + 4방향 arrow 인디케이터. 나는 라임 gradient nub. 터치 앵커 = 손가락 착지점 (드래그 필요)
- P2P: `MAZE_SEED`, `MAZE_POS`, `MAZE_MON` (host 권위), `MAZE_KEY`, `MAZE_DROP`, `MAZE_ESCAPED`, `MAZE_WIN`
- 결과 화면: `EscapeGameOver` — check/× 배지 + `ESCAPE!/TIME OUT` + 소요 시간 metric + 팀 협동 note

### 1c. 코드네임 · 모순 (Mosun)

- 3×3 카드 · 폭탄 1 · 전체힌트 3 · 개인힌트 3 · 일반 2
- **패자 선공** (loser-starts)
- 결정론적 seed 기반 board (`generatePlacements`)
- **역할 boolean** (`turnIsHost`) — peerId 스왑 이슈 방지
- 액션 3택:
  - 뒤집기 (grid SVG)
  - 턴 넘기기 (skip SVG · 게임당 1회)
  - 폭탄 찾기 → **2-step confirm** (`MosunBombConfirm`)
- 규칙 4종류 (`enumerateRelation/Conditional/Elimination/Exclusion`):
  - 관계형 (인접 · 방향 · 같은 줄·열)
  - 조건형 (region 지시)
  - 소거형 (특정 칸 배제)
  - 배제형 (region 배제 · 판당 1)
- **방향 문구**: `바로 오른칸/왼칸/윗칸/아랫칸` (오독 방지)
- **≥2 floor**: MIN_REMAINING 비협상 · 붕괴 시 넌센스 placeholder
- Placeholder 라인 (deterministic pick):
  ```
  무난이는 항상 무난하다.
  바나나는 노란색이다.
  동그란 세모는 실존한다.
  밤은 밤에 온다.
  폭탄은 남은 카드 중에 있다.
  ```
  + `(더 이상 좁힐 규칙이 없어요.)`
- Rule reveal UI:
  - Owner ALL/ME 또는 exclusion → **full-screen overlay** (conic 방사 + 큰 카드 그래픽 + 규칙 박스 + helper)
  - Opponent private ME → **top toast** (accent-secondary + 이름 + `개인규칙을 획득했어요`)
- 턴 넘기기 toast + rulesLog 자동 기록
- 결과 화면: `MosunGameOver`
  - `lose-bomb` — 빨간 conic + BOOM + 큰 폭탄 카드 + `폭탄을 열었어요…` + narrative
  - `win/lose-guess/win-opp-bomb` — 트로피 + `YOU WIN!/LOSE` + winner name + **narrative 문구** + 폭탄 위치 mini 3×3 board
  - narrative:
    - win-guess → `N번 카드가 폭탄이었어요. 정확히 짚었어요.`
    - win-opp-bomb → `{loser}가 N번 카드(폭탄)를 뒤집었어요.`
    - lose-bomb → `N번 카드가 폭탄이었어요. 규칙을 더 캐서 좁혔어야 했어요.`
    - lose-guess → `{winner}가 N번 카드(폭탄)를 정확히 짚었어요.`
- P2P: `MOSUN_HELLO`, `MOSUN_SEED`, `MOSUN_FLIP`, `MOSUN_PASS`, `MOSUN_BOMB_GUESS`, `GAME_RESET`

### 1d. 틱택토 (TicTacToe)

- 3×3 · O/X · 3판 2선승 / 5판 3선승 (matchOption)
- 승리 라인 metallic-line 애니
- **RoundBanner** — 라운드 전환 (spec §라운드 전환 셔플 스타일)
- 결과 화면: 공용 `GameOverModal`

### 1e. 컬러 브레이커 (Breaker)

- 4색 버튼 · 마스터 룰 추리
- 시도 10회 제한
- 결과 화면: 공용 `GameOverModal`

### 1f. 메모리 매치 (Memory)

- 8쌍 카드
- 카드 뒤집기 · 짝 맞추기
- 결과 화면: 공용 `GameOverModal`

### 1g. 미니 탁구 (PingPong · 랠리 가속)

- 실시간 · 호스트 권위 물리
- 선제 3/5/7점 (matchOption)
- **랠리 속도 가속**: 패들 반사마다 `speed *= 1.055`. 상한 `MAX_SPEED = 7.5`
- **랠리 카운터**: `rallyRef` — 헤더 스코어에 `· 랠리 N` 표시. 득점 시 0 리셋
- 결과 화면: 공용 `GameOverModal`

---

## 2. 공통 컴포넌트

### 오버레이 계층 (z-index)

- `--z-game-modal = 8000` — 가이드 · 규칙 · 채팅 · 진단 · 라운드 전환 · Mosun bomb confirm
- `--z-game-over = 10000` — 결과 화면

### RoundBanner

- **full-screen 레이어**
- Props: `round`, `totalRounds?`, `previousWinnerName?`, `subline?`, `headline?`, `visual`, `onDismiss?`, `autoDismissMs?`
- `visual='shuffle'` — 3장 카드 셔플 애니 (Mosun용)
- `visual='simple'` — 텍스트만 (TicTacToe 등)
- 자동 dismiss `autoDismissMs = 2600` (기본)

### GameGuideModal

- **full-screen 레이어** + scanline `::before`
- 구조:
  - 헤더 (책 SVG + 제목 + X)
  - ONE LINE hero card (accent-primary bg + Press-Start-2P eyebrow)
  - Structured sections (`rows` / `sprites` / `badges` kinds)
  - Legacy step list
  - Warning card (accent 또는 bomb border)
- Registry driven (`guide.oneLine/sections/steps/warning`)

### ChatDrawer

- **bottom sheet + 반투명 + backdrop-filter blur** (spec §채팅 · 게임 중 상시)
- 68dvh · 밑에서 위로 슬라이드
- Header: chat SVG + 인원 chip + X
- Message rows:
  - Peer: 이름 colored (deterministic senderId hash → 6색 팔레트) + `bg-inset` 어두운 chip
  - Own: 우측 정렬 · `accent-primary` lime + hard shadow · 이름 미표시
- Quick-reply chips: `가자!` · `한 판 더` · `gg` · `ㅋㅋ` · `아깝다` · `잘가`
- Send: paper-plane SVG accent tile

### GameHeader

- Chip 3개 (code · 인원 · rule tag)
- Actions: **ChatButton** · **DiagButton** · **LogButton (optional · 규칙 히스토리 두루마리 SVG)** · **HelpButton (?)**
- Log과 Diag 아이콘 구분 (두루마리 vs 시계)

### GameTurnStrip

- `isMyTurn` prop: **accent-primary lime bg + pulse box-shadow + ▶ chevron 깜빡**
- 상대 턴: `idle` variant (dim)

### LibraryThumb

- ThumbKind별 30px 인라인 SVG (게임별 하나씩)
- `placeholder`는 artText fallback

---

## 3. 테스트 모드

- URL `?test=1&game=<id>` 진입
- 헤더 로고 옆 `테스트모드` 버튼
- 역할 토글 (방장 · 참가자)
- ChatDrawer / DiagDrawer 활성 (echo bot 응답)
- 단일 인스턴스 · 상태 공유 · sendMessage no-op

---

## 4. 팔레트 · 하드코딩 정책

### CSS 토큰 (`src/styles/tokens.css`)

- `--bg-app`, `--bg-inset`, `--bg-surface`
- `--fg-primary`, `--fg-accent`, `--fg-muted`, `--fg-inverse`
- `--accent-primary`, `--accent-secondary`
- `--border-strong`, `--border-soft`
- `--game-color-bomb`, `--game-color-safe`, `--game-color-all`, `--game-color-me`

### JS/Canvas 팔레트 (`src/styles/palette.ts`)

- `PALETTE.borderStrong`, `fgAccent`, `bgInset`, `bomb`, `bombLight`, `gold`, `info`, ...
- Canvas fill · particle burst · SVG fill inline 사용
- **CSS 토큰의 mirror** — 변경 시 동기 필요

### 잔여 하드코딩 (의도적)

- `src/features/games/common/sprites.ts` — 픽셀 스프라이트 팔레트 (spec verbatim)
- `src/components/common/LibraryThumb.tsx` — 게임별 미니 썸네일 (그래픽 자산)
- `src/features/lobby/parts/QrZoomModal.tsx` — QR 흑백 (기술 요구)
- `src/chat/ChatDrawer.tsx` — `SENDER_PALETTE` 채팅 이름 색 6종

---

## 5. 남은 개선점

- [ ] Mosun 초기 boardRef 세팅 race (host/guest tick 겹침 방어 강화 여지)
- [ ] PingPong 결과 화면 · Breaker 결과 화면 게임별 특화 필요? (현재 공용 사용)
- [ ] Wudada 스프린트 완주 시 시간 기록 표시 (현재 거리만)
- [ ] Escape 시야 아이템 스폰 rate 튜닝
- [ ] TURN 서버 자체 운영 검토 (openrelay 의존성 최소화)
