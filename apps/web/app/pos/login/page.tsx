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
        credentials: "include",
        body: JSON.stringify({ email, password })
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.message ?? "Login failed.");
      }

      window.location.replace("/pos");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Login failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_top,_rgba(245,158,11,0.2),_transparent_25%),linear-gradient(135deg,_#111827,_#0f172a)] px-4">
      <Card className="w-full max-w-md rounded-3xl border-white/10 bg-white/95 p-7">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-orange-600">Pocket POS</p>
        <h1 className="mt-3 text-3xl font-black text-slate-900">Counter Login</h1>
        <p className="mt-2 text-sm text-slate-500">Use a POS staff or admin account to open the terminal.</p>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <Input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="counter@pocketshawarma.com" required />
          <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" required />
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <Button type="submit" className="h-11 w-full rounded-xl" disabled={loading}>
            {loading ? "Signing in..." : "Open POS"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
