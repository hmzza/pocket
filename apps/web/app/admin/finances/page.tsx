"use client";

import { useState } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FinanceManagement } from "@/components/admin/finance-management";

export default function AdminFinancesPage() {
  const [pin, setPin] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [error, setError] = useState("");

  if (!unlocked) {
    return (
      <div className="mx-auto max-w-[1400px] px-4 py-10 md:px-6">
        <AdminShell title="Finances" description="Monthly break-even tracking, Foodpanda payout estimates, and expense context in one place.">
          <Card className="mx-auto max-w-md p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Protected area</p>
            <h2 className="mt-2 text-2xl font-black text-pocket-navy">Enter finance PIN</h2>
            <p className="mt-2 text-sm text-pocket-navy/60">This page unlocks only after the correct PIN is entered.</p>
            <div className="mt-5 space-y-3">
              <Input
                value={pin}
                onChange={(event) => setPin(event.target.value)}
                placeholder="PIN"
                inputMode="numeric"
                autoComplete="new-password"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                type="text"
                name="finance-pin"
                data-1p-ignore="true"
                data-lpignore="true"
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    if (pin.trim() === "6969") {
                      setError("");
                      setUnlocked(true);
                    } else {
                      setError("Incorrect PIN.");
                    }
                  }
                }}
              />
              {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}
              <Button
                className="w-full"
                onClick={() => {
                  if (pin.trim() === "6969") {
                    setError("");
                    setUnlocked(true);
                  } else {
                    setError("Incorrect PIN.");
                  }
                }}
              >
                Unlock Finances
              </Button>
            </div>
          </Card>
        </AdminShell>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-10 md:px-6">
      <AdminShell title="Finances" description="Monthly break-even tracking, Foodpanda payout estimates, and expense context in one place.">
        <FinanceManagement />
      </AdminShell>
    </div>
  );
}
