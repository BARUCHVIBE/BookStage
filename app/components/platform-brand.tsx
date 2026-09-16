type PlatformLogoProps = {
  variant?: "horizontal" | "symbol" | "tagline";
  tone?: "primary" | "inverse";
  className?: string;
  decorative?: boolean;
};

const logoSources = {
  horizontal: {
    primary: "/brand/book_business_logo_primary.svg",
    inverse: "/brand/book_business_logo_white_gold.svg",
  },
  symbol: {
    primary: "/brand/book_business_symbol_color.svg",
    inverse: "/brand/book_business_symbol_white_gold.svg",
  },
  tagline: {
    primary: "/brand/book_business_logo_with_tagline.svg",
    inverse: "/brand/book_business_logo_with_tagline.svg",
  },
} as const;

export function PlatformLogo({
  variant = "horizontal",
  tone = "primary",
  className = "",
  decorative = false,
}: PlatformLogoProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- official SVG assets are selected dynamically by logo variant.
    <img
      className={`platform-logo platform-logo-${variant} platform-logo-${tone} ${className}`.trim()}
      src={logoSources[variant][tone]}
      alt={decorative ? "" : "BookBusiness"}
      aria-hidden={decorative || undefined}
    />
  );
}

export function PlatformBrand({ className = "" }: { className?: string }) {
  return (
    <span className={`platform-brand ${className}`.trim()}>
      <span className="platform-brand-horizontal">
        <PlatformLogo className="platform-brand-primary" />
        <PlatformLogo className="platform-brand-inverse" tone="inverse" />
      </span>
      <span className="platform-brand-symbol">
        <PlatformLogo className="platform-brand-primary" variant="symbol" />
        <PlatformLogo
          className="platform-brand-inverse"
          variant="symbol"
          tone="inverse"
        />
      </span>
    </span>
  );
}

export function PlatformWatermark({ className = "" }: { className?: string }) {
  return (
    <span
      className={`platform-watermark ${className}`.trim()}
      aria-hidden="true"
    >
      <PlatformLogo variant="tagline" decorative />
    </span>
  );
}
