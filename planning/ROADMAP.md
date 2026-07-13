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
- [ ] **결과 화면** — 다시하기 · 대기방 · 다른 게임 · 나가기 각 4버튼 flow.
- [ ] **재접속** — 3분 window · 재접속 성공/실패 · 상대측 UI 대응.
- [ ] **뒤로가기 · 이탈** — 각 스크린별 confirm · sentinel · session restore 정합.

### 노출 문구 정확성 스위프

- [ ] **Bombhunt** 가이드 — rule engine 최신 반영 (parity/distance/relation 등 신규 타입 언급).
- [ ] **Escape** 가이드 — 열쇠 힌트 · minimap 사용법 · 아이템 (vision/speed/stun) 설명.
- [ ] **Memory** 가이드 — 라운드 옵션 (matchOption2) · 승리 조건 설명 보강.
- [ ] **Wavelength** 가이드 — targetScore 3/5/7 스케일 · tolerance 프리셋 실제 값 반영.
- [ ] **HiddenWord** 가이드 — 카드 종류별 효과 · 로그 표기법 명시.
- [ ] **Quorimo** 가이드 — 벽 배치 규칙 (경로 차단 금지) · 이동/점프 규칙.
- [ ] **Vinci** 가이드 — 조커 위치 선택 · 스톡 소진 · 검은 타일 처리.
- [ ] **Ditrick** 가이드 — 액션 세트 (check/call/raise/fold) · tie 팟 분배.
- [ ] **Trumeon** 가이드 — Briscola 룰 · 무늬 강제 국면.
- [ ] 전 게임 **토스트/라벨/에러 메시지** grep → 오탈자 · 톤 검토.

### 인터랙션 자연스러움

- [ ] **연결/재접속 오버레이** — 재연결 문구 · 진행 표시 · 취소 옵션.
- [ ] **애니메이션 페이스** — 카드 뒤집기 · 다이얼 회전 · 파티클 강도 (게임별 검토).
- [ ] **햅틱/피드백** — 성공/실패 시 시각 피드백 즉시성.
- [ ] **터치 정확도** — Quorimo 벽 슬롯 20px · Mastermind 팔레트 · HiddenWord 카드.

### 코드 위생 · 리팩터 · 최적화

- [ ] **useRoom.ts** debug console.log → `debug()` 유틸 wrap · prod no-op.
- [ ] **Escape.css joystick** rgba 5건 (V1 감사 잔재) 토큰화.
- [ ] **game-common.css** 유틸 확산 · 게임별 CSS 내 잔존 하드코딩 재검색.
- [ ] **Escape.tsx** 1000+ 줄 파일 분해 (캔버스 렌더 · 입력 · 상태 계층 분리).
- [ ] **각 게임 rAF cleanup** 재검증 (unmount 시 애니메이션 stall 방지).
- [ ] 각 게임 `useEffect` deps 정합성 재감사 (audit 후 잔여).
- [ ] `sw.ts` 캐시 무효화 · 업데이트 프롬프트 flow 재검토.
- [ ] `useAppNavigation.ts` sentinel · restore 로직 edge case 재확인.
- [ ] **Escape** 매치 타이머 — host/guest 가 각자 로컬 `performance.now()` 로 독립 시작(핸드셰이크 지연 시 만료 시점이 짧게 어긋남 · 자체 수렴). 만료를 브로드캐스트로 동기화할지 검토 (프로토콜 변경 범위라 별도 사이클).
- [ ] **BombHunt** `applyRevealLocal` 의 `useCallback` deps(`[isHost, fire]`)가 클로저 내부에서 쓰는 `finishMatchByRole` 을 누락 — `players` 변경 시 stale 클로저 참조 가능성 재확인.

### 문서 최신화

- [ ] `planning/screen_spec.html` — 실제 라이브 게임 10종 반영 (3게임 제거 후 갱신 안 됨).
- [ ] `planning/service_spec.html` — GPS 매칭 · P2P · PWA 실제 구현 반영.
- [ ] `planning/system_spec.html` — Cloudflare TURN · GitHub Actions 반영.
- [ ] `planning/IMPLEMENTATION.md` — 최근 refactor (감사 후속) 반영.
- [ ] `planning/TURN_SETUP.md` — 크레딧/폴백 정책 명시.
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
