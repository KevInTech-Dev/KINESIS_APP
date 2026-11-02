"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function PaymentReturnPage() {
  const router = useRouter();

  useEffect(() => {
    const query = window.location.search;
    router.replace(`/espace-voyageur${query}`);
  }, [router]);

  return (
    <main className="booking-page">
      <div className="booking-content" role="status">
        Retour vers votre espace voyageur…
      </div>
    </main>
  );
}
