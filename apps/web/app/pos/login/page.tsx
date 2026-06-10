"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function PosLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}/api/auth/pos-login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ email, password })
      });

      if (!response.ok) {
        throw new Error("Invalid credentials");
      }

      const data = await response.json();
      window.localStorage.setItem("pocket-pos-token", data.token);
      window.localStorage.setItem("pocket-pos-user", JSON.stringify(data.user));

      const next = new URLSearchParams(window.location.search).get("next");
      window.location.replace(next && next.startsWith("/") ? next : "/pos");
    } catch {
      setError("Login failed. Use a POS staff or admin account.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,rgba(255,245,235,1)_0%,rgba(255,255,255,1)_55%,rgba(252,247,242,1)_100%)] px-4 py-10">
      <div className="mx-auto flex min-h-[80vh] max-w-5xl items-center justify-center">
        <Card className="grid w-full max-w-4xl overflow-hidden rounded-[32px] border-pocket-navy/10 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="bg-pocket-navy p-8 text-pocket-cream">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Counter Access</p>
            <h1 className="mt-4 text-4xl font-black">POCKET POS</h1>
            <p className="mt-4 max-w-md text-sm leading-7 text-pocket-cream/80">
              Use this screen for takeaway and dine-in orders from the counter. POS staff can access this area only. Admin accounts can access both POS and the admin console.
            </p>
          </div>

          <div className="p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">POS Login</p>
            <h2 className="mt-3 text-3xl font-black text-pocket-navy">Open the counter terminal</h2>
            <p className="mt-2 text-sm text-pocket-navy/70">Sign in with a POS staff or admin account to continue.</p>

            <form onSubmit={handleSubmit} className="mt-8 space-y-4">
              <Input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" required />
              <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" required />
              {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Signing in..." : "Enter POS"}
              </Button>
            </form>
          </div>
        </Card>
      </div>
    </div>
  );
}
