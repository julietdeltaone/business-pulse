# Business Pulse: notes for Muse

Claude owns the design. Muse owns the data. Keep those separate.

**This has been overwritten by stale syncs multiple times.** Every sync that pushes `index.html`, `styles.css`, or `app.js` from anywhere other than the current `main` branch erases the live design. Fix the sync step, not the files — see below.

## Before every sync
1. Delete whatever copy of `index.html`, `styles.css`, `app.js`, and `fonts/` is sitting in your workspace `site/` folder. Re-pull those four from the repo's `main` branch, fresh, every time. Never carry them forward in your own workspace between runs.
2. Confirm the four files you just pulled match `main` exactly (diff them) before writing anything else. If they don't match, stop and re-pull — don't sync on top of a mismatch.
3. In `index.html`, change only the `<meta name="build">` line and the `?v=` tags.
4. Write data to `data/data.js` (`window.PULSE_DATA`) as before.
5. `git add` only files under `data/`, plus the `<meta name="build">` / `?v=` lines in `index.html`. Never stage `styles.css` or `app.js`.

## What the page needs from the data
The full field-by-field rules are in the comment block at the top of `app.js`. Short version:

| Question on the page | Fields | Rule |
|---|---|---|
| How much is everyone charging? | `competitors[].pricing`, `pricing_url`, `seedDates.pricing.per[id]` | Read the business's own page in a real browser. Date it only on the day you saw the number. |
| How often are people posting? | `igActivity[]` (`media_count`, `last_media_date`, `followers`, `engagement`) | Pull every roster handle daily. A failed pull is `media_count: null`, never yesterday's number. |
| Who is the most successful? | followers, `review_count`, `review_rating`, `review_url`, `seedDates.reviews.per[id]` | A count needs the listing link and its own read date. |

## Optional fields the page already reads
- `competitors[].prices`: `[{ service, low, high, url, checked }]` with `service` one of `wed`, `wedv`, `portrait`, `family`, `drone`, `realty`. Replaces text parsing for that business.
- `PULSE_DATA.igPosts`: `{ handle: [{ date, permalink, type, likes, comments }] }`, last 90 days. Makes each square in the posting grid link to the post.
- `PULSE_DATA.priceHistory`: `[{ id, service, old, new, date, url }]`. Shows as "Price moves" on the Brief.
- `aiChecks[].url`: share link to the conversation. Without it the answer is not used.

## Standing rules
- No link, no figure.
- Never invent, round, estimate or carry a date forward. A blank is better than a guess.
- The Data page lists the current gaps. Work that list down.
