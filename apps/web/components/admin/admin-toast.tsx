"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/utils";

type AdminToastProps = {
  message: string;
  variant: "success" | "error";
  onClose: () => void;
  className?: string;
};

export function AdminToast({ message, variant, onClose, className }: AdminToastProps) {
  return (
    <div
      className={cn(
        "fixed right-4 top-4 z-[70] flex max-w-md items-start gap-3 rounded-2xl border px-4 py-3 shadow-panel backdrop-blur-md",
        className,
        variant === "success"
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-red-200 bg-red-50 text-red-700"
      )}
      role="status"
      aria-live="polite"
    >
      <p className="min-w-0 flex-1 whitespace-pre-line text-sm font-medium leading-6">{message}</p>
      <button
        type="button"
        onClick={onClose}
        className="rounded-full p-1 transition hover:bg-black/5"
        aria-label="Dismiss notification"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
