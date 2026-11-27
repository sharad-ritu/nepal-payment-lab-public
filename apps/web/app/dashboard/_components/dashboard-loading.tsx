import { Skeleton } from "@/components/ui/skeleton";

export function DashboardLoading() {
  return (
    <div role="status" className="flex flex-col gap-4">
      <span className="sr-only">Loading provider settings...</span>
      <Skeleton aria-hidden="true" className="h-10 w-full max-w-sm" />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(18rem,1fr)]">
        <Skeleton aria-hidden="true" className="h-96 rounded-xl" />
        <Skeleton aria-hidden="true" className="h-64 rounded-xl" />
      </div>
    </div>
  );
}
