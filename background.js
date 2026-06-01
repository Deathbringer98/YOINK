const BEARER =
  "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I%2BxGezTKlex3yE%2BdOaRuis%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";

function bitrateToLabel(bitrate) {
  if (bitrate >= 2_000_000) return "1080p";
  if (bitrate >= 1_000_000) return "720p";
  if (bitrate >= 500_000) return "480p";
  if (bitrate > 0) return "360p";
  return "SD";
}

function variantsFromMediaList(mediaList) {
  console.log("[Yoink] variantsFromMediaList — count:", mediaList.length, "types:", mediaList.map(m => m.type));
  for (const media of mediaList) {
    if (media.type === "video" || media.type === "animated_gif") {
      const all = media.video_info?.variants || [];
      console.log("[Yoink] raw variants:", JSON.stringify(all));
      const mp4 = all
        .filter((v) => v.content_type === "video/mp4")
        .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
      console.log("[Yoink] mp4 variants after filter:", JSON.stringify(mp4));
      if (mp4.length)
        return mp4.map((v) => ({
          url: v.url,
          bitrate: v.bitrate || 0,
          quality: bitrateToLabel(v.bitrate || 0),
        }));
    }
  }
  console.warn("[Yoink] variantsFromMediaList — nothing found");
  return [];
}

// ── Method 1: twitter.com internal API using user session cookies ──────────
async function fetchViaSession(tweetId, ct0) {
  console.log("[Yoink] [1] session API — ct0 present:", !!ct0);
  const res = await fetch(
    `https://twitter.com/i/api/1.1/statuses/show.json?id=${tweetId}&tweet_mode=extended`,
    {
      headers: { Authorization: `Bearer ${BEARER}`, "x-csrf-token": ct0 },
      credentials: "include",
    }
  );
  console.log("[Yoink] [1] session API status:", res.status);
  if (!res.ok) {
    const body = await res.text().catch(() => "(unreadable)");
    console.error("[Yoink] [1] session API error body:", body);
    throw new Error(`session ${res.status}`);
  }
  const data = await res.json();
  console.log("[Yoink] [1] session extended_entities:", JSON.stringify(data.extended_entities));
  return variantsFromMediaList(data.extended_entities?.media || data.entities?.media || []);
}

// ── Method 2: guest token (no user cookies needed) ────────────────────────
async function getGuestToken() {
  const res = await fetch("https://api.twitter.com/1.1/guest/activate.json", {
    method: "POST",
    headers: { Authorization: `Bearer ${BEARER}` },
  });
  console.log("[Yoink] [2] guest/activate status:", res.status);
  if (!res.ok) throw new Error(`guest/activate ${res.status}`);
  const { guest_token } = await res.json();
  console.log("[Yoink] [2] guest token:", guest_token);
  return guest_token;
}

async function fetchViaGuestToken(tweetId) {
  console.log("[Yoink] [2] guest token API");
  const guestToken = await getGuestToken();
  const res = await fetch(
    `https://api.twitter.com/1.1/statuses/show.json?id=${tweetId}&tweet_mode=extended`,
    {
      headers: {
        Authorization: `Bearer ${BEARER}`,
        "x-guest-token": guestToken,
      },
    }
  );
  console.log("[Yoink] [2] guest token API status:", res.status);
  if (!res.ok) {
    const body = await res.text().catch(() => "(unreadable)");
    console.error("[Yoink] [2] guest token error body:", body);
    throw new Error(`guest ${res.status}`);
  }
  const data = await res.json();
  console.log("[Yoink] [2] guest extended_entities:", JSON.stringify(data.extended_entities));
  return variantsFromMediaList(data.extended_entities?.media || data.entities?.media || []);
}

