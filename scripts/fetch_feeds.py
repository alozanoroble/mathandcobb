#!/usr/bin/env python3
"""Fetch the latest @mathandcobb posts into site/feed.json.

Standard library only, so the GitHub Action needs no setup. Every source is
independent: one that fails is reported in `errors` and the page falls back to
its embed widget, so a flaky platform never blocks the deploy.

    python3 scripts/fetch_feeds.py [out_path]
"""

import json
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

YOUTUBE_CHANNEL = "UCsl3cpHnDaFTYnV66g8MB0A"  # youtube.com/@mathandcobb
BLUESKY_ACTOR = "mathandcobb.bsky.social"
X_HANDLE = "mathandcobb"
LIMIT = 12

UA = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/128 Safari/537.36")
NS = {
    "a": "http://www.w3.org/2005/Atom",
    "yt": "http://www.youtube.com/xml/schemas/2015",
    "media": "http://search.yahoo.com/mrss/",
}


def get(url, timeout=20):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def youtube_playlist(prefix):
    # The uploads playlist UU<id> splits into UULF<id> (long-form videos) and
    # UUSH<id> (Shorts); both have public Atom feeds of the latest 15.
    pid = prefix + YOUTUBE_CHANNEL[2:]
    root = ET.fromstring(get(
        f"https://www.youtube.com/feeds/videos.xml?playlist_id={pid}"))
    out = []
    for e in root.findall("a:entry", NS)[:LIMIT]:
        group = e.find("media:group", NS)
        stats = group.find("media:community/media:statistics", NS)
        out.append({
            "id": e.findtext("yt:videoId", namespaces=NS),
            "title": e.findtext("a:title", namespaces=NS),
            "published": e.findtext("a:published", namespaces=NS),
            "views": int(stats.get("views", 0)) if stats is not None else None,
        })
    return out


def bluesky():
    url = ("https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed"
           f"?actor={BLUESKY_ACTOR}&limit=30&filter=posts_no_replies")
    data = json.loads(get(url))
    out = []
    for item in data["feed"]:
        post = item["post"]
        rec = post["record"]
        entry = {
            "uri": post["uri"],
            "url": "https://bsky.app/profile/{}/post/{}".format(
                post["author"]["handle"], post["uri"].rsplit("/", 1)[-1]),
            "author": {
                "handle": post["author"]["handle"],
                "name": post["author"].get("displayName", ""),
                "avatar": post["author"].get("avatar"),
            },
            "text": rec.get("text", ""),
            "facets": rec.get("facets", []),
            "created": rec.get("createdAt"),
            "likes": post.get("likeCount", 0),
            "reposts": post.get("repostCount", 0),
            "replies": post.get("replyCount", 0),
            "repost": item.get("reason", {}).get("$type", "").endswith("reasonRepost"),
            "embed": simplify_bsky_embed(post.get("embed")),
        }
        out.append(entry)
        if len(out) == LIMIT:
            break
    return out


def simplify_bsky_embed(embed):
    if not embed:
        return None
    kind = embed.get("$type", "")
    if kind.startswith("app.bsky.embed.recordWithMedia"):
        return simplify_bsky_embed(embed.get("media"))
    if kind.startswith("app.bsky.embed.images"):
        return {"type": "images", "images": [
            {"thumb": i["thumb"], "full": i["fullsize"], "alt": i.get("alt", "")}
            for i in embed["images"]]}
    if kind.startswith("app.bsky.embed.external"):
        ext = embed["external"]
        return {"type": "link", "url": ext["uri"], "title": ext.get("title", ""),
                "description": ext.get("description", ""), "thumb": ext.get("thumb")}
    if kind.startswith("app.bsky.embed.video"):
        return {"type": "video", "thumb": embed.get("thumbnail")}
    return None


def x_best_effort():
    # X has no free read API and its timeline widget no longer renders for
    # logged-out visitors. The syndication endpoint behind that widget still
    # answers sometimes; when it does, take the newest post ids from it.
    html = get(f"https://syndication.twitter.com/srv/timeline-profile/"
               f"screen-name/{X_HANDLE}").decode("utf-8", "replace")
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.S)
    if not m:
        raise RuntimeError(html.strip()[:80] or "empty response")
    entries = json.loads(m.group(1))["props"]["pageProps"]["timeline"]["entries"]
    ids = []
    for e in entries:
        tw = e.get("content", {}).get("tweet")
        if tw and tw.get("user", {}).get("screen_name", "").lower() == X_HANDLE:
            ids.append(tw["id_str"])
    if not ids:
        raise RuntimeError("no posts in response")
    return [f"https://x.com/{X_HANDLE}/status/{i}" for i in ids[:6]]


def main():
    out_path = Path(sys.argv[1] if len(sys.argv) > 1 else "site/feed.json")
    feed = {"generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "errors": {}}
    sources = {
        "youtube_videos": lambda: youtube_playlist("UULF"),
        "youtube_shorts": lambda: youtube_playlist("UUSH"),
        "bluesky": bluesky,
        "x": x_best_effort,
    }
    for name, fn in sources.items():
        try:
            feed[name] = fn()
            print(f"{name}: {len(feed[name])} items")
        except Exception as exc:  # one bad source must not sink the rest
            feed[name] = []
            feed["errors"][name] = f"{type(exc).__name__}: {exc}"
            print(f"{name}: FAILED {feed['errors'][name]}")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(feed, ensure_ascii=False, indent=1),
                        encoding="utf-8")
    print(f"wrote {out_path}")


if __name__ == "__main__":
    main()
