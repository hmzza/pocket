"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { fetchAdminCms, updateAdminCmsBlock, updateAdminSetting } from "@/lib/admin-client";

const DEFAULT_HERO = {
  eyebrow: "Islamabad's newest shawarma ritual",
  headline: "POCKET",
  subheadline: "Real Shawarma, Served The Pocket Way",
  description: "Fresh carved wraps, loaded fries, bold sauces, and fast delivery from G-11 Markaz.",
  primaryCta: { label: "Order Now", href: "/menu" },
  secondaryCta: { label: "View Menu", href: "/menu" }
};

const DEFAULT_PROMOTION = {
  code: "",
  body: "",
  scope: ""
};

const DEFAULT_FAQ = {
  question: "Do you deliver outside G-11?",
  answer: "Delivery zones are configured per branch and expand as new outlets launch."
};

const DEFAULT_CONTACT = {
  phone: "+92-300-POCKET1",
  email: "hello@pocketshawarma.com",
  instagram: "@pocket.pakistan",
  address: "Shop #17, Al Ghaffar Mall, G-11 Markaz, Islamabad"
};

export default function AdminCmsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [hero, setHero] = useState(DEFAULT_HERO);
  const [promotion, setPromotion] = useState(DEFAULT_PROMOTION);
  const [faq, setFaq] = useState(DEFAULT_FAQ);
  const [contact, setContact] = useState(DEFAULT_CONTACT);

  useEffect(() => {
    let cancelled = false;

    async function loadCms() {
      try {
        setError("");
        const data = await fetchAdminCms();
        if (cancelled) return;

        const heroBlock = (data.blocks["homepage.hero"]?.content as Partial<typeof DEFAULT_HERO>) ?? {};
        const promotionsBlock = (data.blocks["homepage.promotions"]?.content as Partial<typeof DEFAULT_PROMOTION>) ?? {};
        const faqBlock = ((data.blocks["faq"]?.content as Array<Partial<typeof DEFAULT_FAQ>> | undefined) ?? [])[0] ?? {};
        const contactSetting = (data.settings["store.contact"] as Partial<typeof DEFAULT_CONTACT>) ?? {};

        setHero({
          ...DEFAULT_HERO,
          ...heroBlock
        });
        setPromotion({
          ...DEFAULT_PROMOTION,
          ...promotionsBlock
        });
        setFaq({
          ...DEFAULT_FAQ,
          ...faqBlock
        });
        setContact({
          ...DEFAULT_CONTACT,
          ...contactSetting
        });
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load CMS.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadCms();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSave() {
    setSaving(true);
    setError("");
    setMessage("");

    try {
      await Promise.all([
        updateAdminCmsBlock("homepage.hero", {
          title: "Hero",
          content: hero
        }),
        updateAdminCmsBlock("homepage.promotions", {
          title: "Promotions",
          content: promotion
        }),
        updateAdminCmsBlock("faq", {
          title: "FAQ",
          content: [faq]
        }),
        updateAdminSetting("store.contact", contact)
      ]);

      setMessage("Content saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save CMS.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 md:px-6">
      <AdminShell title="CMS" description="Editable homepage messaging, offers, FAQs, and contact layer.">
        {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}
        {message ? <p className="text-sm font-medium text-emerald-700">{message}</p> : null}
        {loading ? (
          <Card className="p-6 text-sm text-pocket-navy/60">Loading content...</Card>
        ) : (
          <>
            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="p-5">
                <p className="text-lg font-black text-pocket-navy">Hero content</p>
                <div className="mt-4 grid gap-4">
                  <Input value={hero.headline} onChange={(event) => setHero((current) => ({ ...current, headline: event.target.value }))} placeholder="Headline" />
                  <Input value={hero.subheadline} onChange={(event) => setHero((current) => ({ ...current, subheadline: event.target.value }))} placeholder="Subheadline" />
                  <Textarea value={hero.description} onChange={(event) => setHero((current) => ({ ...current, description: event.target.value }))} placeholder="Hero description" />
                </div>
              </Card>
              <Card className="p-5">
                <p className="text-lg font-black text-pocket-navy">Promotions and offers</p>
                <div className="mt-4 grid gap-4">
                  <Input value={promotion.code} onChange={(event) => setPromotion((current) => ({ ...current, code: event.target.value.toUpperCase() }))} placeholder="Promotion code" />
                  <Textarea value={promotion.body} onChange={(event) => setPromotion((current) => ({ ...current, body: event.target.value }))} placeholder="Offer description" />
                  <Input value={promotion.scope} onChange={(event) => setPromotion((current) => ({ ...current, scope: event.target.value }))} placeholder="Offer scope" />
                </div>
              </Card>
              <Card className="p-5">
                <p className="text-lg font-black text-pocket-navy">FAQ</p>
                <div className="mt-4 grid gap-4">
                  <Input value={faq.question} onChange={(event) => setFaq((current) => ({ ...current, question: event.target.value }))} placeholder="Question" />
                  <Textarea value={faq.answer} onChange={(event) => setFaq((current) => ({ ...current, answer: event.target.value }))} placeholder="Answer" />
                </div>
              </Card>
              <Card className="p-5">
                <p className="text-lg font-black text-pocket-navy">Contact</p>
                <div className="mt-4 grid gap-4">
                  <Input value={contact.phone} onChange={(event) => setContact((current) => ({ ...current, phone: event.target.value }))} placeholder="Phone" />
                  <Input value={contact.email} onChange={(event) => setContact((current) => ({ ...current, email: event.target.value }))} placeholder="Email" />
                  <Input value={contact.instagram} onChange={(event) => setContact((current) => ({ ...current, instagram: event.target.value }))} placeholder="Instagram" />
                  <Textarea value={contact.address} onChange={(event) => setContact((current) => ({ ...current, address: event.target.value }))} placeholder="Address" />
                </div>
              </Card>
            </div>
            <Button onClick={() => void handleSave()} disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </>
        )}
      </AdminShell>
    </div>
  );
}
