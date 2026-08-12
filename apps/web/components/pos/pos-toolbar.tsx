"use client";

import { useEffect, useRef, useState } from "react";
import { LayoutGrid, ListChecks, LogOut } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { BranchSwitcher } from "@/components/admin/branch-switcher";
import { Button } from "@/components/ui/button";
import { fetchPosSession, logoutPosSession } from "@/lib/pos-client";

type PosUser = Awaited<ReturnType<typeof fetchPosSession>>["user"];

function getInitials(user: PosUser) {
  const source = user.name?.trim() || user.username?.trim() || "POS";
  const parts = source.split(/\s+/).filter(Boolean);
  const first = parts[0] ?? source;
  const last = parts[parts.length - 1] ?? first;
  return (parts.length > 1 ? `${first.charAt(0)}${last.charAt(0)}` : source.slice(0, 2)).toUpperCase();
}

function ProfileMenu({ user }: { user: PosUser }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  async function logout() {
    await logoutPosSession().catch(() => null);
    router.replace("/pos/login");
  }

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        aria-label={`Open account menu for ${user.name || user.username}`}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-amber-300 text-xs font-black text-slate-950 shadow-sm transition hover:bg-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-200/70"
      >
        {getInitials(user)}
      </button>
      {open ? (
        <div className="absolute right-0 top-[calc(100%+0.55rem)] z-50 w-56 overflow-hidden rounded-xl border border-white/10 bg-white text-slate-900 shadow-2xl">
          <div className="border-b border-slate-200 px-4 py-3">
            <p className="truncate text-sm font-bold">{user.name || user.username || "POS user"}</p>
          </div>
          <button
            type="button"
            onClick={() => void logout()}
            className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-red-700 transition hover:bg-red-50"
          >
            <LogOut className="h-4 w-4" />
            Logout
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function PosToolbar({
  user,
  active,
  splitView,
  onToggleSplit
}: {
  user: PosUser;
  active: "pos" | "queue";
  splitView?: boolean;
  onToggleSplit?: () => void;
}) {
  const router = useRouter();

  return (
    <div className="flex flex-col gap-3 rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur md:flex-row md:items-center md:justify-between">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-amber-300">Pocket POS</p>
        <h1 className="mt-1.5 text-[1.7rem] font-black leading-none">Counter Terminal</h1>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2.5">
        {active === "pos" && onToggleSplit ? (
          <Button
            variant="outline"
            className="h-10 border-white/15 bg-white/5 px-4 text-white hover:bg-white/10"
            onClick={onToggleSplit}
          >
            <LayoutGrid className="h-4 w-4" />
            {splitView ? "Close Split" : "Split View"}
          </Button>
        ) : null}
        <Button
          variant="outline"
          className="h-10 border-white/15 bg-white/5 px-4 text-white hover:bg-white/10"
          onClick={() => router.push(active === "pos" ? "/pos/queue" : "/pos")}
        >
          <ListChecks className="h-4 w-4" />
          {active === "pos" ? "Queue" : "POS"}
        </Button>
        <BranchSwitcher user={user} />
        <ProfileMenu user={user} />
      </div>
    </div>
  );
}

export function PosWorkspaceShell({ children, active }: { children: React.ReactNode; active: "pos" | "queue" }) {
  const [user, setUser] = useState<PosUser | null>(null);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    void fetchPosSession()
      .then((session) => {
        if (!session.user.canAccessPos && !["ADMIN", "SUPER_ADMIN", "POS_STAFF"].includes(session.user.role)) {
          router.replace("/pos/login");
          return;
        }
        if (!cancelled) setUser(session.user);
      })
      .catch(() => router.replace("/pos/login"));

    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!user) {
    return <div className="pos-terminal min-h-screen bg-[#111827] px-4 py-5 text-white">Loading POS...</div>;
  }

  return (
    <div className="pos-terminal min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(245,158,11,0.18),_transparent_22%),linear-gradient(135deg,_#111827,_#1f2937_55%,_#0f172a)] px-3 py-4 text-white md:px-4">
      <div className="mx-auto max-w-[1720px] space-y-4">
        <PosToolbar user={user} active={active} />
        {children}
      </div>
    </div>
  );
}
