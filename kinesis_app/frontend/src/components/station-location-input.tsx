"use client";

import { useEffect, useRef, useState } from "react";
import { importLibrary, setOptions } from "@googlemaps/js-api-loader";

type PlaceLocation = {
  latitude: string;
  longitude: string;
  google_place_id: string;
  maps_url: string;
};

const EMPTY_LOCATION: PlaceLocation = {
  latitude: "",
  longitude: "",
  google_place_id: "",
  maps_url: "",
};

let placesLibraryPromise: Promise<google.maps.PlacesLibrary> | null = null;

export default function StationLocationInput() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [location, setLocation] = useState<PlaceLocation>(EMPTY_LOCATION);
  const [warning, setWarning] = useState("");

  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    const input = inputRef.current;
    if (!apiKey || !input) return;

    let active = true;
    let autocomplete: google.maps.places.Autocomplete | undefined;
    let placeListener: google.maps.MapsEventListener | undefined;
    void Promise.resolve()
      .then(() => {
        if (!placesLibraryPromise) {
          setOptions({ key: apiKey, v: "weekly", language: "fr" });
          placesLibraryPromise = importLibrary("places") as Promise<google.maps.PlacesLibrary>;
        }
        return placesLibraryPromise;
      })
      .then((places) => {
        if (!active) return;
        autocomplete = new places.Autocomplete(input, {
          fields: ["formatted_address", "geometry", "place_id", "url"],
        });
        placeListener = autocomplete.addListener("place_changed", () => {
          const place = autocomplete?.getPlace();
          const position = place?.geometry?.location;
          if (!place || !position) {
            setWarning("Sélectionnez une adresse proposée pour enregistrer sa localisation.");
            return;
          }
          if (place.formatted_address) input.value = place.formatted_address;
          setLocation({
            latitude: String(position.lat()),
            longitude: String(position.lng()),
            google_place_id: place.place_id ?? "",
            maps_url:
              place.url ??
              (place.place_id
                ? `https://www.google.com/maps/search/?api=1&query_place_id=${encodeURIComponent(place.place_id)}`
                : ""),
          });
          setWarning("");
        });
      })
      .catch((error: unknown) => {
        console.error("Google Places could not be loaded", error);
        if (active) {
          setWarning("Google Maps est indisponible. Vous pouvez saisir l’adresse manuellement.");
        }
      });

    return () => {
      active = false;
      placeListener?.remove();
      if (autocomplete) google.maps.event.clearInstanceListeners(autocomplete);
    };
  }, []);

  function clearLocation() {
    setLocation(EMPTY_LOCATION);
    setWarning("");
  }

  return (
    <>
      <label>
        <span>Adresse ou lieu de la gare</span>
        <input
          ref={inputRef}
          name="adresse"
          type="text"
          autoComplete="off"
          placeholder="Ex. Gare routière centrale, Cotonou"
          required
          onChange={clearLocation}
        />
        {warning ? <small role="status">{warning}</small> : null}
      </label>
      <input type="hidden" name="latitude" value={location.latitude} readOnly />
      <input type="hidden" name="longitude" value={location.longitude} readOnly />
      <input
        type="hidden"
        name="google_place_id"
        value={location.google_place_id}
        readOnly
      />
      <input type="hidden" name="maps_url" value={location.maps_url} readOnly />
    </>
  );
}
