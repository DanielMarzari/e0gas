import type { MetadataRoute } from "next";

export const dynamic = "force-static";

// Lets "Add to Home Screen" install e0 gas as a full-screen app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "e0 gas — ethanol-free stations",
    short_name: "e0 gas",
    description: "Find the nearest ethanol-free (E0) gas station.",
    start_url: "/",
    display: "standalone",
    background_color: "#eef0ec",
    theme_color: "#0f8a5f",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
