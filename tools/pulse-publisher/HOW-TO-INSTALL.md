# Pulse Publisher: install (about 5 minutes)

It starts in **dry-run**: it builds the dashboard data from the Business Pulse sheet and saves a preview in Drive. Nothing goes to GitHub and the live site is not touched. The old sync keeps running.

1. Open the **Business Pulse** sheet, then **Extensions > Apps Script**.
2. Delete what is in `Code.gs`, paste in the whole `Code.gs` from this folder, and save.
3. In the function menu at the top, pick **seedBase** and click **Run**. Approve the permissions it asks for (Sheets, Drive, outside URLs). This saves `pulse-base.json` in COMMAND CENTER > Business Data. It is a one-time step.
4. Pick **publishPulse** and click **Run**. The log should end with `Dry run OK`. A `pulse-preview-data.js` file appears in Business Data, and a "Pulse Publisher / dry-run" row lands in Admin Data > RunLog.
5. Pick **installTrigger** and click **Run**. It now runs every day at about 8:30 AM ET, after the old 7:54 sync.

## Going live (only after JD says go)
1. Make a fine-grained GitHub token: repository `julietdeltaone/business-pulse` only, permission **Contents: Read and write**.
2. Apps Script > Project Settings > Script Properties: add `GITHUB_TOKEN` (the token) and `MODE` = `live`.
3. Run **publishPulse** once by hand and check the site.
4. Then retire the old sync-pulse.sh.

## What it writes
- Live mode: only `data/data.js` in the repo. It never touches index.html, styles.css, app.js or fonts/.
- It never writes to the Business Pulse sheet.
- If a check fails (missing tab, under 80 competitors, a block shrinks by over 30%), it publishes nothing and logs `stopped` in RunLog. The site stays on its last good data.
