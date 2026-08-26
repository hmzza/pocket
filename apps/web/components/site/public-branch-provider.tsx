"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Branch } from "@/lib/types";

const PUBLIC_BRANCH_KEY = "pocket:public-branch-slug";
const PUBLIC_BRANCH_COOKIE = "pocket_public_branch";

type PublicBranchContextValue = {
  branches: Branch[];
  selectedBranch: Branch | null;
  loading: boolean;
  selectBranch: (slug: string) => void;
};

const PublicBranchContext = createContext<PublicBranchContextValue | null>(null);

export function PublicBranchProvider({ children }: { children: React.ReactNode }) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedSlug, setSelectedSlug] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadBranches() {
      try {
        const response = await fetch("/api/branches", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as { branches?: Branch[] };
        if (cancelled) return;

        const nextBranches = data.branches ?? [];
        const querySlug = new URLSearchParams(window.location.search).get("branch") ?? "";
        const storedSlug = querySlug || window.localStorage.getItem(PUBLIC_BRANCH_KEY) || "";
        const nextSlug = nextBranches.some((branch) => branch.slug === storedSlug)
          ? storedSlug
          : nextBranches[0]?.slug ?? "";
        setBranches(nextBranches);
        setSelectedSlug(nextSlug);
        if (nextSlug) {
          window.localStorage.setItem(PUBLIC_BRANCH_KEY, nextSlug);
          document.cookie = `${PUBLIC_BRANCH_COOKIE}=${encodeURIComponent(nextSlug)}; path=/; max-age=31536000; samesite=lax`;
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadBranches();
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<PublicBranchContextValue>(() => ({
    branches,
    selectedBranch: branches.find((branch) => branch.slug === selectedSlug) ?? branches[0] ?? null,
    loading,
    selectBranch: (slug) => {
      const branch = branches.find((entry) => entry.slug === slug);
      if (!branch) return;
      setSelectedSlug(branch.slug);
      window.localStorage.setItem(PUBLIC_BRANCH_KEY, branch.slug);
      document.cookie = `${PUBLIC_BRANCH_COOKIE}=${encodeURIComponent(branch.slug)}; path=/; max-age=31536000; samesite=lax`;
      window.location.reload();
    }
  }), [branches, loading, selectedSlug]);

  return <PublicBranchContext.Provider value={value}>{children}</PublicBranchContext.Provider>;
}

export function usePublicBranch() {
  const context = useContext(PublicBranchContext);
  if (!context) throw new Error("usePublicBranch must be used within PublicBranchProvider.");
  return context;
}
