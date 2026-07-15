/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'

declare const self: ServiceWorkerGlobalScope

// VitePWA가 빌드 시 __WB_MANIFEST를 정적 자산 목록으로 자동 인젝션함
precacheAndRoute(self.__WB_MANIFEST)

// cleanupOutdatedCaches()는 자체 activate 리스너를 등록하는 방식으로 동작하므로
// (precacheAndRoute와 동일하게) 모듈 최상단에서 호출해야 함 — activate 디스패치 도중
// 등록하면 그 리스너는 해당 디스패치에서 실행되지 않음. 이전 버전 SW가 남긴 구
// precache 버킷만 정리하며, 런타임 캐시는 건드리지 않음.
cleanupOutdatedCaches()

// PWA 업데이트 강제 적용을 위한 메시지 리스너
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

// 새 SW 활성화 즉시 열려있는 클라이언트 모두 장악
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
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
