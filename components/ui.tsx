import * as React from "react";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

export function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "secondary" | "outline" | "ghost" | "danger";
  size?: "default" | "sm" | "lg" | "icon";
}) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 select-none",
        variant === "default" && "bg-primary text-primary-foreground shadow-sm hover:opacity-90 active:scale-[0.98]",
        variant === "secondary" && "bg-secondary text-secondary-foreground hover:bg-secondary/80 active:scale-[0.98]",
        variant === "outline" && "border border-border bg-transparent hover:bg-muted active:scale-[0.98]",
        variant === "ghost" && "hover:bg-muted active:scale-[0.98]",
        variant === "danger" && "bg-red-500 text-white hover:bg-red-600 active:scale-[0.98]",
        size === "default" && "h-9 px-4 py-2",
        size === "sm" && "h-8 rounded-md px-3 text-xs",
        size === "lg" && "h-11 rounded-lg px-6 text-base",
        size === "icon" && "h-9 w-9 p-0",
        className
      )}
      {...props}
    />
  );
}

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card text-card-foreground shadow-sm transition-colors",
        className
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col space-y-1.5 p-5 pb-3", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-base font-semibold leading-none tracking-tight", className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-xs text-muted-foreground", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5 pt-0", className)} {...props} />;
}

export function Input({ className, type, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type={type}
      className={cn(
        "flex h-9 w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "flex min-h-[80px] w-full rounded-lg border border-border bg-background px-3 py-2 text-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}

export function Badge({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  variant?: "default" | "outline" | "success" | "warning";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium tracking-tight",
        variant === "default" && "bg-muted text-muted-foreground",
        variant === "outline" && "border border-border text-foreground",
        variant === "success" && "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
        variant === "warning" && "bg-amber-500/10 text-amber-600 dark:text-amber-400",
        className
      )}
      {...props}
    />
  );
}

export function Modal({
  isOpen,
  open,
  onClose,
  title,
  children,
}: {
  isOpen?: boolean;
  open?: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const isVisible = open !== undefined ? open : isOpen;
  if (!isVisible) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-xl animate-in fade-in-0 zoom-in-95 duration-150">
        <div className="mb-4 flex items-center justify-between border-b border-border pb-3">
          <h2 className="text-lg font-bold">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Fermer"
          >
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
