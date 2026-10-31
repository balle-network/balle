import { DotArt } from "@/components/home/DotArt";
import { HeroComposer, RotatingWord } from "@/components/home/HeroComposer";

export default function HomePage() {
  return (
    <main id="hero" className="hero">
      <div className="hero-screen">
        <DotArt />
      </div>
      <div className="hero-copy">
        <h1 className="hero-title">
          <span className="hero-line hero-rise">
            Any <RotatingWord />. Live coin.
          </span>
          <span className="hero-line hero-rise">Instant launch.</span>
        </h1>
        <HeroComposer />
      </div>
    </main>
  );
}
