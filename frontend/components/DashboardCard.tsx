import { Card } from "@/components/ui";

export function DashboardCard({
  title, value, hint, icon: Icon,
}: { title: string; value: string | number; hint?: string; icon?: React.ComponentType<{ size?: number; className?: string }> }) {
  return (
    <Card>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold">{value}</p>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
        {Icon && <Icon size={28} className="text-primary" />}
      </div>
    </Card>
  );
}
