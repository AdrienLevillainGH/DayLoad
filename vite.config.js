import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// base must match the repository name, because GitHub Pages serves the
// site from https://<user>.github.io/<repo>/ . If you rename the repo,
// change this line too.
export default defineConfig({
  base: "/DayLoad/",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon-192.png", "icon-512.png"],

      // This manifest is only the fallback, used before anything is
      // chosen. public/icons/<shape>-<colourway>/manifest.webmanifest
      // holds one per combination, and the app swaps the <link> to the
      // chosen one — which is how the installed icon can be picked from
      // Settings at all. Those files are static because Google's
      // servers fetch the manifest and icons themselves when installing.
      manifest: {
        name: "DayLoad",
        short_name: "DayLoad",
        description: "Personal training load log",
        start_url: ".",
        scope: ".",
        display: "standalone",
        background_color: "#0f0f10",
        theme_color: "#0f0f10",
        orientation: "portrait",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },

      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,woff2}"],
        // 63 icon PNGs is about 600 kB. Precaching the twenty you will
        // never choose wastes the phone's storage and the first load;
        // the browser fetches the chosen one normally and caches it.
        globIgnores: ["**/icons/**"],
      },
    }),
  ],
});
