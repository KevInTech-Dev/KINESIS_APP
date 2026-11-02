import { Suspense } from "react";
import BookingPage from "./booking-page";

type BookingRouteProps = {
  params: Promise<{ voyageId: string }>;
  searchParams: Promise<{ passagers?: string }>;
};

async function BookingRoute({ params, searchParams }: BookingRouteProps) {
  const [{ voyageId }, { passagers }] = await Promise.all([params, searchParams]);
  return (
    <BookingPage
      voyageId={voyageId}
      passengerCount={Number(passagers) || 1}
    />
  );
}

export default function NewReservationPage(props: BookingRouteProps) {
  return (
    <Suspense
      fallback={
        <main className="booking-page">
          <div className="booking-content" role="status">
            Préparation de votre voyage…
          </div>
        </main>
      }
    >
      <BookingRoute {...props} />
    </Suspense>
  );
}
