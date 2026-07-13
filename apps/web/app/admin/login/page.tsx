"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function AdminLoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/auth/admin-login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        credentials: "include",
        body: JSON.stringify({ username, password })
      });

      if (!response.ok) {
        throw new Error("Invalid credentials");
      }

      window.location.replace("/admin");
    } catch {
      setError("Login failed. Check the username and password.");
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
        <form onSubmit={handleSubmit} className="mt-6 space-y-4" autoComplete="off">
          <Input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="Username"
            required
            autoComplete="off"
            spellCheck={false}
          />
          <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" required autoComplete="new-password" />
          {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Signing in..." : "Login"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
