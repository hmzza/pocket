"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}/api/auth/admin-login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ email, password })
      });

      if (response.ok) {
        const data = await response.json();
        window.localStorage.setItem("pocket-admin-token", data.token);
        window.localStorage.setItem("pocket-admin-user", JSON.stringify(data.user));
      } else {
        throw new Error("Invalid credentials");
      }

      const next = new URLSearchParams(window.location.search).get("next");
      window.location.replace(next && next.startsWith("/") ? next : "/admin");
    } catch {
      setError("Login failed. Check the admin email and password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-lg items-center px-4 py-12 md:px-6">
      <Card className="w-full p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Admin Login</p>
        <h1 className="mt-3 text-3xl font-black text-pocket-navy">Secure operations access</h1>
        <p className="mt-2 text-sm text-pocket-navy/70">Use the private admin route and valid staff credentials to continue.</p>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <Input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Admin email" required />
          <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" required />
          {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Signing in..." : "Login"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
