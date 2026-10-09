import Link from "next/link";
import { AIStatusPill } from "@/components/kid/AIStatusPill";
import { FriendShelf } from "@/components/kid/FriendShelf";
import { HeroDoodle } from "@/components/kid/HeroDoodle";
import { Camera, DownloadSimple, PaintBrush } from "@/components/kid/icons";
import { LinkButton, Scribble } from "@/components/kid/ui";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-8 sm:px-6">
      <header className="flex items-center justify-between gap-4">
        <span className="relative font-display text-4xl font-black tracking-tight text-ink sm:text-5xl">
          Guhit
          <Scribble className="absolute -bottom-2 left-0 h-3 w-full" color="var(--crayon-red)" />
        </span>
        <AIStatusPill />
      </header>

      <section className="mt-6 grid items-center gap-6 sm:mt-10 md:grid-cols-[1.1fr_0.9fr] md:gap-10">
        <div className="anim-float-in">
          <h1 className="text-[2.6rem] font-black leading-[1.02] text-ink sm:text-6xl lg:text-7xl">
            Let&rsquo;s wake up{" "}
            <span className="relative inline-block">
              your drawing!
              <Scribble className="absolute -bottom-1 left-0 -z-10 h-4 w-full sm:h-5" />
            </span>
          </h1>
          <p className="mt-4 max-w-md text-xl text-ink-soft sm:text-2xl">
            Take a photo of something you drew. It comes alive, and it talks with you!
          </p>

          <div className="mt-7 flex flex-col gap-4 sm:max-w-lg">
            <LinkButton
              href="/snap"
              tone="sun"
              size="xl"
              tilt={-1}
              icon={<Camera size={44} weight="fill" aria-hidden="true" />}
            >
              Bring a drawing to life
            </LinkButton>
            <LinkButton
              href="/draw"
              tone="sky"
              size="lg"
              tilt={0.8}
              icon={<PaintBrush size={32} weight="fill" aria-hidden="true" />}
              className="sm:self-start"
            >
              Draw here instead
            </LinkButton>
          </div>
        </div>

        <HeroDoodle className="mx-auto w-full max-w-[300px] md:max-w-[440px] max-md:order-first max-md:hidden" />
      </section>

      <FriendShelf />

      <footer className="mt-auto flex flex-wrap items-center justify-between gap-x-6 gap-y-2 pt-10 text-base text-ink-soft">
        <p>Everything stays on this device. No internet needed.</p>
        <Link
          href="/setup"
          className="inline-flex min-h-12 items-center gap-2 font-bold text-ink-soft underline decoration-2 underline-offset-4 hover:text-ink"
        >
          <DownloadSimple size={20} weight="bold" aria-hidden="true" />
          Grown-ups: get ready (download)
        </Link>
      </footer>
    </main>
  );
}
