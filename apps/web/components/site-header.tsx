"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandMark } from "@/components/brand-mark";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from "@/components/ui/navigation-menu";

const navigation = [
  {
    href: "/how-it-works",
    label: "How it works",
    className: undefined,
  },
  {
    href: "/dashboard",
    label: "Dashboard",
    className: "max-sm:hidden",
  },
];

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
      <div className="dashboard-container flex h-16 items-center gap-3 sm:gap-8">
        <Link
          href="/dashboard"
          aria-label="Nepal Payment Lab dashboard"
          className="flex items-center gap-2.5 rounded-md"
        >
          <BrandMark />
          <span className="heading text-lg leading-none">
            <span className="hidden sm:inline">Nepal </span>Payment Lab
          </span>
        </Link>
        <NavigationMenu
          aria-label="Main navigation"
          className="ml-auto flex-none"
        >
          <NavigationMenuList className="gap-1">
            {navigation.map(({ href, label, className }) => (
              <NavigationMenuItem key={href} className={className}>
                <NavigationMenuLink
                  render={<Link href={href} />}
                  active={pathname === href || pathname.startsWith(`${href}/`)}
                  className="font-medium"
                >
                  {label}
                </NavigationMenuLink>
              </NavigationMenuItem>
            ))}
          </NavigationMenuList>
        </NavigationMenu>
      </div>
    </header>
  );
}
