import { LucideIcon } from "lucide-react";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  iconColor?: string;
  children?: React.ReactNode;
}

export function PageHeader({ title, subtitle, icon: Icon, iconColor = "#5B5BD6", children }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between pb-6">
      <div className="flex items-center gap-3">
        {Icon && (
          <div
            className="flex h-9 w-9 items-center justify-center rounded-lg"
            style={{ backgroundColor: `${iconColor}15` }}
          >
            <Icon size={18} style={{ color: iconColor }} strokeWidth={1.75} />
          </div>
        )}
        <div>
          <h1 className="text-[20px] font-bold text-[#0A0A0A] leading-tight">{title}</h1>
          {subtitle && (
            <p className="mt-0.5 text-[13px] text-[#71717A]">{subtitle}</p>
          )}
        </div>
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}
