"use client";

import { CheckIcon, CopyIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useClipboard } from "@/hooks/use-clipboard";
import { cn } from "@/lib/utils";

export function CodeBlock({
  code,
  label,
  actions,
  children,
}: {
  code: string;
  label: string;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  const { copy, status } = useClipboard();

  return (
    <div className="code-block">
      <div className="flex items-center justify-between gap-4 py-1.5 pr-1.5 pl-4">
        <span className="truncate text-xs text-code-muted">{label}</span>
        <div className="flex shrink-0 items-center gap-1.5">
          {actions}
          <Button
            variant="secondary"
            size="xs"
            aria-label={`Copy ${label}`}
            onClick={() => void copy(code)}
          >
            {status === "copied" ? (
              <CheckIcon data-icon="inline-start" />
            ) : (
              <CopyIcon data-icon="inline-start" />
            )}
            {status === "copied" ? "Copied" : "Copy"}
          </Button>
        </div>
      </div>
      {/* biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users need to scroll long code lines. */}
      <section aria-label={label} tabIndex={0}>
        <pre>
          <code>{children ?? code}</code>
        </pre>
      </section>
      <span
        role="status"
        className={cn(
          status === "error"
            ? "block px-4 pb-3 text-xs text-destructive-soft"
            : "sr-only",
        )}
      >
        {status === "error"
          ? "Clipboard unavailable. Select and copy the text."
          : status === "copied"
            ? `${label} copied.`
            : ""}
      </span>
    </div>
  );
}
