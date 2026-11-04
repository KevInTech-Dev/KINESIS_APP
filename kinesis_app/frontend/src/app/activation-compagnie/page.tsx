import { Suspense } from "react";
import KinesisLoader from "@/components/kinesis-loader";
import ActivationStatus from "./activation-status";

function ActivationFallback() {
  return <KinesisLoader message="Vérification de votre lien d’activation…" />;
}

export default function CompanyActivationPage() {
  return (
    <Suspense fallback={<ActivationFallback />}>
      <ActivationStatus />
    </Suspense>
  );
}