// ── Method 3: public api.twitter.com bearer only ──────────────────────────
async function fetchViaPublicAPI(tweetId) {
  console.log("[Yoink] [3] public api.twitter.com");
  const res = await fetch(
    `https://api.twitter.com/1.1/statuses/show.json?id=${tweetId}&tweet_mode=extended`,
    { headers: { Authorization: `Bearer ${BEARER}` } }
  );
  console.log("[Yoink] [3] public API status:", res.status);
  if (!res.ok) {
    const body = await res.text().catch(() => "(unreadable)");
    console.error("[Yoink] [3] public API error body:", body);
    throw new Error(`public ${res.status}`);
  }
  const data = await res.json();
  console.log("[Yoink] [3] public extended_entities:", JSON.stringify(data.extended_entities));
  return variantsFromMediaList(data.extended_entities?.media || data.entities?.media || []);
}

// ── Method 4: syndication API (no auth) ───────────────────────────────────
async function fetchViaSyndication(tweetId) {
  console.log("[Yoink] [4] syndication API");
  const url =
    `https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}&lang=en` +
    `&features=tfw_timeline_list%3A%3Btfw_follower_count_sunset%3Atrue%3Btfw_tweet_edit_backend%3Aon`;
  const res = await fetch(url);
  console.log("[Yoink] [4] syndication status:", res.status);
  if (!res.ok) {
    const body = await res.text().catch(() => "(unreadable)");
    console.error("[Yoink] [4] syndication error body:", body);
    throw new Error(`syndication ${res.status}`);
  }
  const data = await res.json();
  console.log("[Yoink] [4] syndication response keys:", Object.keys(data));
  console.log("[Yoink] [4] syndication mediaDetails:", JSON.stringify(data.mediaDetails));
  console.log("[Yoink] [4] syndication full response (first 800 chars):", JSON.stringify(data).slice(0, 800));
  return variantsFromMediaList(data.mediaDetails || []);
}

// ── Orchestrator ──────────────────────────────────────────────────────────
async function fetchVideoVariants(tweetId, ct0) {
  console.log("[Yoink] ── fetchVideoVariants start — tweetId:", tweetId, "ct0:", !!ct0);

  if (ct0) {
    try {
      const v = await fetchViaSession(tweetId, ct0);
      if (v.length) { console.log("[Yoink] ✓ session API succeeded"); return v; }
      console.warn("[Yoink] session API: 0 variants");
    } catch (e) { console.error("[Yoink] session API threw:", e.message); }
  } else {
    console.warn("[Yoink] no ct0 — skipping session API");
  }

  try {
    const v = await fetchViaGuestToken(tweetId);
    if (v.length) { console.log("[Yoink] ✓ guest token API succeeded"); return v; }
    console.warn("[Yoink] guest token API: 0 variants");
  } catch (e) { console.error("[Yoink] guest token API threw:", e.message); }

  try {
    const v = await fetchViaPublicAPI(tweetId);
    if (v.length) { console.log("[Yoink] ✓ public API succeeded"); return v; }
    console.warn("[Yoink] public API: 0 variants");
  } catch (e) { console.error("[Yoink] public API threw:", e.message); }

  const v = await fetchViaSyndication(tweetId);
  if (v.length) { console.log("[Yoink] ✓ syndication succeeded"); return v; }
  console.error("[Yoink] ✗ all methods exhausted — no variants found");
  return v;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "FETCH_VIDEO") {
    console.log("[Yoink] FETCH_VIDEO message received — tweetId:", message.tweetId);
    fetchVideoVariants(message.tweetId, message.ct0)
      .then((variants) => {
        console.log("[Yoink] sending response — variants:", variants.length);
        sendResponse({ ok: true, variants });
      })
      .catch((err) => {
        console.error("[Yoink] top-level error:", err.message);
        sendResponse({ ok: false, error: err.message });
      });
    return true;
  }

  if (message.type === "DOWNLOAD_VIDEO") {
    console.log("[Yoink] DOWNLOAD_VIDEO:", message.filename, message.url);
    chrome.downloads.download(
      { url: message.url, filename: message.filename, saveAs: false },
      () => sendResponse({ ok: true })
    );
    return true;
  }
});
