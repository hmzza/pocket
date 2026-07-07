"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { ChevronDown, ChevronUp, Plus, RotateCcw, Save, Sparkles, Upload } from "lucide-react";
import { HeroSlider } from "@/components/site/hero-slider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { fetchAdminSettings, updateAdminSetting, uploadAdminImage } from "@/lib/admin-client";
import { getPocketImageAltFromFilename, isSupportedPocketImageFile } from "@/lib/image-upload";
import { homeContent } from "@/lib/mock-data";
import { resolvePocketImagePath } from "@/lib/image-paths";

type SliderImage = {
  id: string;
  url: string;
  alt: string;
};

type SliderSetting = {
  intervalMs: number;
  images: Array<{
    url: string;
    alt: string;
  }>;
};

const AVAILABLE_ASSETS = [
  { label: "Classic Pocket", url: "/images/classic-shawarma.png" },
  { label: "Spicy Pocket", url: "/images/spicy-shawarma.png" },
  { label: "Pocket Mai Rocket", url: "/images/pocket-mai-rocket-shawarma.png" },
  { label: "Thela Fries", url: "/images/thela-fries.png" },
  { label: "Loaded Fries", url: "/images/loaded-fries.png" },
  { label: "Kiwi Passion", url: "/images/kiwi-passion-chiller.png" },
  { label: "Strawberry Cherry", url: "/images/strawberyy-cherry-chiller.png" },
  { label: "Watermelon Guava", url: "/images/watermelon-guava-chiller.png" },
  { label: "Chocolate Shake", url: "/images/chocolate-shake.png" },
  { label: "Vanilla Shake", url: "/images/vanilla-shake.png" },
  { label: "Oreo Shake", url: "/images/oreo-shake-shake.png" }
];

