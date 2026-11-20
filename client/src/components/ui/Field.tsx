import { useId } from "react";
import type { ComponentPropsWithRef, ReactNode } from "react";
import { cx } from "./cx";

type ControlAttributes = {
  id: string;
  required?: boolean;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
};

type FieldProps = Omit<ComponentPropsWithRef<"div">, "children" | "id"> & {
  id?: string;
  label: ReactNode;
  hint?: string;
  error?: string;
  required?: boolean;
  children: (attributes: ControlAttributes) => ReactNode;
};

export function Field({ id, label, hint, error, required, children, className, ...props }: FieldProps) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  return (
    <div {...props} className={cx("min-w-0 space-y-1.5 wrap-break-word", className)}>
      <label htmlFor={controlId} className="block text-sm font-semibold text-slate-900">
        {label}{required && <span aria-hidden="true" className="ml-1 text-rose-700">*</span>}
      </label>
      {children({ id: controlId, required, "aria-describedby": cx(hintId, errorId) || undefined, "aria-invalid": error ? true : undefined })}
      {hint && <p id={hintId} className="text-sm text-slate-600">{hint}</p>}
      {error && <p id={errorId} className="text-sm font-medium text-rose-700">{error}</p>}
    </div>
  );
}

const controlClasses = "block min-h-11 w-full min-w-0 rounded-control border border-slate-500 bg-white px-3 py-2 text-base leading-relaxed text-slate-900 placeholder:text-slate-500 aria-invalid:border-rose-700 disabled:cursor-not-allowed disabled:bg-slate-100";

export function Input({ className, ...props }: ComponentPropsWithRef<"input">) {
  return <input {...props} className={cx(controlClasses, className)} />;
}

export function Textarea({ className, rows = 3, ...props }: ComponentPropsWithRef<"textarea">) {
  return <textarea {...props} rows={rows} className={cx(controlClasses, "resize-y", className)} />;
}

export function Select({ className, ...props }: ComponentPropsWithRef<"select">) {
  return <select {...props} className={cx(controlClasses, className)} />;
}
