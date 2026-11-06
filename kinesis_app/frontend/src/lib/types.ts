export type Ville = {
  id_ville: string;
  nom: string;
};

export type GareVoyage = {
  id_gare: string;
  nom: string;
  ville_nom: string;
  adresse: string;
  latitude: string | null;
  longitude: string | null;
  google_place_id: string;
  maps_url: string | null;
};

export type Voyage = {
  id_voyage: string;
  compagnie: string;
  compagnie_nom: string;
  ville_depart: string;
  ville_depart_nom: string;
  ville_arrivee: string;
  ville_arrivee_nom: string;
  gare_depart: GareVoyage | null;
  gare_arrivee: GareVoyage | null;
  date_depart: string;
  heure_depart: string;
  date_depart_effective: string | null;
  place_totale: number;
  places_disponibles: number;
  prix: string | number;
  image: string | null;
  statut: string;
};
