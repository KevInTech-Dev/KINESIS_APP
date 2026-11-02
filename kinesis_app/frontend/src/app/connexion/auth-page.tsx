"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, type FormEvent } from "react";

type AuthMode = "login" | "register";
type Feedback = { kind: "success" | "error"; message: string };

function getApiMessage(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const message = getApiMessage(item);
      if (message) {
        return message;
      }
    }
  }

  if (typeof value === "object" && value !== null) {
    if ("detail" in value) {
      const detail = getApiMessage(value.detail);
      if (detail) {
        return detail;
      }
    }

    for (const [field, fieldValue] of Object.entries(value)) {
      const message = getApiMessage(fieldValue);
      if (message) {
        const label =
          field === "email"
            ? "E-mail"
            : field === "password"
              ? "Mot de passe"
              : field === "password_confirmation"
                ? "Confirmation du mot de passe"
                : field === "nom"
                  ? "Nom"
                  : field;
        return `${label} : ${message}`;
      }
    }
  }

  return null;
}

export default function AuthPage() {
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [nom, setNom] = useState("");
  const [prenoms, setPrenoms] = useState("");
  const [telephone, setTelephone] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [sessionActive, setSessionActive] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setFeedback(null);

    const isRegister = mode === "register";
    const endpoint = isRegister
      ? "/api/auth/inscription"
      : "/api/auth/connexion";
    const payload = isRegister
      ? {
          email: email.trim(),
          nom: nom.trim(),
          prenoms: prenoms.trim(),
          telephone: telephone.trim(),
          password,
          password_confirmation: passwordConfirmation,
        }
      : { email: email.trim(), password };

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        setFeedback({
          kind: "error",
          message:
            (mode === "login" && response.status === 401
              ? "Adresse e-mail ou mot de passe incorrect."
              : getApiMessage(result)) ??
            "La demande a échoué. Vérifiez vos informations et réessayez.",
        });
        return;
      }

      if (isRegister) {
        setPassword("");
        setPasswordConfirmation("");
        setMode("login");
        setFeedback({
          kind: "success",
          message:
            getApiMessage(result) ??
            "Votre compte est créé. Vous pouvez maintenant vous connecter.",
        });
      } else {
        setPassword("");
        setSessionActive(true);
        setFeedback({
          kind: "success",
          message: "Vous êtes connecté. Votre session est sécurisée.",
        });
      }
    } catch (error) {
      console.error("Authentication request failed", error);
      setFeedback({
        kind: "error",
        message: "Le serveur est inaccessible. Réessayez dans quelques instants.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function logout() {
    setSubmitting(true);
    setFeedback(null);

    try {
      const response = await fetch("/api/auth/deconnexion", {
        method: "POST",
      });
      const result: unknown = await response.json().catch(() => null);
      setSessionActive(false);
      setPassword("");

      if (!response.ok) {
        setFeedback({
          kind: "error",
          message:
            getApiMessage(result) ??
            "La session locale a été fermée, mais le serveur n’a pas confirmé la déconnexion.",
        });
        return;
      }

      setFeedback({ kind: "success", message: "Vous êtes déconnecté." });
    } catch (error) {
      console.error("Logout request failed", error);
      setSessionActive(false);
      setFeedback({
        kind: "error",
        message:
          "La session locale a été fermée, mais la révocation côté serveur n’a pas pu être confirmée.",
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

      <section className="auth-panel" aria-labelledby="auth-title">
        <Link className="auth-back-link" href="/">
          ← Retour à l’accueil
        </Link>

        {sessionActive ? (
          <div className="auth-success-panel">
            <span className="auth-success-icon" aria-hidden="true">
              ✓
            </span>
            <h1 id="auth-title">Connexion réussie</h1>
            <p>
              Votre session est ouverte. Les espaces de réservation arrivent
              dans la prochaine étape.
            </p>
            {feedback ? (
              <p
                className={`auth-feedback auth-feedback--${feedback.kind}`}
                role="status"
              >
                {feedback.message}
              </p>
            ) : null}
            <Link className="auth-submit auth-home-link" href="/">
              Retourner à l’accueil
            </Link>
            <button
              className="auth-logout"
              type="button"
              onClick={logout}
              disabled={submitting}
            >
              {submitting ? "Déconnexion…" : "Se déconnecter"}
            </button>
          </div>
        ) : (
          <>
            <div className="auth-heading">
              <p className="auth-eyebrow">KINESIS · VOYAGEZ AU TOGO</p>
              <h1 id="auth-title">
                {mode === "login" ? "Bon retour parmi nous" : "Créer un compte"}
              </h1>
              <p>
                {mode === "login"
                  ? "Connectez-vous pour retrouver vos voyages et réservations."
                  : "Créez votre compte voyageur pour préparer vos déplacements."}
              </p>
            </div>

            <div className="auth-tabs" role="tablist" aria-label="Compte">
              <button
                type="button"
                role="tab"
                aria-selected={mode === "login"}
                className={mode === "login" ? "is-active" : ""}
                onClick={() => {
                  setMode("login");
                  setFeedback(null);
                }}
              >
                Connexion
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === "register"}
                className={mode === "register" ? "is-active" : ""}
                onClick={() => {
                  setMode("register");
                  setFeedback(null);
                }}
              >
                Inscription
              </button>
            </div>

            <form className="auth-form" onSubmit={submitAuth}>
              {mode === "register" ? (
                <>
                  <label>
                    <span>Nom</span>
                    <input
                      autoComplete="family-name"
                      value={nom}
                      onChange={(event) => setNom(event.target.value)}
                      required
                      maxLength={100}
                    />
                  </label>
                  <label>
                    <span>Prénoms</span>
                    <input
                      autoComplete="given-name"
                      value={prenoms}
                      onChange={(event) => setPrenoms(event.target.value)}
                      maxLength={150}
                    />
                  </label>
                  <label>
                    <span>Téléphone <small>(facultatif)</small></span>
                    <input
                      type="tel"
                      autoComplete="tel"
                      value={telephone}
                      onChange={(event) => setTelephone(event.target.value)}
                      maxLength={30}
                    />
                  </label>
                </>
              ) : null}

              <label>
                <span>Adresse e-mail</span>
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </label>
              <label>
                <span>Mot de passe</span>
                <input
                  type="password"
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  minLength={mode === "register" ? 8 : undefined}
                />
              </label>
              {mode === "register" ? (
                <label>
                  <span>Confirmer le mot de passe</span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={passwordConfirmation}
                    onChange={(event) =>
                      setPasswordConfirmation(event.target.value)
                    }
                    required
                    minLength={8}
                  />
                </label>
              ) : null}

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
                {submitting
                  ? "Veuillez patienter…"
                  : mode === "login"
                    ? "Se connecter"
                    : "Créer mon compte"}
              </button>
            </form>

            <p className="auth-switch">
              {mode === "login" ? "Pas encore de compte ?" : "Déjà inscrit ?"}{" "}
              <button
                type="button"
                onClick={() => {
                  setMode(mode === "login" ? "register" : "login");
                  setFeedback(null);
                }}
              >
                {mode === "login" ? "Créer un compte" : "Se connecter"}
              </button>
            </p>
          </>
        )}
      </section>
      <p className="auth-footer">Le Togo en mouvement, avec vous.</p>
    </main>
  );
}
