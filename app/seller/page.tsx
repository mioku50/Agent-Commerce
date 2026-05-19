import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { ArrowRight, ChartNoAxesCombined, PlusCircle, Store } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  listDynamicStoreServiceRows,
  rowToSellerService,
  type SellerStoreService,
} from "@/lib/services/store-service-persistence";

export const metadata = {
  title: "Seller Creator Mode | Arc Agent Commerce",
  description: "Create safe seller-owned API service listings for the API Store.",
};

function statusVariant(status: string) {
  if (status === "live") return "default";
  if (status === "disabled") return "destructive";
  return "secondary";
}

function SourceBadge({ sourceType }: { sourceType: string }) {
  return (
    <Badge variant={sourceType === "seller_mock" ? "secondary" : "outline"}>
      {sourceType === "seller_mock" ? "Protected mock response" : "External placeholder"}
    </Badge>
  );
}

function ServiceCard({ service }: { service: SellerStoreService }) {
  return (
    <Card className="rounded-lg shadow-sm">
      <CardHeader>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Badge variant={statusVariant(service.status)}>{service.status}</Badge>
          <SourceBadge sourceType={service.sourceType} />
          <Badge variant="outline">{service.method}</Badge>
        </div>
        <CardTitle className="text-xl">{service.name}</CardTitle>
        <p className="text-sm leading-6 text-muted-foreground">
          {service.shortDescription}
        </p>
      </CardHeader>
      <CardContent className="grid gap-4">
        <dl className="grid gap-3 text-sm">
          <div>
            <dt className="text-muted-foreground">Endpoint</dt>
            <dd className="break-all font-mono">{service.endpoint}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Price</dt>
            <dd className="font-mono">{service.priceLabel}</dd>
          </div>
        </dl>
        <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row">
          <Button asChild className="flex-1">
            <Link href={`/seller/services/${service.id}`}>
              Edit listing
              <ArrowRight />
            </Link>
          </Button>
          <Button asChild variant="outline" className="flex-1">
            <Link href={`/api/seller/services/${service.id}/analytics`}>
              Analytics JSON
            </Link>
          </Button>
          <Button asChild variant="outline" className="flex-1">
            <Link href={`/store/${service.slug}`}>View in store</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

async function SellerServices() {
  await connection();
  const { services: rows, warning } = await listDynamicStoreServiceRows();
  const services = rows.map(rowToSellerService);
  const liveCount = services.filter((service) => service.status === "live").length;
  const draftCount = services.filter((service) => service.status === "draft").length;

  return (
    <>
      {warning ? (
        <p className="rounded-lg border bg-card p-3 text-sm text-muted-foreground">
          {warning}
        </p>
      ) : null}

      <section className="grid gap-4 md:grid-cols-3">
        {[
          ["Total services", services.length],
          ["Live services", liveCount],
          ["Draft services", draftCount],
        ].map(([label, value]) => (
          <Card className="rounded-lg" key={label}>
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="mt-2 font-mono text-3xl font-semibold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {services.length > 0 ? (
          services.map((service) => (
            <ServiceCard key={service.id} service={service} />
          ))
        ) : (
          <Card className="rounded-lg lg:col-span-2">
            <CardContent className="p-6 text-sm text-muted-foreground">
              No seller-created services yet.
            </CardContent>
          </Card>
        )}
      </section>
    </>
  );
}

function SellerServicesFallback() {
  return (
    <Card className="rounded-lg">
      <CardContent className="p-6 text-sm text-muted-foreground">
        Loading seller services...
      </CardContent>
    </Card>
  );
}

export default function SellerPage() {
  return (
    <main className="min-h-screen bg-background">
      <section className="border-b bg-secondary/30">
        <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <Badge variant="secondary">Seller Creator Mode</Badge>
                <Badge variant="outline">Safe mock services first</Badge>
              </div>
              <h1 className="text-4xl font-bold tracking-normal text-foreground sm:text-5xl">
                Publish API services for agents
              </h1>
              <p className="mt-4 max-w-3xl leading-7 text-muted-foreground">
                Create marketplace listings that agents can discover from the
                API Store. Phase 4 supports safe stored mock responses and
                external placeholders without introducing arbitrary API proxying.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button asChild>
                <Link href="/seller/services/new">
                  <PlusCircle />
                  Create API Service
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/seller/analytics">
                  <ChartNoAxesCombined />
                  View analytics
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/store">
                  <Store />
                  Open API Store
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-8 sm:px-6">
        <Suspense fallback={<SellerServicesFallback />}>
          <SellerServices />
        </Suspense>
      </section>
    </main>
  );
}
