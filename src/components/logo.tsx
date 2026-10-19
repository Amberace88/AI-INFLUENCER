// Wordmark: a single film frame with a sprocket edge, then the name.
export function Logo({ className = "", inverted = false }: { className?: string; inverted?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden>
        <rect x="1" y="1" width="24" height="24" rx="5" fill={inverted ? "#f8fafc" : "#17202b"} />
        <rect x="6" y="5" width="14" height="16" rx="2" fill="#2e4be0" />
        <circle cx="13" cy="11" r="3.2" fill={inverted ? "#17202b" : "#f8fafc"} />
        <path d="M7.5 21c.8-3.6 3-5.2 5.5-5.2s4.7 1.6 5.5 5.2" fill={inverted ? "#17202b" : "#f8fafc"} />
        {[4, 9, 14, 19].map((y) => <rect key={y} x="2.6" y={y + 0.5} width="1.6" height="2" rx=".5" fill="#e6c86e" />)}
      </svg>
      <span className="text-lg font-bold" style={{ fontVariationSettings: '"wdth" 78', letterSpacing: "-0.02em" }}>Persona Studio</span>
    </span>
  );
}
