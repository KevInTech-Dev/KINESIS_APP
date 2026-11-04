import { Suspense } from "react";
import KinesisLoader from "@/components/kinesis-loader";
import BookingPage from "./booking-page";

type BookingRouteProps = {
  params: Promise<{ voyageId: string }>;
  searchParams: Promise<{ passagers?: string }>;
};

async function BookingRoute({ params, searchParams }: BookingRouteProps) {
  const [{ voyageId }, { passagers }] = await Promise.all([params, searchParams]);
  return (
    <BookingPage
      key={`${voyageId}:${Number(passagers) || 1}`}
      voyageId={voyageId}
      passengerCount={Number(passagers) || 1}
    />
  );
}

export default function NewReservationPage(props: BookingRouteProps) {
  return (
    <Suspense
      fallback={<KinesisLoader message="Préparation de votre voyage…" />}
    >
      <BookingRoute {...props} />
    </Suspense>
  );
}
