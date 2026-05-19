/**
 * Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BadgeCheck,
  Bot,
  ChartNoAxesCombined,
  House,
  LayoutDashboard,
  ListChecks,
  LogIn,
  LogOut,
  PlusCircle,
  ReceiptText,
  Store,
  type LucideIcon,
} from "lucide-react";
import { logout } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { ArcWalletWidget } from "@/components/wallet/arc-wallet-widget";
import { cn } from "@/lib/utils";

type GlobalNavClientProps = {
  loggedIn: boolean;
};

const publicLinks = [
  { href: "/", label: "Home", icon: House },
  { href: "/store", label: "API Store", icon: Store },
  { href: "/agent-control", label: "Agent Control", icon: Bot },
  { href: "/runs", label: "Agent Runs", icon: ListChecks },
  { href: "/agents", label: "Agent Passports", icon: BadgeCheck },
  { href: "/receipts", label: "Receipts", icon: ReceiptText },
];

const sellerLinks = [
  { href: "/dashboard", label: "Seller Dashboard", icon: LayoutDashboard },
  { href: "/seller/analytics", label: "Seller Analytics", icon: ChartNoAxesCombined },
  { href: "/seller/services/new", label: "Create API Service", icon: PlusCircle },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({
  href,
  label,
  icon: Icon,
  pathname,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  pathname: string;
}) {
  const active = isActive(pathname, href);

  return (
    <Link
      href={href}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary",
        active && "bg-primary/10 text-primary",
      )}
    >
      <Icon className="size-4" />
      {label}
    </Link>
  );
}

export function GlobalNavClient({ loggedIn }: GlobalNavClientProps) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/78">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground shadow-sm">
              AC
            </span>
            <span>
              <span className="block text-sm font-semibold leading-none text-foreground">
                Arc Agent Commerce
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">
                x402 API Store
              </span>
            </span>
          </Link>

          <div className="flex items-center gap-2 lg:hidden">
            <ArcWalletWidget variant="compact" />
            {loggedIn ? (
              <form action={logout}>
                <Button type="submit" variant="outline" size="sm">
                  <LogOut />
                  Logout
                </Button>
              </form>
            ) : (
              <Button asChild size="sm">
                <Link href="/login">
                  <LogIn />
                  Seller Login
                </Link>
              </Button>
            )}
          </div>
        </div>

        <nav className="flex gap-2 overflow-x-auto pb-1 lg:pb-0" aria-label="Public navigation">
          {publicLinks.map((link) => (
            <NavLink key={link.href} {...link} pathname={pathname} />
          ))}
        </nav>

        <div className="flex flex-col gap-2 border-t pt-3 lg:flex-row lg:items-center lg:border-t-0 lg:pt-0">
          <div className="hidden lg:block">
            <ArcWalletWidget variant="compact" />
          </div>
          {loggedIn ? (
            <>
              <nav
                className="flex gap-2 overflow-x-auto pb-1 lg:pb-0"
                aria-label="Seller navigation"
              >
                {sellerLinks.map((link) => (
                  <NavLink key={link.href} {...link} pathname={pathname} />
                ))}
              </nav>
              <form action={logout} className="hidden lg:block">
                <Button type="submit" variant="outline" size="sm">
                  <LogOut />
                  Logout
                </Button>
              </form>
            </>
          ) : (
            <Button asChild size="sm" className="hidden lg:inline-flex">
              <Link href="/login">
                <LogIn />
                Seller Login
              </Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
