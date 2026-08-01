import { Project360Client } from "./project-360-client";

export const metadata = {
  title: "Project 360 Due Diligence",
  description:
    "Discover project sources for free, confirm the evidence, and run a transparent coverage-aware Project 360 report.",
};

export default function Project360Page() {
  return <Project360Client />;
}
