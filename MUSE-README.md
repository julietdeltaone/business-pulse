# Business Pulse: notes for Muse

Claude owns the design. Muse owns the data, and — as of Nov 16, 2026 — Muse may also add new sections and pages, within the rules below.

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

---

## Adding a new section or page

You can now propose a new page (e.g. "Venues", "Reviews deep-dive") or a new section on an existing page (e.g. another pane on Brief), not just data. Four rules, no exceptions:

1. **Don't touch existing code.** Add a new function, a new nav entry, new CSS rules for your new component. Never edit an existing function body, an existing CSS rule, or existing markup. If the thing you want already exists, data-feed it instead of rebuilding it.
2. **Reuse the design system below. Introduce nothing new to it** — no new hex colors, no new font, no new border-radius or shadow values, no new component shape. Every new pane, number, and label is built from the tokens and helpers already in the file.
3. **Don't push straight to `main`.** Open your work on a branch named `muse-pages` (create it fresh from `main` each time, don't carry it forward) and leave it there — do not merge it yourself. Claude reviews it for design conformance and merges it in. This is the one exception to "Muse pushes to main freely" and it's there because of the repeated design overwrites above; once a few of these land cleanly it can be revisited.
4. **Log what you added.** Append one line to `MUSE-PAGES-LOG.md` (create it if missing) per new page/section: date, what it is, which branch commit. Makes review fast.

### Design system reference (don't deviate)

**Colors** (CSS custom properties already defined in `:root` — use `var(--name)`, never a literal hex):
| Token | Use |
|---|---|
| `--bg`, `--s1`, `--s2`, `--s3` | page background, pane background, raised surface, hover surface (darkest to lightest) |
| `--line`, `--line2` | hairline borders, dim and visible |
| `--tx`, `--tx2`, `--tx3` | text: primary, secondary, muted |
| `--you`, `--you2`, `--you-bg` | JD's own business — accent lilac, used nowhere else |
| `--them`, `--them2` | competitors — muted blue-grey |
| `--good`, `--warn`, `--bad` | up/fine, caution, down/bad |
| `--gold`, `--silver`, `--bronze` | medal colors only |

**Type:** `var(--disp)` (Bricolage Grotesque) for headlines, big numbers, and anything meant to be read as a statement. Everything else inherits Instrument Sans from `body`. No other typeface, ever.

**Layout:** panes are `.pane` (rounded surface, `var(--s1)` background, `var(--line)` border, `24px 26px` padding) laid out in a CSS grid of 12 columns (see `.deck` and the `.w-*` span classes). A page opens with `head(title, subtitle, rightSideHtml)` and uses `empty(text)` for a pane with nothing to show.

**Existing component helpers in `app.js`** — call these, don't rebuild them: `A(text, url, title)` wraps a figure in its source link (mandatory — see "no link, no figure"); `cnt(value, prefix, suffix, decimals)` animates a number counting up; `dial(pct)` draws the semicircular gauge; `radar(boards)` draws the spider chart; `podium(medals)` draws the 3-column medal podium; `vbars(items, cssClass)` draws a vertical bar chart; `dotStrip(service)` draws the price dot-plot; `bl(items)` renders a bullet list. A new section should be assembled almost entirely out of these plus `.pane`/`head`/`empty` — if a new visual doesn't fit any of them, that's a sign to simplify the section rather than add a new drawing routine.

**Numbers:** every figure on a new page follows the same contract as everywhere else on the site — wrapped in `A()` with a real source link, dated, never invented or estimated.

**Navigation:** a new top-level page gets one `<a href="#yourpage">Your Page</a>` added to `#nav` in `index.html`, in the same style as the existing five, and a matching entry added to the `VIEWS` router object in `app.js` (`yourpage: viewYourPage`). That's the only index.html/app.js wiring a new page needs beyond its own code.
