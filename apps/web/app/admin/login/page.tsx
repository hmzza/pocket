"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@pocketshawarma.com");
  const [password, setPassword] = useState("PocketAdmin123!");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ email, password })
      });

      if (response.ok) {
        const data = await response.json();
        window.localStorage.setItem("pocket-admin-token", data.token);
      } else {
        throw new Error("Invalid credentials");
      }

      router.replace("/admin");
    } catch {
      setError("Login failed. Use the seeded admin credentials.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-lg items-center px-4 py-12 md:px-6">
      <Card className="w-full p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Admin Login</p>
        <h1 className="mt-3 text-3xl font-black text-pocket-navy">Secure operations access</h1>
        <p className="mt-2 text-sm text-pocket-navy/70">Seeded credentials are prefilled for local evaluation.</p>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <Input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Admin email" />
          <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" />
          {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Signing in..." : "Login"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
