# Multi-Agent Development Workflow System

## minidamo 전용 온보딩 가이드 & 빠른 시작

> 기획→개발→검토→테스트→배포 사이클, PM 감독 하 자율 반복.
> minidamo(React/TypeScript/PWA) 특성 맞춤 버전.

---

## 파일 구조

```
agentic/
  README.md                     ← 이 파일 (온보딩 & 빠른 시작)
  SKILL.md                      ← 오케스트레이터 (스킬 등록 진입점)
  agents/
    pm-supervisor.md            ← PM 감독 에이전트 (조율자)
    planning-agent.md           ← 기획 에이전트
    development-agent.md        ← 개발 에이전트 (Pre/In/Post Flight + Veto 자가 검사)
    review-agent.md             ← 코드 검토 에이전트 — Marcus (★ Veto 권한)
    test-agent.md               ← 테스트·리팩토링 에이전트
  protocols/
    code-principles.md          ← ★ 핵심 원칙 P1~P8 + Severity + 단계별 체크리스트
    execution-budget.md         ← ★ 실행 예산 + 스케줄링 기법 + 부하 관리
    circuit-breaker.md          ← 서킷 브레이커 9종 (CB-1~CB-9)
    handoff-protocol.md         ← 에이전트 간 파일 인터페이스 / state.json 스키마
    resumption.md               ← 체크포인트·재개 프로토콜
    context-cache.md            ← CLAUDE.md/ARCHITECTURE.md 압축 캐시
    _quick-reference.md         ← 매 사이클 빠른 참조표
```

---

## minidamo 프로젝트 컨텍스트

| 항목        | 내용                                                     |
| ----------- | -------------------------------------------------------- |
| 스택        | React + TypeScript + Vite + PeerJS + Geolocation         |
| 상태관리    | React Context / Custom Hooks (usePeer, useLocation)      |
| 아키텍처    | View(features) ➔ Hooks ➔ Context ➔ Utils/Styles         |
| 분석 명령   | `npm run lint`                                           |
| 빌드 명령   | `npm run build`                                          |
| 테스트 명령 | `npm test`                                               |
| 기획 파일   | `README.md`, `TODO.md`, `planning/`                      |
| 작업 브랜치 | `main`                                                   |

---

## 신규 사이클 시작 방법

```
SKILL.md를 읽고 다음을 실행하라:
[프로젝트 루트: /Users/qpoiop/workspaces/test/minidamo]에 이 멀티 에이전트 시스템을 적용하여 실행하라.
```

---

## 각 에이전트 요약

| 에이전트             | 핵심 역할                           | 주요 산출물                | 핵심 권한                                                         |
| -------------------- | ----------------------------------- | -------------------------- | ----------------------------------------------------------------- |
| **PM 감독**          | 단계 전환 중재, 예산 관리, 라우팅   | pm-decision.md, state.json | 라우팅 / Soft Reject 오버라이드 — Veto / 예산 한도 변경 권한 없음 |
| **A. 기획**          | TODO 분석, 스펙, 우선순위 점수      | plan-spec.md, TODO.md      | 스펙 작성                                                         |
| **B. 개발**          | 구현, 자체 검증, Veto 자가 검사     | dev-report.md, 소스코드    | 코드 작성 / 수정                                                  |
| **C. 검토 (Marcus)** | 5축 검토, 원칙 위반 자동 감지       | review-report.md           | ★ **Hard Reject (Veto) 발동 권한**                                |
| **D. 테스트**        | 기능 검증, 회귀 확인, 안전 리팩토링 | test-report.md             | 테스트 / 리팩토링                                                 |

---

## 시스템 전체 4대 원칙

1. **PM은 검토 거부권을 뒤집을 수 없다** — Veto 오버라이드는 사용자 권한
2. **Hardcoding is a Crime** — P1 BLOCKING — 자동 거부 (`Color(0xFF...)`, 하드코딩 문자열, `AppColors` 직접 사용 등)
3. **Rule of Three** — 같은 로직 3회 등장 → 무조건 추출 — P2 BLOCKING
4. **예산은 임의로 늘릴 수 없다** — 한도 변경은 사용자 권한

---

## minidamo 특화 Veto 트리거 요약

| 트리거                 | minidamo 맥락                                                                                             |
| ---------------------- | -------------------------------------------------------------------------------------------------------- |
| **V1 Hardcoding**      | 인라인 색상코드 및 수치 직접 기입 / CSS 변수 미사용 / any 타입 남발 / 하드코딩 문자열                      |
| **V2 Duplication**     | 동일 컴포넌트/로직 3회 이상 + 미추출                                                                         |
| **V3 Spec Violation**  | 완료 기준 미충족 / 스펙 외 기능 추가                                                                     |
| **V4 Silent Error**    | 빈 catch / `.catchError((e) {})`                                                                         |
| **V5 Type Crime**      | `dynamic` 무근거 사용 / `as` 이중 캐스팅 / 공개 API 반환 타입 미명시                                     |
| **V6 Regression**      | 기존 테스트 약화/삭제                                                                                    |
| **V7 Dead-End Flow**   | 빈 상태/에러 상태 미처리 화면                                                                            |
| **V8 Boundary Bypass** | 사용자 입력 검증 없이 Service/Provider로 전달                                                            |

---

## 서킷 브레이커 요약

| 이름                 | 발동               | 결과                    |
| -------------------- | ------------------ | ----------------------- |
| CB-1 개발 루프       | B 재시작 3회       | A 강제 복귀             |
| CB-2 동일 실패       | 같은 실패 2회 연속 | A 복귀                  |
| CB-3 스코프 드리프트 | 30%+ 증가          | 범위 재조정             |
| CB-4 기획 모순       | 구현 불가          | A 즉시 복귀             |
| CB-5 오버엔지니어링  | 불필요한 복잡도    | 단순화 지시             |
| CB-7 시간 예산       | 100%               | 사이클 분할             |
| CB-8 호출 예산       | 100%               | 부분 인계               |
| **CB-9 Veto 반복**   | 동일 V 3회         | **사용자 에스컬레이션** |
| CB-6 HALT            | 보안/환경/누적     | 시스템 정지             |

---

_버전: minidamo 전용 v1.0 (q-football v1.1 기반 React/TypeScript 적응)_
