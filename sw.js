// sw.js - 离线缓存核心脚本
const CACHE_NAME = 'abusimbel-offline-v1';
  '/audio/spot00.mp3',
  '/audio/spot01.mp3',
  '/audio/spot02.mp3',
  '/audio/spot03.mp3',
  '/audio/spot04.mp3',
  '/audio/spot05.mp3',
  '/audio/spot06.mp3',
  '/audio/spot07.mp3',
  '/audio/spot08.mp3',
  '/audio/spot09.mp3',
  '/audio/spot10.mp3',
  '/audio/spot11.mp3',
  '/audio/spot12.mp3',
  '/audio/spot13.mp3',
  '/audio/spot14.mp3',
  '/audio/spot15.mp3',
  '/audio/spot16.mp3',
];

// 1. 安装阶段：强行把地图和所有音频存入手机本地
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('正在预下载所有地图和音频资源到本地...');
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// 2. 激活阶段：清理旧缓存
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. 拦截请求：一旦断网，直接从手机本地沙盒里拿地图和语音！
self.addEventListener('fetch', event => {
  // 如果是 AI 对话接口，不进行本地拦截（AI必须联网）
  if (event.request.url.includes('/api/chat')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      // 优先使用本地缓存，没有缓存再走网络下载
      return cachedResponse || fetch(event.request);
    })
  );
});
