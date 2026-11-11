"use client";

import Image from "next/image";
import { CircleUserRound } from "lucide-react";
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
  if (src && failedSource !== src) {
    return (
      <Image
        className={className}
        src={src}
        width={size}
        height={size}
        alt={alt || name}
        onError={() => setFailedSource(src)}
      />
    );
  }

  return (
    <span
      className={`${className} profile-avatar-fallback ${fallbackClassName ?? ""}`.trim()}
      role="img"
      aria-label={alt || name}
    >
      <CircleUserRound
        className="profile-avatar-fallback__icon"
        aria-hidden="true"
      />
    </span>
  );
}
