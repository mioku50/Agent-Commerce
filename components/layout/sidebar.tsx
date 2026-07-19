"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BadgeCheck,
  Bot,
  FileText,
  Github,
  House,
  LayoutTemplate,
  ReceiptText,
  ShieldCheck,
  Store,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: string;
};

const navSections: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "Workflow Product",
    items: [
      { href: "/", label: "Dashboard", icon: House },
      { href: "/agent-runner", label: "Run Workflow", icon: Bot },
      { href: "/workflows", label: "Workflow Templates", icon: LayoutTemplate },
      { href: "/results", label: "Results", icon: FileText },
      { href: "/runs", label: "Activity", icon: Activity },
      { href: "/proofs", label: "Arc Proofs", icon: ShieldCheck },
      { href: "/agents", label: "Agent Passports", icon: BadgeCheck },
      { href: "/receipts", label: "Commerce Receipts", icon: ReceiptText },
      { href: "/developer-tools", label: "Developer Tools", icon: Wrench },
      { href: "/seller", label: "Seller", icon: Store },
    ],
  },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function SidebarLink({ item, collapsed }: { item: NavItem; collapsed?: boolean }) {
  const pathname = usePathname();
  const active = isActive(pathname, item.href);
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      title={collapsed ? item.label : undefined}
      className={cn(
        "group flex min-w-0 items-center gap-3 rounded-md border border-transparent px-3 py-2 text-sm text-muted-foreground transition-all hover:border-primary/25 hover:bg-primary/10 hover:text-foreground",
        active && "border-primary/30 bg-primary/15 text-foreground shadow-[0_0_20px_rgb(61_126_255/0.08)]",
        collapsed && "justify-center px-2",
      )}
    >
      <Icon className="size-4 shrink-0" />
      <span className={cn("min-w-0 flex-1 truncate", collapsed && "sr-only")}>
        {item.label}
      </span>
      {item.badge && !collapsed ? (
        <span className="rounded-full border border-primary/25 bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
          {item.badge}
        </span>
      ) : null}
    </Link>
  );
}

export function Sidebar({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <aside
      className={cn(
        "hidden border-r bg-[#0b0e14]/92 backdrop-blur-xl md:sticky md:top-16 md:block md:h-[calc(100vh-4rem)]",
        collapsed ? "w-16" : "w-60",
      )}
    >
      <div className="flex h-full flex-col gap-5 p-3">
        <div className="grid gap-5">
          {navSections.map((section) => (
            <div key={section.label}>
              <p
                className={cn(
                  "mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground",
                  collapsed && "sr-only",
                )}
              >
                {section.label}
              </p>
              <div className="grid gap-1">
                {section.items.map((item) => (
                  <SidebarLink key={item.href} item={item} collapsed={collapsed} />
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-auto grid gap-2 border-t pt-4">
          <Link
            href="https://github.com/mioku50/Agent-Commerce#readme"
            target="_blank"
            rel="noreferrer"
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-primary/10 hover:text-foreground",
              collapsed && "justify-center px-2",
            )}
            title={collapsed ? "View README" : undefined}
          >
            <Github className="size-4" />
            <span className={cn(collapsed && "sr-only")}>View README</span>
          </Link>
          <div
            className={cn(
              "flex items-center gap-2 rounded-md border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-xs text-emerald-300",
              collapsed && "justify-center px-2",
            )}
            title={collapsed ? "Arc Testnet" : undefined}
          >
            <span className="size-2 rounded-full bg-emerald-300 shadow-[0_0_14px_rgb(0_208_132/0.6)]" />
            <span className={cn("font-semibold", collapsed && "sr-only")}>Arc Testnet</span>
          </div>
        </div>
      </div>
    </aside>
  );
}

export function MobileSidebar({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <div className={cn("fixed inset-0 z-50 md:hidden", !open && "pointer-events-none")}>
      <button
        type="button"
        aria-label="Close navigation"
        className={cn(
          "absolute inset-0 bg-black/60 transition-opacity",
          open ? "opacity-100" : "opacity-0",
        )}
        onClick={onClose}
      />
      <div
        className={cn(
          "absolute left-0 top-0 h-full w-[290px] border-r bg-background p-4 shadow-2xl transition-transform duration-200",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="mb-5 flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
            AC
          </span>
          <div>
            <p className="text-sm font-semibold">Arc Agent Commerce</p>
            <p className="text-xs text-muted-foreground">Hosted workflow reports</p>
          </div>
        </div>
        <div className="grid gap-5">
          {navSections.map((section) => (
            <div key={section.label}>
              <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {section.label}
              </p>
              <div className="grid gap-1" onClick={onClose}>
                {section.items.map((item) => (
                  <SidebarLink key={item.href} item={item} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
