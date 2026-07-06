import { useEffect, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

function isStandaloneDisplay(): boolean {
  const nav = window.navigator as Navigator & { standalone?: boolean }
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in nav && Boolean(nav.standalone))
  )
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

  useEffect(() => {
    if (isStandaloneDisplay()) {
      setIsInstalled(true)
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

  const close = () => {
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

      {offlineReady && (
        <div className="pwa-card">
          <div className="pwa-card-body">
            <span className="pwa-card-title">오프라인 준비 완료</span>
            <span className="pwa-card-desc">네트워크 없이도 실행 가능</span>
          </div>
          <button type="button" className="pixel-btn pixel-btn--ghost pwa-btn" onClick={close}>
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
            <button type="button" className="pixel-btn pixel-btn--ghost pwa-btn" onClick={close}>
              닫기
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
