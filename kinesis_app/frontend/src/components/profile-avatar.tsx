"use client";

import Image from "next/image";
import { useState } from "react";

type ProfileAvatarProps = {
  src?: string | null;
  name: string;
  size: number;
  className: string;
  fallbackClassName?: string;
  alt?: string;
};

export default function ProfileAvatar({
  src,
  name,
  size,
  className,
  fallbackClassName,
  alt = "",
}: ProfileAvatarProps) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const initials = name.trim().slice(0, 1).toLocaleUpperCase("fr-FR") || "K";

  if (src && failedSource !== src) {
    return (
      <Image
        className={className}
        src={src}
        width={size}
        height={size}
        alt={alt}
        unoptimized
        onError={() => setFailedSource(src)}
      />
    );
  }

  return (
    <span
      className={`${className} ${fallbackClassName ?? ""}`.trim()}
      role={alt ? "img" : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
    >
      {initials}
    </span>
  );
}
