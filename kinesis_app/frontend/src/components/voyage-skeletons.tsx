import { Skeleton } from "@/components/ui/skeleton";

export function HomeTripSkeletons() {
  return (
    <div
      className="trip-grid"
      role="status"
      aria-label="Chargement des prochains départs"
    >
      {Array.from({ length: 3 }, (_, index) => (
        <article className="trip-card trip-card--skeleton" key={index}>
          <Skeleton className="trip-skeleton__background" />
          <div className="trip-skeleton__content" aria-hidden="true">
            <Skeleton className="trip-skeleton__badge" />
            <Skeleton className="trip-skeleton__route" />
            <Skeleton className="trip-skeleton__company" />
            <div className="trip-skeleton__details">
              <Skeleton />
              <Skeleton />
            </div>
          </div>
        </article>
      ))}
      <span className="sr-only">Chargement des prochains départs…</span>
    </div>
  );
}

export function CatalogTripSkeletons({ count }: { count: number }) {
  return (
    <div
      className="catalog-grid"
      role="status"
      aria-label="Chargement des voyages"
    >
      {Array.from({ length: count }, (_, index) => (
        <article className="catalog-card catalog-card--skeleton" key={index}>
          <Skeleton className="catalog-skeleton__image" />
          <div className="catalog-skeleton__body" aria-hidden="true">
            <Skeleton className="catalog-skeleton__company" />
            <Skeleton className="catalog-skeleton__route" />
            <Skeleton className="catalog-skeleton__date" />
            <Skeleton className="catalog-skeleton__footer" />
          </div>
        </article>
      ))}
      <span className="sr-only">Chargement des voyages…</span>
    </div>
  );
}
