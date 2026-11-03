"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

type ActivationResult = {
  success: boolean;
  message: string;
};

export default function ActivationStatus() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [result, setResult] = useState<ActivationResult | null>(null);

  useEffect(() => {
    let active = true;
    if (!token) return () => {
      active = false;
    };

    void fetch(`/api/compagnie/activation?${new URLSearchParams({ token })}`, {
      cache: "no-store",
    })
      .then(async (response) => {
        const body: unknown = await response.json().catch(() => null);
        const message =
          typeof body === "object" &&
          body !== null &&
          "detail" in body &&
          typeof body.detail === "string"
            ? body.detail
            : "L’activation n’a pas pu aboutir. Réessayez depuis votre e-mail.";
        if (active) {
          setResult({ success: response.ok, message });
          if (response.ok) {
            window.history.replaceState(null, "", "/activation-compagnie");
          }
        }
      })
      .catch((error: unknown) => {
        console.error("Company activation request failed", error);
        if (active) {
          setResult({
            success: false,
            message:
              "Le service est temporairement indisponible. Réessayez dans quelques instants.",
          });
        }
      });

    return () => {
      active = false;
    };
  }, [token]);

  const activationResult = token
    ? result
    : {
        success: false,
        message:
          "Le lien d’activation est incomplet. Vérifiez le lien reçu par e-mail.",
      };

  return (
    <main className="activation-page">
      <section
        className={`activation-card ${activationResult?.success ? "activation-card--success" : activationResult ? "activation-card--error" : ""}`}
        aria-live="polite"
      >
        <Link className="activation-brand" href="/" aria-label="Kinesis, accueil">
          KINESIS
        </Link>
        <span className="activation-mark" aria-hidden="true">
          {activationResult ? (activationResult.success ? "✓" : "!") : <span className="activation-spinner" />}
        </span>
        <p className="activation-eyebrow">COMPTE COMPAGNIE</p>
        <h1>
          {activationResult
            ? activationResult.success
              ? "Votre compte est activé"
              : "Activation impossible"
            : "Activation en cours"}
        </h1>
        <p className="activation-message">
          {activationResult?.message ?? "Nous vérifions votre lien sécurisé. Cette opération ne prend qu’un instant."}
        </p>
        {activationResult ? (
          <Link
            className="activation-button"
            href={activationResult.success ? "/connexion" : "/"}
          >
            {activationResult.success ? "Se connecter" : "Retour à l’accueil"}
          </Link>
        ) : null}
        {activationResult && !activationResult.success ? (
          <p className="activation-help">
            Le lien a peut-être expiré. Contactez l’équipe KINESIS pour obtenir de l’aide.
          </p>
        ) : null}
      </section>
    </main>
  );
}
