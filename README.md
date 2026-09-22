# MathAndCobb's Latest Posts

**https://alozanoroble.github.io/mathandcobb/**

One page with the latest videos and posts from Álvaro Lozano-Robledo
(@mathandcobb) on YouTube, TikTok, Instagram, Facebook, Bluesky and X.

| Panel | Source |
|---|---|
| YouTube | Channel RSS (videos and Shorts), refreshed every 3 hours |
| Bluesky | Public API, fetched live in the browser |
| TikTok | Official creator embed |
| Instagram | Profile embed |
| Facebook | Official Page Plugin |
| X | Post embeds of the URLs in `site/x-posts.json` |

A GitHub Action (`.github/workflows/pages.yml`) runs
`scripts/fetch_feeds.py` to build `site/feed.json`, then deploys `site/` to
GitHub Pages. It runs on every push, every 3 hours, and on demand.

Preview locally:

```bash
python3 scripts/fetch_feeds.py site/feed.json
python3 -m http.server 8765 --directory site
```
