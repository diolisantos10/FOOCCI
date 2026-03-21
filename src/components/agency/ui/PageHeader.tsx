import { LucideIcon } from "lucide-react";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  iconColor?: string;
  children?: React.ReactNode;
}

export function PageHeader({
  title,
  subtitle,
  icon: Icon,
  iconColor = "#5B5BD6",
  children,
}: PageHeaderProps) {
  return (
    <div className="mb-7 flex items-center justify-between">
      <div className="flex items-center gap-3">
        {Icon && (
          <div
            className="flex h-8 w-8 flex-none items-center justify-center rounded-lg"
            style={{ backgroundColor: `${iconColor}12` }}
          >
            <Icon size={15} strokeWidth={1.75} style={{ color: iconColor }} />
          </div>
        )}
        <div>
          <h1 className="text-[18px] font-bold leading-tight text-[#0A0A0A]">{title}</h1>
          {subtitle && (
            <p className="mt-0.5 text-[12px] text-[#A1A1AA]">{subtitle}</p>
          )}
        </div>
      </div>
      {children && (
        <div className="flex items-center gap-2">{children}</div>
      )}
    </div>
  );
}
