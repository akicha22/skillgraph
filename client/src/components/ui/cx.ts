export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

const variants = {
  primary: "bg-brand-600 text-white hover:bg-brand-700",
  secondary: "border border-slate-500 bg-white text-slate-900 hover:bg-slate-50",
  ghost: "text-brand-700 hover:bg-brand-50",
  danger: "bg-rose-700 text-white hover:bg-rose-800",
};

const sizes = {
  sm: "px-3 py-2 text-sm",
  md: "px-4 py-2 text-sm",
  lg: "min-h-12 px-5 py-3 text-base",
};

export type ButtonStyle = {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  className?: string;
};

export function buttonClasses({ variant = "primary", size = "md", className }: ButtonStyle = {}): string {
  return cx(
    "inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-control text-center font-semibold transition-colors duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:opacity-60",
    variants[variant], sizes[size], className,
  );
}
