"use client";

export function KpiStripSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div
      className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${
        count === 5 ? "xl:grid-cols-5" : "lg:grid-cols-4"
      }`}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl border border-border bg-card p-4 space-y-2.5 shadow-sm animate-pulse"
        >
          <div className="h-3 w-24 rounded bg-muted" />
          <div className="h-7 w-20 rounded bg-muted" />
          <div className="h-2.5 w-36 rounded bg-muted/70" />
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 5, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="space-y-2.5 animate-pulse">
      <div className="grid gap-3 border-b border-border pb-2.5" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {Array.from({ length: columns }).map((_, c) => (
          <div key={c} className="h-3 rounded bg-muted" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          className="grid gap-3 py-2 border-b border-border/50"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: columns }).map((_, c) => (
            <div key={c} className="h-3.5 rounded bg-muted/70" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardsListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3 animate-pulse">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border bg-card p-5 space-y-2.5 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div className="h-4 w-48 rounded bg-muted" />
            <div className="h-5 w-20 rounded bg-muted/70" />
          </div>
          <div className="h-3 w-full max-w-xl rounded bg-muted/70" />
          <div className="h-3 w-64 rounded bg-muted/60" />
        </div>
      ))}
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <KpiStripSkeleton count={5} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7 rounded-xl border border-border bg-card p-5 shadow-sm">
          <CardsListSkeleton count={3} />
        </div>
        <div className="lg:col-span-5 rounded-xl border border-border bg-card p-5 shadow-sm animate-pulse space-y-3">
          <div className="h-4 w-44 rounded bg-muted" />
          <div className="h-32 w-full rounded-lg bg-muted/60" />
          <div className="h-12 w-full rounded-lg bg-muted/50" />
        </div>
      </div>
    </div>
  );
}
