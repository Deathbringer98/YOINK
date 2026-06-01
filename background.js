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
  for (const media of mediaList) {
    if (media.type === "video" || media.type === "animated_gif") {
      const variants = (media.video_info?.variants || [])
        .filter((v) => v.content_type === "video/mp4")
        .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
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

// Primary: twitter.com internal API using the user's own session cookies
async function fetchViaSession(tweetId, ct0) {
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
  if (!res.ok) throw new Error(`session ${res.status}`);
  const data = await res.json();
  return variantsFromMediaList(
    data.extended_entities?.media || data.entities?.media || []
  );
}

// Fallback: public api.twitter.com with bearer only
async function fetchViaPublicAPI(tweetId) {
  const res = await fetch(
    `https://api.twitter.com/1.1/statuses/show.json?id=${tweetId}&tweet_mode=extended`,
    { headers: { Authorization: `Bearer ${BEARER}` } }
  );
  if (!res.ok) throw new Error(`public ${res.status}`);
  const data = await res.json();
  return variantsFromMediaList(
    data.extended_entities?.media || data.entities?.media || []
  );
}

// Last resort: syndication API (no auth)
async function fetchViaSyndication(tweetId) {
  const url =
    `https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}&lang=en` +
    `&features=tfw_timeline_list%3A%3Btfw_follower_count_sunset%3Atrue%3Btfw_tweet_edit_backend%3Aon`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`syndication ${res.status}`);
  const data = await res.json();
  return variantsFromMediaList(data.mediaDetails || []);
}

async function fetchVideoVariants(tweetId, ct0) {
  if (ct0) {
    try {
      const v = await fetchViaSession(tweetId, ct0);
      if (v.length) return v;
    } catch {}
  }
  try {
    const v = await fetchViaPublicAPI(tweetId);
    if (v.length) return v;
  } catch {}
  return fetchViaSyndication(tweetId);
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
