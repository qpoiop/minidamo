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
- [ ] **HOME** — 게임 카드 슬라이더 · 드로어 · 규칙 보기 · 방 만들기 · 뒤로 진행 전체 flow.
- [ ] **LOBBY (CREATE)** — QR 노출 · 상대 접속 · 옵션 동기화 · 시작 조건.
- [ ] **LOBBY (JOIN)** — QR 스캔 · 근접 목록 · 접속 실패 · 재시도.
- [ ] **GAME_PLAY (각 10 게임)** — 시작 애니 · 진행 상태 · 승패 판정 · 결과 화면.
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
