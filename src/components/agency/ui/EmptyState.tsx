import { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick?: () => void;
  };
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#F4F4F5] mb-4">
        <Icon size={22} className="text-[#A1A1AA]" strokeWidth={1.5} />
      </div>
      <p className="text-[14px] font-semibold text-[#0A0A0A]">{title}</p>
      {description && (
        <p className="mt-1 max-w-xs text-[13px] text-[#71717A]">{description}</p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className="mt-4 rounded-lg bg-[#5B5BD6] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#4C4CB8] transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
