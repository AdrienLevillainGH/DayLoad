# DayLoad

Personal training load log. Single user, local-first, no accounts, no backend.

## Run it locally

```bash
npm install
npm run dev
```

## Deploy

Push to `main`. The workflow in `.github/workflows/deploy.yml` builds the site
and publishes it to GitHub Pages.

One-time setup on GitHub: **Settings → Pages → Build and deployment →
Source: GitHub Actions**.

If the repository is not named `dayload`, change `base` in `vite.config.js`
to match, or the site will load a blank page.

## Where the data lives

In `localStorage`, on the device you're using, under the key `dayload:v1`.
It does not travel between devices and it is not backed up anywhere.
Export a copy from Settings → Your data now and then.

Every read and write goes through `src/storage.js`. Nothing else in the app
touches `localStorage`. To add a remote backend later, change `load()` and
`save()` in that one file.

## Layout

```
src/DayLoad.jsx    the whole app
src/storage.js     the only place storage is touched
src/main.jsx       mounts the app, asks the browser to keep the data
```
