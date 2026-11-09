"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { MailCheck } from "lucide-react";
import {
  getUserFacingApiError,
  getUserFacingErrorMessage,
} from "@/lib/user-facing-errors";

function getErrorMessage(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const message = getErrorMessage(item);
      if (message) return message;
    }
  }
  if (typeof value === "object" && value !== null) {
    if ("detail" in value) return getErrorMessage(value.detail);
    for (const message of Object.values(value)) {
      const result = getErrorMessage(message);
      if (result) return result;
    }
  }
  return null;
}

export default function PasswordResetRequestForm() {
  const [email, setEmail] = useState("");
  const [feedback, setFeedback] = useState<{
    kind: "error";
    message: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [requestSent, setRequestSent] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/auth/password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setFeedback({
          kind: "error",
          message: getUserFacingErrorMessage(
            getErrorMessage(result) ??
              getUserFacingApiError(
                result,
                "La demande n’a pas abouti. Réessayez dans quelques instants.",
                response.status,
              ),
            "La demande n’a pas abouti. Réessayez dans quelques instants.",
          ),
        });
        return;
      }
      setRequestSent(true);
    } catch (error) {
      console.error("Password reset request failed", error);
      setFeedback({
        kind: "error",
        message: getUserFacingErrorMessage(
          error,
          "Impossible de joindre le service. Réessayez dans quelques instants.",
        ),
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <Link className="auth-brand" href="/" aria-label="Kinesis, accueil">
        <Image src="/kinesis-mark.png" width={48} height={48} alt="" priority />
        <span>KINESIS</span>
      </Link>
      <section className="auth-panel" aria-labelledby="password-reset-title">
        {requestSent ? (
          <div className="password-reset-success" role="status" aria-live="polite">
            <div className="password-reset-success__icon" aria-hidden="true">
              <MailCheck />
            </div>
            <div className="auth-heading">
              <p className="auth-eyebrow">DEMANDE PRISE EN COMPTE</p>
              <h1 id="password-reset-title">Vérifiez votre boîte mail</h1>
              <p>
                Si un compte actif est associé à cette adresse, un lien de
                réinitialisation lui a été envoyé :
              </p>
              <p className="password-reset-success__email">{email.trim()}</p>
              <p>
                Le lien est valable une heure. Pensez à vérifier vos courriers
                indésirables. Vous pouvez fermer cette page.
              </p>
            </div>
            <Link className="auth-submit" href="/connexion">
              Retour à la connexion
            </Link>
          </div>
        ) : (
          <>
            <Link className="auth-back-link" href="/connexion">
              ← Retour à la connexion
            </Link>
            <div className="auth-heading">
              <p className="auth-eyebrow">SÉCURITÉ DU COMPTE</p>
              <h1 id="password-reset-title">Mot de passe oublié ?</h1>
              <p>
                Saisissez l’adresse e-mail de votre compte. Si elle est reconnue,
                vous recevrez un lien valable une heure.
              </p>
            </div>
            <form className="auth-form" onSubmit={submit}>
              <label>
                <span>Adresse e-mail</span>
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  maxLength={254}
                />
              </label>
              {feedback ? (
                <p
                  className={`auth-feedback auth-feedback--${feedback.kind}`}
                  role="alert"
                >
                  {feedback.message}
                </p>
              ) : null}
              <button
                className="auth-submit"
                type="submit"
                disabled={submitting}
              >
                {submitting ? "Envoi en cours…" : "Recevoir le lien"}
              </button>
            </form>
          </>
        )}
      </section>
      <p className="auth-footer">Le Togo en mouvement, avec vous.</p>
    </main>
  );
}
