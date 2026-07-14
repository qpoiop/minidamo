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
- [ ] **재접속 — 호스트 mid-game 세션 재구성** — GAME_PLAY 중 호스트측 연결이 끊겼을 때 게스트가 재접속할 방법이 실질적으로 없음. `restartWait()` 는 handshake 이전(Lobby, `!hasGuestJoined`) 전용으로, 이미 협상 완료된(`signalingState: 'stable'`) `RTCPeerConnection` 을 그대로 재사용해 예전 SDP 만 재발행하므로 새 answer 적용 시 `InvalidStateError`. 같은 `roomId` 를 유지한 채 `RTCPeerConnection` 을 새로 만들고 offer 를 재발행하는 별도 경로 설계 필요 — 세션 재구성 범위라 별도 사이클.
- [x] **뒤로가기 · 이탈** — 각 스크린별 confirm · sentinel · session restore 정합 (2026-07-14, 아래 로그 참조).

### 노출 문구 정확성 스위프

- [x] **Bombhunt** 가이드 — rule engine 최신 반영 (parity/distance/relation 등 신규 타입 언급, 2026-07-14 아래 로그 참조).
- [x] **Escape** 가이드 — 열쇠 힌트 · minimap 사용법 · 아이템 (vision/speed/stun) 설명 (2026-07-14 아래 로그 참조).
- [x] **Memory** 가이드 — 라운드 옵션 (matchOption2) · 승리 조건 설명 보강 (2026-07-14 아래 로그 참조).
- [x] **Wavelength** 가이드 — targetScore 3/5/7 스케일 · tolerance 프리셋 실제 값 반영 (2026-07-14 아래 로그 참조).
- [x] **HiddenWord** 가이드 — 카드 종류별 효과 · 로그 표기법 명시 (2026-07-14 아래 로그 참조).
- [x] **Quorimo** 가이드 — 벽 배치 규칙 (경로 차단 금지) · 이동/점프 규칙 (2026-07-14 아래 로그 참조).
- [x] **Vinci** 가이드 — 조커 위치 선택 · 스톡 소진 · 검은 타일 처리 (2026-07-14 아래 로그 참조).
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
