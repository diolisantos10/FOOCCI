/**
 * Inline line-icon set for the marketing site.
 *
 * Hand-rolled SVGs (24x24, currentColor, stroke-based) — no icon dependency.
 * The WhatsApp glyph is filled so it reads correctly at small sizes.
 */

type IconProps = { className?: string };

function stroke(className?: string) {
  return {
    width: 24,
    height: 24,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    "aria-hidden": true,
  };
}

export function MenuIcon({ className }: IconProps) {
  return (
    <svg {...stroke(className)}>
      <path d="M3 6h18M3 12h18M3 18h18" />
    </svg>
  );
}

export function CloseIcon({ className }: IconProps) {
  return (
    <svg {...stroke(className)}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

export function ArrowRightIcon({ className }: IconProps) {
  return (
    <svg {...stroke(className)}>
      <path d="M5 12h14M13 5l7 7-7 7" />
    </svg>
  );
}

export function CheckIcon({ className }: IconProps) {
  return (
    <svg {...stroke(className)}>
      <path d="m20 6-11 11-5-5" />
    </svg>
  );
}

export function MinusIcon({ className }: IconProps) {
  return (
    <svg {...stroke(className)}>
      <path d="M5 12h14" />
    </svg>
  );
}

export function PlusIcon({ className }: IconProps) {
  return (
    <svg {...stroke(className)}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function ChatIcon({ className }: IconProps) {
  return (
    <svg {...stroke(className)}>
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" />
    </svg>
  );
}

export function SparklesIcon({ className }: IconProps) {
  return (
    <svg {...stroke(className)}>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" />
    </svg>
  );
}

export function MenuBookIcon({ className }: IconProps) {
  return (
    <svg {...stroke(className)}>
      <path d="M12 6v14M12 6a4 4 0 0 0-4-4H3v14h5a4 4 0 0 1 4 4M12 6a4 4 0 0 1 4-4h5v14h-5a4 4 0 0 0-4 4" />
    </svg>
  );
}

export function UsersIcon({ className }: IconProps) {
  return (
    <svg {...stroke(className)}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13A4 4 0 0 1 16 11" />
    </svg>
  );
}

export function MegaphoneIcon({ className }: IconProps) {
  return (
    <svg {...stroke(className)}>
      <path d="M3 11v2a1 1 0 0 0 1 1h2l4 4V6L6 10H4a1 1 0 0 0-1 1Z" />
      <path d="M10 6l9-3v18l-9-3M19 9a3 3 0 0 1 0 6" />
    </svg>
  );
}

export function CartRefreshIcon({ className }: IconProps) {
  return (
    <svg {...stroke(className)}>
      <circle cx="9" cy="20" r="1.4" />
      <circle cx="18" cy="20" r="1.4" />
      <path d="M2 3h2l2.4 12.2a1 1 0 0 0 1 .8h9.2a1 1 0 0 0 1-.8L20 7H6" />
    </svg>
  );
}

export function ChartIcon({ className }: IconProps) {
  return (
    <svg {...stroke(className)}>
      <path d="M3 3v18h18" />
      <path d="M7 14v3M12 9v8M17 5v12" />
    </svg>
  );
}

export function RepeatIcon({ className }: IconProps) {
  return (
    <svg {...stroke(className)}>
      <path d="m17 2 4 4-4 4" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14M7 22l-4-4 4-4" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  );
}

export function HeartIcon({ className }: IconProps) {
  return (
    <svg {...stroke(className)}>
      <path d="M20.8 6.6a5 5 0 0 0-7.1 0L12 8.3l-1.7-1.7a5 5 0 1 0-7.1 7.1l1.7 1.7L12 22l7.1-7.1 1.7-1.7a5 5 0 0 0 0-7.1Z" />
    </svg>
  );
}

export function TrendingUpIcon({ className }: IconProps) {
  return (
    <svg {...stroke(className)}>
      <path d="m3 17 6-6 4 4 8-8" />
      <path d="M17 7h4v4" />
    </svg>
  );
}

export function QrIcon({ className }: IconProps) {
  return (
    <svg {...stroke(className)}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <path d="M14 14h3v3M21 14v.01M14 21h3M21 17v4" />
    </svg>
  );
}

export function StarIcon({ className }: IconProps) {
  return (
    <svg {...stroke(className)}>
      <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2-5.5-2.9-5.5 2.9 1-6.2L3 9.6l6.2-.9L12 3Z" />
    </svg>
  );
}

export function WhatsAppIcon({ className }: IconProps) {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.6-.92-2.2-.24-.58-.49-.5-.67-.51l-.57-.01c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.07 2.88 1.22 3.08.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35ZM12.05 21.5h-.01a9.4 9.4 0 0 1-4.79-1.31l-.34-.2-3.56.93.95-3.47-.22-.36a9.38 9.38 0 0 1-1.44-5.01c0-5.19 4.23-9.41 9.43-9.41 2.52 0 4.88.98 6.66 2.76a9.34 9.34 0 0 1 2.76 6.66c0 5.19-4.23 9.41-9.4 9.41ZM20.52 3.49A11.78 11.78 0 0 0 12.05 0C5.5 0 .16 5.33.16 11.88c0 2.09.55 4.14 1.59 5.94L.06 24l6.33-1.66a11.88 11.88 0 0 0 5.66 1.44h.01c6.54 0 11.88-5.33 11.88-11.88 0-3.17-1.24-6.16-3.48-8.41Z" />
    </svg>
  );
}
