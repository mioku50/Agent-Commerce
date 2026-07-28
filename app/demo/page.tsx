import { redirect } from "next/navigation";

export default function DemoPage() {
  redirect(
    "/agent-runner?workflow=github&repository=https%3A%2F%2Fgithub.com%2Fcirclefin%2Fdeveloper-controlled-wallets-web-sdk",
  );
}
