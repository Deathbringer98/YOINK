async function fetchVideoVariants(tweetId) {
  const url =
    `https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}&lang=en` +
    `&features=tfw_timeline_list%3A%3Btfw_follower_count_sunset%3Atrue%3Btfw_tweet_edit_backend%3Aon`;

  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      Referer: "https://x.com/",
    },
  });

  if (!res.ok) throw new Error(`X returned HTTP ${res.status}`);

  const data = await res.json();
  const mediaDetails = data.mediaDetails || [];

  for (const media of mediaDetails) {
    if (media.type === "video" || media.type === "animated_gif") {
      const variants = (media.video_info?.variants || [])
        .filter((v) => v.content_type === "video/mp4")
        .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));

      return variants.map((v) => ({
        url: v.url,
        bitrate: v.bitrate || 0,
        quality: bitrateToLabel(v.bitrate || 0),
      }));
    }
  }

  return [];
}

function bitrateToLabel(bitrate) {
  if (bitrate >= 2_000_000) return "1080p";
  if (bitrate >= 1_000_000) return "720p";
  if (bitrate >= 500_000) return "480p";
  if (bitrate > 0) return "360p";
  return "SD";
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "FETCH_VIDEO") {
    fetchVideoVariants(message.tweetId)
      .then((variants) => sendResponse({ ok: true, variants }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true; // keep channel open for async response
  }

  if (message.type === "DOWNLOAD_VIDEO") {
    chrome.downloads.download(
      { url: message.url, filename: message.filename, saveAs: false },
      () => sendResponse({ ok: true })
    );
    return true;
  }
});
