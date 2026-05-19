import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { ArrowLeft, ChartNoAxesCombined } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SellerServiceForm } from "@/app/seller/services/service-form";
import {
  getDynamicStoreServiceRowById,
  rowToSellerService,
} from "@/lib/services/store-service-persistence";

type EditSellerServicePageProps = {
  params: Promise<{
    id: string;
  }>;
};

export const metadata = {
  title: "Edit API Service | Arc Agent Commerce",
};

async function EditSellerService({ params }: EditSellerServicePageProps) {
  await connection();
  const { id } = await params;
  const row = await getDynamicStoreServiceRowById(id);

  if (!row) notFound();

  const service = rowToSellerService(row);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline">
          <Link href="/seller/analytics">
            <ChartNoAxesCombined />
            View seller analytics
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={`/api/seller/services/${service.id}/analytics`}>
            Service analytics JSON
          </Link>
        </Button>
      </div>
      <SellerServiceForm initialService={service} />
    </div>
  );
}

function EditSellerServiceFallback() {
  return (
    <Card className="rounded-lg">
      <CardContent className="p-6 text-sm text-muted-foreground">
        Loading service editor...
      </CardContent>
    </Card>
  );
}

export default function EditSellerServicePage({
  params,
}: EditSellerServicePageProps) {
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
            Edit API Service
          </h1>
          <p className="mt-3 max-w-2xl leading-7 text-muted-foreground">
            Update listing metadata, schemas, pricing, and safe fulfillment
            mode for the API Store.
          </p>
        </div>
      </section>

      <section className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
        <Suspense fallback={<EditSellerServiceFallback />}>
          <EditSellerService params={params} />
        </Suspense>
      </section>
    </main>
  );
}
