export type Ville = {
  id_ville: string;
  nom: string;
};

export type Voyage = {
  id_voyage: string;
  compagnie: string;
  compagnie_nom: string;
  ville_depart: string;
  ville_depart_nom: string;
  ville_arrivee: string;
  ville_arrivee_nom: string;
  date_depart: string;
  heure_depart: string;
  date_depart_effective: string | null;
  place_totale: number;
  places_disponibles: number;
  prix: string | number;
  image: string | null;
  statut: string;
};
