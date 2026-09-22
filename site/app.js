// Renders the panels. feed.json is written by scripts/fetch_feeds.py (in the
// GitHub Action); Bluesky is also re-fetched live because its API allows it.

const BSKY_ACTOR = "mathandcobb.bsky.social";
const X_HANDLE = "mathandcobb";

const $ = (sel) => document.querySelector(sel);
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") n.className = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) if (kid != null) n.append(kid);
  return n;
};

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
function ago(iso) {
  const s = (new Date(iso) - Date.now()) / 1000;
  const steps = [[60, "second"], [3600, "minute"], [86400, "hour"], [604800, "day"], [2629800, "week"], [31557600, "month"], [Infinity, "year"]];
  const div = { second: 1, minute: 60, hour: 3600, day: 86400, week: 604800, month: 2629800, year: 31557600 };
  for (const [lim, unit] of steps) if (Math.abs(s) < lim) return rtf.format(Math.round(s / div[unit]), unit);
}
const nfmt = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const views = (v) => (v == null ? "" : `${nfmt.format(v)} views · `);

async function loadFeed() {
  try {
    const r = await fetch("feed.json", { cache: "no-cache" });
    if (r.ok) return await r.json();
  } catch {}
  return {};
}

/* ---------- YouTube ---------- */

const ytThumb = (id) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
const ytEmbed = (id) => `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`;

function playButton() { return el("span", { class: "play", "aria-hidden": "true" }); }

function playInto(container, id, title) {
  container.replaceChildren(el("iframe", {
    src: ytEmbed(id), title, allow: "autoplay; encrypted-media; picture-in-picture; fullscreen", allowfullscreen: true,
  }));
}

function renderVideos(videos) {
  const body = $("#yt-body");
  if (!videos.length) return body.replaceChildren(ytFallback());
  const player = el("div", { class: "player" });
  const title = el("h3");
  const meta = el("p", { class: "meta" });
  const list = el("div", { class: "yt-list" });

  function feature(v, autoplay) {
    title.textContent = v.title;
    meta.replaceChildren(`${views(v.views)}${ago(v.published)} · `, el("a", { href: `https://www.youtube.com/watch?v=${v.id}` }, "Watch on YouTube"));
    for (const b of list.children) b.setAttribute("aria-current", b.dataset.id === v.id);
    if (autoplay) return playInto(player, v.id, v.title);
    player.replaceChildren(el("button", { class: "player", "aria-label": `Play ${v.title}`, onclick: () => playInto(player, v.id, v.title) },
      el("img", { src: ytThumb(v.id), alt: "" }), playButton()));
  }

  for (const v of videos) {
    list.append(el("button", { class: "yt-item", "data-id": v.id, onclick: () => feature(v, true) },
      el("span", { class: "thumb" }, el("img", { src: ytThumb(v.id), alt: "", loading: "lazy" }), playButton()),
      el("span", {}, el("h4", {}, v.title), el("span", { class: "meta" }, `${views(v.views)}${ago(v.published)}`))));
  }
  body.replaceChildren(el("div", { class: "yt-grid" }, el("div", { class: "feature-meta" }, player, title, meta), list));
  feature(videos[0], false);
}

function renderShorts(shorts) {
  const body = $("#yt-body");
  if (!shorts.length) return body.replaceChildren(ytFallback());
  body.replaceChildren(el("div", { class: "shorts" }, shorts.map((v) => {
    const frame = el("button", { class: "thumb", "aria-label": `Play ${v.title}` }, el("img", { src: ytThumb(v.id), alt: "", loading: "lazy" }), playButton());
    frame.addEventListener("click", () => {
      const p = el("div", { class: "player" });
      frame.replaceWith(p);
      playInto(p, v.id, v.title);
    }, { once: true });
    return el("div", { class: "short" }, frame, el("h4", {}, v.title), el("p", { class: "meta" }, `${views(v.views)}${ago(v.published)}`));
  })));
}

function ytFallback() {
  return el("p", { class: "empty" }, "Couldn't load the latest videos. ", el("a", { href: "https://www.youtube.com/@mathandcobb" }, "See them on YouTube →"));
}

