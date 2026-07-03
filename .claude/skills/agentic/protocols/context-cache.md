# 프로젝트 컨텍스트 캐시 프로토콜
## protocols/context-cache.md — minidamo 전용

> **문제**: README.md / TODO.md / 기획 문서의 양이 많아 사이클 간 컨텍스트 로딩 토큰 낭비 발생.
> **해결**: 핵심 규칙을 압축한 `_project-context-cache.md`를 생성하여 에이전트들이 이를 기준으로 신속히 작업 판단.

---

## 1. 캐시 파일 위치 및 갱신 조건

```
.agent-state/_project-context-cache.md
```

| 갱신 조건 | 갱신 주체 |
|-----------|-----------|
| 파일 없음 (최초) | 첫 사이클 기획 에이전트 |
| README.md / TODO.md / 기획 문서 중 하나라도 변경 발생 시 | 해당 사이클 기획 에이전트 |
| 캐시 생성일 7일 초과 | PM 감독이 기획 에이전트에 재생성 지시 |

---

## 2. 캐시 파일 구조 (기획 에이전트가 작성)

```markdown
# Project Context Cache — minidamo
generated_at: {ISO 8601}
source_files_hash:
  README.md: {git rev-parse HEAD:README.md | head -c8}
  TODO.md: {git rev-parse HEAD:TODO.md | head -c8}

---

## 서비스 한 줄 요약
minidamo — 모바일 PWA 환경에서 구동되는 2인용 GPS 근접 탐색 기반 P2P WebRTC 실시간 미니게임 플랫폼.

## 현재 단계
{TODO.md 기준 현재 개발 마일스톤}

## 아키텍처 규칙
View (src/features/...) ➔ Hooks (src/hooks/usePeer.ts 등) ➔ P2P/Location Context ➔ Utils/Styles
- 컴포넌트는 오직 화면 표시 및 사용자 인터랙션 처리만 담당.
- 연결 및 위치 추적 등의 핵심 상태 연산은 전용 커스텀 훅으로 위임.
- any 및 as any의 무단 사용은 차단되며 엄격한 TypeScript 타입을 준수.

## 디자인 시스템 필수 규칙
- 스타일링: Vanilla CSS 변수 활용 (`var(--color-primary)`, `var(--spacing-md)` 등)
- 하드코딩 색상코드/픽셀값 CSS 및 JS 내 직접 기입 금지.
- 공통 컴포넌트 위치: src/components/common/ (Button, Card, PWAPrompt 등)

## 절대 금지 (자동 거부 V1~V8 요약)
- V1 Hardcoding: 색상코드/수치 직접 기입, any 타입 사용.
- V2 DRY 위반: src/components/common/에 있는 컴포넌트 복제 및 중복 비즈니스 로직 방치.
- V3 스펙 이탈: 기획에 어긋나는 과잉 엔지니어링 및 기능 추가.
- V4 Silent error: 예외 에러 무시 처리 (빈 catch 블록).
- V5 Type Crime: 타입 캐스팅 as any 남발.
- V7 예외 화면 누락: GPS 거리 이탈 경고, 재연결 팝업, PWA 오프라인 감지 누락.

## 주요 파일 위치
- P2P 상태 제어: src/hooks/usePeer.ts
- GPS 위치 추적: src/hooks/useLocation.ts
- 서비스 워커: src/sw.ts
- 공통 컴포넌트: src/components/common/
- 스타일 정의: src/styles/variables.css, src/index.css
- 기획서: README.md, TODO.md, planning/

## 스택 요약
React + TypeScript + Vite + PeerJS (WebRTC) + Geolocation API + PWA (Service Worker)
분석 명령: npm run lint
빌드 명령: npm run build
```

---

## 3. 에이전트별 사용 규칙

### 기획 에이전트
1. `_project-context-cache.md` 유효성 검사.
2. 유효하면 캐시만 확인, 변경 감지 시 원본 문서를 대조해 캐시 갱신.

### 개발 에이전트
- 캐시로 아키텍처 규칙 및 V1~V8 금지사항 사전 대조.

### 검토 에이전트
- V1~V8 위반 체크 시 캐시 내 기준을 활용해 코드 검증.

### 테스트 에이전트
- 캐시에서 검증 명령어 확인 (`npm run lint`, `npm run build`).