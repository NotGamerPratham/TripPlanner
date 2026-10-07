import { useRef } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { ArrowDown, CloudSun, MapPinned, Sparkles, Wallet } from "lucide-react";
import { Button } from "./ui.jsx";
import { EXAMPLES, useTrip } from "../store/useTrip.js";

// Deterministic star field so SSR/hydration and re-renders stay stable.
const STARS = Array.from({ length: 80 }, (_, i) => {
  const r = (n) => {
    const x = Math.sin(i * 9301 + n * 49297) * 233280;
    return x - Math.floor(x);
  };
  return { x: r(1) * 1440, y: r(2) * 420, s: 0.6 + r(3) * 1.4, d: r(4) * 4 };
});

const LAYERS = [
  { d: "M0 560 L120 500 L220 540 L340 455 L460 520 L560 470 L680 530 L800 445 L920 510 L1040 470 L1160 520 L1280 480 L1440 530 V900 H0Z", fill: "url(#m1)", speed: 70 },
  { d: "M0 640 L90 600 L200 642 L300 568 L420 630 L520 590 L640 652 L760 578 L880 640 L1000 600 L1120 662 L1240 598 L1360 640 L1440 610 V900 H0Z", fill: "url(#m2)", speed: 140 },
  { d: "M0 720 Q120 650 240 700 T480 690 T720 712 T960 676 T1200 720 T1440 690 V900 H0Z", fill: "url(#m3)", speed: 220 },
  { d: "M0 806 Q200 742 400 792 T800 782 T1200 802 T1440 772 V900 H0Z", fill: "#070a14", speed: 300 },
];

const headline = ["Plans", "that", "know", "what's", "happening"];