function setupYouTube(feed) {
  const tabs = document.querySelectorAll("#youtube [role=tab]");
  const show = (name) => {
    tabs.forEach((t) => t.setAttribute("aria-selected", t.dataset.tab === name));
    name === "shorts" ? renderShorts(feed.youtube_shorts || []) : renderVideos(feed.youtube_videos || []);
  };
  tabs.forEach((t) => t.addEventListener("click", () => show(t.dataset.tab)));
  show("videos");
}

/* ---------- Facebook ---------- */

function setupFacebook() {
  // The Page Plugin fixes its width at load (180–500px), so size it to the panel.
  const box = $("#fb-widget");
  const w = Math.max(180, Math.min(500, Math.floor(box.clientWidth)));
  const h = box.clientHeight || 640;
  const src = "https://www.facebook.com/plugins/page.php?" + new URLSearchParams({
    href: "https://www.facebook.com/mathandcobb", tabs: "timeline", width: w, height: h,
    small_header: "true", adapt_container_width: "true", hide_cover: "false", show_facepile: "false",
  });
  box.replaceChildren(el("iframe", { src, width: w, height: h, title: "Latest Facebook posts from Mathandcobb", loading: "lazy", scrolling: "no", allow: "encrypted-media", style: `width:${w}px` }));
}

/* ---------- Bluesky ---------- */

async function liveBluesky() {
  const url = `https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=${BSKY_ACTOR}&limit=30&filter=posts_no_replies`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(r.status);
  const data = await r.json();
  return data.feed.slice(0, 12).map(({ post, reason }) => ({
    url: `https://bsky.app/profile/${post.author.handle}/post/${post.uri.split("/").pop()}`,
    author: { handle: post.author.handle, name: post.author.displayName || "", avatar: post.author.avatar },
    text: post.record.text || "", facets: post.record.facets || [], created: post.record.createdAt,
    likes: post.likeCount || 0, reposts: post.repostCount || 0, replies: post.replyCount || 0,
    repost: !!reason && reason.$type.endsWith("reasonRepost"),
    embed: simplifyEmbed(post.embed),
  }));
}

function simplifyEmbed(e) {
  if (!e) return null;
  const t = e.$type || "";
  if (t.startsWith("app.bsky.embed.recordWithMedia")) return simplifyEmbed(e.media);
  if (t.startsWith("app.bsky.embed.images")) return { type: "images", images: e.images.map((i) => ({ thumb: i.thumb, full: i.fullsize, alt: i.alt || "" })) };
  if (t.startsWith("app.bsky.embed.external")) return { type: "link", url: e.external.uri, title: e.external.title, description: e.external.description, thumb: e.external.thumb };
  if (t.startsWith("app.bsky.embed.video")) return { type: "video", thumb: e.thumbnail };
  return null;
}

// Facets index UTF-8 bytes, not JS string positions.
function richText(text, facets) {
  const bytes = new TextEncoder().encode(text);
  const dec = new TextDecoder();
  const out = [];
  let pos = 0;
  const sorted = [...facets].sort((a, b) => a.index.byteStart - b.index.byteStart);
  for (const f of sorted) {
    const { byteStart: s, byteEnd: e } = f.index;
    if (s < pos) continue;
    out.push(dec.decode(bytes.slice(pos, s)));
    const label = dec.decode(bytes.slice(s, e));
    const feat = f.features[0] || {};
    let href = null;
    if (feat.$type === "app.bsky.richtext.facet#link") href = feat.uri;
    else if (feat.$type === "app.bsky.richtext.facet#mention") href = `https://bsky.app/profile/${feat.did}`;
    else if (feat.$type === "app.bsky.richtext.facet#tag") href = `https://bsky.app/hashtag/${encodeURIComponent(feat.tag)}`;
    out.push(href ? el("a", { href, target: "_blank", rel: "noopener" }, label) : label);
    pos = e;
  }
  out.push(dec.decode(bytes.slice(pos)));
  return out;
}

