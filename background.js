// ── Update checker ───────────────────────────────────────────────────────────
const UPDATE_ALARM = "yoink-update-check";
const UPDATE_URL   = "https://raw.githubusercontent.com/Deathbringer98/YOINK/main/manifest.json";

function newerThan(a, b) {
  const ap = a.split(".").map(Number);
  const bp = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((ap[i] || 0) > (bp[i] || 0)) return true;
    if ((ap[i] || 0) < (bp[i] || 0)) return false;
  }
  return false;
}

async function checkForUpdate() {
  try {
    const res = await fetch(`${UPDATE_URL}?_=${Date.now()}`);
    if (!res.ok) return;
    const { version } = await res.json();
    const current = chrome.runtime.getManifest().version;
    if (version && newerThan(version, current)) {
      chrome.storage.local.set({ yoinkUpdateAvailable: version });
      chrome.notifications.create("yoink-update", {
        type: "basic",
        iconUrl: "128x128.png",
        title: "Yoink update available!",
        message: `v${version} is ready — click the Yoink icon to download.`,
        buttons: [{ title: "View on GitHub" }],
        requireInteraction: false
      });
    } else {
      chrome.storage.local.remove("yoinkUpdateAvailable");
    }
  } catch {}
}

// Register on every service-worker wake so listeners survive restarts
chrome.runtime.onInstalled.addListener(() => {
  // Create alarm (idempotent — Chrome dedupes by name)
  chrome.alarms.create(UPDATE_ALARM, { delayInMinutes: 5, periodInMinutes: 360 });
  checkForUpdate();
});

chrome.runtime.onStartup.addListener(checkForUpdate);

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === UPDATE_ALARM) checkForUpdate();
});

chrome.notifications.onButtonClicked.addListener((id, btnIdx) => {
  if (id === "yoink-update" && btnIdx === 0) {
    chrome.tabs.create({ url: "https://github.com/Deathbringer98/YOINK" });
    chrome.notifications.clear("yoink-update");
  }
});
// ─────────────────────────────────────────────────────────────────────────────

const BEARER_GQL =
  "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";
const BEARER_LEGACY =
  "AAAAAAAAAAAAAAAAAAAAAIK1zgAAAAAA2tUWuhGZ2JceoId5GwYWU5GspY4%3DUq7gzFoCZs1QfwGoVdvSac3IniczZEYXIcDyumCauIXpcAPorE";

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
  for (const media of mediaList) {
    if (media.type === "video" || media.type === "animated_gif") {
      const durationMs = media.video_info?.duration_millis || 0;
      const mp4 = (media.video_info?.variants || [])
        .filter((v) => v.content_type === "video/mp4")
        .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
      if (mp4.length)
        return mp4.map((v) => ({
          url: v.url,
          bitrate: v.bitrate || 0,
          quality: bitrateToLabel(v.bitrate || 0),
          // estimated bytes = duration(s) × bitrate(bps) ÷ 8
          estimatedBytes: durationMs > 0 ? Math.ceil((durationMs / 1000) * (v.bitrate || 0) / 8) : 0,
        }));
    }
  }
  return [];
}

let cachedGuestToken = null;
async function getGuestToken() {
  if (cachedGuestToken) return cachedGuestToken;
  const res = await fetch("https://api.x.com/1.1/guest/activate.json", {
    method: "POST",
    headers: { Authorization: `Bearer ${BEARER_GQL}` },
    body: "",
  });
  if (!res.ok) throw new Error(`guest/activate ${res.status}`);
  const { guest_token } = await res.json();
  cachedGuestToken = guest_token;
  setTimeout(() => { cachedGuestToken = null; }, 15 * 60 * 1000);
  return guest_token;
}

async function fetchViaGraphQL(tweetId) {
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
  if (!res.ok) throw new Error(`graphql ${res.status}`);
  const data = await res.json();
  const legacy = data?.data?.tweetResult?.result?.legacy;
  return variantsFromMediaList(legacy?.extended_entities?.media || legacy?.entities?.media || []);
}

async function fetchViaSyndication(tweetId) {
  const token = syndicationToken(tweetId);
  const url = `https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}&lang=en&token=${token}`;
  const res = await fetch(url, { headers: { "User-Agent": "Googlebot" } });
  if (!res.ok) throw new Error(`syndication ${res.status}`);
  const data = await res.json();
  return variantsFromMediaList(data.mediaDetails || []);
}

async function fetchViaLegacy(tweetId) {
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
  if (!res.ok) throw new Error(`legacy ${res.status}`);
  const data = await res.json();
  return variantsFromMediaList(data.extended_entities?.media || data.entities?.media || []);
}

async function fetchViaSession(tweetId, ct0) {
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
  if (!res.ok) throw new Error(`session ${res.status}`);
  const data = await res.json();
  return variantsFromMediaList(data.extended_entities?.media || data.entities?.media || []);
}

async function fetchVideoVariants(tweetId, ct0) {
  try {
    const v = await fetchViaGraphQL(tweetId);
    if (v.length) return v;
  } catch {}

  try {
    const v = await fetchViaSyndication(tweetId);
    if (v.length) return v;
  } catch {}

  try {
    const v = await fetchViaLegacy(tweetId);
    if (v.length) return v;
  } catch {}

  if (ct0) {
    try {
      const v = await fetchViaSession(tweetId, ct0);
      if (v.length) return v;
    } catch {}
  }

  return [];
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "FETCH_VIDEO") {
    fetchVideoVariants(message.tweetId, message.ct0)
      .then((variants) => sendResponse({ ok: true, variants }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (message.type === "DOWNLOAD_VIDEO") {
    chrome.downloads.download(
      { url: message.url, filename: message.filename, saveAs: false },
      () => sendResponse({ ok: true })
    );
    return true;
  }
});
