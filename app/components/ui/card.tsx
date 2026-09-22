import React from "react";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "card" | "canvas" | "dark";
}

export function Card({
  className = "",
  variant = "card",
  children,
  ...props
}: CardProps) {
  const bgStyles =
    variant === "dark"
      ? "bg-[#181715] text-[#faf9f5] border-[#252320]"
      : variant === "canvas"
        ? "bg-[#faf9f5] text-[#141413] border-[#e6dfd8]"
        : "bg-[#efe9de] text-[#141413] border-[#e6dfd8]";

  return (
    <div
      className={`rounded-xl border shadow-xs overflow-hidden ${bgStyles} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  className = "",
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`p-5 sm:p-6 pb-3 ${className}`} {...props}>
      {children}
    </div>
  );
}

export interface CardTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {
  as?: "h1" | "h2" | "h3" | "h4";
  isSerif?: boolean;
}

export function CardTitle({
  as: Tag = "h3",
  isSerif = true,
  className = "",
  children,
  ...props
}: CardTitleProps) {
  const fontClass = isSerif
    ? "font-serif tracking-tight font-medium"
    : "font-sans font-semibold";

  return (
    <Tag className={`text-lg sm:text-xl text-[#141413] ${fontClass} ${className}`} {...props}>
      {children}
    </Tag>
  );
}

export function CardDescription({
  className = "",
  children,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={`mt-1 text-xs sm:text-sm text-[#6c6a64] leading-relaxed ${className}`} {...props}>
      {children}
    </p>
  );
}

export function CardContent({
  className = "",
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`p-5 sm:p-6 pt-2 ${className}`} {...props}>
      {children}
    </div>
  );
}

export function CardFooter({
  className = "",
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`border-t border-[#e6dfd8] bg-[#f5f0e8]/50 px-5 sm:px-6 py-3 flex items-center justify-between gap-4 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
