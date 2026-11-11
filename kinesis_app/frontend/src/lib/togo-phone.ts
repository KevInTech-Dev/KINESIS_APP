export function formatTogoPhoneInput(value: string) {
  let digits = value.replace(/\D/g, "");
  if (digits.length > 8 && digits.startsWith("228")) {
    digits = digits.slice(3);
  }
  digits = digits.slice(0, 8);
  return digits.match(/.{1,2}/g)?.join(" ") ?? "";
}
