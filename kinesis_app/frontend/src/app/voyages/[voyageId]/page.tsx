import { Suspense } from "react";
import VoyageDetailClient from "./voyage-detail-client";
import VoyagesPageHeader from "@/components/voyages-page-header";

type VoyageDetailPageProps = {
  params: Promise<{ voyageId: string }>;
  searchParams: Promise<{ passagers?: string }>;
};

async function VoyageDetailRoute({
  params,
  searchParams,
}: VoyageDetailPageProps) {
  const [{ voyageId }, { passagers }] = await Promise.all([
    params,
    searchParams,
  ]);
  const parsedPassengerCount = Number.parseInt(passagers ?? "1", 10);

  return (
    <VoyageDetailClient
      key={voyageId}
      voyageId={voyageId}
      passengerCount={
        Number.isFinite(parsedPassengerCount) && parsedPassengerCount > 0
          ? parsedPassengerCount
          : 1
      }
    />
  );
}

export default function VoyageDetailPage(props: VoyageDetailPageProps) {
  return (
    <Suspense
      fallback={
        <main className="voyage-detail-page" aria-busy="true">
          <VoyagesPageHeader currentPage="detail" />
        </main>
      }
    >
      <VoyageDetailRoute {...props} />
    </Suspense>
  );
}
