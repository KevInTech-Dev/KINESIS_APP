"use client";

import Image from "next/image";
import Link from "next/link";
import PasswordInput from "@/components/password-input";
import TogoPhoneInput from "@/components/togo-phone-input";
import OtpCodeInput from "@/components/otp-code-input";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  getUserFacingApiError,
  getUserFacingErrorMessage,
} from "@/lib/user-facing-errors";
import { formatTogoPhoneInput } from "@/lib/togo-phone";

type Feedback = { kind: "error"; message: string };

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

function responseDetail(value: unknown): string | null {
  if (
    typeof value === "object" &&
    value !== null &&
    "detail" in value &&
    typeof value.detail === "string"
  ) {
    return value.detail;
  }
  return null;
}

export default function CompanyRegistration() {
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [telephone, setTelephone] = useState("");
  const [telephoneSecondaire, setTelephoneSecondaire] = useState("");
  const [rccm, setRccm] = useState("TG-");
  const [verificationEmail, setVerificationEmail] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [verificationPending, setVerificationPending] = useState(false);
  const [verificationSubmitted, setVerificationSubmitted] = useState(false);
  const [resending, setResending] = useState(false);

  async function submitRegistration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const rccm = String(formData.get("rccm") ?? "").replace(/^TG-/i, "");
    formData.set("rccm", `TG-${rccm}`);
    setSubmitting(true);
    setFeedback(null);

    try {
      const response = await fetch("/api/compagnie/inscription", {
        method: "POST",
        body: formData,
      });
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setFeedback({
          kind: "error",
          message:
            response.status === 502
              ? "Le délai de réponse est dépassé. Votre dossier a peut-être été reçu. Réessayez avec les mêmes informations : si la demande est déjà enregistrée, le système le confirmera sans créer de doublon."
              : getUserFacingErrorMessage(
                  apiMessage(result) ??
                    getUserFacingApiError(
                      result,
                      "L’inscription a échoué. Vérifiez les informations et les documents joints.",
                      response.status,
                    ),
                  "L’inscription a échoué. Vérifiez les informations et les documents joints.",
                ),
        });
        return;
      }

      form.reset();
      setTelephone("");
      setTelephoneSecondaire("");
      if (response.status === 202) {
        setRccm("TG-");
        setVerificationEmail(String(formData.get("email") ?? ""));
        setVerificationCode("");
        setVerificationPending(true);
        toast.success(
          responseDetail(result) ??
            "Un code de vérification a été envoyé à votre adresse e-mail.",
        );
      } else {
        toast.success(
          responseDetail(result) ??
            "Votre demande est déjà enregistrée. Aucun doublon n’a été créé.",
          { duration: 10_000 },
        );
      }
    } catch (error) {
      console.error("Company registration failed", error);
      setFeedback({
        kind: "error",
        message: getUserFacingErrorMessage(
          error,
          "Le délai de réponse est dépassé. Votre dossier a peut-être été reçu. Vous pouvez réessayer avec les mêmes informations : si la demande est déjà enregistrée, le système le confirmera sans créer de doublon.",
        ),
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function submitEmailVerification(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/auth/verification-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: verificationEmail,
          code: verificationCode.replace(/\D/g, ""),
        }),
      });
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setFeedback({
          kind: "error",
          message: getUserFacingErrorMessage(
            apiMessage(result) ?? "La vérification du code a échoué.",
            "La vérification du code a échoué.",
          ),
        });
        return;
      }
      setVerificationPending(false);
      setVerificationSubmitted(true);
      setVerificationCode("");
      toast.success(
        responseDetail(result) ??
          "Votre adresse e-mail est vérifiée et votre demande est transmise à KINESIS.",
        { duration: 10_000 },
      );
    } catch (error) {
      console.error("Company email verification failed", error);
      setFeedback({
        kind: "error",
        message: getUserFacingErrorMessage(
          error,
          "La vérification a échoué. Vérifiez votre connexion et réessayez.",
        ),
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function resendVerificationCode() {
    setResending(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/auth/renvoi-code-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: verificationEmail }),
      });
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setFeedback({
          kind: "error",
          message: getUserFacingErrorMessage(
            apiMessage(result) ?? "Le renvoi du code a échoué.",
            "Le renvoi du code a échoué. Réessayez.",
          ),
        });
        return;
      }
      toast.success(
        responseDetail(result) ??
          "Si votre demande est en attente, un nouveau code a été envoyé.",
      );
    } catch (error) {
      console.error("Company verification code resend failed", error);
      setFeedback({
        kind: "error",
        message: getUserFacingErrorMessage(
          error,
          "Le renvoi du code a échoué. Réessayez.",
        ),
      });
    } finally {
      setResending(false);
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
          <h1>
            {verificationPending
              ? "Vérifiez votre adresse e-mail"
              : verificationSubmitted
                ? "Demande transmise à KINESIS"
                : "Rejoignez le réseau KINESIS"}
          </h1>
          <p>
            {verificationPending
              ? `Saisissez le code à 6 chiffres envoyé à ${verificationEmail}. Il est valable 10 minutes.`
              : verificationSubmitted
                ? "Votre adresse est confirmée. L’équipe KINESIS peut maintenant examiner votre dossier."
                : "Présentez votre compagnie et transmettez les pièces nécessaires à la vérification de votre dossier."}
          </p>
        </div>
        {verificationPending ? (
          <form className="auth-form" onSubmit={submitEmailVerification}>
            <label>
              <span>Adresse e-mail</span>
              <input type="email" value={verificationEmail} disabled tabIndex={-1} />
            </label>
            <label>
              <span>Code de vérification</span>
              <OtpCodeInput
                value={verificationCode}
                onChange={setVerificationCode}
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
            <button className="auth-submit" type="submit" disabled={submitting}>
              {submitting
                ? "Vérification en cours…"
                : "Vérifier mon adresse et soumettre ma demande"}
            </button>
            <button
              className="auth-resend-code"
              type="button"
              onClick={() => void resendVerificationCode()}
              disabled={resending || submitting}
            >
              {resending ? "Envoi en cours…" : "Renvoyer le code"}
            </button>
          </form>
        ) : verificationSubmitted ? (
          <div className="company-registration-success" role="status">
            <p>
              Votre demande est maintenant en attente d’examen. Après validation,
              vous recevrez un e-mail avec le lien d’activation de votre compte.
            </p>
            <Link className="auth-submit" href="/">
              Retour à l’accueil
            </Link>
          </div>
        ) : (
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
                <TogoPhoneInput
                  name="telephone"
                  required
                  value={telephone}
                  onChange={(value) =>
                    setTelephone(formatTogoPhoneInput(value))
                  }
                />
              </label>
              <label>
                <span>Téléphone secondaire <small>(facultatif)</small></span>
                <TogoPhoneInput
                  name="telephone_secondaire"
                  value={telephoneSecondaire}
                  onChange={(value) =>
                    setTelephoneSecondaire(formatTogoPhoneInput(value))
                  }
                />
              </label>
              <label>
                <span>Adresse <small>(facultatif)</small></span>
                <input name="adresse" maxLength={255} />
              </label>
              <label>
                <span>NIF</span>
                <input
                  name="nif"
                  inputMode="numeric"
                  pattern="[0-9]{1,10}"
                  required
                  maxLength={10}
                  onChange={(event) => {
                    event.currentTarget.value = event.currentTarget.value
                      .replace(/\D/g, "")
                      .slice(0, 10);
                  }}
                />
              </label>
              <label>
                <span>RCCM</span>
                <div className="company-rccm-input">
                  <input
                    name="rccm"
                    value={rccm}
                    required
                    maxLength={50}
                    onChange={(event) => {
                      const entered = event.currentTarget.value.toUpperCase();
                      setRccm(
                        entered.startsWith("TG-")
                          ? entered
                          : `TG-${entered.replace(/^TG-/i, "")}`,
                      );
                    }}
                    onKeyDown={(event) => {
                      const input = event.currentTarget;
                      const start = input.selectionStart;
                      const end = input.selectionEnd;
                      if (
                        (event.key === "Backspace" || event.key === "Delete") &&
                        start !== null &&
                        end !== null &&
                        ((start === end &&
                          ((event.key === "Backspace" && start <= 3) ||
                            (event.key === "Delete" && start < 3))) ||
                          (start < 3 && end > start))
                      ) {
                        event.preventDefault();
                      }
                    }}
                  />
                </div>
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
        )}
        <p className="auth-switch">
          Votre compagnie est déjà activée ? <Link href="/connexion">Se connecter</Link>
        </p>
      </section>
      <p className="auth-footer">Partenaires de confiance, trajets sereins.</p>
    </main>
  );
}
