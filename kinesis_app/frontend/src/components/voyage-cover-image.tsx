"use client";

import Image from "next/image";
import { useState } from "react";

type VoyageCoverImageProps = {
  image: string | null;
  alt: string;
  sizes: string;
  className?: string;
  priority?: boolean;
};

export default function VoyageCoverImage({
  image,
  alt,
  sizes,
  className,
  priority = false,
}: VoyageCoverImageProps) {
  const [failedSource, setFailedSource] = useState<string | null>(null);

  if (!image || failedSource === image) return null;

  return (
    <Image
      src={image}
      alt={alt}
      fill
      sizes={sizes}
      className={className}
      priority={priority}
      onError={() => setFailedSource(image)}
    />
  );
}
