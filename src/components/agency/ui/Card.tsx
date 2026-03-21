import { cn } from "@/lib/utils";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  onClick?: () => void;
}

export function Card({ children, className, hover, onClick }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "rounded-xl border border-[#E8E8E5] bg-white shadow-card",
        hover && "cursor-pointer transition-shadow hover:shadow-card-hover",
        className
      )}
    >
      {children}
    </div>
  );
}

interface CardSectionProps {
  children: React.ReactNode;
  className?: string;
  border?: boolean;
}

export function CardSection({ children, className, border }: CardSectionProps) {
  return (
    <div
      className={cn(
        "px-5 py-4",
        border && "border-b border-[#E8E8E5]",
        className
      )}
    >
      {children}
    </div>
  );
}
