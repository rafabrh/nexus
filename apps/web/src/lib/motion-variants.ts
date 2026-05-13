import type { Variants } from 'framer-motion';

export const pageTransition: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
};

export const pageTransitionConfig = {
  duration: 0.3,
  ease: [0.16, 1, 0.3, 1] as const,
};

export const staggerContainer: Variants = {
  animate: {
    transition: { staggerChildren: 0.04, delayChildren: 0.06 },
  },
};

export const staggerItem: Variants = {
  initial: { opacity: 0, y: 6 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] },
  },
};

export const cardEntrance: Variants = {
  initial: { opacity: 0, scale: 0.97, y: 8 },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] },
  },
};

export const slideInRight: Variants = {
  initial: { x: '100%', opacity: 0 },
  animate: {
    x: 0,
    opacity: 1,
    transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] },
  },
  exit: {
    x: '100%',
    opacity: 0,
    transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] },
  },
};

export const feedEntry: Variants = {
  initial: { opacity: 0, x: -12, scale: 0.98 },
  animate: {
    opacity: 1,
    x: 0,
    scale: 1,
    transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] },
  },
};

export const modalOverlay: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.2 } },
};

export const modalContent: Variants = {
  initial: { opacity: 0, scale: 0.95, y: 10 },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] },
  },
  exit: {
    opacity: 0,
    scale: 0.97,
    y: 5,
    transition: { duration: 0.2 },
  },
};

export const messageIncoming: Variants = {
  initial: { opacity: 0, x: -8 },
  animate: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] },
  },
};

export const messageOutgoing: Variants = {
  initial: { opacity: 0, x: 8 },
  animate: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] },
  },
};
