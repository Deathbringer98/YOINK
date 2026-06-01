// Bearer tokens from yt-dlp's actively-maintained Twitter extractor
const BEARER_GQL =
  "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";
const BEARER_LEGACY =
  "AAAAAAAAAAAAAAAAAAAAAIK1zgAAAAAA2tUWuhGZ2JceoId5GwYWU5GspY4%3DUq7gzFoCZs1QfwGoVdvSac3IniczZEYXIcDyumCauIXpcAPorE";

// Token formula reverse-engineered by yt-dlp:
// ((Number(tweetId) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, '')
function syndicationToken(tweetId) {
  const n = (Number(tweetId) / 1e15) * Math.PI;
  return n.toString(36).replace(/[0.]/g, "");
}

function bitrateToLabel(bitrate) {
  if (bitrate >= 2_000_000) return "1080p";
  if (bitrate >= 1_000_000) return "720p";
  if (bitrate >= 500_000) return "480p";
  if (bitrate > 0) return "360p";
  return "SD";
}

function variantsFromMediaList(mediaList) {
  console.log("[Yoink] variantsFromMediaList — count:", mediaList.length);
  for (const media of mediaList) {
    if (media.type === "video" || media.type === "animated_gif") {
      const all = media.video_info?.variants || [];
      const mp4 = all
        .filter((v) => v.content_type === "video/mp4")
        .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
      console.log("[Yoink] mp4 variants:", JSON.stringify(mp4));
      if (mp4.length)
        return mp4.map((v) => ({
          url: v.url,
          bitrate: v.bitrate || 0,
          quality: bitrateToLabel(v.bitrate || 0),
        }));
    }
  }
  console.warn("[Yoink] variantsFromMediaList — nothing usable found");
  return [];
}

// ── Guest token (shared across methods) ──────────────────────────────────
let cachedGuestToken = null;
async function getGuestToken() {
  if (cachedGuestToken) return cachedGuestToken;
  console.log("[Yoink] fetching guest token");
  const res = await fetch("https://api.x.com/1.1/guest/activate.json", {
    method: "POST",
    headers: { Authorization: `Bearer ${BEARER_GQL}` },
    body: "",
  });
  console.log("[Yoink] guest/activate status:", res.status);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("[Yoink] guest/activate error:", body);
    throw new Error(`guest/activate ${res.status}`);
  }
  const { guest_token } = await res.json();
  console.log("[Yoink] guest token:", guest_token);
  cachedGuestToken = guest_token;
  // Cache expires after 15 min
  setTimeout(() => { cachedGuestToken = null; }, 15 * 60 * 1000);
  return guest_token;
}

// ── Method 1: GraphQL TweetResultByRestId (guest token, no login needed) ─
async function fetchViaGraphQL(tweetId) {
  console.log("[Yoink] [1] GraphQL");
  const guestToken = await getGuestToken();
  const variables = JSON.stringify({
    tweetId,
    withCommunity: false,
    includePromotedContent: false,
    withVoice: false,
  });
  const features = JSON.stringify({
    creator_subscriptions_tweet_preview_api_enabled: true,
    tweetypie_unmention_optimization_enabled: true,
    responsive_web_edit_tweet_api_enabled: true,
    graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
    view_counts_everywhere_api_enabled: true,
    longform_notetweets_consumption_enabled: true,
    responsive_web_twitter_article_tweet_consumption_enabled: false,
    tweet_awards_web_tipping_enabled: false,
    freedom_of_speech_not_reach_fetch_enabled: true,
    standardized_nudges_misinfo: true,
    tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
    longform_notetweets_rich_text_read_enabled: true,
    longform_notetweets_inline_media_enabled: true,
    responsive_web_graphql_exclude_directive_enabled: true,
    verified_phone_label_enabled: false,
    responsive_web_media_download_video_enabled: false,
    responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
    responsive_web_graphql_timeline_navigation_enabled: true,
    responsive_web_enhance_cards_enabled: false,
  });
  const url =
    `https://x.com/i/api/graphql/2ICDjqPd81tulZcYrtpTuQ/TweetResultByRestId` +
    `?variables=${encodeURIComponent(variables)}&features=${encodeURIComponent(features)}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${BEARER_GQL}`,
      "x-guest-token": guestToken,
    },
    credentials: "include",
  });
  console.log("[Yoink] [1] GraphQL status:", res.status);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("[Yoink] [1] GraphQL error:", res.status, body.slice(0, 300));
    throw new Error(`graphql ${res.status}`);
  }
  const data = await res.json();
  const legacy = data?.data?.tweetResult?.result?.legacy;
  console.log("[Yoink] [1] GraphQL legacy extended_entities:", JSON.stringify(legacy?.extended_entities));
  return variantsFromMediaList(legacy?.extended_entities?.media || legacy?.entities?.media || []);
}

