import { useEffect, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

export function PWAPrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      console.log('SW Registered: ' + r)
    },
    onRegisterError(error) {
      console.error('SW registration error', error)
    },
  })

  const [installPrompt, setInstallPrompt] = useState<any>(null)

  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault()
      setInstallPrompt(e)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstallClick = async () => {
    if (!installPrompt) return
    installPrompt.prompt()
    const { outcome } = await installPrompt.userChoice
    console.log(`User response to install prompt: ${outcome}`)
    setInstallPrompt(null)
  }

  const close = () => {
    setOfflineReady(false)
    setNeedRefresh(false)
  }

  return (
    <div style={{ position: 'fixed', bottom: 16, right: 16, zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* PWA 설치 안내 카드 */}
      {installPrompt && (
        <div className="pwa-card" style={styles.card}>
          <div style={styles.textContainer}>
            <span style={styles.title}>앱 홈화면에 추가</span>
            <span style={styles.desc}>더 빠르고 오프라인에서도 작동합니다.</span>
          </div>
          <div style={styles.actions}>
            <button onClick={handleInstallClick} style={{ ...styles.btn, backgroundColor: '#6366f1' }}>설치</button>
            <button onClick={() => setInstallPrompt(null)} style={styles.btnSec}>닫기</button>
          </div>
        </div>
      )}

      {/* PWA 오프라인 준비 완료 안내 카드 */}
      {offlineReady && (
        <div className="pwa-card" style={styles.card}>
          <div style={styles.textContainer}>
            <span style={styles.title}>오프라인 준비 완료</span>
            <span style={styles.desc}>네트워크 없이도 플레이할 수 있습니다.</span>
          </div>
          <button onClick={close} style={styles.btnSec}>확인</button>
        </div>
      )}

      {/* PWA 업데이트 안내 카드 */}
      {needRefresh && (
        <div className="pwa-card" style={styles.card}>
          <div style={styles.textContainer}>
            <span style={styles.title}>새 버전 배포 완료</span>
            <span style={styles.desc}>신규 기능이 업데이트되었습니다.</span>
          </div>
          <div style={styles.actions}>
            <button onClick={() => updateServiceWorker(true)} style={{ ...styles.btn, backgroundColor: '#6366f1' }}>업데이트</button>
            <button onClick={close} style={styles.btnSec}>닫기</button>
          </div>
        </div>
      )}
    </div>
  )
}

const styles = {
  card: {
    background: 'rgba(15, 17, 26, 0.95)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '12px',
    padding: '12px 16px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
    width: '280px',
    boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
    fontFamily: 'sans-serif'
  },
  textContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px'
  },
  title: {
    color: '#ffffff',
    fontSize: '13px',
    fontWeight: 600
  },
  desc: {
    color: '#9ca3af',
    fontSize: '11px'
  },
  actions: {
    display: 'flex',
    gap: '6px'
  },
  btn: {
    border: 'none',
    color: 'white',
    padding: '6px 12px',
    borderRadius: '6px',
    fontSize: '11px',
    fontWeight: 600,
    cursor: 'pointer'
  },
  btnSec: {
    border: '1px solid rgba(255, 255, 255, 0.1)',
    background: 'rgba(255, 255, 255, 0.05)',
    color: 'white',
    padding: '6px 12px',
    borderRadius: '6px',
    fontSize: '11px',
    fontWeight: 600,
    cursor: 'pointer'
  }
}
