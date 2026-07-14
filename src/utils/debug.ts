/**
 * 개발 환경 전용 디버그 로그 — production 빌드(`import.meta.env.PROD`)에서는 no-op.
 */
export function debug(...args: unknown[]): void {
  if (import.meta.env.PROD) return
  console.log(...args)
}
