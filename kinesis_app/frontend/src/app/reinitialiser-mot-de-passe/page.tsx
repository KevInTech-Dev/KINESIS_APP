import { Suspense } from "react";
import PasswordResetConfirmForm from "./password-reset-confirm-form";

function LoadingResetPage() {
  return (
    <main className="auth-page">
      <p className="auth-footer">Chargement du formulaire sécurisé…</p>
    </main>
  );
}

export default function PasswordResetConfirmPage() {
  return (
    <Suspense fallback={<LoadingResetPage />}>
      <PasswordResetConfirmForm />
    </Suspense>
  );
}
