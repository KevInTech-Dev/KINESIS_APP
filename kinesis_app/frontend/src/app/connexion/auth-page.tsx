"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useState,
  useSyncExternalStore,
  type FormEvent,
} from "react";
import { ArrowRight, Building2 } from "lucide-react";
import PasswordInput from "@/components/password-input";
import TogoPhoneInput from "@/components/togo-phone-input";
import OtpCodeInput from "@/components/otp-code-input";
import { isUserProfile } from "@/lib/user-profile";
import {
  getUserFacingApiError,
  getUserFacingErrorMessage,
} from "@/lib/user-facing-errors";
import { formatTogoPhoneInput } from "@/lib/togo-phone";
import { toast } from "sonner";

type AuthMode = "login" | "register";
type Feedback = { kind: "error"; message: string };
const PENDING_EMAIL_VERIFICATION_KEY = "kinesis:pending-email-verification";
const PENDING_EMAIL_VERIFICATION_EVENT = "kinesis:pending-email-verification-change";

function subscribeToPendingVerification(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(PENDING_EMAIL_VERIFICATION_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(PENDING_EMAIL_VERIFICATION_EVENT, callback);
  };
}

function getPendingVerificationEmail() {
  try {
    return sessionStorage.getItem(PENDING_EMAIL_VERIFICATION_KEY) ?? "";
  } catch (error) {
    console.error("Could not read pending email verification", error);
    return "";
  }
}

function savePendingVerificationEmail(email: string | null) {
  try {
    if (email) {
      sessionStorage.setItem(PENDING_EMAIL_VERIFICATION_KEY, email);
    } else {
      sessionStorage.removeItem(PENDING_EMAIL_VERIFICATION_KEY);
    }
    window.dispatchEvent(new Event(PENDING_EMAIL_VERIFICATION_EVENT));
  } catch (error) {
    console.error("Could not update pending email verification", error);
  }
}

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
                  : field === "prenoms"
                    ? "Prénoms"
                    : field === "telephone"
                      ? "Téléphone"
                      : field === "code"
                        ? "Code de vérification"
                        : field;
        return `${label} : ${message}`;
      }
    }
  }

  return null;
}

