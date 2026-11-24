import { useEffect, useState } from 'react';

interface LiquidSplashScreenProps {
  isLoading: boolean;
}

export default function LiquidSplashScreen({ isLoading }: LiquidSplashScreenProps) {
  const [mounted, setMounted] = useState(true);
  const [exiting, setExiting] = useState(false);
  const [reducedMotion] = useState<boolean>(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false,
  );

  useEffect(() => {
    if (isLoading) return;

    const exitTimer = window.setTimeout(() => {
      setExiting(true);
    }, 0);

    const unmountDelay = reducedMotion ? 150 : 550;
    const unmountTimer = window.setTimeout(() => {
      setMounted(false);
    }, unmountDelay);

    return () => {
      window.clearTimeout(exitTimer);
      window.clearTimeout(unmountTimer);
    };
  }, [isLoading, reducedMotion]);

  if (!mounted) {
    return null;
  }

  return (
    <div
      aria-hidden={!isLoading}
      aria-label="Cargando AquaPlants"
      role="status"
      style={
        reducedMotion
          ? {
              opacity: exiting ? 0 : 1,
              transition: 'opacity 150ms ease-out',
            }
          : {
              clipPath: exiting
                ? 'circle(0% at 50% 46%)'
                : 'circle(150% at 50% 46%)',
              transition: 'clip-path 550ms cubic-bezier(0.65, 0, 0.35, 1)',
            }
      }
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-[radial-gradient(circle_at_50%_42%,_#00753A_0%,_#0E1F17_72%)] ${
        exiting ? 'pointer-events-none' : ''
      }`}
    >
      <div
        className={`flex flex-col items-center gap-6 transition-all duration-300 ${
          exiting ? 'scale-105 opacity-0' : 'scale-100 opacity-100'
        }`}
      >
        <img
          src="/LogoAquaSVG.svg"
          alt="AquaPlants"
          className="h-auto w-44 animate-[pulse_2.2s_ease-in-out_infinite] sm:w-52"
        />

        <div className="h-1 w-32 overflow-hidden rounded-full bg-white/15">
          <div className="liquid-bar-slide h-full w-1/2 rounded-full bg-gradient-to-r from-[#22C55E] to-[#E6A608]" />
        </div>
      </div>
    </div>
  );
}
