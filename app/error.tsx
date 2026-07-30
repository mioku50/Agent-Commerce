"use client";

import { Button } from "@/components/ui/button";
import { BRAND } from "@/lib/brand";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="grid min-h-[calc(100vh-4rem)] place-items-center px-4 py-16">
      <section className="max-w-xl text-center">
        <p className="font-mono text-sm font-semibold text-primary">{BRAND.name}</p>
        <h1 className="mt-3 text-4xl font-bold">Something went wrong</h1>
        <p className="mt-4 leading-7 text-muted-foreground">
          The workflow interface could not be loaded safely. Try the request again.
        </p>
        <Button type="button" className="mt-7" onClick={reset}>
          Try again
        </Button>
      </section>
    </main>
  );
}
