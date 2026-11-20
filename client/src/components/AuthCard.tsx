import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import type { ComponentPropsWithRef, ReactNode } from "react";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import { Input } from "./ui/Field";
import { Logo } from "./ui/Logo";
import { Link } from "react-router-dom";

export default function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <main className="grid min-h-screen animate-fade-in place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        <Link to="/" className="mx-auto mb-6 flex min-h-11 w-fit items-center rounded-control">
          <Logo />
        </Link>
        <Card>
          <h1 className="text-[1.75rem] leading-tight font-semibold tracking-tight text-slate-900">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </Card>
      </div>
    </main>
  );
}

export function PasswordInput(props: Omit<ComponentPropsWithRef<"input">, "type">) {
  const [visible, setVisible] = useState(false);
  const Icon = visible ? EyeOff : Eye;
  return (
    <div className="flex items-start gap-2">
      <Input {...props} type={visible ? "text" : "password"} />
      <Button variant="secondary" size="sm" className="shrink-0" aria-controls={props.id} aria-label={visible ? "Hide password" : "Show password"} onClick={() => setVisible((previous) => !previous)}>
        <Icon aria-hidden="true" className="size-4" />
      </Button>
    </div>
  );
}
