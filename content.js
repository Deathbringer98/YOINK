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
  try {
    // ── 1. Extract post data ──────────────────────────────────────────
    const avatarSrc = article.querySelector('[data-testid="Tweet-User-Avatar"] img')?.src ?? "";

    const userNameEl = article.querySelector('[data-testid="User-Name"]');
    const nameText   = userNameEl?.querySelector("div > span")?.innerText?.trim() ?? "";
    const handleText = [...(userNameEl?.querySelectorAll("span") ?? [])]
      .find(s => s.innerText?.trim().startsWith("@"))?.innerText?.trim() ?? "";

    const textEl    = article.querySelector('[data-testid="tweetText"]');
    const mediaSrcs = [...article.querySelectorAll('[data-testid="tweetPhoto"] img')]
      .filter(img => !img.closest('[data-testid="videoPlayer"]'))
      .map(img => fullResImage(img.src));

    const timeEl  = article.querySelector("time");
    const timeStr = timeEl?.dateTime
      ? new Date(timeEl.dateTime).toLocaleString("en-US", {
          hour: "numeric", minute: "2-digit", hour12: true,
          month: "long", day: "numeric", year: "numeric"
        })
      : "";

    // ── 2. Build off-screen styled card ──────────────────────────────
    const wrap = document.createElement("div");
    Object.assign(wrap.style, {
      position: "absolute", left: "-9999px", top: "0",
      width: "680px", padding: "28px",
      background: "linear-gradient(135deg, #dbeafe 0%, #ede9fe 100%)",
      display: "flex", justifyContent: "center", alignItems: "flex-start",
      boxSizing: "border-box"
    });

    const card = document.createElement("div");
    Object.assign(card.style, {
      background: "#ffffff", width: "100%", padding: "24px 28px 20px",
      borderRadius: "16px", boxSizing: "border-box",
      boxShadow: "0 8px 32px rgba(0,0,0,.16), 0 2px 8px rgba(0,0,0,.08)",
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      color: "#0f1419"
    });

    // Header: avatar + name + handle
    const header = document.createElement("div");
    Object.assign(header.style, {
      display: "flex", alignItems: "center",
      marginBottom: "14px", gap: "12px"
    });

    if (avatarSrc) {
      const av = document.createElement("img");
      av.src = avatarSrc;
      av.crossOrigin = "anonymous";
      Object.assign(av.style, {
        width: "48px", height: "48px", borderRadius: "50%",
        flexShrink: "0", border: "1px solid #eff3f4"
      });
      header.appendChild(av);
    }

    const userBlock = document.createElement("div");
    Object.assign(userBlock.style, { display: "flex", flexDirection: "column", gap: "2px" });

    const nameNode = document.createElement("span");
    nameNode.textContent = nameText;
    Object.assign(nameNode.style, { fontWeight: "700", fontSize: "15px", color: "#0f1419", lineHeight: "1.3" });

    const handleNode = document.createElement("span");
    handleNode.textContent = handleText;
    Object.assign(handleNode.style, { fontSize: "14px", color: "#536471", lineHeight: "1.3" });

    userBlock.appendChild(nameNode);
    userBlock.appendChild(handleNode);
    header.appendChild(userBlock);
    card.appendChild(header);

    // Tweet text — clone to preserve inline formatting (mentions, hashtags, etc.)
    if (textEl) {
      const clone = textEl.cloneNode(true);
      Object.assign(clone.style, {
        fontSize: "18px", lineHeight: "1.55", color: "#0f1419",
        marginBottom: mediaSrcs.length ? "14px" : "0",
        whiteSpace: "pre-wrap", wordBreak: "break-word", display: "block"
      });
      // Force readable dark colour on everything (overrides X's dark-mode whites)
      clone.querySelectorAll("*").forEach(el => { el.style.color = "#0f1419"; });

      // Convert Twitter SVG emoji → PNG data-URI (html2canvas can't render SVGs reliably)
      const emojiJobs = [];
      clone.querySelectorAll('img[src*="twimg.com/emoji"], img[src*="abs.twimg.com/emoji"]').forEach(img => {
        emojiJobs.push(new Promise(res => {
          const tmp = new Image();
          tmp.crossOrigin = "anonymous";
          tmp.onload = () => {
            const ec = document.createElement("canvas");
            ec.width = ec.height = 72;
            ec.getContext("2d").drawImage(tmp, 0, 0, 72, 72);
            img.src = ec.toDataURL("image/png");
            Object.assign(img.style, {
              width: "1.2em", height: "1.2em",
              display: "inline-block", verticalAlign: "-0.2em",
              margin: "0 0.05em"
            });
            res();
          };
          tmp.onerror = res;
          tmp.src = img.src;
        }));
      });
      await Promise.all(emojiJobs);
      card.appendChild(clone);
    }

    // Media images (up to 4, 2-column grid for multiple)
    if (mediaSrcs.length) {
      const grid = document.createElement("div");
      const multi = mediaSrcs.length > 1;
      Object.assign(grid.style, {
        display: "grid",
        gridTemplateColumns: multi ? "1fr 1fr" : "1fr",
        gap: "4px", marginTop: "12px",
        borderRadius: "12px", overflow: "hidden"
      });
      mediaSrcs.slice(0, 4).forEach(src => {
        const img = document.createElement("img");
        img.src = src;
        img.crossOrigin = "anonymous";
        Object.assign(img.style, {
          width: "100%", display: "block",
          aspectRatio: multi ? "1/1" : "16/9",
          objectFit: "cover"
        });
        grid.appendChild(img);
      });
      card.appendChild(grid);
    }

    // Footer: timestamp
    const footer = document.createElement("div");
    Object.assign(footer.style, {
      borderTop: "1px solid #eff3f4",
      marginTop: "16px", paddingTop: "12px",
      fontSize: "13px", color: "#536471"
    });
    footer.textContent = timeStr;
    card.appendChild(footer);

    wrap.appendChild(card);
    document.body.appendChild(wrap);

    // Let layout settle then fix height so gradient background isn't cropped
    await new Promise(r => setTimeout(r, 60));
    wrap.style.height = (card.offsetHeight + 56) + "px";

    // ── 3. Render with html2canvas ────────────────────────────────────
    const canvas = await html2canvas(wrap, {
      scale: 2,
      useCORS: true,
      allowTaint: false,
      logging: false,
      backgroundColor: null
    });

    // ── 4. Download ───────────────────────────────────────────────────
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `yoink-${tweetId}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    document.body.removeChild(wrap);
    flash(btn, true);
  } catch (err) {
    console.error("[Yoink] screenshot error:", err);
    document.querySelectorAll('[style*="-9999px"]').forEach(el => el.remove());
    flash(btn, false);
  }
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
