const { html } = globalThis;

// Luna gótica: disco nacarado con cráteres, halo carmesí, arco de catedral
// y pequeñas siluetas de cuervos. Todo CSS: liviano y sin canvas adicional.
export function Luna() {
  return html`
    <div class="gothic-moon-hud" aria-hidden="true">
      <style>
        .gothic-moon-hud {
          position: fixed;
          inset: 0;
          pointer-events: none;
          overflow: hidden;
          z-index: 2;
        }

        .gothic-moon-hud::before {
          content: '';
          position: absolute;
          top: clamp(-96px, -7vw, -48px);
          left: clamp(-92px, -6vw, -42px);
          width: clamp(210px, 28vw, 390px);
          aspect-ratio: 1;
          border-radius: 50%;
          background:
            radial-gradient(circle at 35% 31%, rgba(255,255,255,.26) 0 2.5%, transparent 3.2%),
            radial-gradient(circle at 61% 35%, rgba(20,8,18,.22) 0 5%, transparent 5.8%),
            radial-gradient(circle at 45% 63%, rgba(20,8,18,.18) 0 8%, transparent 8.8%),
            radial-gradient(circle at 71% 68%, rgba(255,255,255,.11) 0 4%, transparent 4.8%),
            radial-gradient(circle at 52% 48%,
              color-mix(in srgb, white 72%, var(--aurora-accent)) 0%,
              color-mix(in srgb, #d8d0dc 76%, var(--aurora-accent)) 48%,
              color-mix(in srgb, #7c6878 64%, var(--aurora-accent)) 72%,
              color-mix(in srgb, #160912 72%, var(--aurora-accent)) 100%);
          box-shadow:
            inset -24px -18px 52px rgba(14,3,10,.58),
            inset 10px 8px 24px rgba(255,255,255,.12),
            0 0 18px 4px color-mix(in srgb, var(--aurora-accent) 38%, transparent),
            0 0 72px 20px color-mix(in srgb, var(--aurora-accent) 22%, transparent),
            0 0 150px 52px color-mix(in srgb, var(--aurora-accent) 10%, transparent);
          opacity: .66;
          animation: gothic-moon-breathe 8s ease-in-out infinite;
        }

        .gothic-moon-hud::after {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          width: clamp(300px, 38vw, 520px);
          height: clamp(260px, 35vw, 480px);
          opacity: .24;
          background:
            radial-gradient(ellipse at 0 0, transparent 0 48%, color-mix(in srgb, var(--aurora-accent) 46%, transparent) 48.5% 49%, transparent 49.5%),
            linear-gradient(45deg, transparent 49.2%, color-mix(in srgb, var(--aurora-accent) 32%, transparent) 49.5% 50.3%, transparent 50.6%);
          filter: drop-shadow(0 0 9px var(--aurora-edge-glow));
        }

        .gothic-moon-raven {
          position: absolute;
          width: 32px;
          height: 13px;
          opacity: .46;
          filter: drop-shadow(0 0 5px rgba(0,0,0,.8));
          animation: gothic-raven-drift 13s ease-in-out infinite;
        }

        .gothic-moon-raven::before,
        .gothic-moon-raven::after {
          content: '';
          position: absolute;
          top: 5px;
          width: 18px;
          height: 8px;
          background: #020102;
        }

        .gothic-moon-raven::before {
          right: 50%;
          border-radius: 95% 10% 75% 10%;
          transform-origin: right center;
          transform: rotate(13deg) skewX(-18deg);
        }

        .gothic-moon-raven::after {
          left: 50%;
          border-radius: 10% 95% 10% 75%;
          transform-origin: left center;
          transform: rotate(-13deg) skewX(18deg);
        }

        .gothic-moon-raven--one {
          top: clamp(72px, 10vw, 136px);
          left: clamp(150px, 21vw, 300px);
        }

        .gothic-moon-raven--two {
          top: clamp(122px, 15vw, 210px);
          left: clamp(210px, 29vw, 410px);
          scale: .72;
          animation-delay: -5s;
        }

        .gothic-moon-raven--three {
          top: clamp(50px, 7vw, 98px);
          left: clamp(238px, 33vw, 460px);
          scale: .48;
          opacity: .3;
          animation-delay: -9s;
        }

        @keyframes gothic-moon-breathe {
          0%, 100% { transform: scale(1); opacity: .61; }
          50% { transform: scale(1.018); opacity: .74; }
        }

        @keyframes gothic-raven-drift {
          0%, 100% { transform: translate(0, 0) rotate(-2deg); }
          45% { transform: translate(18px, -8px) rotate(3deg); }
          55% { transform: translate(21px, -6px) rotate(1deg); }
        }

        @media (max-width: 820px) {
          .gothic-moon-hud::before { opacity: .48; }
          .gothic-moon-hud::after { opacity: .15; }
          .gothic-moon-raven--three { display: none; }
        }

        @media (prefers-reduced-motion: reduce) {
          .gothic-moon-hud::before,
          .gothic-moon-raven { animation: none; }
        }
      </style>

      <i class="gothic-moon-raven gothic-moon-raven--one"></i>
      <i class="gothic-moon-raven gothic-moon-raven--two"></i>
      <i class="gothic-moon-raven gothic-moon-raven--three"></i>
    </div>
  `;
}
