import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SellerServiceForm } from "@/app/seller/services/service-form";

export const metadata = {
  title: "Create API Service | Arc Agent Commerce",
};

export default function NewSellerServicePage() {
  return (
    <main className="min-h-screen bg-background">
      <section className="border-b bg-secondary/30">
        <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
          <Button asChild variant="ghost" className="mb-6 px-0">
            <Link href="/seller">
              <ArrowLeft />
              Back to Seller Creator
            </Link>
          </Button>
          <h1 className="text-4xl font-bold tracking-normal">
            Create API Service
          </h1>
          <p className="mt-3 max-w-2xl leading-7 text-muted-foreground">
            Publish a safe marketplace listing. Use `seller_mock` for a protected
            stored response, or `external_placeholder` to document future
            fulfillment without proxying external APIs.
          </p>
        </div>
      </section>

      <section className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
        <SellerServiceForm />
      </section>
    </main>
  );
}
