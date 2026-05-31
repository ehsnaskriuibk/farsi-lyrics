import { readFile, writeFile } from "node:fs/promises";

const CHANNEL_ID = "UC9y5EgYitKP_jpnVrRjPzfQ";
const FEED_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;
const INDEX_FILE = new URL("../index.html", import.meta.url);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function decodeXml(value = "") {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function textBetween(source, start, end) {
  const pattern = new RegExp(`${start}([\\s\\S]*?)${end}`);
  return decodeXml(source.match(pattern)?.[1]?.trim() || "");
}

function attr(source, pattern) {
  return decodeXml(source.match(pattern)?.[1]?.trim() || "");
}

function formatDate(isoDate) {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return "";
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
}

function formatNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number.toLocaleString("en-US") : "0";
}

function hasPersian(value) {
  return /[\u0600-\u06FF]/.test(value);
}

function stripChannelPrefix(title) {
  return title.replace(/^Farsi Lyrics\s*-\s*/i, "").trim();
}

function getPersianTitle(title) {
  if (/^TOP FARSI/i.test(title)) return "بهترین آهنگ‌های فارسی";

  const pipeParts = title.split("|").map((part) => part.trim());
  if (pipeParts.length > 1) {
    const pipePart = pipeParts.findLast?.((part) => hasPersian(part));
    if (pipePart) return pipePart;
  }

  const parenMatches = [...title.matchAll(/\(([^)]*[\u0600-\u06FF][^)]*)\)/g)].map((match) => match[1].trim());
  if (parenMatches.length) return parenMatches.at(-1);

  const dashParts = title.split(/\s+-\s+/).map((part) => part.trim());
  if (dashParts.length > 1) {
    const dashPart = dashParts.findLast?.((part) => hasPersian(part));
    if (dashPart) return dashPart;
  }

  if (hasPersian(title) && !/^Farsi Lyrics/i.test(title)) return title;
  return stripChannelPrefix(title).replace(/\s*\([^)]*[\u0600-\u06FF][^)]*\)\s*/g, "").trim();
}

function getEnglishTitle(title) {
  let value = stripChannelPrefix(title)
    .replace(/\s*\|.*$/g, "")
    .replace(/\s*-\s*[\u0600-\u06FF][\s\S]*$/g, "")
    .replace(/\s*\([^)]*[\u0600-\u06FF][^)]*\)\s*/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (/^TOP FARSI/i.test(title)) value = "Top Farsi AI Songs 2026 (Part 2)";
  if (hasPersian(title) && !/^Farsi Lyrics/i.test(title) && !/^TOP FARSI/i.test(title)) {
    value = `Teaser - ${getPersianTitle(title).replace(/[«»"]/g, "")}`;
  }

  return value || title;
}

function getDisplayName(title) {
  return title
    .replace(/^Farsi Lyrics\s*-\s*/i, "")
    .replace(/\s*-\s*Persian (Deep|Techno) House.*$/i, "")
    .replace(/\s*\(Rework\).*$/i, " (Rework)")
    .trim();
}

function inferType(title, description, isShort) {
  const combined = `${title} ${description}`.toLowerCase();
  if (isShort) return "YouTube Short";
  if (combined.includes("compilation") || combined.includes("top farsi")) return "Compilation";
  if (combined.includes("techno house")) return "Persian Techno House";
  if (combined.includes("deep house")) return "Persian Deep House";
  if (combined.includes("edm") || combined.includes("pop")) return "Persian Pop / EDM";
  if (combined.includes("english")) return "Persian / English";
  return "Persian Song";
}

function inferLabel(title, isShort, isLatest, isFeatured) {
  if (isFeatured) return "1M+ Views";
  if (isLatest) return "Latest";
  if (isShort) return "Short";
  if (/compilation|top farsi/i.test(title)) return "Compilation";
  if (/rework/i.test(title)) return "Rework";
  return "Track";
}

function getFeaturedIndex(videos) {
  let bestIndex = -1;
  let bestViews = 0;
  videos.forEach((video, index) => {
    if (video.viewCount >= 1_000_000 && video.viewCount > bestViews) {
      bestViews = video.viewCount;
      bestIndex = index;
    }
  });
  return bestIndex;
}

