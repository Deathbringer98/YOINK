const DOWNLOAD_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>`;

function getTweetId(article) {
  const links = article.querySelectorAll('a[href*="/status/"]');
  for (const link of links) {
    const m = link.href.match(/\/status\/(\d+)/);
    if (m) return m[1];
  }
  return null;
}

function getMedia(article) {
  if (article.querySelector('[data-testid="videoPlayer"]') || article.querySelector("video")) {
    const video =
      article.querySelector('[data-testid="videoPlayer"] video') ||
      article.querySelector("video");
    const fallbackUrl =
      video?.src && !video.src.startsWith("blob:") ? video.src : null;
    return { type: "video", fallbackUrl };
  }
  const photos = [...article.querySelectorAll('[data-testid="tweetPhoto"] img')].filter(
    (img) => !img.closest('[data-testid="videoPlayer"]')
  );
  if (photos.length) {
    return { type: "image", urls: photos.map((img) => img.src) };
  }
  return null;
}

function fullResImage(src) {
  try {
    const u = new URL(src);
    u.searchParams.set("name", "orig");
    return u.toString();
  } catch {
    return src;
  }
}

function imageExt(src) {
  const m = src.match(/format=(\w+)/);
  return m ? m[1] : "jpg";
}

function runtimeAlive() {
  try { return !!chrome?.runtime?.id; } catch { return false; }
}

function playYoink() {
  try {
    const audio = new Audio(chrome.runtime.getURL("yoink.mp3"));
    audio.volume = 1;
    audio.play().catch(() => {});
  } catch {}
}

function flash(btn, ok) {
  btn.classList.add(ok ? "yoink-done" : "yoink-fail");
  setTimeout(() => btn.classList.remove("yoink-done", "yoink-fail"), 1800);
}

function getCt0() {
  return document.cookie.match(/ct0=([^;]+)/)?.[1] || "";
}

function injectButton(article) {
  const media = getMedia(article);
  if (!media) return;

  const tweetId = getTweetId(article);
  if (!tweetId) return;

  const reply = article.querySelector('[data-testid="reply"]');
  const bar = reply ? reply.closest('[role="group"]') : null;
  if (!bar || bar.querySelector(".yoink-action")) return;

  const btn = document.createElement("button");
  btn.className = "yoink-action";
  btn.title = "Download media";
  btn.innerHTML = DOWNLOAD_ICON;

  bar.appendChild(btn);

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    if (!runtimeAlive()) return;

    playYoink();

    if (media.type === "video") {
      const ct0 = getCt0();
      console.log("[Yoink] click — tweetId:", tweetId, "ct0 present:", !!ct0, "fallbackUrl:", media.fallbackUrl);
      chrome.runtime.sendMessage({ type: "FETCH_VIDEO", tweetId, ct0 }, (res) => {
        console.log("[Yoink] FETCH_VIDEO response:", res, "lastError:", chrome.runtime.lastError?.message);
        if (chrome.runtime.lastError || !res?.ok || !res.variants?.length) {
          console.warn("[Yoink] API fetch failed — trying fallbackUrl:", media.fallbackUrl);
          if (media.fallbackUrl) {
            chrome.runtime.sendMessage({
              type: "DOWNLOAD_VIDEO",
              url: media.fallbackUrl,
              filename: `yoink-${tweetId}.mp4`,
            });
            flash(btn, true);
          } else {
            console.error("[Yoink] no variants and no fallback — giving up");
            flash(btn, false);
          }
          return;
        }
        const best = res.variants[0];
        chrome.runtime.sendMessage({
          type: "DOWNLOAD_VIDEO",
          url: best.url,
          filename: `yoink-${tweetId}-${best.quality}.mp4`,
        });
        flash(btn, true);
      });
    } else {
      media.urls.forEach((src, i) => {
        const full = fullResImage(src);
        chrome.runtime.sendMessage({
          type: "DOWNLOAD_VIDEO",
          url: full,
          filename: `yoink-${tweetId}-${i + 1}.${imageExt(full)}`,
        });
      });
      flash(btn, true);
    }
  });
}

function scanAll() {
  document.querySelectorAll("article").forEach(injectButton);
}

const observer = new MutationObserver(scanAll);
observer.observe(document.body, { childList: true, subtree: true });
scanAll();
