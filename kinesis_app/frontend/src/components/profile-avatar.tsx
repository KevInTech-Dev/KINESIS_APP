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
  const nameParts = name.trim().split(/\s+/).filter(Boolean);
  const initials =
    nameParts.length > 1
      ? `${nameParts[0][0]}${nameParts[nameParts.length - 1][0]}`.toLocaleUpperCase("fr-FR")
      : nameParts[0]?.[0]?.toLocaleUpperCase("fr-FR") || "K";

  if (src && failedSource !== src) {
    return (
      <Image
        className={className}
        src={src}
        width={size}
        height={size}
        alt={alt}
        onError={() => setFailedSource(src)}
      />
    );
  }

  return (
    <span
      className={`${className} profile-avatar-fallback ${fallbackClassName ?? ""}`.trim()}
      role={alt ? "img" : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
    >
      {initials}
    </span>
  );
}
