export type SidebarIconName =
  | "activity"
  | "agent"
  | "my-agents"
  | "console"
  | "dashboard"
  | "passport"
  | "proof"
  | "receipt"
  | "results"
  | "seller"
  | "templates"
  | "tools";

export const publicSidebarNavigation = [
  {
    label: "Menu",
    items: [
      { href: "/", label: "Home", icon: "dashboard" },
      { href: "/agent-runner", label: "New Report", icon: "agent" },
      { href: "/results", label: "Reports", icon: "results" },
    ],
  },
] as const satisfies ReadonlyArray<{
  label: string;
  items: ReadonlyArray<{ href: string; label: string; icon: SidebarIconName }>;
}>;

export const consoleSidebarNavigation = [
  {
    label: "Developer Console",
    items: [
      { href: "/console", label: "Console Home", icon: "console" },
      { href: "/console/agents", label: "Agents", icon: "my-agents" },
      { href: "/console/seller", label: "Services / Seller", icon: "seller" },
      { href: "/console/developer-tools", label: "Developer Tools", icon: "tools" },
      { href: "/console/audit", label: "Audit & Verification", icon: "proof" },
    ],
  },
] as const satisfies ReadonlyArray<{
  label: string;
  items: ReadonlyArray<{ href: string; label: string; icon: SidebarIconName }>;
}>;

export const sidebarNavigation = publicSidebarNavigation;

export const DESKTOP_SIDEBAR_SCROLL_CLASS = "overflow-y-auto overscroll-contain";
export const MOBILE_SIDEBAR_SCROLL_CLASS = "overflow-y-auto overscroll-contain";

