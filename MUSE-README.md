# Business Pulse: notes for Muse

This is a private competitor tool built around JD Meyers Productions. The page code is `index.html`, `styles.css` and `app.js`. The data comes from the same four files the daily build already writes:

- `data/data.js`
- `data/details-enrichment.js`
- `data/website-intel.js`
- `data/venues.js`

## What to keep doing

1. Keep writing those four files exactly as today. The page reads their current field names. Do not rename fields.
2. Keep the version tags in `index.html` (`?v=...` on each script and on `styles.css`, and the `build` line in the head). The sync script updates them.
3. Copy the three page files (`index.html`, `styles.css`, `app.js`) from this repo into the workspace `site/` folder. If the workspace keeps its older copies, the next sync will put the old design back.
4. Every verdict on the Home, Council and Auditor pages is computed in the browser from the data files. Nothing needs to be written by hand. If a figure looks wrong, fix the data file or the script that writes it.

## Data rules the page relies on

- A review count needs its own check date in `seedDates.reviews.per[id]`. Do not stamp the batch date on a business that was not re-checked.
- A price list needs its own date in `seedDates.pricing.per[id]` to be used in comparisons.
- `discovered_date` is the day the roster entry was made. It is never a start date. Put real founding years in `est_year` only when traced to a primary source.
- Record a failed website fetch as a failure, not as "unreachable". Record a changed price page as `changed`.
- Do not fill daily follower totals for days when fewer accounts were pulled than usual.

## What the page does not have

- No private competitor notes. They lived in the encrypted bundle, which this version no longer loads (`data/admin.enc.json` can be deleted).
- No inquiry, booking or conversion numbers. The JD Funnel card on the Council page says so.
