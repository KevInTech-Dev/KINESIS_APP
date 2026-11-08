"use client";

import Image from "next/image";
import { useState } from "react";
import { getVoyageImage } from "@/lib/voyage-cache";

type VoyageCoverImageProps = {
  image: string | null;
  voyageId: string;
  alt: string;
  sizes: string;
  className?: string;
  priority?: boolean;
};

export default function VoyageCoverImage({
  image,
  voyageId,
  alt,
  sizes,
  className,
  priority = false,
}: VoyageCoverImageProps) {
  const source = getVoyageImage(image, voyageId);
  const [failedSource, setFailedSource] = useState<string | null>(null);

  return (
    <Image
      src={failedSource === source ? getVoyageImage(null, voyageId) : source}
      alt={alt}
      fill
      sizes={sizes}
      className={className}
      priority={priority}
      onError={() => {
        if (image && failedSource !== source) setFailedSource(source);
      }}
    />
  );
}
