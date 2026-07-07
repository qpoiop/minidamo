import { useEffect, useRef, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

const IOS_DISMISS_KEY = 'minidamo:ios-install-dismissed'
const OFFLINE_TOAST_DISMISS_KEY = 'minidamo:offline-toast-dismissed-session'
const SW_APPLIED_KEY = 'minidamo:sw-update-applied-at'
const SW_INHIBIT_WINDOW_MS = 60_000

function isStandaloneDisplay(): boolean {
  const nav = window.navigator as Navigator & { standalone?: boolean }
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in nav && Boolean(nav.standalone))
  )
}

function detectIosSafari(): boolean {
  const ua = window.navigator.userAgent
  const nav = window.navigator as Navigator & { maxTouchPoints?: number }
  const isIos = /iP(ad|hone|od)/.test(ua) || (nav.platform === 'MacIntel' && (nav.maxTouchPoints ?? 0) > 1)
  const isSafari = /^((?!chrome|android).)*safari/i.test(ua) || /CriOS|FxiOS|EdgiOS/i.test(ua)
  return isIos && isSafari
}

function readAppliedAt(): number | null {
  try {
    const raw = sessionStorage.getItem(SW_APPLIED_KEY)
    if (!raw) return null
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}

/**
 * The user just clicked "업데이트" and vite-plugin-pwa is about to
 * reload — for the reload's fresh page-load, keep the update card
 * suppressed for up to SW_INHIBIT_WINDOW_MS. This kills the specific
 * race where the reload lands before controllerchange completes, the
 * plugin briefly sees a "waiting" SW again, and offers the card twice.
 */
function shouldInhibitRefresh(): boolean {
  const applied = readAppliedAt()
  if (applied == null) return false
  const age = Date.now() - applied
  if (age < 0 || age > SW_INHIBIT_WINDOW_MS) {
    try { sessionStorage.removeItem(SW_APPLIED_KEY) } catch { /* ignore */ }
    return false
  }
  return true
}

export function PWAPrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onRegisteredSW(swUrl, registration) {
      console.log('SW registered:', swUrl)
      if (!registration) return
      // Keep exactly one background update poll per tab. React StrictMode
      // double-mount + hot reloads used to stack these otherwise.
      const key = '__minidamoSwPoll'
      const w = window as unknown as Record<string, unknown>
      if (w[key]) return
      w[key] = setInterval(() => {
        registration.update().catch(() => undefined)
      }, 60_000)
    },
    onRegisterError(error) {
      console.error('SW registration error', error)
    },
  })

  // First render after a reload: if the user just applied an update,
  // silently drop the immediate re-trigger the plugin sometimes fires
  // before the new SW finishes taking control.
  useEffect(() => {
    if (needRefresh && shouldInhibitRefresh()) {
      setNeedRefresh(false)
    }
  }, [needRefresh, setNeedRefresh])

  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isInstalled, setIsInstalled] = useState(false)
  const [showIosGuide, setShowIosGuide] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [offlineDismissed, setOfflineDismissed] = useState<boolean>(() => {
    try { return sessionStorage.getItem(OFFLINE_TOAST_DISMISS_KEY) === '1' } catch { return false }
  })
  const installedHandledRef = useRef(false)

  useEffect(() => {
    if (isStandaloneDisplay()) {
      setIsInstalled(true)
      return
    }

    if (detectIosSafari()) {
      const dismissed = localStorage.getItem(IOS_DISMISS_KEY) === '1'
      if (!dismissed) setShowIosGuide(true)
    }

    const handler = (e: Event) => {
      e.preventDefault()
      if (!isStandaloneDisplay() && !installedHandledRef.current) {
        setInstallPrompt(e as BeforeInstallPromptEvent)
      }
    }
    window.addEventListener('beforeinstallprompt', handler)

    const installedHandler = () => {
      installedHandledRef.current = true
      setInstallPrompt(null)
      setIsInstalled(true)
    }
    window.addEventListener('appinstalled', installedHandler)

    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
      window.removeEventListener('appinstalled', installedHandler)
    }
  }, [])

  const handleInstallClick = async () => {
    if (!installPrompt) return
    try {
      await installPrompt.prompt()
      await installPrompt.userChoice
    } catch (err) {
      console.warn('install prompt failed', err)
    } finally {
      setInstallPrompt(null)
    }
  }

  const dismissIos = () => {
    try { localStorage.setItem(IOS_DISMISS_KEY, '1') } catch { /* ignore */ }
    setShowIosGuide(false)
  }

  const dismissOfflineToast = () => {
    setOfflineReady(false)
    try { sessionStorage.setItem(OFFLINE_TOAST_DISMISS_KEY, '1') } catch { /* ignore */ }
    setOfflineDismissed(true)
  }

  const applyUpdate = async () => {
    if (updating) return
    setUpdating(true)
    // Mark "user asked to apply" BEFORE we hand off to the plugin so
    // the sessionStorage-scoped inhibit is already in place if the
    // plugin decides to reload synchronously.
    try {
      sessionStorage.setItem(SW_APPLIED_KEY, String(Date.now()))
    } catch { /* ignore */ }
    try {
      await updateServiceWorker(true)
    } catch (e) {
      console.warn('updateServiceWorker failed', e)
      try { sessionStorage.removeItem(SW_APPLIED_KEY) } catch { /* ignore */ }
      setUpdating(false)
      setNeedRefresh(false)
    }
  }

  // 우선순위: needRefresh > installPrompt > iosGuide > offlineReady
  // 한 번에 하나의 카드만 노출 → 중복 표시 방지
  let activeCard: 'refresh' | 'install' | 'ios' | 'offline' | null = null
  if (needRefresh) activeCard = 'refresh'
  else if (installPrompt) activeCard = 'install'
  else if (showIosGuide) activeCard = 'ios'
  else if (offlineReady && !offlineDismissed) activeCard = 'offline'

  if (!activeCard) return null
  if (isInstalled && activeCard === 'install') return null

  return (
    <div className="pwa-prompt-stack">
      {activeCard === 'install' && installPrompt && (
        <div className="pwa-card">
          <div className="pwa-card-body">
            <span className="pwa-card-title">앱 홈 화면에 추가</span>
            <span className="pwa-card-desc">더 빠르고 오프라인에서도 작동</span>
          </div>
          <div className="pwa-card-actions">
            <button type="button" className="pixel-btn pixel-btn--primary pwa-btn" onClick={handleInstallClick}>
              설치
            </button>
            <button type="button" className="pixel-btn pixel-btn--ghost pwa-btn" onClick={() => setInstallPrompt(null)}>
              닫기
            </button>
          </div>
        </div>
      )}

      {activeCard === 'ios' && (
        <div className="pwa-card pwa-card--ios">
          <div className="pwa-card-body">
            <span className="pwa-card-title">iOS 홈 화면에 추가</span>
            <ol className="pwa-ios-steps">
              <li>Safari 하단 <b>공유 버튼</b> 탭</li>
              <li>메뉴에서 <b>홈 화면에 추가</b> 선택</li>
              <li>우측 상단 <b>추가</b> 확인</li>
            </ol>
          </div>
          <div className="pwa-card-actions">
            <button type="button" className="pixel-btn pixel-btn--ghost pwa-btn" onClick={dismissIos}>
              알겠어요
            </button>
          </div>
        </div>
      )}

      {activeCard === 'offline' && (
        <div className="pwa-card">
          <div className="pwa-card-body">
            <span className="pwa-card-title">오프라인 준비 완료</span>
            <span className="pwa-card-desc">네트워크 없이도 실행 가능</span>
          </div>
          <button type="button" className="pixel-btn pixel-btn--ghost pwa-btn" onClick={dismissOfflineToast}>
            확인
          </button>
        </div>
      )}

      {activeCard === 'refresh' && (
        <div className="pwa-card">
          <div className="pwa-card-body">
            <span className="pwa-card-title">새 버전 배포</span>
            <span className="pwa-card-desc">{updating ? '적용 중…' : '업데이트 후 적용'}</span>
          </div>
          <div className="pwa-card-actions">
            <button
              type="button"
              className="pixel-btn pixel-btn--primary pwa-btn"
              disabled={updating}
              onClick={applyUpdate}
            >
              {updating ? '업데이트 중' : '업데이트'}
            </button>
            <button
              type="button"
              className="pixel-btn pixel-btn--ghost pwa-btn"
              onClick={() => setNeedRefresh(false)}
              disabled={updating}
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
