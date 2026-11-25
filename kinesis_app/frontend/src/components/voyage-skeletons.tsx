import { Skeleton } from "@/components/ui/skeleton";

function VoyageCardSkeleton() {
  return (
    <article
      className="catalog-card voyage-card voyage-card--skeleton"
      aria-hidden="true"
    >
      <div className="voyage-card__header">
        <Skeleton className="voyage-card-skeleton__company" />
        <Skeleton className="voyage-card-skeleton__availability" />
      </div>
      <div className="voyage-card__route">
        <div className="voyage-card__stop">
          <Skeleton className="voyage-card-skeleton__marker" />
          <Skeleton className="voyage-card-skeleton__label" />
          <Skeleton className="voyage-card-skeleton__city" />
          <Skeleton className="voyage-card-skeleton__station" />
        </div>
        <span className="voyage-card__route-connector" />
        <div className="voyage-card__stop">
          <Skeleton className="voyage-card-skeleton__marker" />
          <Skeleton className="voyage-card-skeleton__label" />
          <Skeleton className="voyage-card-skeleton__city" />
          <Skeleton className="voyage-card-skeleton__station" />
        </div>
      </div>
      <div className="voyage-card__schedule">
        <Skeleton className="voyage-card-skeleton__date" />
        <Skeleton className="voyage-card-skeleton__time" />
      </div>
      <div className="voyage-card__footer">
        <div className="voyage-card__price">
          <Skeleton className="voyage-card-skeleton__price-label" />
          <Skeleton className="voyage-card-skeleton__price" />
        </div>
        <Skeleton className="voyage-card-skeleton__action" />
      </div>
    </article>
  );
}

export function HomeTripSkeletons() {
  return (
    <div
      className="trip-grid"
      role="status"
      aria-label="Chargement des prochains départs"
    >
      {Array.from({ length: 3 }, (_, index) => (
        <VoyageCardSkeleton key={index} />
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
        <VoyageCardSkeleton key={index} />
      ))}
      <span className="sr-only">Chargement des voyages…</span>
    </div>
  );
}
