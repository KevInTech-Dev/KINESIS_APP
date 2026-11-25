import Link from "next/link";
import { ArrowRight, Bus, CalendarDays, Clock3 } from "lucide-react";
import type { Voyage } from "@/lib/types";

type VoyageCardProps = {
  trip: Voyage;
} & (
  | {
      href: string;
      onSelect?: never;
      onBook?: never;
    }
  | {
      href?: never;
      onSelect?: (trip: Voyage) => void;
      onBook?: (trip: Voyage) => void;
    }
);

function formatPrice(price: string | number) {
  const amount = Number(price);
  return Number.isFinite(amount)
    ? `${new Intl.NumberFormat("fr-FR").format(amount)} FCFA`
    : `${price} FCFA`;
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00`));
}

export default function VoyageCard(props: VoyageCardProps) {
  const { trip } = props;
  const onSelect = "onSelect" in props ? props.onSelect : undefined;
  const onBook = "onBook" in props ? props.onBook : undefined;
  const handleSelect = onBook ?? onSelect;
  const placesLabel = `${trip.places_disponibles} place${trip.places_disponibles > 1 ? "s" : ""} disponible${trip.places_disponibles > 1 ? "s" : ""}`;
  const actionLabel = onSelect ? "Choisir ce voyage" : "Voir le voyage";

  const content = (
    <>
      <div className="voyage-card__header">
        <span className="voyage-card__company">
          <Bus aria-hidden="true" />
          <span>{trip.compagnie_nom || "Compagnie partenaire"}</span>
        </span>
        <span className="voyage-card__availability">{placesLabel}</span>
      </div>

      <div
        className="voyage-card__route"
        aria-label={`${trip.ville_depart_nom} vers ${trip.ville_arrivee_nom}`}
      >
        <div className="voyage-card__stop">
          <span
            className="voyage-card__stop-marker voyage-card__stop-marker--departure"
            aria-hidden="true"
          />
          <span className="voyage-card__stop-label">Départ</span>
          <strong>{trip.ville_depart_nom}</strong>
          {trip.gare_depart ? <small>{trip.gare_depart.nom}</small> : null}
        </div>
        <span className="voyage-card__route-connector" aria-hidden="true" />
        <div className="voyage-card__stop voyage-card__stop--arrival">
          <span
            className="voyage-card__stop-marker voyage-card__stop-marker--arrival"
            aria-hidden="true"
          />
          <span className="voyage-card__stop-label">Arrivée</span>
          <strong>{trip.ville_arrivee_nom}</strong>
          {trip.gare_arrivee ? <small>{trip.gare_arrivee.nom}</small> : null}
        </div>
      </div>

      <div className="voyage-card__schedule">
        <span>
          <CalendarDays aria-hidden="true" />
          <time dateTime={trip.date_depart}>{formatDate(trip.date_depart)}</time>
        </span>
        <span>
          <Clock3 aria-hidden="true" />
          <time dateTime={trip.heure_depart}>{trip.heure_depart.slice(0, 5)}</time>
        </span>
      </div>

      <div className="voyage-card__footer">
        <div className="voyage-card__price">
          <span>Prix par place</span>
          <strong>{formatPrice(trip.prix)}</strong>
        </div>
        <span className="voyage-card__action">
          {actionLabel}
          <ArrowRight aria-hidden="true" />
        </span>
      </div>
    </>
  );

  if ("href" in props && props.href) {
    return (
      <Link className="catalog-card voyage-card" href={props.href}>
        {content}
      </Link>
    );
  }

  return (
    <article className="catalog-card voyage-card home-trip-card">
      {handleSelect ? (
        <button
          className="home-trip-card__select"
          onClick={() => handleSelect(trip)}
          type="button"
          aria-label={`${onBook ? "Consulter" : "Préparer une recherche pour"} ${trip.ville_depart_nom} vers ${trip.ville_arrivee_nom}`}
        />
      ) : null}
      {content}
    </article>
  );
}
