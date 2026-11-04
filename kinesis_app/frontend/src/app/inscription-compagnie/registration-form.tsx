"use client";

import Image from "next/image";
import Link from "next/link";
import PasswordInput from "@/components/password-input";
import { useState, type FormEvent } from "react";

type Feedback = { kind: "success" | "error"; message: string };

function apiMessage(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const message = apiMessage(item);
      if (message) return message;
    }
  }
  if (typeof value === "object" && value !== null) {
    if ("detail" in value) {
      const detail = apiMessage(value.detail);
      if (detail) return detail;
    }
    for (const [field, fieldValue] of Object.entries(value)) {
      const message = apiMessage(fieldValue);
      if (message) return `${field} : ${message}`;
    }
  }
  return null;
}

export default function CompanyRegistration() {
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submitRegistration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setSubmitting(true);
    setFeedback(null);

    try {
      const response = await fetch("/api/compagnie/inscription", {
        method: "POST",
        body: new FormData(event.currentTarget),
      });
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setFeedback({
          kind: "error",
          message:
            apiMessage(result) ??
            "L’inscription a échoué. Vérifiez les informations et les documents joints.",
        });
        return;
      }

      form.reset();
      setFeedback({
        kind: "success",
        message:
          "Votre demande a bien été reçue. KINESIS vérifiera vos documents. Après validation, un lien d’activation sera envoyé à votre adresse e-mail.",
      });
    } catch (error) {
      console.error("Company registration failed", error);
      setFeedback({
        kind: "error",
        message: "Le serveur est inaccessible. Réessayez dans quelques instants.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="company-registration-page">
      <Link className="auth-brand" href="/" aria-label="Kinesis, accueil">
        <Image src="/kinesis-mark.png" width={48} height={48} alt="" priority />
        <span>KINESIS</span>
      </Link>
      <section className="company-registration-panel">
        <Link className="auth-back-link" href="/">
          ← Retour à l’accueil
        </Link>
        <div className="auth-heading">
          <p className="auth-eyebrow">KINESIS · PARTENAIRES TRANSPORT</p>
          <h1>Rejoignez le réseau KINESIS</h1>
          <p>
            Présentez votre compagnie et transmettez les pièces nécessaires à la
            vérification de votre dossier.
          </p>
        </div>
        <form className="company-form" onSubmit={submitRegistration}>
          <fieldset>
            <legend>Votre compagnie</legend>
            <div className="company-form-grid">
              <label>
                <span>Raison sociale</span>
                <input name="raison_sociale" required maxLength={150} />
              </label>
              <label>
                <span>Nom commercial</span>
                <input name="nom_commercial" required maxLength={150} />
              </label>
              <label>
                <span>Adresse e-mail</span>
                <input name="email" type="email" autoComplete="email" required />
              </label>
              <label>
                <span>Téléphone principal</span>
                <input name="telephone" type="tel" autoComplete="tel" required maxLength={30} />
              </label>
              <label>
                <span>Téléphone secondaire <small>(facultatif)</small></span>
                <input name="telephone_secondaire" type="tel" maxLength={30} />
              </label>
              <label>
                <span>Adresse <small>(facultatif)</small></span>
                <input name="adresse" maxLength={255} />
              </label>
              <label>
                <span>NIF</span>
                <input name="nif" inputMode="numeric" pattern="[0-9]{1,10}" required maxLength={10} />
              </label>
              <label>
                <span>RCCM</span>
                <input name="rccm" placeholder="TG-..." required maxLength={50} />
              </label>
            </div>
            <label>
              <span>Description <small>(facultatif)</small></span>
              <textarea name="description" rows={3} />
            </label>
          </fieldset>

          <fieldset>
            <legend>Documents à fournir</legend>
            <div className="company-form-grid">
              <label>
                <span>Carte CFE <small>(image obligatoire)</small></span>
                <input name="carte_cfe" type="file" accept="image/*" required />
              </label>
              <label>
                <span>Pièce d’identité du gérant <small>(image obligatoire)</small></span>
                <input name="piece_identite_gerant" type="file" accept="image/*" required />
              </label>
              <label>
                <span>Logo <small>(facultatif)</small></span>
                <input name="logo" type="file" accept="image/*" />
              </label>
            </div>
          </fieldset>

          <fieldset>
            <legend>Sécurité du compte</legend>
            <div className="company-form-grid">
              <label>
                <span>Mot de passe</span>
                <PasswordInput name="password" autoComplete="new-password" required minLength={8} />
              </label>
              <label>
                <span>Confirmer le mot de passe</span>
                <PasswordInput name="password_confirmation" autoComplete="new-password" required minLength={8} />
              </label>
            </div>
          </fieldset>

          {feedback ? (
            <p className={`auth-feedback auth-feedback--${feedback.kind}`} role="status">
              {feedback.message}
            </p>
          ) : null}
          <button className="auth-submit" type="submit" disabled={submitting}>
            {submitting ? "Envoi du dossier…" : "Soumettre ma demande"}
          </button>
        </form>
        <p className="auth-switch">
          Votre compagnie est déjà activée ? <Link href="/connexion">Se connecter</Link>
        </p>
      </section>
      <p className="auth-footer">Partenaires de confiance, trajets sereins.</p>
    </main>
  );
}
