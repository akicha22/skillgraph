import { Inbox, LoaderCircle } from "lucide-react";
import type { ComponentPropsWithRef, ReactNode } from "react";
import { cx } from "./cx";

type SpinnerProps = ComponentPropsWithRef<"span"> & { label?: string; decorative?: boolean };

export function Spinner({ label = "Loading", decorative, className, ...props }: SpinnerProps) {
  return (
    <span {...props} role={decorative ? undefined : "status"} aria-hidden={decorative || undefined} className={cx("inline-flex shrink-0", className)}>
      <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
      {!decorative && <span className="sr-only">{label}</span>}
    </span>
  );
}

export function Skeleton({ className, ...props }: ComponentPropsWithRef<"div">) {
  return <div {...props} aria-hidden="true" className={cx("min-h-4 animate-shimmer rounded-control bg-slate-200 bg-linear-to-r from-slate-200 via-slate-100 to-slate-200 bg-size-[200%_100%]", className)} />;
}

type EmptyStateProps = Omit<ComponentPropsWithRef<"div">, "title" | "children"> & {
  title: ReactNode;
  text: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
};

export function EmptyState({ title, text, icon, action, className, ...props }: EmptyStateProps) {
  return (
    <div {...props} className={cx("flex min-w-0 flex-col items-center gap-3 p-6 text-center wrap-break-word", className)}>
      <span aria-hidden="true" className="grid size-11 place-items-center rounded-full bg-brand-50 text-brand-700">{icon ?? <Inbox className="size-5" />}</span>
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <p className="text-sm leading-relaxed text-slate-600">{text}</p>
      {action && <div className="mt-1 max-w-full">{action}</div>}
    </div>
  );
}

type ProgressBarProps = Omit<ComponentPropsWithRef<"div">, "children" | "role" | "aria-label"> & {
  label: string;
  value: number;
  max?: number;
};

export function ProgressBar({ label, value, max = 100, className, ...props }: ProgressBarProps) {
  const maximum = Number.isFinite(max) && max > 0 ? max : 100;
  const current = Number.isFinite(value) ? Math.min(maximum, Math.max(0, value)) : 0;
  return (
    <div {...props} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={maximum} aria-valuenow={current} className={cx("h-2 w-full overflow-hidden rounded-full bg-slate-200", className)}>
      <div className="h-full rounded-full bg-brand-600 transition-[width] duration-150 ease-out" style={{ width: `${(current / maximum) * 100}%` }} />
    </div>
  );
}
