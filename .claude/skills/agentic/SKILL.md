---
name: agentic
description: PM 감독 하에 기획/개발/검토(거부권)/테스트 사이클을 자율 반복하는 멀티 에이전트 워크플로우. Hardcoding/DRY 자동 거부, 4단 예산, 9종 서킷 브레이커, 체크포인트 기반 재개. minidamo(Vite/React/TS) 전용.
---

# Multi-Agent Development Workflow System

## SKILL.md — Orchestrator (minidamo 전용)

> 본 파일은 **시스템의 짧은 진입점**. 정책은 protocols/, 페르소나는 agents/ 위치.
> 매 호출에 SKILL.md 전체 재독 불필요 — `_quick-reference.md` 가 자주 쓰는 결정 포함.

---

## 1. 시스템이 무엇을 막는가

| 방지 대상                       | 메커니즘                       |
| ------------------------------- | ------------------------------ |
| 역할 매몰 / 목적 이탈           | PM 감독 + 5축 검토             |
| 오버엔지니어링 / 언더엔지니어링 | P1~P8 원칙 + 서비스 단계 인지  |
| Hardcoding / Duplication        | V1·V2 자동 거부                |
| 무한 루프 / 같은 실패 반복      | CB-1·CB-2                      |
| 비용 폭증 (시간·호출)           | 4단 예산 + CB-7·CB-8           |
| 거부권 회피 (PM 압박)           | Marcus Veto + CB-9             |
| 토큰 소진으로 작업 손실         | resumption + \_checkpoint.json |

---

## 2. 4대 절대 원칙

1. **PM도 검토 거부권을 뒤집을 수 없다** — Veto 오버라이드는 사용자 권한
2. **Hardcoding is a Crime** — V1 자동 거부 (인라인 색상코드/수치 직접 기입, any 타입 남발 등)
3. **Rule of Three** — 같은 로직 3회 시 추출 (V2)
4. **예산은 임의로 늘릴 수 없다** — 한도 변경은 사용자 권한, 시스템은 분할로 대응

---

## 3. 아키텍처

```
PM 감독 (게이트키퍼·예산 관리·라우팅)
   ※ 검토 Veto / 예산 한도 변경 권한 없음
       │
       ├─► A. 기획 ─► B. 개발 ─► C. 검토(★Veto) ─► D. 테스트 ─► [배포]
       │
       └─► 파일 핸드오프: state.json + cycle-{N}/{단계}-report.md

protocols/_quick-reference.md      (★매 사이클 첫 참조)
protocols/code-principles.md       (P1~P8)
protocols/execution-budget.md      (시간/호출/스케줄링)
protocols/circuit-breaker.md       (CB-1~CB-9)
protocols/handoff-protocol.md      (state.json 스키마)
protocols/resumption.md            (체크포인트·재개)
protocols/context-cache.md         (CLAUDE.md/ARCHITECTURE.md 압축 캐시)
```

---

## 4. 컨텍스트 로드 순서 (토큰 효율 최적화)

PM 호출 시 **이 순서대로 lazy load**:

```
필수 매번:
1. state.json (현재 상태)
2. _quick-reference.md (결정용 빠른 참조)
3. 직전 pm-decision-{최신seq}.md (직전 판단)

조건부 (해당 단계만):
★ 모든 에이전트: .agent-state/_project-context-cache.md 먼저 확인
   → HIT(유효): 원본 CLAUDE.md / ARCHITECTURE.md / TODO.md 읽지 않음
   → MISS/STALE: 기획 에이전트가 원본 읽고 캐시 갱신 (protocols/context-cache.md §2)

4-A. 기획: TODO.md + (캐시 MISS 시) CLAUDE.md, ARCHITECTURE.md, code-principles.md
4-B. 개발: plan-spec.md + (캐시에서 V1~V8 요약 확인, 세부만 CLAUDE.md)
4-C. 검토: plan-spec.md, dev-report.md (V1~V8 grep은 캐시 요약 기준)
4-D. 테스트: review-report.md (명령어는 캐시에서 확인)

재개 시 추가:
5. _checkpoint.json + _in_progress.json (있으면)

문제 시:
6. circuit-breaker.md (CB 발동 시만)
7. handoff-protocol.md (스키마 검증 시만)
```

