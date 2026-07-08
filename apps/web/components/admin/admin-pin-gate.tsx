"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type AdminPinGateProps = {
  title: string;
  description: string;
  unlockLabel: string;
  children: ReactNode;
};

const ADMIN_PIN = "6969";

export function AdminPinGate({ title, description, unlockLabel, children }: AdminPinGateProps) {
  const [pin, setPin] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [error, setError] = useState("");

  const attemptUnlock = () => {
    if (pin.trim() === ADMIN_PIN) {
      setError("");
      setUnlocked(true);
      return;
    }

    setError("Incorrect PIN.");
  };

  if (unlocked) {
    return <>{children}</>;
  }

  return (
    <Card className="mx-auto max-w-md p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Protected area</p>
      <h2 className="mt-2 text-2xl font-black text-pocket-navy">{title}</h2>
      <p className="mt-2 text-sm text-pocket-navy/60">{description}</p>
      <form
        className="mt-5 space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          attemptUnlock();
        }}
      >
        <Input
          value={pin}
          onChange={(event) => setPin(event.target.value)}
          placeholder="PIN"
          inputMode="numeric"
          autoComplete="new-password"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          type="password"
          name="admin-pin"
          data-1p-ignore="true"
          data-lpignore="true"
        />
        {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}
        <Button className="w-full" type="submit">
          {unlockLabel}
        </Button>
      </form>
    </Card>
  );
}