export default function AuthPage() {
  const router = useRouter();
  const pendingVerificationEmail = useSyncExternalStore(
    subscribeToPendingVerification,
    getPendingVerificationEmail,
    () => "",
  );
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [nom, setNom] = useState("");
  const [prenoms, setPrenoms] = useState("");
  const [telephone, setTelephone] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const verificationPending = Boolean(pendingVerificationEmail);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setFeedback(null);

    const isRegister = mode === "register";
    const endpoint = verificationPending
      ? "/api/auth/verification-email"
      : isRegister
        ? "/api/auth/inscription"
        : "/api/auth/connexion";
    const payload = verificationPending
      ? {
          email: pendingVerificationEmail,
          code: verificationCode.replace(/\D/g, ""),
        }
      : isRegister
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
        const fallback =
          "La demande a échoué. Vérifiez vos informations et réessayez.";
        const extractedMessage = getApiMessage(result);
        setFeedback({
          kind: "error",
          message:
            mode === "login" && response.status === 401
              ? "Adresse e-mail ou mot de passe incorrect."
              : extractedMessage
                ? getUserFacingErrorMessage(extractedMessage, fallback)
                : getUserFacingApiError(result, fallback, response.status),
        });
        return;
      }

      if (verificationPending) {
        savePendingVerificationEmail(null);
        setPassword("");
        setVerificationCode("");
        toast.success("Votre adresse e-mail est vérifiée.");
        const requestedPath = new URLSearchParams(window.location.search).get(
          "next",
        );
        router.push(
          requestedPath?.startsWith("/") && !requestedPath.startsWith("//")
            ? requestedPath
            : "/espace-voyageur",
        );
        return;
      }

      if (isRegister) {
        savePendingVerificationEmail(email.trim());
        setPassword("");
        setPasswordConfirmation("");
        setFeedback(null);
        toast.success(
          getApiMessage(result) ??
            "Un code de vérification a été envoyé à votre adresse e-mail.",
        );
      } else {
        setPassword("");
        const requestedPath = new URLSearchParams(window.location.search).get(
          "next",
        );
        let destination =
          requestedPath?.startsWith("/") && !requestedPath.startsWith("//")
            ? requestedPath
            : "/espace-voyageur";
        if (!requestedPath) {
          const sessionResponse = await fetch("/api/auth/session", {
            cache: "no-store",
          });
          const sessionProfile: unknown = await sessionResponse
            .json()
            .catch(() => null);
          if (!sessionResponse.ok) {
            setFeedback({
              kind: "error",
              message:
                getApiMessage(sessionProfile) ??
                "La connexion a réussi, mais le profil n’a pas pu être chargé.",
            });
            return;
          }
          if (isUserProfile(sessionProfile) && sessionProfile.role === "COMPAGNIE") {
            destination = "/espace-compagnie";
          } else if (
            isUserProfile(sessionProfile) &&
            sessionProfile.role === "AGENT_COMPAGNIE"
          ) {
            destination = "/espace-agent";
          } else if (
            isUserProfile(sessionProfile) &&
            sessionProfile.role === "ADMINISTRATEUR"
          ) {
            destination = "/espace-administration";
          }
        }
        router.push(destination);
      }
    } catch (error) {
      console.error("Authentication request failed", error);
      setFeedback({
        kind: "error",
        message: getUserFacingErrorMessage(
          error,
          "La connexion au service a échoué. Réessayez dans quelques instants.",
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
        body: JSON.stringify({
          email: verificationPending
            ? pendingVerificationEmail
            : email.trim(),
        }),
      });
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message = getApiMessage(result);
        setFeedback({
          kind: "error",
          message: message
            ? getUserFacingErrorMessage(
                message,
                "Le renvoi du code a échoué. Réessayez.",
              )
            : getUserFacingApiError(
                result,
                "Le renvoi du code a échoué. Réessayez.",
                response.status,
              ),
        });
        return;
      }
      toast.success(
        getApiMessage(result) ??
          "Si votre compte est en attente, un nouveau code a été envoyé.",
      );
    } catch (error) {
      console.error("Email verification resend failed", error);
      setFeedback({
        kind: "error",
        message: getUserFacingErrorMessage(
          error,
          "Le renvoi du code a échoué. Réessayez dans quelques instants.",
        ),
      });
    } finally {
      setResending(false);
    }
  }

  return (
    <main
      className={`auth-page ${mode === "login" && !verificationPending ? "auth-page--login" : ""}`}
    >
      <Link className="auth-brand" href="/" aria-label="Kinesis, accueil">
        <Image src="/kinesis-mark.png" width={48} height={48} alt="" priority />
        <span>KINESIS</span>
      </Link>

      <section className="auth-panel" aria-labelledby="auth-title">
        <div className="auth-panel-topline">
          <Link className="auth-back-link" href="/">
            ← Retour à l’accueil
          </Link>
          <Link className="auth-company-link" href="/inscription-compagnie">
            <Building2 aria-hidden="true" />
            <span>
              <small>Vous représentez une compagnie ?</small>
              <strong>Créer un compte partenaire</strong>
            </span>
            <ArrowRight aria-hidden="true" />
          </Link>
        </div>

        <>
            <div className="auth-heading">
              <p className="auth-eyebrow">KINESIS · VOYAGEZ AU TOGO</p>
              <h1 id="auth-title">
                {verificationPending
                  ? "Vérifiez votre adresse e-mail"
                  : mode === "login"
                    ? "Bon retour parmi nous"
                    : "Créer un compte"}
              </h1>
              <p>
                {verificationPending
                  ? `Saisissez le code à 6 chiffres envoyé à ${pendingVerificationEmail}. Il est valable 10 minutes.`
                  : mode === "login"
                    ? "Connectez-vous pour retrouver vos voyages et réservations."
                    : "Créez votre compte voyageur pour préparer vos déplacements."}
              </p>
            </div>

            {!verificationPending ? (
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
            ) : null}

            <form className="auth-form" onSubmit={submitAuth}>
              {verificationPending ? (
                <>
                  <label>
                    <span>Adresse e-mail</span>
                    <input
                      type="email"
                      value={pendingVerificationEmail}
                      disabled
                      tabIndex={-1}
                    />
                  </label>
                  <label>
                    <span>Code de vérification</span>
                    <OtpCodeInput
                      value={verificationCode}
                      onChange={setVerificationCode}
                    />
                  </label>
                </>
              ) : mode === "register" ? (
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
                    <TogoPhoneInput
                      value={telephone}
                      onChange={(value) =>
                        setTelephone(formatTogoPhoneInput(value))
                      }
                    />
                  </label>
                </>
              ) : null}

              {!verificationPending ? (
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
              ) : null}
              {!verificationPending ? (
                <label>
                  <span>Mot de passe</span>
                  <PasswordInput
                    autoComplete={
                      mode === "login" ? "current-password" : "new-password"
                    }
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    minLength={mode === "register" ? 8 : undefined}
                  />
                </label>
              ) : null}
              {!verificationPending && mode === "login" ? (
                <Link className="auth-password-reset" href="/mot-de-passe-oublie">
                  Mot de passe oublié ?
                </Link>
              ) : null}
              {!verificationPending && mode === "register" ? (
                <label>
                  <span>Confirmer le mot de passe</span>
                  <PasswordInput
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
              {mode === "register" && !verificationPending ? (
                <p className="auth-password-hint">
                  Au moins 8 caractères avec une majuscule, une minuscule, un
                  chiffre et un caractère spécial.
                </p>
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
                  : verificationPending
                    ? "Vérifier mon adresse e-mail"
                    : mode === "login"
                      ? "Se connecter"
                      : "Créer mon compte"}
              </button>
              {verificationPending ? (
                <button
                  className="auth-resend-code"
                  type="button"
                  onClick={resendVerificationCode}
                  disabled={resending}
                >
                  {resending ? "Envoi en cours…" : "Renvoyer le code"}
                </button>
              ) : null}
              {verificationPending ? (
                <button
                  className="auth-resend-code"
                  type="button"
                  onClick={() => {
                    savePendingVerificationEmail(null);
                    setMode("register");
                    setVerificationCode("");
                    setFeedback(null);
                  }}
                >
                  Modifier l’adresse e-mail
                </button>
              ) : null}
            </form>

            {!verificationPending ? <p className="auth-switch">
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
            </p> : null}
        </>
      </section>
      <p className="auth-footer">Le Togo en mouvement, avec vous.</p>
    </main>
  );
}
