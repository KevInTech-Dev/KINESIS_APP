import type { Voyage } from "@/lib/types";

export type CachedVoyage = Pick<
  Voyage,
  | "id_voyage"
  | "compagnie_nom"
  | "ville_depart_nom"
  | "ville_arrivee_nom"
  | "gare_depart"
  | "gare_arrivee"
  | "date_depart"
  | "heure_depart"
  | "places_disponibles"
  | "prix"
  | "image"
  | "statut"
>;

const routePhotos = [
  "https://images.unsplash.com/photo-1613463918637-3574cd5d34c0?auto=format&fit=crop&w=1000&q=85",
  "https://images.unsplash.com/photo-1645364512519-5efd4cfaa1c6?auto=format&fit=crop&w=1000&q=85",
  "https://images.unsplash.com/photo-1738427436305-453325092968?auto=format&fit=crop&w=1000&q=85",
];

const voyages = new Map<string, Voyage>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStation(value: unknown): boolean {
  return (
    value === null ||
    (isRecord(value) &&
      typeof value.id_gare === "string" &&
      typeof value.nom === "string" &&
      typeof value.ville_nom === "string" &&
      typeof value.adresse === "string" &&
      (typeof value.latitude === "string" || value.latitude === null) &&
      (typeof value.longitude === "string" || value.longitude === null) &&
      typeof value.google_place_id === "string" &&
      (typeof value.maps_url === "string" || value.maps_url === null))
  );
}

export function isCachedVoyage(value: unknown): value is Voyage {
  return (
    isRecord(value) &&
    typeof value.id_voyage === "string" &&
    typeof value.compagnie === "string" &&
    typeof value.compagnie_nom === "string" &&
    typeof value.ville_depart === "string" &&
    typeof value.ville_depart_nom === "string" &&
    typeof value.ville_arrivee === "string" &&
    typeof value.ville_arrivee_nom === "string" &&
    isStation(value.gare_depart) &&
    isStation(value.gare_arrivee) &&
    typeof value.date_depart === "string" &&
    typeof value.heure_depart === "string" &&
    typeof value.place_totale === "number" &&
    typeof value.places_disponibles === "number" &&
    (typeof value.date_depart_effective === "string" ||
      value.date_depart_effective === null) &&
    (typeof value.prix === "string" || typeof value.prix === "number") &&
    (typeof value.image === "string" || value.image === null) &&
    typeof value.statut === "string"
  );
}

export function cacheVoyages(items: readonly Voyage[]) {
  for (const item of items) voyages.set(item.id_voyage, item);
}

export function getCachedVoyage(id: string): Voyage | null {
  return voyages.get(id) ?? null;
}

export function getVoyageImage(image: string | null, voyageId: string): string {
  if (image) return image;
  const hash = Array.from(voyageId).reduce(
    (value, character) => (value * 31 + character.charCodeAt(0)) >>> 0,
    0,
  );
  return routePhotos[hash % routePhotos.length];
}
