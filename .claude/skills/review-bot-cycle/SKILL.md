---
name: review-bot-cycle
description: production 브랜치에 열린 PR 의 리뷰봇/사람 코멘트를 확인하고 지적사항 반영해 다시 준비 상태(ready)로 전환. 사이클마다 새로운 태스크를 시작하지 않고 기존 PR 을 통과시킨다.
---

# 리뷰봇 루틴 (PR 리뷰 수정 사이클)

> `.claude/skills/agentic/agents/pm-supervisor.md §PR 리뷰 수정 사이클` 근거.
> 사용자가 `/review-bot-cycle` 로 호출.
> **스케줄 아님**. 명시 호출 시에만 실행.

---

## 1. 진입 조건

- `git checkout development` 상태
- `gh pr list --base production --state open` 결과에 PR 존재
- 그 PR 의 `reviews[].state == "REQUEST_CHANGES"` 또는 comments 에 아래 마커/키워드 존재:
  - `agentic-review-bot-report`
  - `VETO` / `Hard Reject` / `BLOCKING`
  - `V1`~`V8`

위 조건 불충족 시 즉시 종료 후 "리뷰봇 지적 없음 · work-cycle 로 진행 권장" 리포트.

---

## 2. 절차

```
1. gh pr list --base production --state open --json number,title,url
   → 없음 → "PR 없음. work-cycle 실행 필요" 안내 후 종료

2. gh pr view {번호} --json reviews,comments,body
   ★ body 를 반드시 읽는다 (숫자만 보고 스킵 금지)

3. 지적사항 추출:
   - reviews[].state == "REQUEST_CHANGES" → review.body 전체
   - comments[].body 전체 → 위 마커/키워드 필터
   - agentic-review-bot-report 마커 코멘트는 반드시 전체 파싱

4. plan-spec 없이 바로 목록화:
   - 각 지적 → 체크리스트 항목
   - BLOCKING/Veto-trigger 우선순위
   - Nit (스타일 지적) 은 별도 리스트

5. 수정 실행:
   - 파일 수정 → lint + build 통과 필수
   - 실패 시 원인 분석 · 3회 실패 시 사용자 에스컬레이션

6. 완료 후:
   a. git add {수정 파일들}
   b. git commit -m "review: PR#{N} 리뷰 반영 — {대표 지적 요약}"
   c. git push origin development
   d. ★ PR 코멘트: 반드시 Write 도구로 파일 생성 후 --body-file 사용.
      `--body "..."` / heredoc 은 `\n` 리터럴 렌더 버그 발생.
      1) Write file_path=/tmp/pr_response.md content="반영/미반영/사유 본문"
      2) gh pr comment {N} --body-file /tmp/pr_response.md
      3) rm /tmp/pr_response.md
   e. draft 였다면 gh pr ready {N}
```

---

## 3. 금지

- 신규 태스크 시작 (그건 work-cycle 소관)
- 지적사항 오버라이드 (사용자 명시 승인 없이)
- V1 위반 신규 도입 (기존 리뷰가 하드코딩 지적한 상황에서 다른 곳에 하드코딩 추가 등)
- `--no-verify` / `--force` 커밋

---

## 4. 종료 조건

- 모든 BLOCKING 지적 반영 · lint + build 통과 · PR ready 상태
- 또는 같은 지적 3회 반복 실패 → 사용자 에스컬레이션 (CB-9)
- 또는 리뷰봇 지적이 실제 코드와 무관/오탐 → PR 코멘트로 반박 후 종료

---

## 5. 참조

- 상세 프로토콜: `.claude/skills/agentic/agents/pm-supervisor.md §PR 리뷰 수정 사이클`
- V1~V8 정의: `.claude/skills/agentic/protocols/code-principles.md`
- CB-9: `.claude/skills/agentic/protocols/circuit-breaker.md`
