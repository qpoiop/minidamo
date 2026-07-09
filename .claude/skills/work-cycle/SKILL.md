---
name: work-cycle
description: production 에 열린 PR 이 없을 때 planning/ROADMAP.md 우선순위 기반으로 새 개발 사이클 1회 진행. 기획→개발→검토→테스트→PR 생성까지 자율.
---

# 작업 루틴 (신규 개발 사이클)

> `.claude/skills/agentic/SKILL.md §5 워크플로우 상태 머신` 근거.
> 사용자가 `/work-cycle` 로 호출.
> **스케줄 아님**. 명시 호출 시에만 실행.

---

## 1. 진입 조건

- `git checkout development` · `git merge origin/production` 성공
- `gh pr list --base production --state open` 결과 **비어있음**
- lint + build 게이트 통과

PR 이 열려있으면 → "review-bot-cycle 먼저 실행 필요" 안내 후 종료.

---

## 2. 태스크 선택 소스 (우선순위 순)

1. `planning/ROADMAP.md` §최우선 (Top of queue) 미체크 항목
2. `planning/ROADMAP.md` §디자인 시스템 · §코드 위생 미체크 항목
3. `TODO.md` (있고 살아있는 항목)
4. 위 셋 다 비었으면 → "할 일 없음 · 사이클 종료" 보고 (강제 태스크 생성 금지)

**Feature-First 규칙** (pm-supervisor §태스크 선택 규칙):
- 1순위: Domain 변경 포함 (V+St+Sv+Domain)
- 2순위: 크로스 레이어 (V+St, V+St+Sv)
- 3순위: V 단독 (다른 후보 0 개일 때만)

---

## 3. 절차

```
1. Git 준비:
   git checkout development
   git fetch origin
   git merge origin/production --no-edit
   충돌 → 사용자에게 보고 후 종료

2. 태스크 선택 → 한 줄 요약 결정

3. 사이클 단계 실행:
   A. 기획   — plan-spec.md 작성 (영향 레이어 · 완료 기준)
   B. 개발   — 파일 수정 · V1~V8 자체 검증
   C. 검토   — code-principles.md 기준 Veto 판정
              Hard Reject → B 재시작 (사용자 개입 없음)
              CB-9 발동 (동일 V 3회) → 사용자 에스컬레이션
   D. 테스트 — npm run lint (필수) + npm run build (필수)
              둘 다 통과 못하면 D 재실행 또는 B 로 복귀

4. PR 생성:
   git add {변경 파일들}
   git commit -m "{type}({scope}): {한 줄 요약}"
   git push origin development
   ★ PR body: 반드시 Write 도구로 파일 생성 후 --body-file.
     `--body "..."` / heredoc 은 `\n` 리터럴 렌더 버그 발생 (agentic PM 지침).
     1) Write file_path=/tmp/cycle_pr_body.md content="Summary/Test plan/..."
     2) gh pr create --base production --head development \
          --title "{한 줄 요약}" --body-file /tmp/cycle_pr_body.md
     3) rm /tmp/cycle_pr_body.md

5. ROADMAP.md 해당 항목 체크 · 완료 로그 이동:
   - [ ] 항목 → - [x] 로 변경
   - `## 완료 (지난 사이클)` 하단으로 이동

6. 종료 보고: PR URL · 다음 후보 태스크 안내
```

---

## 4. 예산 (protocols/execution-budget.md 요약)

- 사이클 전체 wall-clock 60 분 이내 목표
- 단계별 tool-call 상한: A 20 / B 60 / C 30 / D 20
- 초과 시 CB-7/CB-8 발동 → 부분 산출물 인계 · 다음 사이클로 이월

---

## 5. 금지

- 신규 게임 추가 (ROADMAP §하지 않을 것)
- V1 위반 하드코딩 · V2 위반 중복 신규 도입
- 사용자 명시 승인 없는 룩앤필 대격변
- 사용자 명시 승인 없는 CB / Veto 오버라이드
- `--no-verify` / `--force` 커밋
- 진전 없이 리팩터링만 하는 사이클 (Feature-First 위반)

---

## 6. 참조

- 상세 워크플로우: `.claude/skills/agentic/SKILL.md`
- PM 감독 상세: `.claude/skills/agentic/agents/pm-supervisor.md`
- 원칙: `.claude/skills/agentic/protocols/code-principles.md`
- CB: `.claude/skills/agentic/protocols/circuit-breaker.md`
- 살아있는 백로그: `planning/ROADMAP.md`
