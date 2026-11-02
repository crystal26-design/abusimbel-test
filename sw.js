const CACHE_NAME = 'abusimbel-offline-v2';

/* ---------- 1. 页面骨架 ---------- */
const CORE = [
  '/',
  '/index.html'
];

/* ---------- 2. 图片（按实际文件名，注意 spot2 和 spot3 是 png） ---------- */
const IMAGES = [
  '/images/map.png',
  '/images/spot0.jpg',
  '/images/spot1.jpg',
  '/images/spot2.png',
  '/images/spot3.png',
  '/images/spot4.jpg',
  '/images/spot5.jpg',
  '/images/spot6.jpg',
  '/images/spot7.jpg',
  '/images/spot8.jpg',
  '/images/spot9.jpg',
  '/images/spot10.jpg',
  '/images/spot11.jpg',
  '/images/spot12.jpg',
  '/images/spot13.jpg',
  '/images/spot14.jpg',
  '/images/spot15.jpg',
  '/images/spot16.jpg'
];

/* ---------- 3. 音频（全部写死，缺哪个一眼能看出来） ---------- */
const AUDIOS = [
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
  '/audio/spot16.mp3'
];

const ASSETS_TO_CACHE = [...CORE, ...IMAGES, ...AUDIOS];

/* ---------- 逐条预缓存 ---------- */
async function precache(cache, urls) {
  const failed = [];
  await Promise.all(
    urls.map(async (url) => {
      try {
        // cache: 'reload' 绕开 HTTP 缓存，确保拿到的是服务器上的新文件
        const res = await fetch(url, { cache: 'reload' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await cache.put(url, res);
      } catch (err) {
        failed.push(url);
      }
    })
  );
  if (failed.length) {
    console.warn('[SW] 以下资源缓存失败：\n' + failed.join('\n'));
  }
  // 只要核心页面拿到了就算安装成功；图片音频缺几个不影响离线可用
  return failed;
}

/* ---------- install ---------- */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(async (cache) => {
        await precache(cache, ASSETS_TO_CACHE);
        await self.skipWaiting();
      })
  );
});

/* ---------- activate：清掉旧版本 ---------- */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== CACHE_NAME)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

/* ---------- fetch ---------- */
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // 只处理 GET
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 跨域的不管（字体、统计之类）
  if (url.origin !== self.location.origin) return;

  // 接口请求不进缓存
  if (url.pathname.startsWith('/api/')) return;

  // 页面和代码类文件：网络优先，断网回落缓存
  const isDoc =
    req.mode === 'navigate' || /\.(html|js|css|json)$/i.test(url.pathname);

  if (isDoc) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // 拿到新的就顺手更新缓存
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(async () => {
          const cached = await caches.match(req);
          if (cached) return cached;
          // 导航请求兜底给首页
          if (req.mode === 'navigate') {
            const fallback = await caches.match('/index.html');
            if (fallback) return fallback;
          }
          return Response.error();
        })
    );
    return;
  }

  // 图片 / 音频：缓存优先，没有再去网络并顺手存下来
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          if (res && res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => Response.error());
    })
  );
});
