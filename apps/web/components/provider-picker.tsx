"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ProviderMark } from "@/components/provider-mark";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from "@/components/ui/navigation-menu";
import { type ProviderDefinition, providers } from "@/lib/providers";

export function ProviderPicker({
  provider,
  disabled = false,
}: {
  provider: ProviderDefinition;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const busy = disabled || isPending;

  return (
    <NavigationMenu
      aria-label="Payment providers"
      className="w-full max-w-none flex-none justify-start"
    >
      <NavigationMenuList className="grid w-full flex-none grid-cols-4 justify-start gap-1 rounded-xl border bg-muted p-1 sm:w-fit sm:grid-cols-[repeat(4,7rem)]">
        {providers.map((entry) => (
          <NavigationMenuItem key={entry.id} className="min-w-0">
            <NavigationMenuLink
              render={
                <Link href={`/dashboard?provider=${entry.id}`} scroll={false} />
              }
              active={entry.id === provider.id}
              aria-current={entry.id === provider.id ? "page" : undefined}
              aria-disabled={busy}
              aria-label={`${entry.name}, ${entry.productName}`}
              variant="provider"
              onClick={(event) => {
                if (busy || entry.id === provider.id) {
                  event.preventDefault();
                  return;
                }
                if (
                  event.metaKey ||
                  event.ctrlKey ||
                  event.shiftKey ||
                  event.altKey
                )
                  return;
                event.preventDefault();
                startTransition(() =>
                  router.push(`/dashboard?provider=${entry.id}`, {
                    scroll: false,
                  }),
                );
              }}
            >
              <ProviderMark
                provider={entry.id}
                variant="plain"
                size="xs"
                className="max-w-full"
              />
            </NavigationMenuLink>
          </NavigationMenuItem>
        ))}
      </NavigationMenuList>
    </NavigationMenu>
  );
}
