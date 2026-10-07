import { useEffect } from "react";
import { motion, useReducedMotion, useSpring, useTransform } from "framer-motion";

/** Smoothly tweens between values — used for every live-updating cost. */
export default function AnimatedNumber({ value, format = (v) => Math.round(v).toLocaleString(), className }) {
  const reduce = useReducedMotion();
  const spring = useSpring(value, { stiffness: 140, damping: 22, mass: 0.6 });
  useEffect(() => {
    if (reduce) spring.jump(value);
    else spring.set(value);
  }, [value, reduce, spring]);
  const text = useTransform(spring, (v) => format(v));
  return (
    <motion.span className={className} aria-live="off">
      {text}
    </motion.span>
  );
}
