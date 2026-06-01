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
  console.log("[Yoink] mediaList length:", mediaList.length, mediaList.map(m => m.type));
  for (const media of mediaList) {
    if (media.type === "video" || media.type === "animated_gif") {
      const all = media.video_info?.variants || [];
      console.log("[Yoink] raw variants:", all);
      const variants = all
        .filter((v) => v.content_type === "video/mp4")
        .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
      console.log("[Yoink] mp4 variants after filter:", variants);
      if (variants.length)
        return variants.map((v) => ({
          url: v.url,
          bitrate: v.bitrate || 0,
          quality: bitrateToLabel(v.bitrate || 0),
        }));
    }
  }
  return [];
}

async function fetchViaSession(tweetId, ct0) {
  console.log("[Yoink] trying session API, ct0 present:", !!ct0);
  const res = await fetch(
    `https://twitter.com/i/api/1.1/statuses/show.json?id=${tweetId}&tweet_mode=extended`,
    {
      headers: {
        Authorization: `Bearer ${BEARER}`,
        "x-csrf-token": ct0,
      },
      credentials: "include",
    }
  );
  console.log("[Yoink] session API status:", res.status);
  if (!res.ok) {
    const text = await res.text().catch(() => "(unreadable)");
    console.error("[Yoink] session API error body:", text);
    throw new Error(`session ${res.status}`);
  }
  const data = await res.json();
  console.log("[Yoink] session API extended_entities:", data.extended_entities);
  console.log("[Yoink] session API entities:", data.entities);
  return variantsFromMediaList(
    data.extended_entities?.media || data.entities?.media || []
  );
}

async function fetchViaPublicAPI(tweetId) {
  console.log("[Yoink] trying public api.twitter.com");
  const res = await fetch(
    `https://api.twitter.com/1.1/statuses/show.json?id=${tweetId}&tweet_mode=extended`,
    { headers: { Authorization: `Bearer ${BEARER}` } }
  );
  console.log("[Yoink] public API status:", res.status);
  if (!res.ok) {
    const text = await res.text().catch(() => "(unreadable)");
    console.error("[Yoink] public API error body:", text);
    throw new Error(`public ${res.status}`);
  }
  const data = await res.json();
  console.log("[Yoink] public API extended_entities:", data.extended_entities);
  return variantsFromMediaList(
    data.extended_entities?.media || data.entities?.media || []
  );
}

async function fetchViaSyndication(tweetId) {
  console.log("[Yoink] trying syndication API");
  const url =
    `https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}&lang=en` +
    `&features=tfw_timeline_list%3A%3Btfw_follower_count_sunset%3Atrue%3Btfw_tweet_edit_backend%3Aon`;
  const res = await fetch(url);
  console.log("[Yoink] syndication status:", res.status);
  if (!res.ok) {
    const text = await res.text().catch(() => "(unreadable)");
    console.error("[Yoink] syndication error body:", text);
    throw new Error(`syndication ${res.status}`);
  }
  const data = await res.json();
  console.log("[Yoink] syndication mediaDetails:", data.mediaDetails);
  return variantsFromMediaList(data.mediaDetails || []);
}

async function fetchVideoVariants(tweetId, ct0) {
  console.log("[Yoink] fetchVideoVariants tweetId:", tweetId, "ct0 present:", !!ct0);

  if (ct0) {
    try {
      const v = await fetchViaSession(tweetId, ct0);
      if (v.length) { console.log("[Yoink] session API succeeded:", v); return v; }
      console.log("[Yoink] session API returned 0 variants, trying next");
    } catch (e) {
      console.error("[Yoink] session API threw:", e.message);
    }
  } else {
    console.warn("[Yoink] no ct0 cookie — skipping session API");
  }

  try {
    const v = await fetchViaPublicAPI(tweetId);
    if (v.length) { console.log("[Yoink] public API succeeded:", v); return v; }
    console.log("[Yoink] public API returned 0 variants, trying syndication");
  } catch (e) {
    console.error("[Yoink] public API threw:", e.message);
  }

  const v = await fetchViaSyndication(tweetId);
  console.log("[Yoink] syndication result:", v);
  return v;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "FETCH_VIDEO") {
    console.log("[Yoink] FETCH_VIDEO received for tweetId:", message.tweetId);
    fetchVideoVariants(message.tweetId, message.ct0)
      .then((variants) => {
        console.log("[Yoink] final variants:", variants);
        sendResponse({ ok: true, variants });
      })
      .catch((err) => {
        console.error("[Yoink] fetchVideoVariants failed:", err.message);
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
