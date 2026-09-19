# DayLoad

Personal training load log. One user, no accounts, no backend server.

The app is a static site on GitHub Pages. Its data lives in a second,
private repository, which is also where a scheduled GitHub Action fetches
new activities from COROS. Between them there is no server to run and
nothing to pay for.

## Run it locally

```
npm install
npm run dev
```

## Deploy

Push to `main`. The workflow in `.github/workflows/deploy.yml` builds the
site and publishes it to GitHub Pages.

One-time setup on GitHub: **Settings → Pages → Build and deployment →
Source: GitHub Actions**.

If the repository is not named `DayLoad`, change `base` in
`vite.config.js` to match, or the site loads a blank page.

## Where the data lives

`data.json`, in a private repo — `dayload-data` — holding the whole
dataset: sessions, activity types, presets and settings.

`localStorage` under `dayload:v1` is a cache of that file, not the truth.
A device with no token, or no signal, works from the cache alone and
pushes when it can.

Every read and write still goes through `src/storage.js`, and nothing
else in the app touches storage. `load()` reads the repo and merges the
local cache into it; `save()` writes the cache immediately and pushes to
GitHub a few seconds after the last change, so typing a note costs one
request rather than one per keystroke.

### Linking a device

Settings → Sync. Three fields: GitHub account, repo name, and a
fine-grained personal access token limited to that one repo, with
Contents and Actions set to read and write.

The token is the whole identification mechanism. GitHub verifies it, so
the app never has to — which is why there is no login screen and no
password to store. It stays in that browser. "Forget this device"
removes it.

A second person would not share this repo: they would make their own,
with their own token. Git has no per-file permissions, so a shared data
repo would be shared entirely, Actions secrets included.

## How two devices agree

`src/merge.js` holds the rules, and both sides of a sync run through it.

- Every session carries `updatedAt`. Between two versions of one
  session, the later stamp wins — the whole session, not field by field,
  because merging halves produces something neither device ever had.
- Deleting writes a tombstone to `graveyard` instead of removing the
  session. Without that, a device holding an older copy resurrects
  whatever the other one deleted. Tombstones are dropped after 90 days.
- `settings`, `types` and `templates` are stamped as wholes in `stamps`;
  the later stamp wins.
- Sessions are deduplicated on `corosLabelId`, but only ever by dropping
  a copy with nothing of yours in it. Two duplicates that both carry an
  RPE or a note are left alone.

Writes are conditional on the file's SHA, so a device that lost a race
is refused, re-reads, re-merges and retries rather than flattening the
other one's work.

## The COROS sync

In the data repo, not here. `sync.mjs` runs on a schedule (04:12 UTC)
and on demand from the app's "Fetch from COROS" button. It refreshes the
OAuth token, asks the COROS MCP server what is new, and writes one text
file per activity into `inbox/`.

It deliberately does not map anything into sessions. The parsing and the
field mapping live in `DayLoad.jsx`, where they are versioned alongside
the app and adjustable from Settings; a second copy in the sync script
would drift from the first. So the robot captures and the app maps.

COROS rotates its refresh token on every use, so the credential is a file
in the data repo that the workflow rewrites each run, not an Actions
secret — a workflow cannot update a secret without being handed a far
more dangerous permission. Only the robot talks to COROS: if the browser
also refreshed that token, the two would invalidate each other.

`status.json` is rewritten on every run, successful or not. That is
deliberate — it gives the scheduled workflow a commit even on a day with
no new activity, which stops GitHub disabling it for 60 days of
inactivity.

## Layout

```
src/DayLoad.jsx    the whole app
src/storage.js     the only place storage is touched
src/github.js      reads and writes the data repo, fires the workflow
src/merge.js       what happens when two devices disagree
src/coros.js       the in-browser COROS client (superseded by the Action)
src/main.jsx       mounts the app, asks the browser to keep the cache
```

## Still worth exporting

Settings → Your data. The repo is the backup now, and it has full
history, but an export is the copy that survives losing access to
GitHub.
