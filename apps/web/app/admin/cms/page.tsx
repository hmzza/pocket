"use client";

import { AdminShell } from "@/components/admin/admin-shell";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { homeContent } from "@/lib/mock-data";

export default function AdminCmsPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-12 md:px-6">
      <AdminShell title="CMS" description="Editable homepage messaging, offers, FAQs, and contact layer.">
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="p-5">
            <p className="text-lg font-black text-pocket-navy">Hero content</p>
            <div className="mt-4 grid gap-4">
              <Input defaultValue={homeContent.hero.headline} />
              <Input defaultValue={homeContent.hero.subheadline} />
              <Textarea defaultValue={homeContent.hero.description} />
            </div>
          </Card>
          <Card className="p-5">
            <p className="text-lg font-black text-pocket-navy">Promotions and offers</p>
            <div className="mt-4 grid gap-4">
              <Input defaultValue="POCKET10" />
              <Textarea defaultValue="10% off for opening-week orders across the Islamabad branch." />
              <Input defaultValue="Islamabad branch only" />
            </div>
          </Card>
          <Card className="p-5">
            <p className="text-lg font-black text-pocket-navy">FAQ</p>
            <div className="mt-4 grid gap-4">
              <Input defaultValue="Do you deliver outside G-11?" />
              <Textarea defaultValue="Delivery zones are configured per branch and expand as new outlets launch." />
            </div>
          </Card>
          <Card className="p-5">
            <p className="text-lg font-black text-pocket-navy">Contact</p>
            <div className="mt-4 grid gap-4">
              <Input defaultValue="+92-300-POCKET1" />
              <Input defaultValue="hello@pocketshawarma.com" />
              <Textarea defaultValue="Shop #17, Al Ghaffar Mall, G-11 Markaz, Islamabad" />
            </div>
          </Card>
        </div>
        <Button>Save Draft</Button>
      </AdminShell>
    </div>
  );
}
