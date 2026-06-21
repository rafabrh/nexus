import type { Variants } from 'framer-motion';

// Cinematic easing curves
const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;
const SPRING_SOFT = { type: 'spring', stiffness: 380, damping: 32 } as const;
const SPRING_POP = { type: 'spring', stiffness: 460, damping: 26 } as const;

// ---- Page navigation: more expressive (depth via scale + lift) ----
export const pageTransition: Variants = {
  initial: { opacity: 0, y: 14, scale: 0.985 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -10, scale: 0.99 },
};

export const pageTransitionConfig = {
  duration: 0.42,
  ease: EASE_OUT_EXPO,
};

// ---- Staggered lists: more perceptible cascade ----
export const staggerContainer: Variants = {
  animate: {
    transition: { staggerChildren: 0.05, delayChildren: 0.08 },
  },
};

export const staggerItem: Variants = {
  initial: { opacity: 0, y: 10 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.32, ease: EASE_OUT_EXPO },
  },
};

export const cardEntrance: Variants = {
  initial: { opacity: 0, scale: 0.96, y: 10 },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0.38, ease: EASE_OUT_EXPO },
  },
};

export const slideInRight: Variants = {
  initial: { x: '100%', opacity: 0 },
  animate: {
    x: 0,
    opacity: 1,
    transition: { duration: 0.34, ease: EASE_OUT_EXPO },
  },
  exit: {
    x: '100%',
    opacity: 0,
    transition: { duration: 0.28, ease: EASE_OUT_EXPO },
  },
};

export const feedEntry: Variants = {
  initial: { opacity: 0, x: -14, scale: 0.97 },
  animate: {
    opacity: 1,
    x: 0,
    scale: 1,
    transition: SPRING_SOFT,
  },
};

export const modalOverlay: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.2 } },
};

export const modalContent: Variants = {
  initial: { opacity: 0, scale: 0.95, y: 12 },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0.28, ease: EASE_OUT_EXPO },
  },
  exit: {
    opacity: 0,
    scale: 0.97,
    y: 6,
    transition: { duration: 0.2 },
  },
};

// ---- Conversation: messages pop in with a spring for a tactile feel ----
export const messageIncoming: Variants = {
  initial: { opacity: 0, x: -12, scale: 0.94 },
  animate: {
    opacity: 1,
    x: 0,
    scale: 1,
    transition: SPRING_SOFT,
  },
};

export const messageOutgoing: Variants = {
  initial: { opacity: 0, x: 12, scale: 0.94 },
  animate: {
    opacity: 1,
    x: 0,
    scale: 1,
    transition: SPRING_POP,
  },
};

// ---- AI: the assistant's reply lands with a subtle violet glow ----
export const aiMessageEntrance: Variants = {
  initial: { opacity: 0, y: 10, scale: 0.95, boxShadow: '0 0 0px rgba(139,92,246,0)' },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    boxShadow: [
      '0 0 0px rgba(139,92,246,0)',
      '0 0 28px rgba(139,92,246,0.35)',
      '0 0 0px rgba(139,92,246,0)',
    ],
    transition: { duration: 0.7, ease: EASE_OUT_EXPO, boxShadow: { duration: 1.1 } },
  },
};
