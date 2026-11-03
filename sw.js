
/* Abu Simbel Offline Guide
 * 离线范围：网页、地图、点位图片、点位音频
 * AI/API 请求不缓存
 */

const CACHE_NAME = "abusimbel-offline-v3";

// 1. 网页基础资源
const CORE_ASSETS = [
  "/",
  "/index.html"
];

// 2. 地图及17张点位图片
const IMAGE_ASSETS = [
  "/images/abusimbel.png",
  "/images/spot0.jpg",
  "/images/spot1.jpg",
  "/images/spot2.png",
  "/images/spot3.png",
  "/images/spot4.jpg",
  "/images/spot5.jpg",
  "/images/spot6.jpg",
  "/images/spot7.jpg",
  "/images/spot8.jpg",
  "/images/spot9.jpg",
  "/images/spot10.jpg",
  "/images/spot11.jpg",
  "/images/spot12.jpg",
  "/images/spot13.jpg",
  "/images/spot14.jpg",
  "/images/spot15.jpg",
  "/images/spot16.jpg"
];

// 3. 17段讲解音频
const AUDIO_ASSETS = Array.from(
  { length: 17 },
  (_, i) => `/audio/spot${String(i).padStart(2, "0")}.mp3`
);

// 4. 安装时预缓存
self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);

    // 核心网页和地图必须成功缓存
    const required = [
      ...CORE_ASSETS,
      "/images/abusimbel.png"
    ];

    for (const url of required) {
      const response = await fetch(url, {
        cache: "reload"
      });

      if (!response.ok) {
        throw new Error(
          `核心资源缓存失败：${url}`
        );
      }

      await cache.put(url, response);
    }

    // 图片和音频逐个缓存
    const optionalAssets = [
      ...IMAGE_ASSETS.slice(1),
      ...AUDIO_ASSETS
    ];

    const results = await Promise.allSettled(
      optionalAssets.map(async (url) => {
        const response = await fetch(url, {
          cache: "reload"
        });

        if (!response.ok) {
          throw new Error(
            `HTTP ${response.status}: ${url}`
          );
        }

        await cache.put(url, response);
      })
    );

    const failed = results
      .map((result, index) =>
        result.status === "rejected"
          ? optionalAssets[index]
          : null
      )
      .filter(Boolean);

    if (failed.length > 0) {
      console.error(
        "[离线导览] 以下资源缓存失败：",
        failed
      );
    } else {
      console.log(
        "[离线导览] 17个点位图片和音频缓存完成"
      );
    }

    await self.skipWaiting();
  })());
});

// 5. 激活并清理旧版本缓存
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();

    await Promise.all(
      keys
        .filter(key =>
          key.startsWith("abusimbel-offline-") &&
          key !== CACHE_NAME
        )
        .map(key => caches.delete(key))
    );

    await self.clients.claim();

    console.log("[离线导览] 新版本已激活");
  })());
});

// 6. 处理音频 Range 请求
async function responseForRange(request, cachedResponse) {
  const range = request.headers.get("range");

  if (!range) return cachedResponse;

  const match = /^bytes=(\d*)-(\d*)$/.exec(range);

  if (!match) return cachedResponse;

  const buffer = await cachedResponse.arrayBuffer();
  const total = buffer.byteLength;

  let start;
  let end;

  if (match[1] === "") {
    const suffix = Number(match[2]);
    start = Math.max(total - suffix, 0);
    end = total - 1;
  } else {
    start = Number(match[1]);
    end = match[2]
      ? Math.min(Number(match[2]), total - 1)
      : total - 1;
  }

  if (start >= total || start > end) {
    return new Response(null, {
      status: 416,
      headers: {
        "Content-Range": `bytes */${total}`
      }
    });
  }

  const headers = new Headers(cachedResponse.headers);

  headers.set("Accept-Ranges", "bytes");
  headers.set(
    "Content-Range",
    `bytes ${start}-${end}/${total}`
  );
  headers.set(
    "Content-Length",
    String(end - start + 1)
  );

  return new Response(
    buffer.slice(start, end + 1),
    {
      status: 206,
      statusText: "Partial Content",
      headers
    }
  );
}

// 7. 网络请求拦截
self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // 不缓存其他网站的资源
  if (url.origin !== self.location.origin) return;

  // AI及其他API必须联网，不缓存
  if (url.pathname.startsWith("/api/")) return;

  // 8. 网页采用网络优先，断网使用缓存
  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);

        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);

          await cache.put(
            "/index.html",
            response.clone()
          );
        }

        return response;

      } catch (error) {
        const cache = await caches.open(CACHE_NAME);

        const offlinePage = await cache.match(
          "/index.html"
        );

        return offlinePage || new Response(
          "请先联网打开一次阿布辛贝导览网页。",
          {
            status: 503,
            headers: {
              "Content-Type": "text/plain; charset=utf-8"
            }
          }
        );
      }
    })());

    return;
  }

  // 9. 图片、音频及其他静态资源采用缓存优先
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);

    const cached = await cache.match(
      request,
      { ignoreSearch: true }
    );

    if (cached) {
      if (
        request.destination === "audio" ||
        url.pathname.endsWith(".mp3")
      ) {
        return responseForRange(request, cached);
      }

      return cached;
    }

    // 缓存没有时尝试联网下载
    try {
      const response = await fetch(request);

      if (response.ok && response.type === "basic") {
        await cache.put(
          request,
          response.clone()
        );
      }

      return response;

    } catch (error) {
      return new Response(
        "该资源尚未缓存，请先联网下载导览资源。",
        {
          status: 503,
          headers: {
            "Content-Type": "text/plain; charset=utf-8"
          }
        }
      );
    }
  })());
});