---

## 5. 워크플로우 상태 머신 (요약)

```
INIT
  → git checkout development && git merge origin/production
  → production(현재 브랜치) PR 체크:
      - 열린 PR 있음 → "PR 리뷰 수정 사이클" (pm-supervisor.md 참조)
      - 없음 → ROADMAP/TODO 우선순위 평가 → 일반 사이클
  → PLANNING → DEVELOPMENT → REVIEW
                                ├─ Approved → TESTING → GIT_PUSH → PR_CREATE(production) → 사이클 완료
                                ├─ Soft Reject → DEVELOPMENT 재시작 (사용자 개입 없음)
                                └─ Hard Reject (Veto) → DEVELOPMENT 재시작 (사용자 개입 없음)
                                                         ↑ CB-9(동일 V 트리거 3회)시에만 사용자 에스컬레이션
  → CB 발동 시 분기 처리 (_quick-reference.md §2 참조)
```

**작업 브랜치**: `main`
**PR 전략**: 메인 브랜치 직접 반영

---

## 6. 첫 실행 절차 (신규 사이클 시작 시)

```
1. 프로젝트 루트 확인:
   - CLAUDE.md / ARCHITECTURE.md / TODO.md 존재 여부
   - .agent-state/state.json (없으면 신규 생성)
2. Git 환경 준비:
   - git checkout main
   - npm run lint 통과 확인
3. 본 시스템 4개 핵심 프로토콜 lazy load 준비 (위 §4)
4. PM 감독 sub-agent 호출 (agents/pm-supervisor.md)
5. PM이 §5 의 워크플로우 시작

**테스트 단계 종료 조건 (필수)**:
- `npm run lint` 통과 (경고/에러 0건)
- `npm run build` 통과 — **선택 아닌 필수**
- build 실패 시 개발 단계로 재귀
```

---

## 7. 재개 절차 (이전 세션이 있을 때)

```
1. state.status 확인
   ├─ halted → 정지 메시지 출력 후 종료
   ├─ awaiting_user_intervention → 사용자 답신 메시지 출력 후 종료
   └─ running → 다음
2. resumption.md §3 의 재개 결정 트리 따름
3. _checkpoint.json 의 last_safe_point 부터 PM 호출
```

---

## 8. 산출물 디렉토리 구조

```
{프로젝트 루트}/
  .agent-state/
    state.json
    budget.json (선택)
    _project-context-cache.md
    cycle-{N}/
      _checkpoint.json
      _in_progress.json (작업 중에만 존재)
      plan-spec.md
      dev-report.md
      review-report.md
      test-report.md
      pm-decision-{seq}.md
```

---

## 9. 사용자 결정이 필요한 시점만 사용자에게 묻는다

3가지만 멈춰 묻는다. **그 외 모든 상황 자율 진행.**

1. **CB-9 발동** — 같은 V 트리거 3회 반복 (구조적 문제, 재개발로 해결 안 됨)
2. **CB-6 발동 (HALT)** — 보안/환경 문제
3. **사용자가 직접 Veto Override 요청** — 사용자가 `state.json veto_override`에 사유 기록 후 명시적으로 요청

**특히 금지**: Veto(Hard Reject) 발생 직후 사용자에게 "계속 진행할까요?" 묻는 행동.

---

## 10. Feature-First Rule — 서비스 개발 우선 원칙

**모든 사이클에서 PM 태스크 선택 우선순위:**

1. **User Story 단위** — 사용자가 체감할 수 있는 기능 완성/수정
2. **Cross-Layer** — 최소 View + Provider 또는 Service + Domain Model 포함
3. 순수 리팩토링(View 단독)은 위 두 가지 후보 없을 때만 선택

**CLAUDE.md의 아키텍처 레이어 참조:**

```
View(features) ➔ Hooks ➔ Context ➔ Utils/Styles
layers = "V"만      → 후순위 (단일 레이어)
layers = "V+Hooks"  → 우선 고려
layers = "V+Context"→ 최우선 고려
```

---

_상세 정책/페르소나/체크리스트는 protocols/ 와 agents/ 위치. 본 파일은 세션 시작 시 1회 독으로 충분._
