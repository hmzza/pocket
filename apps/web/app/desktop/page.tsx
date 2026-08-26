"use client";

import { Download, MonitorDown, Printer, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";

type Platform = "windows" | "macos" | "linux" | "other";

const releaseDownloadBase = "https://github.com/hmzza/pocket/releases/latest/download";

function detectPlatform(): Platform {
  const agent = window.navigator.userAgent.toLowerCase();
  if (agent.includes("windows")) return "windows";
  if (agent.includes("mac os") || agent.includes("macintosh")) return "macos";
  if (agent.includes("linux")) return "linux";
  return "other";
}

function downloadUrl(app: "POS" | "Admin", platform: Exclude<Platform, "other">) {
  const extension = platform === "windows" ? "exe" : platform === "macos" ? "dmg" : "AppImage";
  return `${releaseDownloadBase}/Pocket-${app}-Setup.${extension}`;
}

export default function DesktopAppsPage() {
  const [platform, setPlatform] = useState<Platform | null>(null);

  useEffect(() => {
    setPlatform(detectPlatform());
  }, []);

  const supportedPlatform = platform === "windows" || platform === "macos" || platform === "linux" ? platform : null;
  const platformName = platform === "windows" ? "Windows" : platform === "macos" ? "macOS" : platform === "linux" ? "Linux" : "your computer";

  return (
    <section className="bg-pocket-cream px-4 py-14 md:px-6 md:py-20">
      <div className="mx-auto max-w-5xl">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-bold uppercase tracking-[0.25em] text-pocket-orange">Pocket for desktop</p>
          <h1 className="mt-3 text-4xl font-black text-pocket-navy md:text-5xl">Install Pocket on your computer</h1>
          <p className="mt-5 text-lg leading-8 text-pocket-navy/70">
            Use the same live Pocket system with faster receipt printing and reliable order alerts. Your account and data stay exactly the same.
          </p>
        </div>

        <div className="mt-10 rounded-2xl border border-pocket-orange/20 bg-white px-5 py-4 text-center text-pocket-navy shadow-sm">
          <p className="font-semibold">
            {platform === null ? "Checking your computer…" : supportedPlatform ? `Recommended download for ${platformName}` : "Desktop downloads are available for Windows, macOS, and Linux"}
          </p>
        </div>

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <DesktopAppCard
            app="POS"
            title="Pocket POS"
            description="For taking orders, receiving sound alerts, and printing 80mm receipts directly to the selected printer."
            platform={supportedPlatform}
          />
          <DesktopAppCard
            app="Admin"
            title="Pocket Admin"
            description="For managers to run the admin dashboard, delivery board, reports, menu, and staff controls."
            platform={supportedPlatform}
          />
        </div>

        <div className="mx-auto mt-10 grid max-w-3xl gap-4 text-sm text-pocket-navy/75 md:grid-cols-3">
          <Feature icon={<Printer className="h-5 w-5" />} text="Direct 80mm receipt printing" />
          <Feature icon={<MonitorDown className="h-5 w-5" />} text="Dedicated desktop order alerts" />
          <Feature icon={<ShieldCheck className="h-5 w-5" />} text="Sign in with your existing account" />
        </div>
      </div>
    </section>
  );
}

function DesktopAppCard({ app, title, description, platform }: { app: "POS" | "Admin"; title: string; description: string; platform: Exclude<Platform, "other"> | null }) {
  return (
    <article className="rounded-2xl border border-pocket-navy/10 bg-white p-7 shadow-sm">
      <h2 className="text-2xl font-black text-pocket-navy">{title}</h2>
      <p className="mt-3 min-h-14 leading-7 text-pocket-navy/70">{description}</p>
      {platform ? (
        <a
          href={downloadUrl(app, platform)}
          className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-pocket-orange px-5 py-3 font-bold text-white transition hover:bg-pocket-orange/90"
        >
          <Download className="h-5 w-5" />
          Download for {platform === "windows" ? "Windows" : platform === "macos" ? "macOS" : "Linux"}
        </a>
      ) : (
        <div className="mt-7 grid gap-3 sm:grid-cols-3">
          <a href={downloadUrl(app, "windows")} className="inline-flex items-center justify-center gap-2 rounded-xl bg-pocket-orange px-4 py-3 font-bold text-white transition hover:bg-pocket-orange/90">
            <Download className="h-5 w-5" /> Windows
          </a>
          <a href={downloadUrl(app, "macos")} className="inline-flex items-center justify-center gap-2 rounded-xl border border-pocket-navy/15 px-4 py-3 font-bold text-pocket-navy transition hover:bg-pocket-cream">
            <Download className="h-5 w-5" /> macOS
          </a>
          <a href={downloadUrl(app, "linux")} className="inline-flex items-center justify-center gap-2 rounded-xl border border-pocket-navy/15 px-4 py-3 font-bold text-pocket-navy transition hover:bg-pocket-cream">
            <Download className="h-5 w-5" /> Linux
          </a>
        </div>
      )}
    </article>
  );
}

function Feature({ icon, text }: { icon: React.ReactNode; text: string }) {
  return <div className="flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 font-medium shadow-sm">{icon}{text}</div>;
}
