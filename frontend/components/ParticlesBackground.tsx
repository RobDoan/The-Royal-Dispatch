'use client';

import { useEffect, useState } from 'react';
import Particles, { initParticlesEngine } from '@tsparticles/react';
import { loadSlim } from '@tsparticles/slim';

export function ParticlesBackground() {
  const [init, setInit] = useState(false);

  useEffect(() => {
    initParticlesEngine(async (engine) => {
      await loadSlim(engine);
    }).then(() => {
      setInit(true);
    });
  }, []);

  if (!init) {
    return null;
  }

  return (
    <div className="fixed inset-0 pointer-events-none z-0">
      <Particles
        id="tsparticles"
        options={{
          fullScreen: { enable: false, zIndex: 0 },
          background: {
            color: {
              value: "transparent",
            },
          },
          fpsLimit: 60,
          interactivity: {
            events: {
              onHover: {
                enable: true,
                mode: "repulse",
              },
            },
            modes: {
              repulse: {
                distance: 100,
                duration: 0.4,
              },
            },
          },
          particles: {
            color: {
              value: ["#FFD700", "#FFFFFF", "#7EC8E3", "#FF85A1"],
            },
            links: {
              enable: false,
            },
            move: {
              direction: "none",
              enable: true,
              outModes: {
                default: "bounce",
              },
              random: true,
              speed: 0.4,
              straight: false,
            },
            number: {
              density: {
                enable: true,
              },
              value: 40,
            },
            opacity: {
              value: { min: 0.1, max: 0.7 },
              animation: {
                enable: true,
                speed: 1.5,
                sync: false,
              },
            },
            shape: {
              type: "circle",
            },
            size: {
              value: { min: 2, max: 5 },
              animation: {
                enable: true,
                speed: 2,
                sync: false,
              },
            },
          },
          detectRetina: true,
        }}
        className="absolute inset-0 z-0 pointer-events-auto"
      />
    </div>
  );
}
