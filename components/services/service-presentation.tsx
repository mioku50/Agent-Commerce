import { Badge } from "@/components/ui/badge";
import {
  servicePresentationLabel,
  type ServicePresentationMetadata,
} from "@/lib/services/presentation";

export function ServicePresentation({
  metadata,
  showBilling = true,
}: {
  metadata: ServicePresentationMetadata;
  showBilling?: boolean;
}) {
  return (
    <div
      data-service-presentation
      data-provider-type={metadata.providerType}
      className="grid min-w-0 gap-2"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Badge variant={metadata.providerType === "live_provider" ? "default" : "outline"}>
          {servicePresentationLabel(metadata)}
        </Badge>
        {metadata.assetSymbol ? <Badge variant="secondary">{metadata.assetSymbol}</Badge> : null}
        {metadata.dataFreshness ? <Badge variant="outline">{metadata.dataFreshness}</Badge> : null}
      </div>
      {showBilling ? (
        <p className="break-words text-xs leading-5 text-muted-foreground">
          {metadata.billingLabel}
        </p>
      ) : null}
    </div>
  );
}
