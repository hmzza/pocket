import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Pocket Delivery Alerts",
    short_name: "Pocket Delivery",
    description: "Pocket G-11 delivery order alerts and dispatch board.",
    start_url: "/admin/delivery",
    display: "standalone",
    background_color: "#fff8ed",
    theme_color: "#e25d2d",
    icons: [
      {
        src: "/pocket-delivery-icon-192.png",
        sizes: "192x192",
        type: "image/png"
      },
      {
        src: "/pocket-delivery-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable"
      }
    ]
  };
}
