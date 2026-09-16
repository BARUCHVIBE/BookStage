"use client";

/* eslint-disable @next/next/no-img-element -- suporta assets R2 e URLs HTTPS legadas cadastradas pelas organizações. */
import {
  useEffect,
  useRef,
  useState,
  type ImgHTMLAttributes,
  type ReactNode,
} from "react";

export function ResilientImage({
  sources,
  fallback,
  alt,
  ...imageProps
}: {
  sources: Array<string | null | undefined>;
  fallback: ReactNode;
  alt: string;
} & Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "onError" | "alt">) {
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set()),
    imageRef = useRef<HTMLImageElement>(null),
    source = [...new Set(sources.filter(Boolean) as string[])].find(
      (candidate) => !failed.has(candidate),
    );
  function markFailed(candidate: string) {
    setFailed((current) =>
      current.has(candidate) ? current : new Set([...current, candidate]),
    );
  }
  useEffect(() => {
    const image = imageRef.current;
    // Em páginas SSR, o erro pode acontecer antes de o React anexar onError.
    if (source && image?.complete && image.naturalWidth === 0)
      markFailed(source);
  }, [source]);
  if (!source) return <>{fallback}</>;
  return (
    <img
      {...imageProps}
      ref={imageRef}
      src={source}
      alt={alt}
      onError={() => markFailed(source)}
    />
  );
}
