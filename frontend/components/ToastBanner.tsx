"use client";

import { AlertCircle, CheckCircle2, X } from "lucide-react";

export interface BannerMessage {
  kind: "ok" | "err";
  text: string;
}

export function ToastBanner({
  banner,
  onDismiss,
}: {
  banner: BannerMessage | null;
  onDismiss?: () => void;
}) {
  if (!banner) return null;
  const isErr = banner.kind === "err";

  return (
    <div
      role={isErr ? "alert" : "status"}
      className={`flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-xs font-medium ${
        isErr
          ? "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400"
          : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      }`}
    >
      <div className="flex items-start gap-2 leading-relaxed">
        {isErr ? (
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
        ) : (
          <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
        )}
        <span>{banner.text}</span>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="rounded p-0.5 opacity-70 hover:opacity-100 transition-opacity shrink-0"
          aria-label="Fermer la notification"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
