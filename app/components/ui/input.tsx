import React, { forwardRef } from "react";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className = "", error = false, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={`block w-full rounded-md border bg-[#faf9f5] px-3.5 py-2 text-sm text-[#141413] placeholder:text-[#8e8b82] transition-colors duration-150 h-10 ${
          error
            ? "border-[#c64545] focus:border-[#c64545] focus:ring-2 focus:ring-[#c64545]/20"
            : "border-[#e6dfd8] focus:border-[#cc785c] focus:ring-2 focus:ring-[#cc785c]/20"
        } focus:outline-none disabled:bg-[#f5f0e8] disabled:text-[#8e8b82] disabled:cursor-not-allowed ${className}`}
        {...props}
      />
    );
  },
);

Input.displayName = "Input";

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className = "", error = false, children, ...props }, ref) => {
    return (
      <div className="relative w-full">
        <select
          ref={ref}
          className={`block w-full appearance-none rounded-md border bg-[#faf9f5] px-3.5 py-2 pr-10 text-sm text-[#141413] transition-colors duration-150 h-10 ${
            error
              ? "border-[#c64545] focus:border-[#c64545] focus:ring-2 focus:ring-[#c64545]/20"
              : "border-[#e6dfd8] focus:border-[#cc785c] focus:ring-2 focus:ring-[#cc785c]/20"
          } focus:outline-none disabled:bg-[#f5f0e8] disabled:text-[#8e8b82] disabled:cursor-not-allowed cursor-pointer ${className}`}
          {...props}
        >
          {children}
        </select>
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-[#6c6a64]">
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </div>
      </div>
    );
  },
);

Select.displayName = "Select";

export type LabelProps = React.LabelHTMLAttributes<HTMLLabelElement>;

export function Label({ className = "", children, ...props }: LabelProps) {
  return (
    <label
      className={`block text-xs font-semibold uppercase tracking-wider text-[#3d3d3a] ${className}`}
      {...props}
    >
      {children}
    </label>
  );
}

export function FormGroup({
  className = "",
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`space-y-1.5 text-left ${className}`} {...props}>
      {children}
    </div>
  );
}
