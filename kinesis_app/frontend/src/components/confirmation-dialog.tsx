"use client";

import { useEffect, useRef, useState } from "react";

export type ConfirmationTone = "primary" | "danger";

export type ConfirmationDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  tone?: ConfirmationTone;
  pending?: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
};

export default function ConfirmationDialog({
  open,
  title,
  description,
  confirmLabel,
  tone = "primary",
  pending = false,
  onCancel,
  onConfirm,
}: ConfirmationDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const busy = pending || submitting;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  async function confirm() {
    setSubmitting(true);
    try {
      await onConfirm();
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      className="app-confirmation"
      aria-labelledby="app-confirmation-title"
      aria-describedby="app-confirmation-description"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current && !busy) onCancel();
      }}
    >
      <div className={`app-confirmation-icon app-confirmation-icon--${tone}`} aria-hidden="true">
        {tone === "danger" ? (
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M12 3.5 21 20H3l9-16.5Z" />
            <path d="M12 9v4.5M12 17h.01" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M12 3.5 20 7v5.1c0 4.1-2.7 7-8 9.4-5.3-2.4-8-5.3-8-9.4V7l8-3.5Z" />
            <path d="m8.5 12 2.2 2.2 4.8-4.8" />
          </svg>
        )}
      </div>
      <div className="app-confirmation-copy">
        <p className="app-confirmation-eyebrow">CONFIRMATION</p>
        <h2 id="app-confirmation-title">{title}</h2>
        <p id="app-confirmation-description">{description}</p>
      </div>
      <div className="app-confirmation-actions">
        <button
          type="button"
          className="app-confirmation-cancel"
          disabled={busy}
          onClick={onCancel}
        >
          Annuler
        </button>
        <button
          type="button"
          className={`app-confirmation-submit app-confirmation-submit--${tone}`}
          disabled={busy}
          onClick={() => void confirm()}
        >
          {busy ? "Traitement…" : confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
