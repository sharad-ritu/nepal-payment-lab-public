import { CircleCheckIcon, CircleXIcon, Clock3Icon } from "lucide-react";
import type { SignalTone } from "@/lib/provider-scenarios";
import { cn } from "@/lib/utils";

export const signalTones = {
  success: {
    icon: CircleCheckIcon,
    className: "text-success",
    pillClassName: "bg-success-soft",
  },
  pending: {
    icon: Clock3Icon,
    className: "text-warning",
    pillClassName: "bg-warning-soft",
  },
  failure: {
    icon: CircleXIcon,
    className: "text-destructive",
    pillClassName: "bg-destructive-soft",
  },
} satisfies Record<SignalTone, unknown>;

export function StatusText({
  tone,
  variant = "text",
  children,
  className,
}: {
  tone: SignalTone;
  variant?: "text" | "pill";
  children: string;
  className?: string;
}) {
  const {
    icon: Icon,
    className: toneClassName,
    pillClassName,
  } = signalTones[tone];

  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 text-sm font-medium",
        toneClassName,
        variant === "pill" && ["rounded-full px-2.5 py-1", pillClassName],
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-3.5 shrink-0" />
      <span className="min-w-0 break-words">{children}</span>
    </span>
  );
}