export default function Hero() {
  const ref = useRef(null);
  const reduce = useReducedMotion();
  const applyExample = useTrip((s) => s.applyExample);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });

  // Each layer drifts at its own speed; reduced motion freezes the scene.
  const y0 = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : 40]);
  const y1 = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : LAYERS[0].speed]);
  const y2 = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : LAYERS[1].speed]);
  const y3 = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : LAYERS[2].speed]);
  const y4 = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : LAYERS[3].speed]);
  const sunY = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : 180]);
  const contentY = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : -140]);
  const contentOpacity = useTransform(scrollYProgress, [0, 0.7], [1, reduce ? 1 : 0]);
  const layerY = [y1, y2, y3, y4];

  const go = (example) => {
    if (example) applyExample(example);
    document.getElementById("plan")?.scrollIntoView({ behavior: reduce ? "auto" : "smooth" });
  };

  return (
    <header ref={ref} className="relative isolate flex min-h-[100svh] items-center overflow-hidden">
      <svg
        aria-hidden
        className="absolute inset-0 -z-10 h-full w-full"
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMax slice"
      >
        <defs>
          <linearGradient id="sky" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#070a1c" />
            <stop offset="0.38" stopColor="#1a1440" />
            <stop offset="0.62" stopColor="#4a2150" />
            <stop offset="0.8" stopColor="#b8505a" />
            <stop offset="1" stopColor="#f39a5f" />
          </linearGradient>
          <radialGradient id="sun" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#fff1c9" />
            <stop offset="0.35" stopColor="#ffc56b" />
            <stop offset="0.7" stopColor="#ff7a59" stopOpacity="0.55" />
            <stop offset="1" stopColor="#ff7a59" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="m1" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#6b3d78" />
            <stop offset="1" stopColor="#3a2558" />
          </linearGradient>
          <linearGradient id="m2" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#3b2a5e" />
            <stop offset="1" stopColor="#1f1a40" />
          </linearGradient>
          <linearGradient id="m3" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#1d1a3c" />
            <stop offset="1" stopColor="#0e1024" />
          </linearGradient>
          <filter id="blur40">
            <feGaussianBlur stdDeviation="40" />
          </filter>
        </defs>

        <rect width="1440" height="900" fill="url(#sky)" />
        <motion.g style={{ y: y0 }}>
          {STARS.map((s, i) => (
            <circle
              key={i}
              cx={s.x}
              cy={s.y}
              r={s.s}
              fill="white"
              style={reduce ? { opacity: 0.6 } : { animation: `twinkle ${3 + s.d}s ease-in-out ${s.d}s infinite` }}
            />
          ))}
          <ellipse cx="300" cy="260" rx="420" ry="90" fill="#8b5cf6" opacity="0.18" filter="url(#blur40)" />
          <ellipse cx="1150" cy="200" rx="380" ry="80" fill="#2dd4bf" opacity="0.12" filter="url(#blur40)" />
        </motion.g>

        <motion.g style={{ y: sunY }}>
          <circle cx="720" cy="560" r="260" fill="url(#sun)" opacity="0.55" />
          <circle cx="720" cy="560" r="78" fill="#ffd27a" opacity="0.95" />
        </motion.g>

        {!reduce && (
          <g opacity="0.75">
            <path id="flight" d="M-40 360 C 300 220, 620 420, 900 260 S 1350 180, 1500 260" fill="none" stroke="white" strokeOpacity="0.35" strokeWidth="1.5" strokeDasharray="2 9" />
            <g>
              <path d="M-7 -3 L7 0 L-7 3 L-4 0Z" fill="white" />
              <animateMotion dur="16s" repeatCount="indefinite" rotate="auto">
                <mpath href="#flight" />
              </animateMotion>
            </g>
          </g>
        )}

        {LAYERS.map((l, i) => (
          <motion.path key={i} d={l.d} fill={l.fill} style={{ y: layerY[i] }} />
        ))}
        <rect y="860" width="1440" height="60" fill="#070a14" />
      </svg>

      <motion.div style={{ y: contentY, opacity: contentOpacity }} className="mx-auto w-full max-w-6xl px-4 pt-28 pb-40 sm:px-6">
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="glass mb-6 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium text-white/80"
        >
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-mint opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-mint" />
          </span>
          Live weather · alerts · holidays · real places — planned by Claude
        </motion.p>

        <h1 className="font-display text-[clamp(2.6rem,7vw,5.6rem)] leading-[0.98] font-semibold tracking-tight text-white">
          {headline.map((w, i) => (
            <motion.span
              key={w}
              className="mr-[0.25em] inline-block"
              initial={{ opacity: 0, y: 40, filter: "blur(8px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 0.8, delay: 0.1 + i * 0.08, ease: [0.16, 1, 0.3, 1] }}
            >
              {w}
            </motion.span>
          ))}
          <motion.span
            className="text-gradient inline-block italic"
            initial={{ opacity: 0, y: 40, filter: "blur(8px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.9, delay: 0.55, ease: [0.16, 1, 0.3, 1] }}
          >
            right now.
          </motion.span>
        </h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.75 }}
          className="mt-6 max-w-2xl text-lg leading-relaxed text-white/75"
        >
          Waypoint reads the 16-day forecast, local holidays and safety alerts, maps real sights within 100&nbsp;km, then
          streams a budget-true, day-by-day plan you can drag, tweak and take with you.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.9 }}
          className="mt-8 flex flex-wrap items-center gap-3"
        >
          <Button variant="primary" size="lg" icon={Sparkles} onClick={() => go()}>
            Plan my trip
          </Button>
          <span className="text-sm text-white/55">or try</span>
          {EXAMPLES.map((ex) => (
            <Button key={ex.label} variant="ghost" size="md" onClick={() => go(ex)}>
              {ex.label}
            </Button>
          ))}
        </motion.div>

        <motion.ul
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 1.1 }}
          className="mt-12 grid max-w-2xl grid-cols-1 gap-3 text-sm text-white/70 sm:grid-cols-3"
        >
          {[
            [CloudSun, "Days reordered around the forecast, with a rain Plan B"],
            [MapPinned, "Nearby, day-trip and hidden-gem rings up to 100 km"],
            [Wallet, "Live budget with a 10% buffer and a “make it cheaper” button"],
          ].map(([Icon, text]) => (
            <li key={text} className="flex items-start gap-2">
              <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-sun" />
              {text}
            </li>
          ))}
        </motion.ul>
      </motion.div>

      <motion.a
        href="#plan"
        aria-label="Scroll to the planner"
        className="absolute bottom-8 left-1/2 -translate-x-1/2 rounded-full p-2 text-white/60 hover:text-white"
        animate={reduce ? undefined : { y: [0, 8, 0] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
      >
        <ArrowDown className="size-6" />
      </motion.a>
    </header>
  );
}
