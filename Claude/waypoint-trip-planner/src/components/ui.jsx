import { forwardRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  HelpCircle,
  Moon,
  Sun,
} from "lucide-react";
import { wmoKind } from "../../shared/weather.js";

export const cx = (...xs) => xs.filter(Boolean).join(" ");

export function Reveal({ children, delay = 0, className, as = "div", y = 28 }) {
  const reduce = useReducedMotion();
  const Comp = motion[as] ?? motion.div;
  return (
    <Comp
      className={className}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </Comp>
  );
}

export function SectionHeader({ eyebrow, title, children, id }) {
  return (
    <Reveal className="mb-8 max-w-3xl">
      {eyebrow && <p className="eyebrow mb-3">{eyebrow}</p>}
      <h2 id={id} className="section-title">
        {title}
      </h2>
      {children && <div className="mt-3 text-base leading-relaxed text-white/70">{children}</div>}
    </Reveal>
  );
}

export const Card = forwardRef(function Card({ className, children, strong, ...rest }, ref) {
  return (
    <div ref={ref} className={cx(strong ? "glass-strong" : "glass", "rounded-2xl", className)} {...rest}>
      {children}
    </div>
  );
});

const BUTTON_VARIANTS = {
  primary:
    "bg-gradient-to-r from-sun to-coral text-ink-950 font-semibold shadow-[0_10px_30px_-10px_rgb(255_122_89/0.7)] hover:brightness-110",
  ghost: "border border-white/15 bg-white/[0.05] text-white hover:bg-white/[0.1]",
  subtle: "text-white/75 hover:bg-white/[0.07] hover:text-white",
  danger: "border border-red-400/30 bg-red-500/10 text-red-100 hover:bg-red-500/20",
};

export const Button = forwardRef(function Button(
  { variant = "ghost", size = "md", className, children, icon: Icon, ...rest },
  ref,
) {
  const sizes = { sm: "h-8 px-3 text-xs gap-1.5", md: "h-10 px-4 text-sm gap-2", lg: "h-12 px-6 text-base gap-2.5" };
  return (
    <motion.button
      ref={ref}
      whileTap={{ scale: 0.97 }}
      className={cx(
        "inline-flex items-center justify-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-50",
        sizes[size],
        BUTTON_VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {Icon && <Icon aria-hidden className={size === "sm" ? "size-3.5" : "size-4"} />}
      {children}
    </motion.button>
  );
});

export function Chip({ selected, onClick, children, className }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cx(
        "rounded-full border px-3 py-1.5 text-sm transition",
        selected ? "border-sun/70 bg-sun/15 text-white" : "border-white/12 bg-white/[0.03] text-white/70 hover:border-white/25 hover:text-white",
        className,
      )}
    >
      {children}
    </button>
  );
}

const BADGE_TONES = {
  neutral: "bg-white/[0.07] text-white/75 border-white/10",
  good: "bg-emerald-400/12 text-emerald-200 border-emerald-300/20",
  warn: "bg-amber-400/12 text-amber-200 border-amber-300/25",
  bad: "bg-red-500/12 text-red-200 border-red-300/25",
  info: "bg-sky-400/12 text-sky-200 border-sky-300/20",
  gem: "bg-violet-400/14 text-violet-200 border-violet-300/25",
};

export function Badge({ tone = "neutral", children, className, icon: Icon, title }) {
  return (
    <span
      title={title}
      className={cx("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium", BADGE_TONES[tone], className)}
    >
      {Icon && <Icon aria-hidden className="size-3" />}
      {children}
    </span>
  );
}

export function Skeleton({ className }) {
  return <div aria-hidden className={cx("shimmer rounded-xl", className)} />;
}

export function WeatherIcon({ code, isDay = true, className = "size-5" }) {
  const kind = wmoKind(code);
  const props = { className, "aria-hidden": true };
  switch (kind) {
    case "clear":
      return isDay ? <Sun {...props} className={cx(className, "text-sun")} /> : <Moon {...props} className={cx(className, "text-sky-200")} />;
    case "partly":
      return <CloudSun {...props} className={cx(className, "text-amber-200")} />;
    case "cloudy":
      return <Cloud {...props} className={cx(className, "text-slate-300")} />;
    case "fog":
      return <CloudFog {...props} className={cx(className, "text-slate-300")} />;
    case "rain":
      return code < 60 ? (
        <CloudDrizzle {...props} className={cx(className, "text-sky-300")} />
      ) : (
        <CloudRain {...props} className={cx(className, "text-sky-300")} />
      );
    case "snow":
      return <CloudSnow {...props} className={cx(className, "text-white")} />;
    case "storm":
      return <CloudLightning {...props} className={cx(className, "text-violet-300")} />;
    default:
      return <HelpCircle {...props} />;
  }
}

/** Accessible tab list (roving focus with arrow keys). */
export function Tabs({ tabs, value, onChange, label, className }) {
  const onKey = (e) => {
    const i = tabs.findIndex((t) => t.id === value);
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
      onChange(next.id);
      document.getElementById(`tab-${next.id}`)?.focus();
    }
  };
  return (
    <div role="tablist" aria-label={label} onKeyDown={onKey} className={cx("inline-flex flex-wrap gap-1 rounded-full bg-white/[0.05] p-1", className)}>
      {tabs.map((t) => (
        <button
          key={t.id}
          id={`tab-${t.id}`}
          role="tab"
          type="button"
          aria-selected={value === t.id}
          tabIndex={value === t.id ? 0 : -1}
          onClick={() => onChange(t.id)}
          className={cx(
            "relative rounded-full px-3.5 py-1.5 text-sm transition",
            value === t.id ? "text-ink-950" : "text-white/70 hover:text-white",
          )}
        >
          {value === t.id && (
            <motion.span layoutId={`tab-pill-${label}`} className="absolute inset-0 rounded-full bg-white" transition={{ type: "spring", bounce: 0.2, duration: 0.5 }} />
          )}
          <span className="relative z-10 inline-flex items-center gap-1.5">
            {t.icon && <t.icon aria-hidden className="size-3.5" />}
            {t.label}
            {t.count != null && <span className="opacity-60">{t.count}</span>}
          </span>
        </button>
      ))}
    </div>
  );
}

export function Unavailable({ children }) {
  return (
    <p className="flex items-start gap-2 rounded-xl border border-dashed border-white/15 px-3 py-2 text-sm text-white/60">
      <HelpCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
