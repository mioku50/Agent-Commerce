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
    label: "Agent Developer Console",
    items: [
      { href: "/console", label: "Console Home", icon: "console" },
      { href: "/console/agent-api", label: "Machine API", icon: "agent" },
      { href: "/console/agents", label: "Agent Credentials", icon: "my-agents" },
      { href: "/console/operations", label: "Operations", icon: "activity" },
      { href: "/console/audit", label: "Audit & Verification", icon: "proof" },
      { href: "/console/developer-tools", label: "Developer Tools", icon: "tools" },
    ],
  },
] as const satisfies ReadonlyArray<{
  label: string;
  items: ReadonlyArray<{ href: string; label: string; icon: SidebarIconName }>;
}>;

export const sidebarNavigation = publicSidebarNavigation;

export const DESKTOP_SIDEBAR_SCROLL_CLASS = "overflow-y-auto overscroll-contain";
export const MOBILE_SIDEBAR_SCROLL_CLASS = "overflow-y-auto overscroll-contain";
