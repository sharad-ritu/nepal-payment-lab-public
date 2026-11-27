import { loadProvider } from "@/lib/lab-server";
import { getProvider, providerApiUrl } from "@/lib/providers";
import { ProviderDashboard } from "./_components/provider-dashboard";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ provider?: string | string[] }>;
}) {
  const provider = getProvider((await searchParams).provider);
  const initial = await loadProvider(provider.id);

  return (
    <ProviderDashboard
      key={provider.id}
      providerId={provider.id}
      initial={initial}
      baseUrl={providerApiUrl({
        provider,
        origin: process.env.API_PUBLIC_URL ?? "http://localhost:45174",
      })}
    />
  );
}
