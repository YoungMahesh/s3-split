import React from "react";

export type BadgeVariant =
  | "cream"
  | "coral"
  | "teal"
  | "amber"
  | "crimson"
  | "dark";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: "sm" | "md";
  dot?: boolean;
}

const badgeVariants: Record<BadgeVariant, string> = {
  cream: "bg-[#efe9de] text-[#141413] border border-[#e6dfd8]",
  coral: "bg-[#cc785c] text-white font-medium",
  teal: "bg-[#5db8a6]/15 text-[#1e6155] border border-[#5db8a6]/30",
  amber: "bg-[#e8a55a]/20 text-[#855013] border border-[#e8a55a]/40",
  crimson: "bg-[#c64545]/15 text-[#9a2c2c] border border-[#c64545]/30 font-medium",
  dark: "bg-[#252320] text-[#faf9f5] border border-[#383530]",
};

const dotColors: Record<BadgeVariant, string> = {
  cream: "bg-[#6c6a64]",
  coral: "bg-white",
  teal: "bg-[#5db8a6]",
  amber: "bg-[#e8a55a]",
  crimson: "bg-[#c64545]",
  dark: "bg-[#faf9f5]",
};

export function Badge({
  className = "",
  variant = "cream",
  size = "md",
  dot = false,
  children,
  ...props
}: BadgeProps) {
  const sizeClasses =
    size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-3 py-1 text-xs";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium select-none ${
        badgeVariants[variant]
      } ${sizeClasses} ${className}`}
      {...props}
    >
      {dot && (
        <span
          className={`h-1.5 w-1.5 rounded-full shrink-0 ${dotColors[variant]}`}
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  );
}
