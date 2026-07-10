# minidamo — TODO (live)

> 서비스 **안정화 · 완성도 · 자연스러운 flow** 만 다룸. 신규 기능·룰·게임 금지.
> 살아있는 우선순위는 `planning/ROADMAP.md` · 자율 사이클 (`/work-cycle`) 이 이 문서와 함께 소스로 사용.
> 초기 부트스트랩 Phase 1~8 은 이미 완료 · 아래 §완료 로그로 이동.

---

## 🎯 5축 검토 원칙

1. **문구** — 모든 노출 텍스트 오탈자·톤·정확성.
2. **이펙트** — 애니메이션 페이스 · 파티클 · 딜레이.
3. **동작** — edge case · race · P2P divergence · restart/reconnect.
4. **화면 flow** — 진입/이탈/재진입 자연스러움 · dead-end 없음.
5. **인터랙션** — 터치 즉시성 · 피드백 명확성.

각 사이클 = 위 축에서 **하나의 작은 slice**.

---

## 🔥 최우선 (클라우드 자율 사이클 가능)

### 화면별 flow 스위프
- [ ] SPLASH · fadeout · HOME 진입 flicker
- [ ] HOME · 카드 슬라이더 · 드로어 · 규칙 · 방 만들기 · 뒤로
- [ ] LOBBY (CREATE) · QR · 상대 접속 · 옵션 동기화 · 시작
- [ ] LOBBY (JOIN) · QR 스캔 · 근접 목록 · 실패 · 재시도
- [ ] GAME_PLAY · 10 게임 각 시작~결과 flow
- [ ] 결과화면 · 다시하기/대기방/다른게임/나가기 4버튼
- [ ] 재접속 · 3분 window · 성공/실패 · 상대측 UI
- [ ] 뒤로가기 · sentinel · session restore 정합

### 문구 정확성
- [ ] Bombhunt 가이드 · rule engine 최신 반영 (parity/distance/relation)
- [ ] Escape 가이드 · 열쇠/minimap/아이템 (vision/speed/stun)
- [ ] Memory 가이드 · 라운드 옵션 (matchOption2) · 승리 조건
- [ ] Wavelength 가이드 · 3/5/7 스케일 · tolerance 프리셋 실제 값
- [ ] HiddenWord 가이드 · 카드 종류 · 로그 표기법
- [ ] Quorimo 가이드 · 벽 배치 규칙 · 이동/점프
- [ ] Vinci 가이드 · 조커 · 스톡 소진 · 검은 타일
- [ ] Ditrick 가이드 · 액션 세트 · tie 팟 분배
- [ ] Trumeon 가이드 · Briscola 룰 · 무늬 강제 국면
- [ ] 전 게임 토스트/라벨/에러 grep · 오탈자·톤

### 인터랙션 자연스러움
- [ ] 연결/재접속 오버레이 문구·진행표시·취소
- [ ] 애니메이션 페이스 (게임별 카드/다이얼/파티클 강도)
- [ ] 성공/실패 시각 피드백 즉시성
- [ ] 터치 정확도 (Quorimo 벽 slot · Mastermind 팔레트 · HiddenWord 카드)

### 코드 위생 · 리팩터 · 최적화
- [ ] `useRoom.ts` debug console.log → `debug()` wrap · prod no-op
- [ ] Escape.css joystick rgba 5건 (V1 잔재) 토큰화
- [ ] `game-common.css` 유틸 확산 · 게임별 CSS 하드코딩 재검색
- [ ] Escape.tsx 1000+ 줄 분해 (캔버스/입력/상태 계층)
- [ ] 각 게임 rAF cleanup 재검증
- [ ] 각 게임 useEffect deps 정합성 재감사
- [ ] `sw.ts` 캐시 무효화 · 업데이트 프롬프트 flow
- [ ] `useAppNavigation.ts` sentinel · restore edge case

### 문서 최신화
- [ ] planning/screen_spec.html · 10 게임 반영
- [ ] planning/service_spec.html · GPS/P2P/PWA 실제 반영
- [ ] planning/system_spec.html · Cloudflare TURN · GH Actions
- [ ] planning/IMPLEMENTATION.md · 최근 감사 refactor 반영
- [ ] planning/TURN_SETUP.md · 크레딧/폴백 정책
- [ ] .claude/skills/agentic/protocols/ · minidamo 파일 경로 재정합

---

## 🔁 지속 (recurring)

- [x] Cloud routine 등록 완료:
  - `minidamo-agentic` (cron `17 * * * *`) · dev 사이클 dispatcher
  - `minidamo code-reviewer` (webhook) · PR ready 시 5축 리뷰
- [ ] 매 PR merge 후 development 최신 sync (routine 이 자동 처리)
- [ ] 세션 시작 시 routine 활성 여부 확인 (https://claude.ai/code/routines)

---

## 🚫 하지 않을 것

- 신규 기능 추가 (사용자 명시 요청 있을 때만).
- 신규 룰 추가/변경 (Trumeon tiebreak · Ditrick raiseCount 등 파킹).
- 신규 게임 추가.
- 룩앤필 대격변 (시안 유지).
- `sw` 캐시 aggressive 무효화.
- V1 위반 · any 남발 · 인라인 hex 신규.
- `--no-verify` / `--force` 커밋.

## 🅿️ 파킹 (사용자 결정 대기)

- Trumeon 마지막 트릭 tiebreak 룰 (Briscola 표준 도입).
- Ditrick raiseCount 강제 쇼다운 튜닝.
- 모바일 실기기 UX 검증 (실기기 필요).
- P2P 재접속 3분 window 실측 (실기기 필요).
- Playwright / Vitest 도입 (ROI 판단).
- tokens.css 라이트/mono 테마 완성도.

---

## ✅ 완료 로그

### 2026-07-10 · 감사 라운드 · PR#25
- [x] 3 fork 감사 (전 게임 · 동작 · 룰 · 디자인 축)
- [x] PR#1 룰/race 6건 (bombhunt rule engine · escape offline drop · ditrick 3건 · hiddenword setTimeout)
- [x] PR#2 V1 하드코드 hex/rgba → 시맨틱 토큰 (~60 매핑)
- [x] PR#3 useEffect deps (3 게임 ref 패턴) · setTimeout cleanup · dead code · doc 스탈
- [x] 자율 사이클 skill 3종 등록 + 클라우드 routine 2종 (`minidamo-agentic` · `minidamo code-reviewer`)
- [x] README/TODO/ROADMAP 재작성 (Vite 보일러플레이트 → 실제 프로젝트)

### 이전 사이클
- [x] 신규 4종 라이브 (Quorimo · Vinci · Ditrick · Trumeon)
- [x] 3게임 제거 (TicTacToe · PingPong · Runner) + 공통 코드 정리
- [x] Legacy 명명 (NYANGHO → MASTERMIND · NYANGWAVE → WAVELENGTH)
- [x] hostRestartRoute 12게임 일괄 제거 · 다시하기 즉시 · onLobby 별도
- [x] Escape 게스트 blank canvas 해소 · MAZE_SEED 원자 교체
- [x] Escape 타이머 상단 이동 · MinimapKey 힌트
- [x] BombHunt rule engine · exclusion ALL 전용 · parity/distance 신규
- [x] Vinci 조커 위치 선택 다이얼로그
- [x] HOME 종료 confirm 제거 (브라우저/PWA 특성상 강제 종료 불가)
- [x] 4종 가이드 대폭 확장
- [x] 초기 부트스트랩 Phase 1~8 (환경 · P2P · PWA · UI · 대기방 · 미니게임 · 결과화면 · 검증)
