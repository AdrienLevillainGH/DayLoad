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
      },
    }),
  ],
});
