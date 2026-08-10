# Launch tracking

Link to post everywhere: **`https://adarsh-golait.vercel.app`**

One link, no per-channel paths. Optional UTM tags can be appended
(`?utm_source=linkedin&utm_medium=social&utm_campaign=launch`) — harmless, and
they become filterable only if Web Analytics is ever upgraded to Plus.

## Before any of it records

Vercel dashboard → project → **Analytics** → **Enable**, then redeploy. Routes
scoped at `/_vercel/insights/*` are only attached on the deployment *after*
enabling. Verify with:

```
curl -s -o /dev/null -w "%{content_type}\n" https://adarsh-golait.vercel.app/_vercel/insights/script.js
# must print application/javascript — HTML or a 404 means it is not recording
```

## Why the rewrite in vercel.json has a negative lookahead

The tracking script lives at `/_vercel/insights/script.js`. The SPA catch-all
rewrite (`/(.*)` → `/index.html`) swallowed it — the browser then parsed HTML as
JavaScript and analytics silently collected nothing, with no visible breakage.
`/((?!_vercel/).*)` keeps that path reserved. JSON has no comments, hence this
note. Do not revert the source pattern.

## What the dashboard gives

Pages · Routes · Hostnames · Referrers · country · browser · device · OS.

Source attribution rests on **Referrers**, which is partial by nature: the
LinkedIn and Instagram in-app browsers usually send no referrer, so those land
in the "direct" bucket alongside genuinely direct traffic. Splitting them apart
needs either UTM filtering (paid tier) or a distinct path per channel.

## What it cannot tell you

No names, no emails, no employer. Privacy-preserving analytics by design, not a
config gap. Identity signals come from LinkedIn's own post and profile
analytics, or from someone contacting you.
