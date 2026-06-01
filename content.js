const DOWNLOAD_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>`;

const DISCORD_LIMIT = 10 * 1024 * 1024; // 10MB

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

function runtimeAlive() {
  try { return !!chrome?.runtime?.id; } catch { return false; }
}

function getCt0() {
  return document.cookie.match(/ct0=([^;]+)/)?.[1] || "";
}

// Pick highest quality variant estimated to be under 10MB.
// Falls back to lowest quality if all exceed the limit or size is unknown.
function bestDiscordVariant(variants) {
  const fits = variants.filter(v => v.estimatedBytes > 0 && v.estimatedBytes < DISCORD_LIMIT);
  return fits.length ? fits[0] : variants[variants.length - 1];
}

function fetchAndDownload(tweetId, ct0, pickVariant, btn, fallbackUrl) {
  chrome.runtime.sendMessage({ type: "FETCH_VIDEO", tweetId, ct0 }, (res) => {
    if (chrome.runtime.lastError || !res?.ok || !res.variants?.length) {
      if (fallbackUrl) {
        chrome.runtime.sendMessage({
          type: "DOWNLOAD_VIDEO",
          url: fallbackUrl,
          filename: `yoink-${tweetId}.mp4`,
        });
        flash(btn, true);
      } else {
        flash(btn, false);
      }
      return;
    }
    const chosen = pickVariant(res.variants);
    chrome.runtime.sendMessage({
      type: "DOWNLOAD_VIDEO",
      url: chosen.url,
      filename: `yoink-${tweetId}-${chosen.quality}.mp4`,
    });
    flash(btn, true);
  });
}

function injectButton(article) {
  const media = getMedia(article);
  if (!media) return;

  const tweetId = getTweetId(article);
  if (!tweetId) return;

  const reply = article.querySelector('[data-testid="reply"]');
  const bar = reply ? reply.closest('[role="group"]') : null;
  if (!bar || bar.querySelector(".yoink-action")) return;

  // ── Standard download button ──────────────────────────────────────────
  const btn = document.createElement("button");
  btn.className = "yoink-action";
  btn.title = "Download media (best quality)";
  btn.innerHTML = `${DOWNLOAD_ICON}<span class="yoink-hd-badge">HD</span>`;
  bar.appendChild(btn);

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    if (!runtimeAlive()) return;
    playYoink();

    if (media.type === "video") {
      fetchAndDownload(tweetId, getCt0(), v => v[0], btn, media.fallbackUrl);
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

  // ── Discord button (videos only) ──────────────────────────────────────
  if (media.type === "video") {
    const dBtn = document.createElement("button");
    dBtn.className = "yoink-action yoink-discord";
    dBtn.title = "Download for Discord (≤10MB)";
    dBtn.innerHTML = `${DOWNLOAD_ICON}<span class="yoink-discord-badge">SD</span>`;
    bar.appendChild(dBtn);

    dBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      if (!runtimeAlive()) return;
      playYoink();
      fetchAndDownload(tweetId, getCt0(), bestDiscordVariant, dBtn, media.fallbackUrl);
    });
  }
}

function scanAll() {
  document.querySelectorAll("article").forEach(injectButton);
}

const observer = new MutationObserver(scanAll);
observer.observe(document.body, { childList: true, subtree: true });
scanAll();
