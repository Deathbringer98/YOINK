const DOWNLOAD_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>`;
const CAMERA_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15.2a3.2 3.2 0 100-6.4 3.2 3.2 0 000 6.4z"/><path d="M9 2L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z"/></svg>`;

const DISCORD_LIMIT = 10 * 1024 * 1024;

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
  if (photos.length) return { type: "image", urls: photos.map((img) => img.src) };
  return null;
}

function fullResImage(src) {
  try {
    const u = new URL(src);
    u.searchParams.set("name", "orig");
    return u.toString();
  } catch { return src; }
}

function imageExt(src) {
  const m = src.match(/format=(\w+)/);
  return m ? m[1] : "jpg";
}

function playYoink() {
  try {
    chrome.storage.local.get({ yoinkSoundEnabled: true, yoinkVolume: 1 }, (s) => {
      if (!s.yoinkSoundEnabled) return;
      const audio = new Audio(chrome.runtime.getURL("yoink.mp3"));
      audio.volume = s.yoinkVolume;
      audio.play().catch(() => {});
    });
  } catch {}
}

function flash(btn, ok) {
  btn.classList.add(ok ? "yoink-done" : "yoink-fail");
  setTimeout(() => btn.classList.remove("yoink-done", "yoink-fail"), 1800);
}

function runtimeAlive() {
  try { return !!chrome?.runtime?.id; } catch { return false; }
}

function getCt0() {
  return document.cookie.match(/ct0=([^;]+)/)?.[1] || "";
}

function bestDiscordVariant(variants) {
  const fits = variants.filter(v => v.estimatedBytes > 0 && v.estimatedBytes < DISCORD_LIMIT);
  return fits.length ? fits[0] : variants[variants.length - 1];
}

function fetchAndDownload(tweetId, ct0, pickVariant, btn, fallbackUrl) {
  chrome.runtime.sendMessage({ type: "FETCH_VIDEO", tweetId, ct0 }, (res) => {
    if (chrome.runtime.lastError || !res?.ok || !res.variants?.length) {
      if (fallbackUrl) {
        chrome.runtime.sendMessage({ type: "DOWNLOAD_VIDEO", url: fallbackUrl, filename: `yoink-${tweetId}.mp4` });
        flash(btn, true);
      } else {
        flash(btn, false);
      }
      return;
    }
    const chosen = pickVariant(res.variants);
    chrome.runtime.sendMessage({ type: "DOWNLOAD_VIDEO", url: chosen.url, filename: `yoink-${tweetId}-${chosen.quality}.mp4` });
    flash(btn, true);
  });
}

async function screenshotArticle(article, tweetId, btn) {
  article.scrollIntoView({ behavior: "instant", block: "center" });
  await new Promise(r => setTimeout(r, 200));

  const rect = article.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;

  chrome.runtime.sendMessage({ type: "SCREENSHOT" }, (res) => {
    if (chrome.runtime.lastError || !res?.ok) { flash(btn, false); return; }

    const img = new Image();
    img.onload = () => {
      // Clamp crop region to actual image bounds
      const sx = Math.max(0, Math.round(rect.left * dpr));
      const sy = Math.max(0, Math.round(rect.top * dpr));
      const sw = Math.min(Math.round(rect.width * dpr), img.width - sx);
      const sh = Math.min(Math.round(rect.height * dpr), img.height - sy);

      const canvas = document.createElement("canvas");
      canvas.width = sw;
      canvas.height = sh;
      canvas.getContext("2d").drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = `yoink-${tweetId}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      flash(btn, true);
    };
    img.onerror = () => flash(btn, false);
    img.src = res.dataUrl;
  });
}

function injectButton(article) {
  const tweetId = getTweetId(article);
  if (!tweetId) return;

  const reply = article.querySelector('[data-testid="reply"]');
  const bar = reply ? reply.closest('[role="group"]') : null;
  if (!bar) return;

  const media = getMedia(article);

  // ── HD / SD buttons — checked independently so lazy-loaded media gets picked up ──
  if (media && !bar.querySelector(".yoink-hd")) {
    const btn = document.createElement("button");
    btn.className = "yoink-action yoink-hd";
    btn.title = "Download media (best quality)";
    btn.innerHTML = `${DOWNLOAD_ICON}<span class="yoink-hd-badge">HD</span>`;
    bar.appendChild(btn);

    btn.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      if (!runtimeAlive()) return;
      playYoink();
      if (media.type === "video") {
        fetchAndDownload(tweetId, getCt0(), v => v[0], btn, media.fallbackUrl);
      } else {
        media.urls.forEach((src, i) => {
          const full = fullResImage(src);
          chrome.runtime.sendMessage({ type: "DOWNLOAD_VIDEO", url: full, filename: `yoink-${tweetId}-${i + 1}.${imageExt(full)}` });
        });
        flash(btn, true);
      }
    });

    if (media.type === "video") {
      const dBtn = document.createElement("button");
      dBtn.className = "yoink-action yoink-discord";
      dBtn.title = "Download for Discord (≤10MB)";
      dBtn.innerHTML = `${DOWNLOAD_ICON}<span class="yoink-discord-badge">SD</span>`;
      bar.appendChild(dBtn);

      dBtn.addEventListener("click", (e) => {
        e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
        if (!runtimeAlive()) return;
        playYoink();
        fetchAndDownload(tweetId, getCt0(), bestDiscordVariant, dBtn, media.fallbackUrl);
      });
    }
  }

  // ── Screenshot button — independent check, shows on every post ───────
  if (!bar.querySelector(".yoink-screenshot")) {
    const ssBtn = document.createElement("button");
    ssBtn.className = "yoink-action yoink-screenshot";
    ssBtn.title = "Save post as PNG";
    ssBtn.innerHTML = `${CAMERA_ICON}<span class="yoink-ss-badge">PNG</span>`;
    bar.appendChild(ssBtn);

    ssBtn.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      if (!runtimeAlive()) return;
      playYoink();
      screenshotArticle(article, tweetId, ssBtn);
    });
  }
}

function scanAll() {
  document.querySelectorAll("article").forEach(injectButton);
}

const observer = new MutationObserver(scanAll);
observer.observe(document.body, { childList: true, subtree: true });
scanAll();
