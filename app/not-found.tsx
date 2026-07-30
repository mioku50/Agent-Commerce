import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BRAND } from "@/lib/brand";

export default function NotFound() {
  return (
    <main className="grid min-h-[calc(100vh-4rem)] place-items-center px-4 py-16">
      <section className="max-w-xl text-center">
        <p className="font-mono text-sm font-semibold text-primary">404</p>
        <h1 className="mt-3 text-4xl font-bold">This {BRAND.name} page does not exist</h1>
        <p className="mt-4 leading-7 text-muted-foreground">
          Return to {BRAND.name} to explore verified workflows and reports.
        </p>
        <Button asChild className="mt-7">
          <Link href="/">Return home</Link>
        </Button>
      </section>
    </main>
  );
}
