interface BrandLogoProps {
  className?: string;
  onClick?: () => void;
}

export function BrandLogo({className = "", onClick}: BrandLogoProps) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag type={onClick ? "button" : undefined} className={`brand${onClick ? " brand-button" : ""} ${className}`.trim()} aria-label={onClick ? "Go to home" : "chisel"} onClick={onClick}>
      <svg className="brand-mark" viewBox="8 4 30 30" aria-hidden="true">
        <path className="brand-mark-shadow" d="M11.6 30.9V14.5L20 6.1h3.3l7.2 7.2-7.4 7.4v3.1h6.3c.8 0 1.6.4 2.1 1l5 5.5c.6.7.1 1.8-.8 1.8H13.1c-.8 0-1.5-.5-1.5-1.2Z" />
        <path className="brand-mark-left" d="M10.8 30.2V14.1L18.9 6h3.6l7.1 7.1-7.4 7.4v5.6l-6.2 6.2h-3.1c-1.2 0-2.1-1-2.1-2.1Z" />
        <path className="brand-mark-top" d="M18.9 6h15.6c1 0 1.5 1.2.8 1.9l-5.8 6.6c-.6.7-1.4 1-2.3 1h-8.3l-4.8-4.8L18.9 6Z" />
        <path className="brand-mark-bottom" d="M18.7 20.9h9.8c.8 0 1.5.3 2 .9l5.4 5.9c.7.8.1 2-.9 2H11.9l6.8-8.8Z" />
        <path className="brand-mark-fold" d="m14.1 10.7 4.8-4.7 8.2 8.2-5 5-5.9-5.9-5.4 5.4v-4.6l3.3-3.4Z" />
        <path className="brand-mark-highlight" d="M20 6.8h13.8" />
      </svg>
      <span className="brand-name">chisel</span>
    </Tag>
  );
}
