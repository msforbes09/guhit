/**
 * A crayon creature stepping out of its sheet of paper: the whole product in
 * one picture. Plain shapes only, drawn by hand in SVG.
 */
export function HeroDoodle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 360 320" className={className} role="img" aria-label="A drawing stepping off its paper and waving">
      <defs>
        <filter id="hero-crayon" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" seed="3" />
          <feDisplacementMap in="SourceGraphic" scale="3" />
        </filter>
      </defs>

      {/* The sheet it came from, with the dashed hole where it was cut out. */}
      <g transform="rotate(-7 130 170)">
        <rect x="34" y="40" width="190" height="250" rx="10" fill="#fff" stroke="#2a2238" strokeWidth="3.5" filter="url(#hero-crayon)" />
        <path
          d="M92 230 C 80 180, 92 120, 130 112 C 168 104, 182 160, 176 230 Z"
          fill="#f6ead3"
          stroke="#8a7d99"
          strokeWidth="3"
          strokeDasharray="9 8"
          strokeLinecap="round"
        />
        <path d="M60 268 h120" stroke="#e8d6b5" strokeWidth="4" strokeLinecap="round" />
      </g>

      {/* The creature, bobbing beside it. */}
      <g className="anim-bob" style={{ transformOrigin: "236px 290px" }}>
        <ellipse cx="236" cy="296" rx="58" ry="9" fill="#2a2238" opacity="0.14" />
        <g filter="url(#hero-crayon)">
          <path d="M182 214 C 162 206, 150 186, 156 168" fill="none" stroke="#2a2238" strokeWidth="9" strokeLinecap="round" />
          <path d="M182 214 C 162 206, 150 186, 156 168" fill="none" stroke="#8f5fd6" strokeWidth="5" strokeLinecap="round" />
          <path
            d="M186 284 C 168 230, 172 150, 236 140 C 300 132, 306 230, 288 284 Z"
            fill="#8f5fd6"
            stroke="#2a2238"
            strokeWidth="4"
            strokeLinejoin="round"
          />
          <path d="M208 284 v14 M266 284 v14" stroke="#2a2238" strokeWidth="8" strokeLinecap="round" />
          <path d="M216 152 l-8 -26 l22 16 Z M254 148 l12 -24 l4 26 Z" fill="#ffc93c" stroke="#2a2238" strokeWidth="3.5" strokeLinejoin="round" />
          <path d="M302 220 C 320 214, 330 200, 326 186" fill="none" stroke="#2a2238" strokeWidth="9" strokeLinecap="round" />
          <path d="M302 220 C 320 214, 330 200, 326 186" fill="none" stroke="#8f5fd6" strokeWidth="5" strokeLinecap="round" />
          <ellipse cx="238" cy="236" rx="28" ry="34" fill="#ffe08a" stroke="#2a2238" strokeWidth="3" />
        </g>
        <circle cx="216" cy="190" r="14" fill="#fff" stroke="#2a2238" strokeWidth="3" />
        <circle cx="258" cy="188" r="14" fill="#fff" stroke="#2a2238" strokeWidth="3" />
        <circle cx="219" cy="192" r="6" fill="#2a2238" />
        <circle cx="255" cy="190" r="6" fill="#2a2238" />
        <circle cx="221" cy="189" r="2" fill="#fff" />
        <circle cx="257" cy="187" r="2" fill="#fff" />
        <circle cx="200" cy="210" r="7" fill="#f585ae" opacity="0.7" />
        <circle cx="276" cy="207" r="7" fill="#f585ae" opacity="0.7" />
        <path d="M224 212 Q238 224 252 211" fill="none" stroke="#2a2238" strokeWidth="3.5" strokeLinecap="round" />
      </g>

      {/* A little sparkle where the magic happened. */}
      <g fill="#ffc93c" stroke="#2a2238" strokeWidth="2.5" strokeLinejoin="round">
        <path d="M322 92 l6 14 l14 6 l-14 6 l-6 14 l-6 -14 l-14 -6 l14 -6 Z" />
        <path d="M290 46 l3.5 8 l8 3.5 l-8 3.5 l-3.5 8 l-3.5 -8 l-8 -3.5 l8 -3.5 Z" />
      </g>
    </svg>
  );
}
