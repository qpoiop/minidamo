import { useEffect, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

const IOS_DISMISS_KEY = 'minidamo:ios-install-dismissed'

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
  // iOS Chrome/Firefox uses 'CriOS'/'FxiOS' but still WebKit — Add-to-Home 동일
  const isSafari = /^((?!chrome|android).)*safari/i.test(ua) || /CriOS|FxiOS|EdgiOS/i.test(ua)
  return isIos && isSafari
}

export function PWAPrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      console.log('SW Registered:', r)
    },
    onRegisterError(error) {
      console.error('SW registration error', error)
    },
  })

  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isInstalled, setIsInstalled] = useState(false)
  const [showIosGuide, setShowIosGuide] = useState(false)

  useEffect(() => {
    if (isStandaloneDisplay()) {
      setIsInstalled(true)
      return
    }

    // iOS Safari: beforeinstallprompt 미발생 → 수동 가이드
    if (detectIosSafari()) {
      const dismissed = localStorage.getItem(IOS_DISMISS_KEY) === '1'
      if (!dismissed) setShowIosGuide(true)
      return
    }

    const handler = (e: Event) => {
      e.preventDefault()
      if (!isStandaloneDisplay()) {
        setInstallPrompt(e as BeforeInstallPromptEvent)
      }
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
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

  const closeToast = () => {
    setOfflineReady(false)
    setNeedRefresh(false)
  }

  if (isInstalled) return null

  return (
    <div className="pwa-prompt-stack">
      {installPrompt && (
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

      {showIosGuide && (
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

      {offlineReady && (
        <div className="pwa-card">
          <div className="pwa-card-body">
            <span className="pwa-card-title">오프라인 준비 완료</span>
            <span className="pwa-card-desc">네트워크 없이도 실행 가능</span>
          </div>
          <button type="button" className="pixel-btn pixel-btn--ghost pwa-btn" onClick={closeToast}>
            확인
          </button>
        </div>
      )}

      {needRefresh && (
        <div className="pwa-card">
          <div className="pwa-card-body">
            <span className="pwa-card-title">새 버전 배포</span>
            <span className="pwa-card-desc">업데이트 후 적용</span>
          </div>
          <div className="pwa-card-actions">
            <button type="button" className="pixel-btn pixel-btn--primary pwa-btn" onClick={() => updateServiceWorker(true)}>
              업데이트
            </button>
            <button type="button" className="pixel-btn pixel-btn--ghost pwa-btn" onClick={closeToast}>
              닫기
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
