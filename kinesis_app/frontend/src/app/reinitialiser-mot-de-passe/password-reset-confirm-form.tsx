"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import PasswordInput from "@/components/password-input";

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

export default function PasswordResetConfirmForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const uid = searchParams.get("uid") ?? "";
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [feedback, setFeedback] = useState<{
    kind: "error";
    message: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const linkIsPresent = Boolean(uid && token);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/auth/password-reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid,
          token,
          new_password: password,
          password_confirmation: confirmation,
        }),
      });
      const result: unknown = response.status === 204
        ? null
        : await response.json().catch(() => null);
      if (!response.ok) {
        setFeedback({
          kind: "error",
          message:
            getErrorMessage(result) ??
            "Le lien est invalide ou expiré. Demandez-en un nouveau.",
        });
        return;
      }
      setPassword("");
      setConfirmation("");
      router.replace("/connexion");
    } catch (error) {
      console.error("Password reset confirmation failed", error);
      setFeedback({
        kind: "error",
        message: "Le serveur est inaccessible. Réessayez dans quelques instants.",
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
        <Link className="auth-back-link" href="/connexion">
          ← Retour à la connexion
        </Link>
        <div className="auth-heading">
          <p className="auth-eyebrow">SÉCURITÉ DU COMPTE</p>
          <h1 id="password-reset-title">Nouveau mot de passe</h1>
          <p>
            Choisissez un mot de passe robuste et confirmez-le pour sécuriser
            votre compte.
          </p>
        </div>
        {linkIsPresent ? (
          <form className="auth-form" onSubmit={submit}>
            <label>
              <span>Nouveau mot de passe</span>
              <PasswordInput
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={8}
              />
            </label>
            <label>
              <span>Confirmer le mot de passe</span>
              <PasswordInput
                autoComplete="new-password"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                required
                minLength={8}
              />
            </label>
            {feedback ? (
              <p
                className={`auth-feedback auth-feedback--${feedback.kind}`}
                role="status"
              >
                {feedback.message}
              </p>
            ) : null}
            <button
              className="auth-submit"
              type="submit"
              disabled={submitting}
            >
              {submitting ? "Enregistrement…" : "Changer le mot de passe"}
            </button>
          </form>
        ) : (
          <div className="auth-reset-invalid">
            <p>Le lien est incomplet ou invalide.</p>
            <Link href="/mot-de-passe-oublie">Demander un nouveau lien</Link>
          </div>
        )}
      </section>
      <p className="auth-footer">Le Togo en mouvement, avec vous.</p>
    </main>
  );
}
