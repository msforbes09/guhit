"use client";

import Link from "next/link";
import type { ComponentProps, CSSProperties, ReactNode } from "react";
import { sfx, type SoundName } from "@/lib/sfx";
import { ArrowLeft, House } from "./icons";

export type Tone = "sun" | "sky" | "grass" | "grape" | "red" | "pink" | "paper";
type Size = "xl" | "lg" | "md" | "sm";

const TONES: Record<Tone, string> = {
  sun: "bg-sun text-ink",
  sky: "bg-sky text-ink",
  grass: "bg-grass text-ink",
  grape: "bg-grape text-white",
  // The deeper red keeps white words readable (5.8:1).
  red: "bg-red-deep text-white",
  pink: "bg-pink text-ink",
  paper: "bg-paper text-ink",
};

const SIZES: Record<Size, string> = {
  xl: "min-h-24 px-8 gap-4 text-[1.75rem] sm:text-[2rem] rounded-cut-lg",
  lg: "min-h-[4.5rem] px-7 gap-3 text-2xl rounded-cut",
  md: "min-h-16 px-6 gap-2.5 text-xl rounded-cut",
  sm: "min-h-14 px-5 gap-2 text-lg rounded-cut",
};

const base =
  "crayon-edge press inline-flex items-center justify-center font-display font-bold leading-tight text-center";

function classes(tone: Tone, size: Size, extra?: string) {
  return `${base} ${TONES[tone]} ${SIZES[size]} ${extra ?? ""}`;
}

type ButtonProps = ComponentProps<"button"> & {
  tone?: Tone;
  size?: Size;
  icon?: ReactNode;
  tilt?: number;
  /** The 8-bit sound of pressing it; false when the action plays its own. */
  sound?: SoundName | false;
};

export function Button({ tone = "sun", size = "md", icon, tilt, sound = "tap", className, children, style, onClick, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      className={classes(tone, size, className)}
      style={{ ...style, ...(tilt ? ({ "--tilt": `${tilt}deg` } as CSSProperties) : null) }}
      onClick={(e) => {
        if (sound) sfx(sound);
        onClick?.(e);
      }}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}

type LinkButtonProps = ComponentProps<typeof Link> & {
  tone?: Tone;
  size?: Size;
  icon?: ReactNode;
  tilt?: number;
};

export function LinkButton({ tone = "sun", size = "md", icon, tilt, className, children, style, onClick, ...rest }: LinkButtonProps) {
  return (
    <Link
      className={classes(tone, size, className)}
      style={{ ...style, ...(tilt ? ({ "--tilt": `${tilt}deg` } as CSSProperties) : null) }}
      onClick={(e) => {
        sfx("tap");
        onClick?.(e);
      }}
      {...rest}
    >
      {icon}
      {children}
    </Link>
  );
}

/** Top strip with a way home and the screen's name. */
export function TopBar({
  title,
  back = "/",
  backLabel = "Home",
  right,
}: {
  title?: ReactNode;
  back?: string;
  backLabel?: string;
  right?: ReactNode;
}) {
  const BackIcon = back === "/" ? House : ArrowLeft;
  return (
    <header className="flex items-center gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2 sm:px-6">
      <Link
        href={back}
        onClick={() => sfx("tap")}
        className="crayon-edge press inline-flex min-h-14 min-w-14 items-center justify-center gap-2 rounded-cut bg-paper px-3 font-display text-lg font-bold text-ink"
      >
        <BackIcon size={26} weight="bold" aria-hidden="true" />
        <span className="max-sm:sr-only">{backLabel}</span>
      </Link>
      {title && (
        <h1 className="min-w-0 flex-1 truncate font-display text-2xl font-extrabold text-ink sm:text-3xl">{title}</h1>
      )}
      {!title && <div className="flex-1" />}
      {right}
    </header>
  );
}

/** A loose sheet of paper on the table. */
export function Sheet({ className, children, ...rest }: ComponentProps<"div">) {
  return (
    <div className={`crayon-edge rounded-cut-lg bg-paper shadow-soft ${className ?? ""}`} {...rest}>
      {children}
    </div>
  );
}

/** Speech bubble that points down at the character. */
export function SpeechBubble({
  children,
  tone = "say",
  className,
  live = true,
}: {
  children: ReactNode;
  tone?: "say" | "think";
  className?: string;
  live?: boolean;
}) {
  return (
    <div
      className={`relative ${className ?? ""}`}
      aria-live={live ? "polite" : undefined}
      role={live ? "status" : undefined}
    >
      <div className="crayon-edge rounded-[30px_36px_32px_38px/36px_30px_38px_32px] bg-white px-5 py-4 text-ink shadow-soft sm:px-6 sm:py-5">
        {children}
      </div>
      {tone === "say" ? (
        <svg
          aria-hidden="true"
          viewBox="0 0 40 30"
          className="absolute -bottom-[22px] left-1/2 h-[26px] w-[36px] -translate-x-1/2"
        >
          <path
            d="M4 1 Q18 6 20 28 Q24 10 36 1"
            fill="#fff"
            stroke="var(--ink)"
            strokeWidth="3"
            strokeLinejoin="round"
            filter="url(#crayon-edge)"
          />
          <rect x="6" y="0" width="28" height="5" fill="#fff" />
        </svg>
      ) : (
        <div aria-hidden="true" className="absolute left-1/2 top-full -translate-x-1/2">
          <span className="crayon-edge absolute left-1 top-2 block h-5 w-5 rounded-full bg-white" />
          <span className="crayon-edge absolute left-5 top-8 block h-3 w-3 rounded-full bg-white" />
        </div>
      )}
    </div>
  );
}

export function ThinkingDots({ label = "Thinking", size = "md" }: { label?: string; size?: "md" | "lg" }) {
  const dot = size === "lg" ? "h-5 w-5" : "h-3.5 w-3.5";
  return (
    <span className={`inline-flex items-center py-1 ${size === "lg" ? "gap-3 px-2" : "gap-2"}`} role="img" aria-label={label}>
      <span className={`thinking-dot block rounded-full bg-grape ${dot}`} />
      <span className={`thinking-dot block rounded-full bg-sky ${dot}`} />
      <span className={`thinking-dot block rounded-full bg-red ${dot}`} />
    </span>
  );
}

/** Hand-drawn wavy underline used under display words. */
export function Scribble({ className, color = "var(--crayon-sun)" }: { className?: string; color?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 300 24" preserveAspectRatio="none" className={className}>
      <path
        d="M4 15 C 40 4, 70 22, 110 12 S 180 4, 215 14 S 270 20, 296 8"
        fill="none"
        stroke={color}
        strokeWidth="9"
        strokeLinecap="round"
      />
    </svg>
  );
}
