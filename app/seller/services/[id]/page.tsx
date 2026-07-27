import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SellerServiceForm } from "@/app/seller/services/service-form";

type Props = { params: Promise<{ id: string }> };

export const metadata = { title: "Edit Seller Service | Arc Agent Commerce" };

export default async function EditSellerServicePage({ params }: Props) {
  const { id } = await params;
  return (
    <main className="min-h-screen bg-background">
      <section className="border-b bg-secondary/30">
        <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
          <Button asChild variant="ghost" className="mb-6 px-0"><Link href="/console/seller"><ArrowLeft />Back to Seller Console</Link></Button>
          <h1 className="text-4xl font-bold">Edit Seller Service</h1>
          <p className="mt-3 max-w-2xl leading-7 text-muted-foreground">Changes to price, endpoint, schemas, method, or timeout create a new immutable version. Existing quotes keep their original version.</p>
        </div>
      </section>
      <section className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6"><SellerServiceForm serviceId={id} /></section>
    </main>
  );
}
