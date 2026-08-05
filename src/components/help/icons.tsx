/**
 * Ícones do Assistente — SVG escrito à mão (o projeto não usa lucide/heroicons).
 * Todos herdam `currentColor` e tamanho por className.
 */

type P = { className?: string };

const base = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  viewBox: "0 0 24 24",
};

export function SparkIcon({ className }: P) {
  return (
    <svg className={className} {...base}>
      <path d="M12 3.5l1.7 4.6 4.6 1.7-4.6 1.7L12 16.1l-1.7-4.6L5.7 9.8l4.6-1.7L12 3.5z" />
      <path d="M18.5 15.5l.8 2.1 2.2.8-2.2.8-.8 2.1-.8-2.1-2.2-.8 2.2-.8.8-2.1z" />
    </svg>
  );
}

// O microfone saiu daqui: ele agora mora com a peça que o usa, em
// `@/components/voice` (VoiceButton). Um ícone de microfone solto neste arquivo
// convidava a próxima tela a desenhar o botão à mão de novo — foi assim que
// nasceram as três implementações que este bloco matou.

export function SendIcon({ className }: P) {
  return (
    <svg className={className} {...base}>
      <path d="M5 12h13M12 5.5l6.5 6.5L12 18.5" />
    </svg>
  );
}

export function BellIcon({ className }: P) {
  return (
    <svg className={className} {...base}>
      <path d="M6 9a6 6 0 1112 0c0 3.2.7 5 1.5 6h-15C5.3 14 6 12.2 6 9z" />
      <path d="M10 19a2 2 0 004 0" />
    </svg>
  );
}

export function MinimizeIcon({ className }: P) {
  return (
    <svg className={className} {...base}>
      <path d="M6 15h12" />
    </svg>
  );
}

export function ExpandIcon({ className }: P) {
  return (
    <svg className={className} {...base}>
      <path d="M14 5h5v5M10 19H5v-5M19 5l-6.5 6.5M5 19l6.5-6.5" />
    </svg>
  );
}

export function CollapseIcon({ className }: P) {
  return (
    <svg className={className} {...base}>
      <path d="M19 10h-5V5M5 14h5v5M14 10l5-5M10 14l-5 5" />
    </svg>
  );
}

export function CloseIcon({ className }: P) {
  return (
    <svg className={className} {...base}>
      <path d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

export function RefreshIcon({ className }: P) {
  return (
    <svg className={className} {...base}>
      <path d="M4 4v5h5M20 20v-5h-5M5 9a7 7 0 0111-3M19 15a7 7 0 01-11 3" />
    </svg>
  );
}
