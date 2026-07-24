import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { ArrowRight, ChartNoAxesCombined, PlusCircle, Store, Server } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { serviceRegistry } from "@/lib/services/registry";
import {
  listDynamicStoreServiceRows,
  rowToSellerService,
  type SellerStoreService,
} from "@/lib/services/store-service-persistence";

export const metadata = {
  title: "Services / Seller | Developer Console | Arc Agent Commerce",
  description: "Manage official system services, provider endpoints, and custom seller listings.",
};

function statusVariant(status: string) {
  if (status === "live") return "default";
  if (status === "disabled") return "destructive";
  return "secondary";
}

function PlatformServiceCard({
  service,
}: {
  service: (typeof serviceRegistry)[number];
}) {
  return (
    <Card className="rounded-lg shadow-sm">
      <CardHeader>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Badge variant={statusVariant(service.status)}>{service.status}</Badge>
          <Badge variant="outline">{service.sourceType}</Badge>
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
            <dd className="break-all font-mono text-xs">{service.endpoint}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Price</dt>
            <dd className="font-mono text-xs">{service.priceLabel}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Category</dt>
            <dd className="text-xs">{service.category}</dd>
          </div>
        </dl>
        <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row">
          <Button asChild variant="outline" className="flex-1">
            <Link href={`/store/${service.slug}`}>
              View in store
              <ArrowRight className="ml-2 size-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" className="flex-1">
            <Link href={`/receipts?serviceSlug=${service.slug}`}>
              Audit receipts
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function SourceBadge({ sourceType }: { sourceType: string }) {
  return (
    <Badge variant={sourceType === "seller_mock" ? "secondary" : "outline"}>
      {sourceType === "seller_mock" ? "Protected mock response" : "External placeholder"}
    </Badge>
  );
}

function SellerServiceCard({ service }: { service: SellerStoreService }) {
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
            <dd className="break-all font-mono text-xs">{service.endpoint}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Price</dt>
            <dd className="font-mono text-xs">{service.priceLabel}</dd>
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
          ["Total custom services", services.length],
          ["Live custom services", liveCount],
          ["Draft custom services", draftCount],
        ].map(([label, value]) => (
          <Card className="rounded-lg" key={String(label)}>
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
            <SellerServiceCard key={service.id} service={service} />
          ))
        ) : (
          <Card className="rounded-lg lg:col-span-2">
            <CardContent className="p-6 text-sm text-muted-foreground">
              No custom seller-created services yet. Use "Create API Service" to publish one.
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
        Loading custom seller services...
      </CardContent>
    </Card>
  );
}

export default function ConsoleSellerPage() {
  return (
    <main className="min-h-screen bg-background">
      <section className="border-b bg-secondary/30">
        <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <Badge variant="secondary">Developer Console</Badge>
                <Badge variant="outline">Service Registry & Seller Creator</Badge>
              </div>
              <h1 className="text-4xl font-bold tracking-normal text-foreground sm:text-5xl">
                API Services & Seller Console
              </h1>
              <p className="mt-4 max-w-3xl leading-7 text-muted-foreground">
                Inspect official platform services (including GitHub Repository Intelligence & GitHub Due Diligence Analysis) and manage custom seller API listings for autonomous agents.
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

      <section className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-8 sm:px-6">
        <div>
          <div className="mb-4 flex items-center gap-2">
            <Server className="size-5 text-primary" />
            <h2 className="text-2xl font-bold">Official System & Provider Services</h2>
          </div>
          <p className="mb-6 text-sm text-muted-foreground">
            Platform services registered in the API Store allowlist, including GitHub Intelligence provider calls and deterministic due diligence analysis.
          </p>
          <div className="grid gap-4 lg:grid-cols-2">
            {serviceRegistry.map((service) => (
              <PlatformServiceCard key={service.id} service={service} />
            ))}
          </div>
        </div>

        <div className="mt-6 border-t pt-8">
          <div className="mb-4 flex items-center gap-2">
            <Store className="size-5 text-primary" />
            <h2 className="text-2xl font-bold">Custom Seller-Created Services</h2>
          </div>
          <Suspense fallback={<SellerServicesFallback />}>
            <SellerServices />
          </Suspense>
        </div>
      </section>
    </main>
  );
}
