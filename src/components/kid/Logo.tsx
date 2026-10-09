import { BLOCK, BRAND, MARK } from "./brand";

/** The creature mark from the printed logo. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} aria-hidden="true">
      <defs>
        <filter id="logo-crayon" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed="7" />
          <feDisplacementMap in="SourceGraphic" scale="3.5" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
      <g filter="url(#logo-crayon)">
        <circle {...MARK.face} fill={BRAND.cream} />
        <g fill="none" strokeWidth={25} strokeLinecap="round">
          {MARK.rays.map(({ color, ...line }, i) => (
            <line key={i} {...line} stroke={color} />
          ))}
        </g>
        <path d={MARK.loop} fill="none" stroke={BRAND.orange} strokeWidth={27} strokeLinecap="round" strokeLinejoin="round" />
        {MARK.eyes.map((eye, i) => (
          <circle key={i} {...eye} fill={BRAND.ink} />
        ))}
        <path d={MARK.smile} fill="none" stroke={BRAND.ink} strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

/** The printed "guhit" wordmark with its crayon i. */
export function LogoWordmark({ className }: { className?: string }) {
  const c = BLOCK.crayon;
  return (
    <svg viewBox="0 0 420 190" className={className} aria-hidden="true">
      <g fill="none" stroke={BRAND.ink} strokeWidth={15} strokeLinecap="round" strokeLinejoin="round">
        <circle {...BLOCK.gBowl} />
        {BLOCK.letters.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
      <path d={c.body} fill={BRAND.orange} />
      <path d={c.tip} fill={BRAND.yellow} stroke={BRAND.yellow} strokeWidth={2} strokeLinejoin="round" />
      <path d={c.lead} fill={BRAND.ink} />
      <rect {...c.band} fill={BRAND.blue} />
      <circle {...BLOCK.dot} fill={BRAND.yellow} />
    </svg>
  );
}

/**
 * Guhit's printed logo (mark + wordmark). Every screen uses this one
 * component, so changing the artwork is this file and brand.ts only.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 ${className ?? ""}`} role="img" aria-label="Guhit">
      <LogoMark className="h-full w-auto" />
      <LogoWordmark className="-ml-1 h-[78%] w-auto" />
    </span>
  );
}
