export type SidebarIconName =
  | "activity"
  | "agent"
  | "my-agents"
  | "dashboard"
  | "passport"
  | "proof"
  | "receipt"
  | "results"
  | "seller"
  | "templates"
  | "tools";

export const sidebarNavigation = [
  {
    label: "Workflows",
    items: [
      { href: "/", label: "Dashboard", icon: "dashboard" },
      { href: "/agent-runner", label: "Run Workflow", icon: "agent" },
      { href: "/my-agents", label: "My Agents", icon: "my-agents" },
      { href: "/workflows", label: "Workflow Templates", icon: "templates" },
      { href: "/results", label: "Results", icon: "results" },
    ],
  },
  {
    label: "Verification",
    items: [
      { href: "/runs", label: "Activity", icon: "activity" },
      { href: "/proofs", label: "Arc Proofs", icon: "proof" },
      { href: "/agents", label: "Agent Passports", icon: "passport" },
      { href: "/receipts", label: "Commerce Receipts", icon: "receipt" },
    ],
  },
  {
    label: "Advanced",
    items: [{ href: "/developer-tools", label: "Developer Tools", icon: "tools" }],
  },
  {
    label: "Operator",
    items: [{ href: "/seller", label: "Seller", icon: "seller" }],
  },
] as const satisfies ReadonlyArray<{
  label: string;
  items: ReadonlyArray<{ href: string; label: string; icon: SidebarIconName }>;
}>;

export const DESKTOP_SIDEBAR_SCROLL_CLASS = "overflow-y-auto overscroll-contain";
export const MOBILE_SIDEBAR_SCROLL_CLASS = "overflow-y-auto overscroll-contain";
