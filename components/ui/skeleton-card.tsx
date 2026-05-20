import { cn } from "@/lib/utils";

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-lg border bg-card/70 p-5", className)}>
      <div className="skeleton-shimmer h-4 w-24 rounded" />
      <div className="skeleton-shimmer mt-5 h-6 w-3/4 rounded" />
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="skeleton-shimmer h-12 rounded" />
        <div className="skeleton-shimmer h-12 rounded" />
        <div className="skeleton-shimmer h-12 rounded" />
      </div>
    </div>
  );
}
