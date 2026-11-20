import type { ComponentPropsWithRef, ReactNode } from "react";
import { buttonClasses } from "./cx";
import type { ButtonStyle } from "./cx";
import { Spinner } from "./Feedback";

type ButtonProps = ComponentPropsWithRef<"button"> & ButtonStyle & {
  loading?: boolean;
  leadingIcon?: ReactNode;
};

export function Button({ variant, size, className, loading, leadingIcon, disabled, type = "button", children, ...props }: ButtonProps) {
  return (
    <button {...props} type={type} disabled={disabled || loading} aria-busy={loading || props["aria-busy"]} className={buttonClasses({ variant, size, className })}>
      {loading ? <Spinner decorative /> : leadingIcon && <span aria-hidden="true" className="shrink-0">{leadingIcon}</span>}
      <span className="min-w-0 wrap-break-word">{children}</span>
    </button>
  );
}
