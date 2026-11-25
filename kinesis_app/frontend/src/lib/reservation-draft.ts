export type ReservationDraft = {
  passengers: string[];
  hasBaggage: boolean | null;
  selectedSeats?: string[];
};

export function reservationDraftKey(voyageId: string) {
  return `kinesis:reservation-draft:${voyageId}`;
}

export function isReservationDraft(value: unknown): value is ReservationDraft {
  const selectedSeats =
    typeof value === "object" && value !== null && "selectedSeats" in value
      ? value.selectedSeats
      : undefined;
  return (
    typeof value === "object" &&
    value !== null &&
    "passengers" in value &&
    Array.isArray(value.passengers) &&
    value.passengers.length > 0 &&
    value.passengers.every(
      (passenger) => typeof passenger === "string" && passenger.trim().length > 0,
    ) &&
    "hasBaggage" in value &&
    (typeof value.hasBaggage === "boolean" || value.hasBaggage === null) &&
    (selectedSeats === undefined ||
      (Array.isArray(selectedSeats) &&
        selectedSeats.every((seat: unknown) => typeof seat === "string") &&
        new Set(selectedSeats).size === selectedSeats.length))
  );
}
