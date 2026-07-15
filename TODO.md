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

_(비어있음 — 2026-07-14~15 사이클에서 아래 §완료 로그 항목으로 전량 해소.
다음 우선순위는 `planning/ROADMAP.md` §최우선을 소스로 사용할 것.)_

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

### 2026-07-14~15 · §최우선 전 항목 해소 (화면 flow · 문구 정확성 · 인터랙션 · 코드 위생 · 문서 최신화, 34개 사이클)
- [x] 위 5개 카테고리 전 항목이 자율 사이클로 실제 완료됨을 코드/문서 대조로 확인 (`useRoom.ts` debug wrap, Escape.tsx 3계층 분해, `sw.ts` cleanupOutdatedCaches, 10종 가이드 정확화, rgba/hex 토큰화, rAF cleanup 재검증 등).
- 상세 항목별 로그는 `planning/ROADMAP.md` §완료 로그 (2026-07-14 · 2026-07-15 날짜 항목) 참조 — 중복 기록 대신 단일 소스로 유지.

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
