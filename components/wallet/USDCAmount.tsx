import { cn } from "@/lib/utils";

export function USDCAmount({
  value,
  size = "md",
  className,
}: {
  value: number | string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const display = typeof value === "number" ? value.toLocaleString("en", {
    maximumFractionDigits: 6,
  }) : value;

  return (
    <span
      className={cn(
        "inline-flex items-baseline gap-1 font-mono tabular-usdc text-code",
        size === "sm" && "text-sm",
        size === "md" && "text-base",
        size === "lg" && "text-2xl font-semibold",
        className,
      )}
    >
      <span>{display}</span>
      <span className={cn("text-muted-foreground", size === "lg" ? "text-sm" : "text-xs")}>
        USDC
      </span>
    </span>
  );
}
