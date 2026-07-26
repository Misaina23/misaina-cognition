import { cn } from "@/lib/utils";

export function Button({
  className, variant = "default", size = "default", ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "icon";
}) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50",
        variant === "default" && "bg-primary text-white hover:opacity-90",
        variant === "outline" && "border border-border hover:bg-muted",
        variant === "ghost" && "hover:bg-muted",
        size === "sm" && "px-3 py-1 text-xs",
        size === "icon" && "h-9 w-9 p-0",
        className
      )}
      {...props}
    />
  );
}

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("rounded-xl border border-border bg-card p-5", className)} {...props} />
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
      {...props}
    />
  );
}

export function Badge({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn("inline-block rounded-full bg-muted px-2 py-0.5 text-xs", className)}
      {...props}
    />
  );
}
