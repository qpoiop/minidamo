/// <reference lib="webworker" />
import { precacheAndRoute } from 'workbox-precaching'

declare const self: ServiceWorkerGlobalScope

// VitePWA가 빌드 시 __WB_MANIFEST를 정적 자산 목록으로 자동 인젝션함
precacheAndRoute(self.__WB_MANIFEST)

// PWA 업데이트 강제 적용을 위한 메시지 리스너
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

// 새 SW 활성화 즉시 열려있는 클라이언트 모두 장악
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      // 오래된 workbox 캐시 정리
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((k) => !k.includes('workbox-precache'))
            .map((k) => caches.delete(k)),
        ),
      ),
    ]),
  )
})

interface CustomNotificationOptions extends NotificationOptions {
  vibrate?: number[];
}

// 백그라운드 웹 푸시 알림 수신 리스너
self.addEventListener('push', (event) => {
  let data = { title: 'minidamo', body: '게임 초대 요청이 도착했습니다!' }
  
  if (event.data) {
    try {
      data = event.data.json()
    } catch {
      data = { title: 'minidamo', body: event.data.text() }
    }
  }

  const options: CustomNotificationOptions = {
    body: data.body,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    vibrate: [100, 50, 100],
    data: {
      url: '/'
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  )
})

// 알림 터치 시 해당 링크로 브라우저 창 전환
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      if (clientList.length > 0) {
        return clientList[0].focus()
      }
      return self.clients.openWindow('/')
    })
  )
})
