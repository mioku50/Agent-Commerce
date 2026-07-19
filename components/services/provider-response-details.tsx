import { Badge } from "@/components/ui/badge";
import { providerResponsePresentation } from "@/lib/services/presentation";

export function ProviderResponseDetails({ value }: { value: unknown }) {
  const provider = providerResponsePresentation(value);
  if (!provider) return null;
  return (
    <div
      data-provider-response
      className="rounded-md border border-primary/20 bg-primary/5 p-4"
    >
      <div className="mb-3 flex min-w-0 flex-wrap items-center gap-2">
        <Badge>Live Provider</Badge>
        <Badge variant="secondary">{provider.providerName}</Badge>
        {provider.assetSymbol ? <Badge variant="outline">{provider.assetSymbol}</Badge> : null}
      </div>
      <dl className="grid min-w-0 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
        {provider.price ? <div><dt className="text-muted-foreground">Price</dt><dd className="break-words font-mono">{provider.price}</dd></div> : null}
        {provider.confidenceLow && provider.confidenceHigh ? <div><dt className="text-muted-foreground">Confidence interval</dt><dd className="break-words font-mono">{provider.confidenceLow} – {provider.confidenceHigh}{provider.confidence ? ` (±${provider.confidence})` : ""}</dd></div> : null}
        {provider.publishTime ? <div><dt className="text-muted-foreground">Provider publish time</dt><dd className="break-words">{provider.publishTime}</dd></div> : null}
        {provider.fetchedAt ? <div><dt className="text-muted-foreground">Data fetched time</dt><dd className="break-words">{provider.fetchedAt}</dd></div> : null}
        {provider.priceAgeSeconds !== null ? <div><dt className="text-muted-foreground">Data age at fetch</dt><dd>{provider.priceAgeSeconds} seconds</dd></div> : null}
        {provider.paidAmountUsdc ? <div><dt className="text-muted-foreground">Provider-backed API price</dt><dd className="font-mono">{provider.paidAmountUsdc} USDC</dd></div> : null}
      </dl>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">
        USDC pays Arc Agent Commerce for access to this provider-backed API; it is not a direct payment to the underlying data provider.
      </p>
    </div>
  );
}
