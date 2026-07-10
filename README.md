# minidamo

2-player P2P PWA 아케이드 게임 플랫폼. 근접 (GPS · 반경 20m) 매칭 + WebRTC · 픽셀 팔레트 (아케이드 GB) UI.

**라이브 게임 10종**:
`memory` · `bombhunt` (룰셋 판도라) · `mastermind` (냥호 브레이커) · `escape` (미로) · `wavelength` (냥파장) · `hiddenword` (모드네임) · `quorimo` (쿼리모) · `vinci` (모빈치코드) · `ditrick` (모디언트릭) · `trumeon` (모루먼쇼)

---

## 실행

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # dist/ · sw.js 생성
npm run lint     # tsc --noEmit
```

## 스택

- React 18 / 19 · TypeScript · Vite (`injectManifest` SW)
- WebRTC P2P · Cloudflare Realtime TURN
- Cloudflare Pages 배포 (GitHub Actions)
- Design tokens = CSS custom properties (`src/styles/tokens.css`)

## 폴더

```
src/
  App.tsx                      # SPLASH / HOME / LOBBY / GAME_PLAY 상태 머신
  hooks/
    useAppNavigation.ts        # 스크린 전이 · back-gesture confirm · restore
    usePeer.ts · useRoom.ts    # P2P 시그널링 + WebRTC 연결
    useLocation.ts             # GPS 근접 매칭
  features/
    home/ · lobby/ · splash/
    games/
      <game-id>/               # 10개 라이브 게임
      common/                  # sprites · game-common.css · matchRestart
  styles/
    tokens.css                 # arcade / mono / light 테마
    palette.ts                 # 캔버스용 palette mirror
  sw.ts                        # Service Worker (PWA)
```

## 문서

- `planning/ROADMAP.md` — 살아있는 우선순위 (`work-cycle` 이 이걸 소스로 사용)
- `planning/screen_spec.html` · `service_spec.html` · `system_spec.html` — 초기 기획서 (파일 오래됨)
- `planning/IMPLEMENTATION.md` — 아키텍처 세부
- `planning/TURN_SETUP.md` — Cloudflare Realtime TURN 세팅
- `TODO.md` — 초기 부트스트랩 (Phase 1~4) 아카이브
- `.claude/skills/` — 자율 사이클 루틴 (아래 §자율 사이클)

## 자율 사이클

세 개의 skill 로 등록된 자동화 루틴:

- `/cowork-cycle` — PR 유무 판단 후 자동 라우팅 (dispatcher)
- `/review-bot-cycle` — production 열린 PR 리뷰봇/사람 코멘트 반영
- `/work-cycle` — planning/ROADMAP.md 우선순위 기반 신규 사이클

각 skill 은 `.claude/skills/agentic/` 프로토콜 (PM 감독 · V1~V8 · CB · Feature-First) 준수. 룰:

- 신규 게임 추가 · 룩앤필 대격변 금지 (사용자 명시 요청 있을 때만).
- V1 위반 (인라인 hex · any 남발) 자동 거부.
- lint + build 통과 필수.
- `--no-verify` · `--force` 커밋 금지.

## 브랜치

- `production` — 배포 브랜치 (Cloudflare Pages 자동 배포)
- `development` — 작업 브랜치. PR 는 `development → production`
- 사이클 완료 시 PR 자동 생성 → 사용자 승인 후 머지 → 배포

## 라이센스

Private / prototype.
