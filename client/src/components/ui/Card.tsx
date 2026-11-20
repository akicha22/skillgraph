import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import type { ComponentPropsWithRef, ReactNode } from "react";
import { cx } from "./cx";

type CardProps =
  | (ComponentPropsWithRef<"div"> & { interactive?: false })
  | (ComponentPropsWithRef<"a"> & { interactive: true; href: string })
  | (ComponentPropsWithRef<"button"> & { interactive: true; href?: never });

export function Card({ className, ...props }: CardProps) {
  const classes = cx("min-w-0 rounded-card border border-slate-200 bg-white p-4 shadow-card sm:p-6", className);
  if (!props.interactive) {
    const { interactive, ...rest } = props;
    void interactive;
    return <div {...rest} className={classes} />;
  }
  const interactiveClasses = cx(classes, "block min-h-11 text-left transition-[transform,box-shadow] duration-150 ease-out motion-safe:hover:-translate-y-px hover:shadow-raised");
  if (typeof props.href === "string") {
    const { interactive, ...link } = props;
    void interactive;
    return <a {...link} className={interactiveClasses} />;
  }
  const { interactive, type = "button", ...button } = props;
  void interactive;
  return <button {...button} type={type} className={interactiveClasses} />;
}

const badgeTones = {
  neutral: "bg-slate-100 text-slate-700",
  brand: "bg-brand-50 text-brand-800",
  success: "bg-emerald-50 text-emerald-800",
  warning: "bg-amber-50 text-amber-900",
  danger: "bg-rose-50 text-rose-800",
  accent: "bg-accent-100 text-accent-900",
};

export function Badge({ tone = "neutral", className, ...props }: ComponentPropsWithRef<"span"> & { tone?: keyof typeof badgeTones }) {
  return <span {...props} className={cx("inline-flex max-w-full rounded-full px-2.5 py-1 text-xs font-semibold wrap-break-word", badgeTones[tone], className)} />;
}

const alerts = {
  info: { icon: Info, label: "Info", classes: "border-sky-200 bg-sky-50 text-sky-900" },
  success: { icon: CircleCheck, label: "Success", classes: "border-emerald-200 bg-emerald-50 text-emerald-900" },
  warning: { icon: TriangleAlert, label: "Warning", classes: "border-amber-200 bg-amber-50 text-amber-900" },
  error: { icon: CircleAlert, label: "Error", classes: "border-rose-200 bg-rose-50 text-rose-900" },
};

export function Alert({ tone = "info", heading, className, children, ...props }: ComponentPropsWithRef<"div"> & { tone?: keyof typeof alerts; heading?: ReactNode }) {
  const { icon: Icon, label, classes } = alerts[tone];
  return (
    <div {...props} role={tone === "error" ? "alert" : props.role} className={cx("flex gap-3 rounded-control border p-4 text-sm", classes, className)}>
      <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
      <div className="min-w-0 wrap-break-word"><p className="font-semibold">{heading ?? label}</p>{children}</div>
    </div>
  );
}

export function StatTile({ label, value, detail, icon, className, ...props }: ComponentPropsWithRef<"div"> & { label: ReactNode; value: ReactNode; detail?: ReactNode; icon?: ReactNode }) {
  return (
    <Card {...props} className={className}>
      <dl className="wrap-break-word">
        <dt className="flex items-center gap-2 text-sm font-medium text-slate-600">{icon && <span aria-hidden="true" className="shrink-0">{icon}</span>}{label}</dt>
        <dd className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{value}</dd>
        {detail && <dd className="mt-1 text-sm text-slate-600">{detail}</dd>}
      </dl>
    </Card>
  );
}
