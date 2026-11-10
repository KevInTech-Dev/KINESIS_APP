export type ReservationDraft = {
  passengers: string[];
  hasBaggage: boolean | null;
};

export function reservationDraftKey(voyageId: string) {
  return `kinesis:reservation-draft:${voyageId}`;
}

export function isReservationDraft(value: unknown): value is ReservationDraft {
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
    (typeof value.hasBaggage === "boolean" || value.hasBaggage === null)
  );
}
