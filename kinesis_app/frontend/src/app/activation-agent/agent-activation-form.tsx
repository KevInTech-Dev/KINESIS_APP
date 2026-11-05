"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
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
    if ("detail" in value) {
      const message = getErrorMessage(value.detail);
      if (message) return message;
    }
    for (const [field, fieldValue] of Object.entries(value)) {
      const message = getErrorMessage(fieldValue);
      if (message) {
        return field === "new_password"
          ? `Mot de passe : ${message}`
          : field === "password_confirmation"
            ? `Confirmation : ${message}`
            : message;
      }
    }
  }
  return null;
}

export default function AgentActivationForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [token] = useState(() => searchParams.get("token") ?? "");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(Boolean(token));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(
    token ? null : "Le lien d’invitation est incomplet.",
  );
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");

  useEffect(() => {
    if (!token) return;
    let active = true;
    void fetch(`/api/auth/agent-activation?${new URLSearchParams({ token })}`, {
      cache: "no-store",
    })
      .then(async (response) => {
        const result: unknown = await response.json().catch(() => null);
        if (!active) return;
        if (
          !response.ok ||
          typeof result !== "object" ||
          result === null ||
          !("email" in result) ||
          typeof result.email !== "string"
        ) {
          setError(
            getErrorMessage(result) ??
              "Ce lien d’invitation est invalide ou a expiré.",
          );
          return;
        }
        setEmail(result.email);
        window.history.replaceState(null, "", "/activation-agent");
      })
      .catch((requestError: unknown) => {
        console.error("Agent invitation lookup failed", requestError);
        if (active) {
          setError(
            "Le service est temporairement indisponible. Réessayez dans quelques instants.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [token]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/agent-activation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          new_password: password,
          password_confirmation: confirmation,
        }),
      });
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setError(
          getErrorMessage(result) ??
            "L’activation a échoué. Vérifiez le lien et réessayez.",
        );
        return;
      }
      setPassword("");
      setConfirmation("");
      router.replace("/espace-agent");
    } catch (requestError) {
      console.error("Agent account activation failed", requestError);
      setError(
        "Le serveur est inaccessible. Réessayez dans quelques instants.",
      );
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
      <section className="auth-panel" aria-labelledby="agent-activation-title">
        <Link className="auth-back-link" href="/connexion">
          ← Retour à la connexion
        </Link>
        <div className="auth-heading">
          <p className="auth-eyebrow">INVITATION KINESIS</p>
          <h1 id="agent-activation-title">Activez votre compte agent</h1>
          <p>Choisissez un mot de passe pour accéder à votre espace agent.</p>
        </div>
        {loading ? (
          <p className="auth-feedback" role="status">
            Vérification de votre invitation…
          </p>
        ) : email ? (
          <form className="auth-form" onSubmit={submit}>
            <label>
              <span>Adresse e-mail</span>
              <input value={email} readOnly aria-readonly="true" />
            </label>
            <label>
              <span>Mot de passe</span>
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
            {error ? (
              <p className="auth-feedback auth-feedback--error" role="alert">
                {error}
              </p>
            ) : null}
            <button className="auth-submit" type="submit" disabled={submitting}>
              {submitting ? "Activation…" : "Activer mon compte"}
            </button>
          </form>
        ) : (
          <div className="auth-reset-invalid">
            <p className="auth-feedback auth-feedback--error" role="alert">
              {error}
            </p>
            <Link href="/connexion">Retour à la connexion</Link>
          </div>
        )}
      </section>
      <p className="auth-footer">Le Togo en mouvement, avec vous.</p>
    </main>
  );
}
