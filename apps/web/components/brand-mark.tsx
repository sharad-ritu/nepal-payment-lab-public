import { cn } from "@/lib/utils";

// One request splits into two answers: the browser return and verification.
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden="true"
      className={cn("size-8 shrink-0", className)}
    >
      <rect width="32" height="32" rx="9" className="fill-primary" />
      <path
        d="M7 16h6.5c3 0 4-6 7.5-6H25M13.5 16c3 0 4 6 7.5 6H25"
        fill="none"
        strokeWidth="2.25"
        strokeLinecap="round"
        className="stroke-accent"
      />
      <circle cx="25" cy="10" r="2.25" className="fill-primary-foreground" />
      <circle cx="25" cy="22" r="2.25" className="fill-highlight" />
    </svg>
  );
}