// ── Method 2: Syndication API with math-derived token ────────────────────
async function fetchViaSyndication(tweetId) {
  console.log("[Yoink] [2] Syndication API");
  const token = syndicationToken(tweetId);
  console.log("[Yoink] [2] syndication token:", token);
  const url = `https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}&lang=en&token=${token}`;
  const res = await fetch(url, { headers: { "User-Agent": "Googlebot" } });
  console.log("[Yoink] [2] syndication status:", res.status);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("[Yoink] [2] syndication error:", body.slice(0, 300));
    throw new Error(`syndication ${res.status}`);
  }
  const data = await res.json();
  console.log("[Yoink] [2] syndication keys:", Object.keys(data));
  console.log("[Yoink] [2] syndication mediaDetails:", JSON.stringify(data.mediaDetails));
  return variantsFromMediaList(data.mediaDetails || []);
}

// ── Method 3: Legacy REST API with guest token ────────────────────────────
async function fetchViaLegacy(tweetId) {
  console.log("[Yoink] [3] Legacy REST API");
  const guestToken = await getGuestToken();
  const res = await fetch(
    `https://api.x.com/1.1/statuses/show.json?id=${tweetId}&tweet_mode=extended`,
    {
      headers: {
        Authorization: `Bearer ${BEARER_LEGACY}`,
        "x-guest-token": guestToken,
      },
    }
  );
  console.log("[Yoink] [3] Legacy status:", res.status);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("[Yoink] [3] Legacy error:", body.slice(0, 300));
    throw new Error(`legacy ${res.status}`);
  }
  const data = await res.json();
  console.log("[Yoink] [3] Legacy extended_entities:", JSON.stringify(data.extended_entities));
  return variantsFromMediaList(data.extended_entities?.media || data.entities?.media || []);
}

// ── Method 4: Session-based (user must be logged in, uses their cookies) ──
async function fetchViaSession(tweetId, ct0) {
  console.log("[Yoink] [4] Session API, ct0 present:", !!ct0);
  const res = await fetch(
    `https://x.com/i/api/1.1/statuses/show.json?id=${tweetId}&tweet_mode=extended`,
    {
      headers: {
        Authorization: `Bearer ${BEARER_GQL}`,
        "x-csrf-token": ct0,
      },
      credentials: "include",
    }
  );
  console.log("[Yoink] [4] Session status:", res.status);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("[Yoink] [4] Session error:", body.slice(0, 300));
    throw new Error(`session ${res.status}`);
  }
  const data = await res.json();
  console.log("[Yoink] [4] Session extended_entities:", JSON.stringify(data.extended_entities));
  return variantsFromMediaList(data.extended_entities?.media || data.entities?.media || []);
}

// ── Orchestrator ──────────────────────────────────────────────────────────
async function fetchVideoVariants(tweetId, ct0) {
  console.log("[Yoink] ── start — tweetId:", tweetId, "ct0:", !!ct0);

  try {
    const v = await fetchViaGraphQL(tweetId);
    if (v.length) { console.log("[Yoink] ✓ GraphQL"); return v; }
    console.warn("[Yoink] GraphQL: 0 variants");
  } catch (e) { console.error("[Yoink] GraphQL threw:", e.message); }

  try {
    const v = await fetchViaSyndication(tweetId);
    if (v.length) { console.log("[Yoink] ✓ Syndication"); return v; }
    console.warn("[Yoink] Syndication: 0 variants");
  } catch (e) { console.error("[Yoink] Syndication threw:", e.message); }

  try {
    const v = await fetchViaLegacy(tweetId);
    if (v.length) { console.log("[Yoink] ✓ Legacy"); return v; }
    console.warn("[Yoink] Legacy: 0 variants");
  } catch (e) { console.error("[Yoink] Legacy threw:", e.message); }

  if (ct0) {
    try {
      const v = await fetchViaSession(tweetId, ct0);
      if (v.length) { console.log("[Yoink] ✓ Session"); return v; }
      console.warn("[Yoink] Session: 0 variants");
    } catch (e) { console.error("[Yoink] Session threw:", e.message); }
  }

  console.error("[Yoink] ✗ all methods exhausted");
  return [];
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "FETCH_VIDEO") {
    console.log("[Yoink] FETCH_VIDEO — tweetId:", message.tweetId);
    fetchVideoVariants(message.tweetId, message.ct0)
      .then((variants) => {
        console.log("[Yoink] sending response — variants:", variants.length, variants.map(v => v.quality));
        sendResponse({ ok: true, variants });
      })
      .catch((err) => {
        console.error("[Yoink] top-level error:", err.message);
        sendResponse({ ok: false, error: err.message });
      });
    return true;
  }

  if (message.type === "DOWNLOAD_VIDEO") {
    console.log("[Yoink] DOWNLOAD_VIDEO:", message.filename);
    chrome.downloads.download(
      { url: message.url, filename: message.filename, saveAs: false },
      () => sendResponse({ ok: true })
    );
    return true;
  }
});
