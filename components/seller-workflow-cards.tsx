import Link from "next/link";
import { ArrowRight, Braces } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { PublicSellerWorkflow } from "@/lib/seller/marketplace";

function inputFields(schema: PublicSellerWorkflow["inputSchema"]) {
  const properties = schema.properties;
  if (!properties || typeof properties !== "object" || Array.isArray(properties)) return "JSON object";
  const keys = Object.keys(properties);
  return keys.length ? keys.join(", ") : "JSON object";
}

export function SellerWorkflowCards({ workflows }: { workflows: PublicSellerWorkflow[] }) {
  if (workflows.length === 0) return null;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {workflows.map((workflow) => (
        <Card key={workflow.serviceId} className="command-card rounded-lg">
          <CardContent className="flex h-full flex-col p-6">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">External Service</Badge>
              <Badge variant="outline">{workflow.category}</Badge>
              <Badge variant={workflow.availability === "available" ? "default" : "secondary"}>
                {workflow.availability === "available" ? "Available" : "Unavailable"}
              </Badge>
            </div>
            <h3 className="mt-4 text-xl font-semibold">{workflow.name}</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{workflow.description}</p>
            <div className="mt-4 flex items-start gap-2 rounded-md border bg-secondary/10 p-3 text-sm">
              <Braces className="mt-0.5 size-4 shrink-0 text-primary" />
              <div>
                <p className="font-medium">Input</p>
                <p className="mt-1 text-xs text-muted-foreground">{inputFields(workflow.inputSchema)}</p>
              </div>
            </div>
            <p className="mt-4 text-sm font-semibold text-primary">{workflow.priceUsdc} USDC + checkout fee</p>
            <Button asChild variant="outline" className="mt-6 w-full sm:w-fit">
              <Link href={`/agent-runner?service=${encodeURIComponent(workflow.serviceId)}`}>
                Run Workflow <ArrowRight />
              </Link>
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
