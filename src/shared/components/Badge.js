"use client";

import { cn } from "@/shared/utils/cn";

const variants = {
  default: "bg-surface-2 text-text-muted ring-1 ring-inset ring-border-subtle",
  primary: "bg-brand-500/10 text-brand-600 dark:text-brand-300 ring-1 ring-inset ring-brand-500/20",
  success: "bg-success/10 text-success ring-1 ring-inset ring-success/20",
  warning: "bg-warning/10 text-warning ring-1 ring-inset ring-warning/20",
  error: "bg-danger/10 text-danger ring-1 ring-inset ring-danger/20",
  info: "bg-info/10 text-info ring-1 ring-inset ring-info/20",
};

const sizes = {
  sm: "px-2 py-0.5 text-[10px]",
  md: "px-2.5 py-1 text-xs",
  lg: "px-3 py-1.5 text-sm",
};

export default function Badge({
  children,
  variant = "default",
  size = "md",
  dot = false,
  icon,
  className,
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-semibold",
        variants[variant],
        sizes[size],
        className
      )}
    >
      {dot && (
        <span
          className={cn(
            "size-1.5 rounded-full",
            variant === "success" && "bg-success",
            variant === "warning" && "bg-warning",
            variant === "error" && "bg-danger",
            variant === "info" && "bg-info",
            variant === "primary" && "bg-brand-500",
            variant === "default" && "bg-text-muted"
          )}
        />
      )}
      {icon && <span className="material-symbols-outlined text-[14px]">{icon}</span>}
      {children}
    </span>
  );
}