function renderBluesky(posts) {
  const list = $("#bs-posts");
  if (!posts.length) {
    return list.replaceChildren(el("li", { class: "empty" }, "Couldn't load posts. ", el("a", { href: `https://bsky.app/profile/${BSKY_ACTOR}` }, "See them on Bluesky →")));
  }
  list.replaceChildren(...posts.map((p) => {
    const media = [];
    const em = p.embed;
    if (em?.type === "images") {
      media.push(el("div", { class: `post-imgs n${Math.min(em.images.length, 4)}` },
        em.images.slice(0, 4).map((i) => el("a", { href: i.full, target: "_blank", rel: "noopener" }, el("img", { src: i.thumb, alt: i.alt, loading: "lazy" })))));
    } else if (em?.type === "video" && em.thumb) {
      media.push(el("a", { class: "post-imgs n1", href: p.url, target: "_blank", rel: "noopener", style: "position:relative;display:block" },
        el("img", { src: em.thumb, alt: "Video", loading: "lazy" }), playButton()));
    } else if (em?.type === "link") {
      let host = ""; try { host = new URL(em.url).hostname.replace(/^www\./, ""); } catch {}
      media.push(el("a", { class: "link-card", href: em.url, target: "_blank", rel: "noopener" },
        em.thumb ? el("img", { src: em.thumb, alt: "", loading: "lazy" }) : null,
        el("div", {}, el("b", {}, em.title || em.url), el("span", {}, host))));
    }
    return el("li", { class: "post" },
      el("img", { src: p.author.avatar || "", alt: "", loading: "lazy" }),
      el("div", {},
        p.repost ? el("div", { class: "repost-tag" }, "↻ Reposted") : null,
        el("div", { class: "post-head" },
          el("b", {}, p.author.name || p.author.handle),
          el("a", { href: p.url, target: "_blank", rel: "noopener" }, `@${p.author.handle} · ${ago(p.created)}`)),
        el("p", { class: "post-text" }, richText(p.text, p.facets || [])),
        media,
        el("div", { class: "stats" },
          el("span", { title: "Replies" }, `💬 ${p.replies}`),
          el("span", { title: "Reposts" }, `↻ ${p.reposts}`),
          el("span", { title: "Likes" }, `♡ ${p.likes}`))));
  }));
}

async function setupBluesky(feed) {
  renderBluesky(feed.bluesky || []);
  try { renderBluesky(await liveBluesky()); } catch {}
}

/* ---------- X ---------- */

async function setupX(feed) {
  let curated = [];
  try {
    const r = await fetch("x-posts.json", { cache: "no-cache" });
    if (r.ok) curated = await r.json();
  } catch {}
  // Newest first: whatever the Action fetched, then the hand-picked list.
  const urls = [...new Set([...(feed.x || []), ...curated])].slice(0, 6);
  const body = $("#x-body");
  const follow = el("div", { class: "x-follow" });
  follow.innerHTML = '<svg aria-hidden="true"><use href="#i-x"/></svg>';
  follow.append(
    el("p", {}, urls.length ? "More on X." : "Latest posts, threads and video clips on X."),
    el("a", { class: "btn", href: `https://x.com/${X_HANDLE}` }, `Follow @${X_HANDLE}`));
  if (!urls.length) return body.replaceChildren(follow);
  body.replaceChildren(...urls.map((u) => el("blockquote", { class: "twitter-tweet", "data-dnt": "true", "data-theme": matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light" },
    el("a", { href: u.replace("x.com", "twitter.com") }))), follow);
  const s = el("script", { src: "https://platform.twitter.com/widgets.js", async: true });
  document.body.append(s);
}

/* ---------- boot ---------- */

(async () => {
  setupFacebook();
  const feed = await loadFeed();
  setupYouTube(feed);
  setupBluesky(feed);
  setupX(feed);
  if (feed.generated) $("#updated").textContent = ago(feed.generated);
  const avatar = feed.bluesky?.find((p) => !p.repost)?.author.avatar;
  if (avatar) $("#avatar").src = avatar;
})();
