"use client";

import Image from "next/image";

type TogoPhoneInputProps = {
  name?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  autoComplete?: string;
  className?: string;
  ariaLabel?: string;
};

export default function TogoPhoneInput({
  name,
  value,
  onChange,
  required,
  autoComplete = "tel",
  className,
  ariaLabel = "Numéro de téléphone togolais",
}: TogoPhoneInputProps) {
  return (
    <div className={`auth-phone-input ${className ?? ""}`.trim()}>
      <Image
        className="auth-phone-input__flag"
        src="/togo-flag.svg"
        width={30}
        height={20}
        alt="Drapeau du Togo"
      />
      <span className="auth-phone-input__code" aria-hidden="true">
        +228
      </span>
      <input
        name={name}
        type="tel"
        autoComplete={autoComplete}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="90 00 00 00"
        maxLength={11}
        inputMode="numeric"
        pattern="[0-9]{2} [0-9]{2} [0-9]{2} [0-9]{2}"
        aria-label={ariaLabel}
        required={required}
      />
    </div>
  );
}
