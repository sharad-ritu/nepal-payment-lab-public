import type { Provider } from "@nepal-payment-lab/shared";
import Image, { type StaticImageData } from "next/image";
import { cn } from "@/lib/utils";
import connectipsLogo from "@/public/provider-logos/connectips.png";
import esewaLogo from "@/public/provider-logos/esewa.png";
import khaltiLogo from "@/public/provider-logos/khalti.png";
// Current NPX artwork from https://nepalpayment.com/assets/mainLogo-28_KGcZp.png.
import npsLogo from "@/public/provider-logos/nps.png";

const logos = {
  khalti: khaltiLogo,
  esewa: esewaLogo,
  connectips: connectipsLogo,
  nps: npsLogo,
} satisfies Record<Provider, StaticImageData>;

const logoSizes = {
  xs: "80px",
  sm: "64px",
  default: "96px",
  lg: "128px",
};

export function ProviderMark({
  provider,
  active = false,
  size = "default",
  variant = "framed",
  className,
}: {
  provider: Provider;
  active?: boolean;
  size?: keyof typeof logoSizes;
  variant?: "framed" | "plain";
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      data-size={size}
      className={cn(
        "inline-flex shrink-0 items-center justify-center",
        "data-[size=xs]:h-6 data-[size=xs]:w-20 data-[size=sm]:h-10 data-[size=sm]:w-16 data-[size=default]:h-12 data-[size=default]:w-24 data-[size=lg]:h-18 data-[size=lg]:w-32",
        variant === "framed" && [
          "rounded-lg border bg-card p-1 transition-colors data-[size=lg]:rounded-xl data-[size=lg]:p-2",
          active ? "border-primary" : "border-border",
        ],
        className,
      )}
    >
      <Image
        src={logos[provider]}
        alt=""
        sizes={logoSizes[size]}
        className="size-full object-contain"
      />
    </span>
  );
}
