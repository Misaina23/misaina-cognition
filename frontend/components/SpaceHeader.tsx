"use client";

interface SpaceHeaderProps {
  spaceId: string;
  activeSection: "overview" | "knowledge" | "validations" | "historique";
  title: string;
  subtitle: string;
  actions?: React.ReactNode;
}

export function SpaceHeader({
  spaceId,
  title,
  subtitle,
  actions,
}: SpaceHeaderProps) {
  return (
    <header className="border-b border-border bg-card/75 backdrop-blur-sm">
      <div className="mx-auto max-w-7xl px-6 py-5 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <p className="font-mono text-[11px] uppercase tracking-wider text-primary">
            Périmètre {spaceId}
          </p>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-foreground">{title}</h1>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>

        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
