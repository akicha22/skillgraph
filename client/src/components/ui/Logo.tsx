import { cx } from "./cx";

const sizes = {
  sm: "gap-2 text-base [&_svg]:size-6",
  md: "gap-2 text-xl [&_svg]:size-8",
  lg: "gap-3 text-2xl [&_svg]:size-10",
};

export function Logo({ size = "md", className }: { size?: keyof typeof sizes; className?: string }) {
  return (
    <span className={cx("inline-flex items-center font-bold tracking-tight text-brand-800", sizes[size], className)}>
      <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" className="shrink-0">
        <rect width="32" height="32" rx="9" className="fill-brand-600" />
        <path d="m9 21 6-11 8 9Z" stroke="white" strokeWidth="1.5" strokeLinejoin="round" />
        <circle cx="9" cy="21" r="2.5" fill="white" />
        <circle cx="15" cy="10" r="2.5" fill="white" />
        <circle cx="23" cy="19" r="2.5" fill="white" />
      </svg>
      SkillGraph
    </span>
  );
}
