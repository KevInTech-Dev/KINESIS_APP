import { Suspense } from "react";
import AgentActivationForm from "./agent-activation-form";

export default function AgentActivationPage() {
  return (
    <Suspense
      fallback={
        <main className="auth-page">
          <p className="auth-footer">Chargement du formulaire sécurisé…</p>
        </main>
      }
    >
      <AgentActivationForm />
    </Suspense>
  );
}
