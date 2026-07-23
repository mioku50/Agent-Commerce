"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, LogIn, LogOut, Wrench } from "lucide-react";
import { logout } from "@/app/actions";
import { ActivityDropdown } from "@/components/activity/ActivityDropdown";
import { Button } from "@/components/ui/button";
import { WalletWidget } from "@/components/wallet/WalletWidget";

export function Topbar({
  loggedIn,
  onMenuClick,
}: {
  loggedIn: boolean;
  onMenuClick: () => void;
}) {
  const pathname = usePathname();
  const isConsole = pathname.startsWith("/console");

  return (
    <header className="sticky top-0 z-40 h-16 border-b bg-[#080a0f]/90 backdrop-blur-xl">
      <div className="flex h-full items-center justify-between gap-4 px-4 md:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="md:hidden"
            onClick={onMenuClick}
            aria-label="Open navigation"
          >
            <Menu className="size-5" />
          </Button>
          <Link href={isConsole ? "/console" : "/"} className="flex min-w-0 items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground shadow-[0_0_28px_rgb(61_126_255/0.25)]">
              AC
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold leading-none text-foreground">
                {isConsole ? "Arc Developer Console" : "Arc Agent Commerce"}
              </span>
              <span className="mt-1 inline-flex max-w-full items-center gap-2 text-xs text-muted-foreground">
                <span className="truncate">
                  {isConsole ? "Developer & Operator tools" : "Hosted paid API workflows"}
                </span>
                {isConsole ? (
                  <span className="hidden rounded-full border border-amber-400/20 bg-amber-400/10 px-2 py-0.5 font-semibold text-amber-300 sm:inline-flex">
                    <span className="mr-1.5 size-1.5 rounded-full bg-amber-300" />
                    Developer Mode
                  </span>
                ) : (
                  <span className="hidden rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 font-semibold text-emerald-300 sm:inline-flex">
                    <span className="mr-1.5 size-1.5 rounded-full bg-emerald-300" />
                    Arc Testnet
                  </span>
                )}
              </span>
            </span>
          </Link>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <ActivityDropdown />
          <WalletWidget compact />
          {isConsole ? (
            <>
              <Button asChild size="sm" variant="outline" className="hidden sm:inline-flex">
                <Link href="/">Public App</Link>
              </Button>
              {loggedIn ? (
                <form action={logout} className="hidden lg:block">
                  <Button type="submit" variant="outline" size="sm">
                    <LogOut />
                    Logout
                  </Button>
                </form>
              ) : (
                <Button asChild size="sm" variant="outline" className="hidden lg:inline-flex">
                  <Link href="/login">
                    <LogIn />
                    Seller Login
                  </Link>
                </Button>
              )}
            </>
          ) : (
            <Button asChild size="sm" variant="outline" className="hidden sm:inline-flex">
              <Link href="/console">
                <Wrench className="size-4" />
                Developer Console
              </Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}

