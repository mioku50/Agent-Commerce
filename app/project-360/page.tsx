import { Project360Client } from "./project-360-client";
import { PROJECT_360_SOURCE_TYPES, type Project360SourceType } from "@/lib/project-360/types";

export const metadata = {
  title: "Project 360 Due Diligence",
  description:
    "Discover project sources for free, confirm the evidence, and run a transparent coverage-aware Project 360 report.",
};

type Project360PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function Project360Page({ searchParams }: Project360PageProps) {
  const query = await searchParams;
  const requestedType = first(query.primaryType);
  const primaryType = PROJECT_360_SOURCE_TYPES.includes(requestedType as Project360SourceType)
    ? requestedType as Project360SourceType
    : "github_repository";
  return <Project360Client initialSource={{
    type: primaryType,
    value: first(query.primaryValue),
  }} />;
}
