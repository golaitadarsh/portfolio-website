# Launch tracking — which link to post where

Base URL: `https://adarsh-golait.vercel.app`

Each channel gets its own path. All of them render the same home page, but
analytics records them as separate pages — so the page list *is* the source
breakdown. UTM params are appended too: harmless, and they light up if Web
Analytics is ever upgraded to a plan with UTM filtering.

| Channel | Link to post |
|---|---|
| LinkedIn post | `https://adarsh-golait.vercel.app/li?utm_source=linkedin&utm_medium=social&utm_campaign=launch` |
| Instagram bio / story | `https://adarsh-golait.vercel.app/ig` |
| X (Twitter) | `https://adarsh-golait.vercel.app/x?utm_source=x&utm_medium=social&utm_campaign=launch` |
| WhatsApp / DMs | `https://adarsh-golait.vercel.app/wa` |
| Email signature, job applications | `https://adarsh-golait.vercel.app/mail` |
| Anything untagged (resume PDF, verbal) | `https://adarsh-golait.vercel.app/` |

Short forms for Instagram bio and stories (no query string, fits the 
character limit, does not look like an ad link):
`adarsh-golait.vercel.app/ig`

## Rules

- **Never post the bare `/` link on a channel that has an alias.** The bare URL
  is the "unknown source" bucket — keep it clean so it stays meaningful.
- The OG share card is identical on every alias (`og:url` and `canonical` still
  point at `/`), so LinkedIn and X preview cards are unaffected.
- Aliases are defined in [src/router/index.ts](src/router/index.ts). Adding a
  channel = adding one string to that `alias` array.
- Do not shorten through bit.ly — it strips the path and adds a redirect hop.

## Why the rewrite in vercel.json has a negative lookahead

The tracking script lives at `/_vercel/insights/script.js`. The SPA catch-all
rewrite (`/(.*)` → `/index.html`) swallowed it — the browser then parsed HTML as
JavaScript and analytics silently collected nothing, with no visible breakage.
`/((?!_vercel/).*)` keeps that path reserved. JSON has no comments, hence this
note. Do not revert the source pattern.

## Reading the numbers

Vercel dashboard → project → Analytics.

- **Pages** — `/li` vs `/ig` vs `/x` = source split. Deeper paths
  (`/experience`, `/projects`) = what people actually read.
- **Referrers** — real domains, but expect a large "direct" bucket: LinkedIn and
  Instagram in-app browsers usually send no referrer at all. This is why the
  aliases exist.
- **Countries / devices / browsers** — aggregate only, no visitor identity.

## What this cannot tell you

No names, no emails, no company. That is a hard limit of privacy-preserving
analytics, not a config gap. Identity signals come from elsewhere:

- LinkedIn's own post + profile analytics (names of who viewed your profile,
  job titles and companies of who saw the post).
- Direct contact — an email or a form on the site.
