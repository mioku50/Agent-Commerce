export const BRAND = {
  name: "Veyra",
  monogram: "V",
  tagline: "Verified workflows for people and AI agents",
  description:
    "Run paid data and analysis workflows, receive structured reports, and verify the results on Arc.",
  developerConsole: "Veyra Developer Console",
  agentApi: "Veyra Agent API",
  reports: "Veyra Reports",
} as const;

export const BRAND_TITLE = `${BRAND.name} — ${BRAND.tagline}`;

export function brandPageTitle(page: string) {
  return `${page} | ${BRAND.name}`;
}