function toJsString(value) {
  return JSON.stringify(value);
}

function renderVideos(videos) {
  const lines = ["      const channelVideos = ["];

  videos.forEach((video) => {
    lines.push("        {");
    lines.push(`          id: ${toJsString(video.id)},`);
    lines.push(`          title: ${toJsString(video.title)},`);
    lines.push(`          fa: ${toJsString(video.fa)},`);
    lines.push(`          label: ${toJsString(video.label)},`);
    lines.push(`          date: ${toJsString(video.date)},`);
    lines.push(`          views: ${toJsString(video.views)},`);
    lines.push(`          likes: ${toJsString(video.likes)},`);
    lines.push(`          type: ${toJsString(video.type)},`);
    if (video.featured) lines.push("          featured: true,");
    lines.push(`          url: ${toJsString(video.url)},`);
    lines.push("        },");
  });

  lines.push("      ];");
  return lines.join("\n");
}

function renderStats({ latestDate, feedItems, featuredName }) {
  return `          <div class="stats-row reveal">
            <div class="stat-card">
              <div class="stat-label">Channel</div>
              <div class="stat-value">Farsi Lyrics</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">1M+ Track</div>
              <div class="stat-value">${featuredName || "Coming Soon"}</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Latest Upload</div>
              <div class="stat-value">${latestDate}</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Feed Items</div>
              <div class="stat-value">${feedItems}</div>
            </div>
          </div>`;
}

function parseFeed(xml) {
  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((match) => match[1]);
  const rawVideos = entries.map((entry) => {
    const id = textBetween(entry, "<yt:videoId>", "<\\/yt:videoId>");
    const rawTitle = textBetween(entry, "<title>", "<\\/title>");
    const mediaTitle = textBetween(entry, "<media:title>", "<\\/media:title>") || rawTitle;
    const description = textBetween(entry, "<media:description>", "<\\/media:description>");
    const published = textBetween(entry, "<published>", "<\\/published>");
    const url = attr(entry, /<link rel="alternate" href="([^"]+)"/);
    const views = Number(attr(entry, /<media:statistics views="([^"]+)"/));
    const likes = Number(attr(entry, /<media:starRating count="([^"]+)"/));
    const isShort = url.includes("/shorts/");

    return {
      id,
      title: getEnglishTitle(mediaTitle),
      fa: getPersianTitle(mediaTitle),
      date: formatDate(published),
      viewCount: views,
      likeCount: likes,
      views: formatNumber(views),
      likes: formatNumber(likes),
      type: inferType(mediaTitle, description, isShort),
      url,
      isShort,
      rawTitle: mediaTitle,
    };
  });

  const featuredIndex = getFeaturedIndex(rawVideos);
  return rawVideos.map((video, index) => ({
    ...video,
    label: inferLabel(video.rawTitle, video.isShort, index === 0, index === featuredIndex),
    featured: index === featuredIndex,
  }));
}

async function main() {
  const response = await fetch(FEED_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch YouTube feed: ${response.status} ${response.statusText}`);
  }

  const xml = await response.text();
  const videos = parseFeed(xml);
  if (!videos.length) throw new Error("No videos found in YouTube feed.");

  const html = await readFile(INDEX_FILE, "utf8");
  const featured = videos.find((video) => video.featured);
  const updatedStats = renderStats({
    latestDate: videos[0].date,
    feedItems: videos.length,
    featuredName: featured ? getDisplayName(featured.title) : "",
  });
  const updatedVideos = renderVideos(videos);

  let updated = html
    .replace(/          <div class="stats-row reveal">[\s\S]*?          <div class="video-grid" id="videoGrid"><\/div>/, `${updatedStats}\n\n          <div class="video-grid" id="videoGrid"></div>`)
    .replace(/      const channelVideos = \[[\s\S]*?\n      \];/, updatedVideos);

  if (updated === html) {
    console.log("No feed changes detected.");
    return;
  }

  await writeFile(INDEX_FILE, updated);
  console.log(`Updated ${videos.length} feed items. Featured: ${featured?.title || "none"}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
