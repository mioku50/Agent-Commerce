import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function TrustProfileNotFound() {
  return (
    <main className="grid min-h-[calc(100vh-4rem)] place-items-center px-4 py-16">
      <section className="max-w-xl text-center">
        <p className="font-mono text-sm font-semibold text-primary">404</p>
        <h1 className="mt-3 text-4xl font-bold">Trust profile not found</h1>
        <p className="mt-4 leading-7 text-muted-foreground">
          This profile does not exist or its owner has kept the watchlist private.
        </p>
        <Button asChild className="mt-7">
          <Link href="/monitoring">Open Monitoring</Link>
        </Button>
      </section>
    </main>
  );
}