function createRow(url = "", alt = ""): SliderImage {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `row-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    url,
    alt
  };
}

function normalizeSetting(value: unknown): SliderSetting {
  const raw = value as Partial<SliderSetting> | null | undefined;
  const images = Array.isArray(raw?.images) && raw?.images.length ? raw.images : homeContent.heroImages;

  return {
    intervalMs: Number(raw?.intervalMs ?? homeContent.heroSliderIntervalMs ?? 4500),
    images: images.map((image) => ({
      url: resolvePocketImagePath(image.url),
      alt: image.alt ?? ""
    }))
  };
}

export function WebsiteControlPanel() {
  const [images, setImages] = useState<SliderImage[]>(homeContent.heroImages.map((image) => createRow(image.url, image.alt)));
  const [intervalMs, setIntervalMs] = useState(String(homeContent.heroSliderIntervalMs));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadSettings() {
      try {
        const settings = await fetchAdminSettings();
        const sliderSetting = settings.find((setting) => setting.key === "homepage.slider");
        const normalized = normalizeSetting(sliderSetting?.value);

        if (!cancelled) {
          setImages(normalized.images.map((image) => createRow(image.url, image.alt)));
          setIntervalMs(String(normalized.intervalMs));
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load website settings.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadSettings();

    return () => {
      cancelled = true;
    };
  }, []);

  function updateImage(index: number, next: Partial<SliderImage>) {
    setImages((current) => current.map((entry, entryIndex) => (entryIndex === index ? { ...entry, ...next } : entry)));
  }

  async function handleUpload(index: number, file: File) {
    if (!isSupportedPocketImageFile(file)) {
      setError("Only PNG and JPEG images are allowed.");
      return;
    }

    setUploadingIndex(index);
    setError("");
    try {
      const uploaded = await uploadAdminImage(file);
      setImages((current) =>
        current.map((entry, entryIndex) =>
          entryIndex === index
            ? {
                ...entry,
                url: uploaded.url,
                alt: entry.alt.trim() || uploaded.alt || getPocketImageAltFromFilename(file.name)
              }
            : entry
        )
      );
      setNotice("Image uploaded.");
      setTimeout(() => setNotice(""), 2500);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Failed to upload image.");
    } finally {
      setUploadingIndex(null);
    }
  }

  async function saveSlider() {
    const cleaned = images
      .map((image) => ({
        url: image.url.trim(),
        alt: image.alt.trim() || "Pocket hero image"
      }))
      .filter((image) => image.url.length > 0);

    if (!cleaned.length) {
      setError("Add at least one image to the slider.");
      return;
    }

    const nextIntervalMs = Number(intervalMs);
    if (!Number.isFinite(nextIntervalMs) || nextIntervalMs < 1500) {
      setError("Interval must be at least 1500ms.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      await updateAdminSetting("homepage.slider", {
        intervalMs: nextIntervalMs,
        images: cleaned
      });
      setNotice("Homepage slider saved.");
      setTimeout(() => setNotice(""), 3500);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save homepage slider.");
    } finally {
      setSaving(false);
    }
  }

  function restoreDefaults() {
    setImages(homeContent.heroImages.map((image) => createRow(image.url, image.alt)));
    setIntervalMs(String(homeContent.heroSliderIntervalMs));
  }

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-none bg-[linear-gradient(135deg,_#102a43,_#172554_48%,_#1f2937)] p-6 text-white shadow-[0_24px_64px_rgba(16,42,67,0.28)]">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-amber-300">Website Control Panel</p>
            <h2 className="mt-3 text-3xl font-black">Homepage slider and media</h2>
            <p className="mt-2 max-w-2xl text-sm text-white/70">
              Control the public hero image area from here. Add, remove, reorder, and rotate images without touching the front-end.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="border-white/20 bg-white/5 text-white hover:bg-white/10" onClick={restoreDefaults}>
              <RotateCcw className="h-4 w-4" />
              Restore defaults
            </Button>
            <Button className="bg-amber-300 text-slate-950 hover:bg-amber-200" onClick={() => void saveSlider()} disabled={saving}>
              <Save className="h-4 w-4" />
              {saving ? "Saving..." : "Save slider"}
            </Button>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-3 text-sm">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2">
            <Sparkles className="h-4 w-4 text-amber-300" />
            Public homepage slider
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2">
            <span className="font-semibold text-white">Interval</span>
            {intervalMs} ms
          </span>
        </div>
      </Card>

      {notice ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">{notice}</div> : null}
      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div> : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-lg font-black text-pocket-navy">Slider images</p>
              <p className="text-sm text-pocket-navy/60">Use the first image as the default card for the hero area.</p>
            </div>
            <div className="flex items-center gap-3">
              <Input
                type="number"
                min="1500"
                step="250"
                value={intervalMs}
                onChange={(event) => setIntervalMs(event.target.value)}
                className="w-36"
              />
              <Button
                variant="outline"
                onClick={() =>
                  setImages((current) => [
                    ...current,
                    createRow("/images/pocket-mai-rocket-shawarma.png", "New hero image")
                  ])
                }
              >
                <Plus className="h-4 w-4" />
                Add image
              </Button>
            </div>
          </div>

          <div className="mt-5 space-y-4">
            {loading ? <p className="text-sm text-pocket-navy/60">Loading website settings...</p> : null}
            {images.map((image, index) => (
              <div key={image.id} className="rounded-2xl border border-pocket-navy/10 bg-pocket-cream/40 p-4">
                <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
                  <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-pocket-navy/10 bg-white">
                    <Image src={resolvePocketImagePath(image.url)} alt={image.alt || "Hero image preview"} fill className="object-cover" sizes="220px" />
                  </div>
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <label className="text-xs font-semibold uppercase tracking-[0.2em] text-pocket-navy/50">Asset library</label>
                      <select
                        value={AVAILABLE_ASSETS.some((asset) => asset.url === image.url) ? image.url : ""}
                        onChange={(event) => {
                          const selected = AVAILABLE_ASSETS.find((asset) => asset.url === event.target.value);
                          if (!selected) return;
                          updateImage(index, {
                            url: selected.url,
                            alt: image.alt.trim() || selected.label
                          });
                        }}
                        className="flex h-11 w-full rounded-md border border-pocket-navy/15 bg-white px-3 py-2 text-sm text-pocket-charcoal outline-none transition focus:border-pocket-orange focus:ring-2 focus:ring-pocket-orange/20"
                      >
                        <option value="">Pick from uploaded images</option>
                        {AVAILABLE_ASSETS.map((asset) => (
                          <option key={asset.url} value={asset.url}>
                            {asset.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-[0.2em] text-pocket-navy/50">Image URL</label>
                        <Input value={image.url} onChange={(event) => updateImage(index, { url: event.target.value })} placeholder="/images/classic-shawarma.png" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-[0.2em] text-pocket-navy/50">Alt text</label>
                        <Input value={image.alt} onChange={(event) => updateImage(index, { alt: event.target.value })} placeholder="Pocket hero image" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold uppercase tracking-[0.2em] text-pocket-navy/50">Upload image</label>
                      <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-md border border-pocket-navy/15 bg-white px-4 text-sm font-semibold text-pocket-navy transition hover:bg-pocket-cream">
                        <Upload className="h-4 w-4" />
                        {uploadingIndex === index ? "Uploading..." : "Choose PNG/JPEG"}
                        <input
                          type="file"
                          accept="image/png,image/jpeg"
                          className="sr-only"
                          onChange={async (event) => {
                            const file = event.target.files?.[0];
                            event.target.value = "";
                            if (!file) return;
                            await handleUpload(index, file);
                          }}
                        />
                      </label>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                          if (index === 0) return;
                          setImages((current) => {
                            const next = current.slice();
                            [next[index - 1], next[index]] = [next[index], next[index - 1]];
                            return next;
                          });
                        }}
                        disabled={index === 0}
                      >
                        <ChevronUp className="h-4 w-4" />
                        Up
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                          if (index === images.length - 1) return;
                          setImages((current) => {
                            const next = current.slice();
                            [next[index + 1], next[index]] = [next[index], next[index + 1]];
                            return next;
                          });
                        }}
                        disabled={index === images.length - 1}
                      >
                        <ChevronDown className="h-4 w-4" />
                        Down
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        className="text-red-600 hover:bg-red-50 hover:text-red-700"
                        onClick={() =>
                          setImages((current) => (current.length > 1 ? current.filter((_, entryIndex) => entryIndex !== index) : [createRow()]))
                        }
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <p className="text-lg font-black text-pocket-navy">Live preview</p>
          <p className="text-sm text-pocket-navy/60">This is what customers will see on the public homepage.</p>
          <div className="mt-4">
            <HeroSlider images={images.map((image) => ({ url: image.url, alt: image.alt }))} intervalMs={Number(intervalMs) || 4500} />
          </div>
          <div className="mt-4 rounded-2xl border border-pocket-navy/10 bg-pocket-cream/60 p-4 text-sm text-pocket-navy/70">
            The public slider is saved under the `homepage.slider` website setting. The front page reads the saved setting automatically.
          </div>
        </Card>
      </div>
    </div>
  );
}
