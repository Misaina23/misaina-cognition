import { Card } from "@/components/ui";

export function DashboardCard({
  title,
  value,
  trend,
  hint,
  icon: Icon,
}: {
  title: string;
  value: string | number;
  trend?: string;
  hint?: string;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
}) {
  return (
    <Card className="relative overflow-hidden p-5 transition-all hover:border-primary/40 hover:shadow-md">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">{title}</p>
          <p className="text-3xl font-bold tracking-tight text-foreground tabular-nums font-mono">
            {value}
          </p>
          {(trend || hint) && (
            <div className="flex items-center gap-1.5 pt-1 text-xs text-muted-foreground">
              {trend && <span className="font-medium text-emerald-600 dark:text-emerald-400">{trend}</span>}
              {trend && hint && <span aria-hidden="true">·</span>}
              {hint && <span>{hint}</span>}
            </div>
          )}
        </div>
        {Icon && (
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon size={22} className="stroke-[2]" />
          </div>
        )}
      </div>
    </Card>
  );
}
