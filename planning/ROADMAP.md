# minidamo — ROADMAP (live)

> 사용자 피드백 기반 반복 개선 · 시안 준수 · 신규 게임 없이 안정화.
> Cowork 자율 dispatcher (cron 매시 :17) 가 이 문서 참고해 다음 태스크 선택.
> PR 있으면 → `/review-bot-cycle`, 없으면 → `/work-cycle` 로 자동 라우팅.

---

## 🔥 최우선 (Top of queue)

- **모바일 실기기 UX 검증**
  - [ ] Vinci/Ditrick/Trumeon iOS Safari + Android Chrome 실측 · 하단 잘림/스크롤 재확인.
  - [ ] Quorimo 벽 배치 터치 정확도 (홈 20px slot 이 손가락으로 눌리나?).
  - [ ] Mastermind/HiddenWord 그리드 시안 대비 크기.

- **가이드 문구 지속 개선**
  - [ ] Bombhunt (룰셋 판도라) 가이드 · rule engine 최신 상태 반영 (parity/distance 등 신규 타입 언급).
  - [ ] Escape · 열쇠 힌트 · minimap 사용법 언급.
  - [ ] Memory · 라운드 옵션 (matchOption2) 설명 부족 여부.

- **P2P 안정성**
  - [ ] 재접속 3분 window 실측 · 실제 폰 잠금/앱 백그라운드 시 timer 동작.
  - [ ] `useRoom.ts` debug console.log 정리 (환경 변수 기반 gate).

## 🎨 디자인 시스템

- [ ] `tokens.css` 라이트 모드/mono 테마 완성도 검증 (현재는 arcade only 실사용).
- [ ] `game-common.css` 유틸 클래스 · 기존 게임에 점진 적용 (하드코딩 잔재 제거).
- [ ] Home 하단 드로어 · dvh/svh 실기기 자름 검증.

## ⚙️ 코드 위생

- [ ] Escape.tsx 1000+ 줄 · 캔버스 렌더/입력/상태 분리 검토 (파일당 400 이하 목표).
- [ ] 각 게임 canvas 게임 (Escape) 의 requestAnimationFrame cleanup 검증.
- [ ] `useRoom.ts` `console.log/warn` → `debug()` 유틸로 wrap · prod 빌드에서 no-op.

## 🧪 테스트

- [ ] `npm run lint` 통과 유지 · CI 확장 검토.
- [ ] Playwright/Vitest 도입 여부 (현재 없음). ROI 판단 후.

## 🚫 하지 않을 것

- 신규 게임 추가 (사용자 요청 있을 때만).
- 룩앤필 대격변 (시안 유지).
- `sw` 캐시 aggressive 무효화 (사용자 세션 데이터 유실 위험).

---

## 완료 (지난 사이클)

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
