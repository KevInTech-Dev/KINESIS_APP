import { Suspense } from "react";
import ActivationStatus from "./activation-status";

function ActivationFallback() {
  return (
    <main className="activation-page">
      <section className="activation-card" aria-live="polite">
        <span className="activation-mark" aria-hidden="true">
          <span className="activation-spinner" />
        </span>
        <p className="activation-eyebrow">COMPTE COMPAGNIE</p>
        <h1>Activation en cours</h1>
        <p className="activation-message">
          Nous vérifions votre lien sécurisé. Cette opération ne prend qu’un instant.
        </p>
      </section>
    </main>
  );
}

export default function CompanyActivationPage() {
  return (
    <Suspense fallback={<ActivationFallback />}>
      <ActivationStatus />
    </Suspense>
  );
}
