import React, { forwardRef } from "react";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "secondary-on-dark"
  | "text-link"
  | "danger"
  | "danger-fill";

export type ButtonSize = "sm" | "md" | "lg" | "icon";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-[#cc785c] text-white hover:bg-[#a9583e] active:bg-[#a9583e] disabled:bg-[#e6dfd8] disabled:text-[#6c6a64] shadow-xs",
  secondary:
    "bg-[#faf9f5] text-[#141413] border border-[#e6dfd8] hover:bg-[#efe9de] active:bg-[#e8e0d2] disabled:opacity-50 shadow-xs",
  "secondary-on-dark":
    "bg-[#252320] text-[#faf9f5] border border-[#383530] hover:bg-[#2d2b27] active:bg-[#1f1e1b] disabled:opacity-50",
  "text-link":
    "bg-transparent text-[#cc785c] hover:underline p-0 h-auto font-medium shadow-none",
  danger:
    "bg-transparent text-[#c64545] border border-[#c64545]/30 hover:bg-[#c64545]/10 active:bg-[#c64545]/20 disabled:opacity-50",
  "danger-fill":
    "bg-[#c64545] text-white hover:bg-[#a83434] active:bg-[#8f2828] disabled:opacity-50 shadow-xs",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-11 px-6 text-base gap-2.5",
  icon: "h-9 w-9 p-0 flex items-center justify-center",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className = "",
      variant = "primary",
      size = "md",
      isLoading = false,
      disabled,
      children,
      ...props
    },
    ref,
  ) => {
    const isIcon = size === "icon";
    const isTextLink = variant === "text-link";

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={`inline-flex items-center justify-center font-medium rounded-md transition-colors duration-150 cursor-pointer disabled:cursor-not-allowed select-none ${
          variantStyles[variant]
        } ${!isTextLink ? sizeStyles[size] : ""} ${className}`}
        {...props}
      >
        {isLoading && (
          <svg
            className={`animate-spin h-4 w-4 ${isIcon ? "" : "-ml-0.5"}`}
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
        {children}
      </button>
    );
  },
);

Button.displayName = "Button";
