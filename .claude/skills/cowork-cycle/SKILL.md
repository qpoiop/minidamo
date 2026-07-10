---
name: cowork-cycle
description: 자동 dispatcher · production 열린 PR 유무에 따라 review-bot-cycle 또는 work-cycle 로 라우팅. 사용자가 /cowork-cycle 호출하면 상태 판단 후 하위 루틴 자동 실행. 스케줄 아님.
---

# Cowork 루틴 (수동 호출 · 자동 라우팅 dispatcher)

> 두 하위 루틴 (`review-bot-cycle`, `work-cycle`) 을 상태 기반으로 자동 라우팅.
> `.claude/skills/agentic/SKILL.md §5 워크플로우 상태 머신` 근거.
> **트리거: 사용자 `/cowork-cycle` 명시 호출만.** Cron/스케줄 아님.

---

## 1. 진입 절차

```
1. Git 준비:
   git checkout development
   git fetch origin
   git merge origin/production --no-edit
   → 충돌: state.status = "halted" · 사용자 에스컬레이션 후 종료

2. Lint 게이트 (전 사이클 시작 전 clean 상태 확인):
   npm run lint
   → 실패: 사용자 보고 후 종료 (자율 사이클이 dirty 상태를 시작하지 않음)

3. PR 상태 조회:
   gh pr list --base production --state open --json number,title,isDraft,url

4. 분기:
   4-a. PR 없음 → /work-cycle 절차 따름
        (planning/ROADMAP.md §최우선 1건 선택 · A→B→C→D → PR)
   4-b. PR 있음 + isDraft=true → resumption.md §3 재개 절차
   4-c. PR 있음 + isDraft=false → /review-bot-cycle 절차 따름
        (reviews · comments 확인 · 지적 반영 · ready)

5. 종료 보고 (한 줄):
   "cowork Nth 실행 · [work|review|noop] 진행 · [결과]"
```

---

## 2. 자율 실행 시 안전장치

- **CB-9**: 같은 V 트리거 3회 반복 → 즉시 사용자 에스컬레이션.
- **CB-6**: 보안/환경 문제 → HALT · state.status = "halted".
- **veto override 금지**: 검토 에이전트 Veto 는 사용자 승인 없이 우회하지 않는다.
- **V1 자동 거부**: 인라인 색상/수치 · any 남발 신규 도입 금지.
- **lint + build 필수**: 두 게이트 통과 못 하면 PR 생성 금지.
- **하지 않을 것** (`planning/ROADMAP.md §하지 않을 것` 참조):
  - 신규 게임 추가
  - 룩앤필 대격변
  - sw 캐시 aggressive 무효화
- **커밋 규칙**: `--no-verify` · `--force` 금지.

---

## 3. 트리거

- **사용자 `/cowork-cycle` 명시 호출만.**
- 스케줄 · cron 없음. 자동 fire 하지 않는다.
- **noop 종료**: PR 없음 · ROADMAP 우선순위 없음 · 새 태스크 없음 → "할 일 없음" 보고 후 종료 (강제 태스크 생성 금지).

---

## 4. 상태 기록

- `state.json.routines.last_cowork_run` 에 마지막 실행 timestamp · outcome 기록.

---

## 5. 참조

- 리뷰봇 루틴 상세: `.claude/skills/review-bot-cycle/SKILL.md`
- 신규 사이클 상세: `.claude/skills/work-cycle/SKILL.md`
- PM 감독: `.claude/skills/agentic/agents/pm-supervisor.md`
- 원칙 · CB · 예산: `.claude/skills/agentic/protocols/`
- 살아있는 백로그: `planning/ROADMAP.md`
