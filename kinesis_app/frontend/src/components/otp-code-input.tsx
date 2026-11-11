"use client";

import { useRef, type ClipboardEvent, type KeyboardEvent } from "react";

type OtpCodeInputProps = {
  value: string;
  onChange: (value: string) => void;
};

export default function OtpCodeInput({ value, onChange }: OtpCodeInputProps) {
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  function applyDigits(start: number, digits: string) {
    const next = Array.from({ length: 6 }, (_, index) => value[index] ?? " ");
    for (let index = 0; index < digits.length && start + index < 6; index += 1) {
      next[start + index] = digits[index];
    }
    onChange(next.join(""));
    inputs.current[Math.min(start + digits.length, 5)]?.focus();
  }

  function handleChange(index: number, rawValue: string) {
    const digits = rawValue.replace(/\D/g, "");
    if (digits.length > 1) {
      applyDigits(index, digits);
      return;
    }
    const next = Array.from({ length: 6 }, (_, digitIndex) => value[digitIndex] ?? " ");
    next[index] = digits || " ";
    onChange(next.join(""));
    if (digits && index < 5) inputs.current[index + 1]?.focus();
  }

  function handleKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace") {
      event.preventDefault();
      const next = Array.from({ length: 6 }, (_, digitIndex) => value[digitIndex] ?? " ");
      const target = /\d/.test(value[index] ?? "") ? index : index - 1;
      if (target < 0) return;
      next[target] = " ";
      onChange(next.join(""));
      inputs.current[target]?.focus();
    } else if (event.key === "ArrowLeft" && index > 0) {
      event.preventDefault();
      inputs.current[index - 1]?.focus();
    } else if (event.key === "ArrowRight" && index < 5) {
      event.preventDefault();
      inputs.current[index + 1]?.focus();
    }
  }

  function handlePaste(index: number, event: ClipboardEvent<HTMLInputElement>) {
    const digits = event.clipboardData.getData("text").replace(/\D/g, "");
    if (!digits) return;
    event.preventDefault();
    applyDigits(index, digits);
  }

  return (
    <div className="otp-code-input" role="group" aria-label="Code à 6 chiffres">
      {Array.from({ length: 6 }, (_, index) => (
        <input
          key={index}
          ref={(element) => {
            inputs.current[index] = element;
          }}
          aria-label={`Chiffre ${index + 1} sur 6`}
          inputMode="numeric"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          pattern="[0-9]"
          maxLength={6}
          value={/\d/.test(value[index] ?? "") ? value[index] : ""}
          required
          onChange={(event) => handleChange(index, event.target.value)}
          onKeyDown={(event) => handleKeyDown(index, event)}
          onPaste={(event) => handlePaste(index, event)}
        />
      ))}
    </div>
  );
}
