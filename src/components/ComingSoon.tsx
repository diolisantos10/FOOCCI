import Link from "next/link";

export function ComingSoon({
  icon,
  title,
  description,
  features,
}: {
  icon: string;
  title: string;
  description: string;
  features?: string[];
}) {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
      {/* Icon */}
      <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-2xl bg-gray-50 text-5xl border border-gray-100">
        {icon}
      </div>

      {/* Badge */}
      <span className="mb-4 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-brand-600">
        Em construção
      </span>

      {/* Title + description */}
      <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
      <p className="mt-2 max-w-md text-sm text-gray-500 leading-relaxed">{description}</p>

      {/* Planned features */}
      {features && features.length > 0 && (
        <div className="mt-8 w-full max-w-sm rounded-xl border border-gray-100 bg-white p-5 text-left">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
            O que está chegando
          </p>
          <ul className="space-y-2">
            {features.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm text-gray-600">
                <span className="mt-0.5 text-brand-400">○</span>
                {f}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Back link */}
      <Link
        href="/dashboard"
        className="mt-8 rounded-lg border border-gray-200 px-5 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
      >
        ← Voltar ao Dashboard
      </Link>
    </div>
  );
}
