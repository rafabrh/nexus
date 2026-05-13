# NEXUS Panel -- Complete Visual Design Specification
# Agent: DESIGN | Pipeline: HigherMind Build
# Date: 2026-05-13
# Status: SPECS_COMPLETAS

---

## 0. DESIGN PHILOSOPHY

This specification elevates NEXUS Panel from "functional dark dashboard" to a product that competes visually with Linear, Raycast, and Arc Browser. The principles:

1. **Material darkness** -- not flat black, but layered surfaces with subtle depth through glassmorphism, glow, and gradient
2. **Motion as information** -- every animation communicates state change, not decoration
3. **Density with breathing room** -- high information density (13px base) balanced by controlled whitespace and visual hierarchy through luminance
4. **Teal as energy** -- the primary teal is not a passive accent; it is a signal of life, intelligence, and activity in the system
5. **Dark-first, glow-accented** -- the darkness makes the light meaningful

References held as north star:
- Linear: information architecture, density, keyboard-first feel
- Arc Browser: vibrant glow on dark, animated color accents
- Raycast: hover states, command palette, micro-interactions
- Vercel: typographic precision, layout restraint
- Stripe: editorial whitespace, gradient subtlety
- Apple: material quality per pixel

---

## 1. DESIGN SYSTEM EXTENSIONS

### 1.1 New CSS Custom Properties (additions to globals.css)

```
/* Glassmorphism */
--glass-bg: rgba(20, 24, 32, 0.72);
--glass-border: rgba(255, 255, 255, 0.06);
--glass-blur: 16px;
--glass-blur-heavy: 24px;

/* Glow */
--glow-primary: 0 0 20px rgba(45, 212, 191, 0.15);
--glow-primary-strong: 0 0 40px rgba(45, 212, 191, 0.25);
--glow-success: 0 0 20px rgba(34, 197, 94, 0.15);
--glow-warning: 0 0 20px rgba(245, 158, 11, 0.15);
--glow-error: 0 0 20px rgba(239, 68, 68, 0.15);
--glow-info: 0 0 20px rgba(59, 130, 246, 0.15);

/* Gradients */
--gradient-primary: linear-gradient(135deg, #14B8A6, #10B981);
--gradient-primary-subtle: linear-gradient(135deg, rgba(20, 184, 166, 0.12), rgba(16, 185, 129, 0.06));
--gradient-surface: linear-gradient(180deg, #161B24, #141820);
--gradient-radial-hero: radial-gradient(ellipse at 50% 0%, rgba(45, 212, 191, 0.08) 0%, transparent 60%);
--gradient-mesh-login: radial-gradient(at 20% 80%, rgba(45, 212, 191, 0.06) 0%, transparent 50%), radial-gradient(at 80% 20%, rgba(16, 185, 129, 0.04) 0%, transparent 50%);

/* Extended shadows */
--shadow-glow-sm: 0 0 8px rgba(45, 212, 191, 0.1);
--shadow-glow-md: 0 0 20px rgba(45, 212, 191, 0.15);
--shadow-glow-lg: 0 0 40px rgba(45, 212, 191, 0.2);
--shadow-elevated: 0 8px 32px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.03);
--shadow-card-hover: 0 12px 40px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(45, 212, 191, 0.1);

/* New radius */
--radius-pill: 9999px;
--radius-lg: 12px;
--radius-xl: 16px;

/* Animation tokens */
--duration-instant: 100ms;
--duration-fast: 150ms;
--duration-normal: 200ms;
--duration-smooth: 300ms;
--duration-slow: 500ms;
--duration-dramatic: 800ms;
--ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
--ease-out-back: cubic-bezier(0.34, 1.56, 0.64, 1);
--ease-spring: cubic-bezier(0.175, 0.885, 0.32, 1.275);
--ease-in-out-smooth: cubic-bezier(0.4, 0, 0.2, 1);

/* Z-index scale */
--z-base: 0;
--z-sidebar: 40;
--z-topbar: 50;
--z-detail: 40;
--z-dropdown: 60;
--z-modal-overlay: 70;
--z-modal: 80;
--z-toast: 90;
--z-command-palette: 100;
```

### 1.2 Lenis Smooth Scroll -- Global Configuration

```
Lenis instance options:
  duration: 1.2
  easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t))  // easeOutExpo
  orientation: 'vertical'
  gestureOrientation: 'vertical'
  smoothWheel: true
  wheelMultiplier: 1
  touchMultiplier: 2
  infinite: false
```

Apply Lenis to: Feed page scroll, Dashboard page scroll, Kanban horizontal scroll override.
Do NOT apply to: Chat message-list (needs native scroll-to-bottom behavior), Sidebar conversation list (needs snap-feel), Modal content.

### 1.3 Framer Motion Global Variants

```
pageTransition:
  initial: { opacity: 0, y: 8 }
  animate: { opacity: 1, y: 0 }
  exit: { opacity: 0, y: -4 }
  transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] }

staggerContainer:
  animate: { transition: { staggerChildren: 0.04, delayChildren: 0.06 } }

staggerItem:
  initial: { opacity: 0, y: 6 }
  animate: { opacity: 1, y: 0 }
  transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] }

cardEntrance:
  initial: { opacity: 0, scale: 0.97, y: 8 }
  animate: { opacity: 1, scale: 1, y: 0 }
  transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] }

slideInRight:
  initial: { x: '100%', opacity: 0 }
  animate: { x: 0, opacity: 1 }
  exit: { x: '100%', opacity: 0 }
  transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] }

slideInLeft:
  initial: { x: '-100%', opacity: 0 }
  animate: { x: 0, opacity: 1 }
  exit: { x: '-100%', opacity: 0 }
  transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] }

modalOverlay:
  initial: { opacity: 0 }
  animate: { opacity: 1 }
  exit: { opacity: 0 }
  transition: { duration: 0.2 }

modalContent:
  initial: { opacity: 0, scale: 0.95, y: 10 }
  animate: { opacity: 1, scale: 1, y: 0 }
  exit: { opacity: 0, scale: 0.97, y: 5 }
  transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] }

feedEntry:
  initial: { opacity: 0, x: -12, scale: 0.98 }
  animate: { opacity: 1, x: 0, scale: 1 }
  transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] }

numberCounter (for GSAP):
  GSAP ScrollTrigger or onMount
  from: { innerText: 0 }
  to: { innerText: targetValue, duration: 1.2, ease: 'power2.out', snap: { innerText: 1 } }
```

---

## 2. LOGIN PAGE

### 2.1 Layout

Full viewport. Vertically and horizontally centered card. No sidebar, no topbar.

```
Structure:
  <div> -- viewport container, min-h-screen
    <div> -- background layer (gradient mesh + optional R3F particles)
    <div> -- centered card (max-w-[420px], w-full)
      <header> -- logo + wordmark
      <form> -- email input + submit button
      <footer> -- subtle "SHK GROUP.IA" text
```

**Background layer:**
- Base: var(--bg-base) #0C0F12
- Gradient mesh overlay: var(--gradient-mesh-login)
- GSAP animated gradient: two radial gradients that slowly drift position over 20s loop, subtle enough to be atmospheric, not distracting
  - Circle 1: rgba(45, 212, 191, 0.05), center starts at 30% 70%, drifts to 40% 60%
  - Circle 2: rgba(16, 185, 129, 0.03), center starts at 70% 30%, drifts to 60% 40%
  - GSAP timeline: yoyo: true, repeat: -1, duration: 20, ease: 'sine.inOut'
- Optional Three.js/R3F: subtle floating particles (50-80 particles, 1-2px diameter, teal with 0.1-0.3 opacity, drift speed 0.2-0.5 units/sec, depth-of-field blur). These are background decoration only. If performance is a concern, skip this layer entirely -- the gradient mesh alone is sufficient.

**Card:**
- Background: var(--glass-bg) rgba(20, 24, 32, 0.72)
- backdrop-filter: blur(var(--glass-blur)) saturate(1.2)
- Border: 1px solid var(--glass-border) rgba(255, 255, 255, 0.06)
- Border-radius: var(--radius-xl) 16px
- Box-shadow: var(--shadow-elevated)
- Padding: 40px
- Width: 100%, max-width: 420px

### 2.2 Card Content

**Logo section:**
- NEXUS wordmark: centered
  - Bot icon (Lucide): 32px, color #2DD4BF (primary-400)
  - "NEXUS" text: font-family Inter, weight 700, size 28px, line-height 1, letter-spacing -0.02em, color #E8ECF1
  - Below: "Panel" text: font-family Inter, weight 400, size 13px, color #505B6B, letter-spacing 0.04em, uppercase
  - Gap between icon and text: 10px (horizontal flex, centered)
  - Margin-bottom: 36px
  - GSAP: on mount, Bot icon scales from 0.8 to 1 with a subtle glow pulse (box-shadow animates from 0 to --glow-primary and back once), duration 1s, ease power2.out

**Heading:**
- "Entrar no painel": font-family Inter, weight 600, size 20px, line-height 1.3, color #E8ECF1, text-align center
- Margin-bottom: 4px

**Subheading:**
- "Insira seu email para receber o link de acesso": font-family Inter, weight 400, size 13px, line-height 1.5, color #8B95A5, text-align center
- Margin-bottom: 28px

**Email label:**
- "Email": font-family Inter, weight 500, size 12px, line-height 1, color #8B95A5, letter-spacing 0.02em
- Margin-bottom: 6px

**Email input:**
- Height: 44px
- Padding-left: 40px (icon space), padding-right: 16px
- Background: #141820 (bg-surface)
- Border: 1px solid #1E2530 (border-default)
- Border-radius: 8px (radius-card)
- Font: Inter 400 14px, color #E8ECF1
- Placeholder: "seu@email.com", color #505B6B
- Mail icon: 16px, positioned absolute left 14px, color #505B6B
- Focus state:
  - Border: 1px solid #0D9488 (primary-600)
  - Box-shadow: 0 0 0 3px rgba(13, 148, 136, 0.15)
  - Icon color transitions to #8B95A5
  - Transition: all 200ms var(--ease-out-expo)
- Error state:
  - Border: 1px solid rgba(239, 68, 68, 0.5)
  - Box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.1)
- Disabled: opacity 0.5, cursor not-allowed

**Submit button:**
- Margin-top: 20px
- Width: 100%
- Height: 44px
- Background: var(--gradient-primary) linear-gradient(135deg, #14B8A6, #10B981)
- Border: none
- Border-radius: 8px
- Font: Inter 500 14px, color #0C0F12 (text-inverse)
- Letter-spacing: 0.01em
- Cursor: pointer
- Default box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3)
- Hover state:
  - Box-shadow: var(--glow-primary), 0 4px 12px rgba(0, 0, 0, 0.4)
  - Transform: translateY(-1px)
  - Background shifts to: linear-gradient(135deg, #2DD4BF, #14B8A6)
  - Transition: all 200ms var(--ease-out-expo)
- Active state:
  - Transform: translateY(0)
  - Box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3)
  - Transition: all 100ms
- Disabled: opacity 0.5, no hover effects, cursor not-allowed
- Loading state:
  - Text becomes "Enviando..."
  - Loader2 icon (16px) with CSS spin animation (1s linear infinite)
  - Subtle pulse on button background: opacity oscillates 0.9--1.0, duration 1.5s, infinite

**Error message:**
- Margin-top: 16px
- Background: rgba(239, 68, 68, 0.08)
- Border: 1px solid rgba(239, 68, 68, 0.15)
- Border-radius: 6px
- Padding: 10px 12px
- Flex row, gap 8px
- AlertCircle icon: 14px, color #EF4444
- Text: Inter 400 12px, color #EF4444, line-height 1.4
- Framer Motion: animate in with { opacity: 0, y: -4 } -> { opacity: 1, y: 0 }, duration 200ms

**Success state (link sent):**
- Card content transitions via AnimatePresence
- Form exits: { opacity: 0, y: 8, scale: 0.98 }, duration 200ms
- Success enters: { opacity: 0, y: -8, scale: 0.98 } -> { opacity: 1, y: 0, scale: 1 }, duration 300ms, delay 100ms
- CheckCircle icon: 48px, color #22C55E, centered
  - GSAP: scale from 0.5 to 1 with ease 'back.out(1.7)', then a single glow pulse (box-shadow --glow-success fade in/out once)
- "Link enviado!" heading: Inter 600 20px, #E8ECF1, center
- Email display: Inter 500 13px, #E8ECF1, within secondary text #8B95A5
- "Usar outro email" ghost button: Inter 500 13px, #8B95A5, hover #E8ECF1, hover bg #1F2733, height 32px, border-radius 6px

**Footer:**
- Margin-top: 32px
- "SHK GROUP.IA": Inter 400 11px, #505B6B, text-align center, letter-spacing 0.06em, uppercase
- Opacity: 0.6

### 2.3 Responsiveness

- >= 768px: card at 420px, padding 40px
- < 768px: card full width with 16px horizontal margin, padding 28px 24px
- < 480px: padding 24px 20px, logo icon shrinks to 28px, heading to 18px

### 2.4 Page Entrance Animation

- Entire card: Framer Motion, initial { opacity: 0, y: 20, scale: 0.96 }, animate { opacity: 1, y: 0, scale: 1 }, transition { duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.1 }
- Logo icon: additional delay 0.2s, scale from 0.8

---

## 3. APP SHELL (TopBar + Layout)

### 3.1 TopBar

**Container:**
- Position: fixed, top 0, left 0, right 0
- Height: 48px
- z-index: var(--z-topbar) 50
- Background: var(--glass-bg) rgba(20, 24, 32, 0.72)
- backdrop-filter: blur(var(--glass-blur)) saturate(1.3)
- Border-bottom: 1px solid var(--glass-border) rgba(255, 255, 255, 0.06)
- Display: flex, align-items center

**Logo zone (left, w-80 = 320px):**
- Padding: 0 20px
- Flex-shrink: 0
- Bot icon: 20px, color #2DD4BF
- "NEXUS" text: Inter 600 14px, #E8ECF1, letter-spacing -0.01em
- "Panel" text: Inter 400 11px, #505B6B, margin-left 6px
- Gap between icon and NEXUS: 8px

**Navigation tabs (center, flex-1):**
- Display: flex, justify-content center, gap 2px
- Each tab:
  - Height: 48px (full topbar height)
  - Padding: 0 18px
  - Display: flex, align-items center
  - Font: Inter 500 13px
  - Inactive: color #8B95A5
  - Hover: color #E8ECF1, background rgba(31, 39, 51, 0.5)
  - Active: color #2DD4BF
  - Active indicator: absolute bottom-0, height 2px, background var(--gradient-primary), border-radius 2px 2px 0 0, inset horizontal 8px from edges
  - Framer Motion layoutId="tab-indicator" for the active indicator bar -- it slides between tabs smoothly
  - Transition: color 150ms ease-out

**Actions zone (right):**
- Padding: 0 16px
- Flex-shrink: 0
- Display: flex, align-items center, gap 10px

**Connection badge:**
- Display: flex, align-items center, gap 6px
- Padding: 4px 10px
- Border-radius: var(--radius-pill) 9999px
- Font: Inter 500 11px, letter-spacing 0.02em
- Connected: bg rgba(34, 197, 94, 0.08), color #22C55E, border 1px solid rgba(34, 197, 94, 0.15)
  - Dot: 6px circle, bg #22C55E, with CSS pulse-ring animation (existing)
  - Wifi icon: 13px
- Disconnected: bg rgba(239, 68, 68, 0.08), color #EF4444, border 1px solid rgba(239, 68, 68, 0.15)
  - Dot: 6px circle, bg #EF4444, no pulse
  - WifiOff icon: 13px

**Notification button:**
- Width: 32px, height: 32px
- Border-radius: 8px
- Background: transparent
- Border: 1px solid #1E2530
- Display: flex, align-items center, justify-content center
- Bell icon: 15px, color #8B95A5
- Hover: bg #1F2733, border-color #2A3545, icon color #E8ECF1
- Badge (count > 0):
  - Position absolute, top -4px, right -4px
  - Min-width: 16px, height: 16px
  - Border-radius: 9999px
  - Background: #EF4444
  - Font: Inter 600 10px, color white
  - Padding: 0 4px
  - Border: 2px solid #141820 (creates separation from button)
  - GSAP: on new notification, badge scales from 0.5 to 1.15 to 1.0 with ease 'back.out(2)', duration 400ms
- Transition: all 150ms ease-out

### 3.2 App Layout Wrapper

- Main content area: padding-top 48px (topbar height)
- Background: #0C0F12
- Framer Motion AnimatePresence on page changes with pageTransition variants
- Lenis smooth scroll wrapper around scrollable pages (Dashboard, Feed)

---

## 4. CONVERSATIONS PAGE

### 4.1 Page Layout

```
Full height: calc(100vh - 48px)
Display: flex

  [Sidebar 320px fixed] | [Chat Area flex-1] | [Detail Panel 380px, conditional, animated]
```

### 4.2 Sidebar (Conversation List)

**Container:**
- Position: fixed, top 48px, left 0, bottom 0
- Width: 320px
- Background: var(--glass-bg) with backdrop-filter blur(12px) saturate(1.2)
- Border-right: 1px solid var(--glass-border)
- z-index: var(--z-sidebar)
- Display: flex, flex-direction column
- Transition for collapsed state: width 300ms var(--ease-out-expo)

**Search section:**
- Padding: 12px
- Search input container:
  - Position: relative
  - Height: 36px
  - Background: #0C0F12 (bg-base) -- darker than sidebar to create depth
  - Border: 1px solid #1E2530
  - Border-radius: 8px
  - Transition: all 200ms ease-out
  - Focus-within: border-color #0D9488, box-shadow 0 0 0 3px rgba(13, 148, 136, 0.1)
  - Search icon: 14px, absolute left 12px, color #505B6B, transitions to #8B95A5 on focus
  - Input: padding-left 34px, padding-right 12px, Inter 400 13px, color #E8ECF1, placeholder #505B6B
  - Keyboard shortcut hint: absolute right 12px, "Ctrl+K" text, Inter 400 10px, color #505B6B, bg #1A2029, padding 1px 5px, border-radius 3px, border 1px solid #1E2530 -- hidden on focus

**Filter chips:**
- Padding: 0 12px 10px
- Display: flex, gap 4px
- Each chip:
  - Padding: 4px 12px
  - Border-radius: 9999px (pill)
  - Font: Inter 500 11px, letter-spacing 0.01em
  - Inactive: color #505B6B, bg transparent, border 1px solid transparent
  - Hover: color #8B95A5, bg rgba(31, 39, 51, 0.4)
  - Active: color #2DD4BF, bg rgba(45, 212, 191, 0.08), border 1px solid rgba(45, 212, 191, 0.12)
  - "Hot" chip when active: color #F59E0B, bg rgba(245, 158, 11, 0.08), border 1px solid rgba(245, 158, 11, 0.12)
  - Transition: all 150ms ease-out
  - Framer Motion: layoutId per-chip for smooth active state transition (background pill morphs between tabs)

**Conversation list:**
- Flex: 1, overflow-y auto (native scroll, not Lenis)
- Scrollbar: existing 4px styling
- Framer Motion staggerContainer on list render

**Conversation item:**
- Padding: 10px 12px
- Display: flex, gap 10px
- Border-radius: 6px
- Margin: 0 6px 1px (inset from sidebar edges -- gives rounded selection a visible margin)
- Cursor: pointer
- Transition: all 150ms ease-out

- **Default state:**
  - Background: transparent
  - Border-left: 2px solid transparent

- **Hover state:**
  - Background: rgba(31, 39, 51, 0.5)
  - Border-left: 2px solid transparent (still)

- **Selected state:**
  - Background: rgba(37, 48, 64, 0.6)
  - Border-left: 2px solid #14B8A6
  - Subtle glow: box-shadow inset 0 0 0 0.5px rgba(45, 212, 191, 0.06)

- **Hot lead (isHot) additional:**
  - Border-left: 2px solid #F59E0B (overrides default/selected border-left)
  - When also selected: border-left stays #F59E0B but background is selected bg

- **Avatar:**
  - Width: 38px, height: 38px
  - Border-radius: 50%
  - Background: linear-gradient(135deg, #1A2029, #1F2733)
  - Font: Inter 500 12px, color #8B95A5, centered
  - Flex-shrink: 0
  - On hover (parent): subtle border 1px solid rgba(255, 255, 255, 0.06)

- **Content:**
  - Flex: 1, min-width 0 (for truncation)
  - Row 1: name + timestamp
    - Name: Inter 500 13px, #E8ECF1, truncate, flex 1
    - Flame icon (if hot): 11px, color #F59E0B, flex-shrink 0, margin-left 4px
      - GSAP: subtle pulse opacity 0.7-1.0, duration 2s, infinite, ease sine.inOut
    - Timestamp: Inter 400 11px, #505B6B, flex-shrink 0, margin-left 8px
  - Row 2: message preview
    - Inter 400 12px, #505B6B, truncate single line, margin-top 2px
  - Row 3: badges
    - Margin-top 6px
    - Display: flex, gap 4px, align-items center
    - AI badge: existing badge component but with enhanced styling:
      - success (ON): bg rgba(34, 197, 94, 0.1), color #22C55E, border 1px solid rgba(34, 197, 94, 0.15), text "IA"
      - warning (PAUSED): bg rgba(245, 158, 11, 0.1), color #F59E0B, text "Pausa"
      - default (OFF): bg rgba(80, 91, 107, 0.1), color #505B6B, text "OFF"
    - Stage badge: uses stage.color for text, bg is stageColor at 10% opacity, border 1px solid stageColor at 12% opacity
    - Font for all badges: Inter 500 10px, letter-spacing 0.02em, padding 2px 7px, border-radius 4px

- **Framer Motion per-item:**
  - staggerItem variant (opacity 0, y 6 -> opacity 1, y 0)
  - On selection change: the selected item background transitions via layout animation

- **AI Thinking state (overlay on item when ai.thinking event):**
  - A subtle 2px tall gradient bar at the bottom of the item, animating left-to-right, colors #3B82F6 -> #2DD4BF -> transparent
  - GSAP: translateX from -100% to 100%, duration 1.5s, repeat infinite, ease linear

**Sidebar footer:**
- Padding: 8px 16px
- Border-top: 1px solid rgba(255, 255, 255, 0.04)
- Background: rgba(20, 24, 32, 0.5)
- Text: Inter 400 11px, #505B6B
- "{n} conversas" count

**Empty state:**
- Centered in list area
- Icon: MessageCircle 24px, color #505B6B, opacity 0.5
- Text: Inter 400 13px, #505B6B, "Nenhuma conversa encontrada"
- Framer Motion: fade in, duration 300ms

**Skeleton loading:**
- 6 skeleton items
- Avatar: 38px circle, skeleton shimmer
- Name line: h-3 w-24, skeleton
- Preview line: h-3 w-40, skeleton
- Enhanced shimmer: gradient uses rgba(45, 212, 191, 0.03) as the bright pass instead of just bg-hover
- Stagger delay: 50ms per item

### 4.3 Chat Area

**Container:**
- Flex: 1
- Margin-left: 320px (sidebar width)
- Transition margin-right: 300ms var(--ease-out-expo) when detail panel toggles
- When detail panel open: margin-right 380px
- Display: flex, flex-direction column
- Background: #0C0F12 (bg-base)

#### 4.3.1 Chat Header

**Container:**
- Height: 56px
- Flex-shrink: 0
- Display: flex, align-items center, justify-content space-between
- Padding: 0 20px
- Background: var(--glass-bg) rgba(20, 24, 32, 0.72)
- backdrop-filter: blur(12px) saturate(1.2)
- Border-bottom: 1px solid rgba(255, 255, 255, 0.04)

**Left section:**
- Display: flex, align-items center, gap 12px
- Avatar: 34px circle, same style as sidebar
- Name: Inter 500 14px, #E8ECF1
- Flame icon (if hot): 12px, #F59E0B, margin-left 4px
- Phone number: Inter (JetBrains Mono) 400 11px, #505B6B, margin-top 2px
- Stage badge: inline, same as sidebar badges

**Right section:**
- Display: flex, align-items center, gap 8px
- AI status pill:
  - Display: flex, align-items center, gap 6px
  - Padding: 4px 10px
  - Border-radius: 9999px
  - Status dot: 7px circle
    - ON: bg #22C55E with pulse-ring animation
    - PAUSED: bg #F59E0B, no pulse
    - OFF: bg #505B6B, no pulse
    - THINKING: bg #3B82F6 with pulse-ring animation
  - Text: Inter 500 11px
  - Background: respective color at 8% opacity
  - Border: 1px solid respective color at 12% opacity
- Detail panel toggle button:
  - 32px x 32px, border-radius 6px
  - Bg transparent
  - Icon: PanelRightOpen/Close 16px, #8B95A5
  - Hover: bg #1F2733, icon #E8ECF1
  - Active (panel open): bg rgba(45, 212, 191, 0.08), icon #2DD4BF
  - Transition: all 150ms

#### 4.3.2 Message List

**Container:**
- Flex: 1, overflow-y auto (native scroll)
- Padding: 20px 24px
- Background: #0C0F12
- Radial gradient at bottom: from transparent to rgba(12, 15, 18, 0.95) -- creates depth near input

**Message bubbles:**

Incoming (user/client, left-aligned):
- Max-width: 65%
- Background: #1A2029 (bg-elevated)
- Border: 1px solid rgba(255, 255, 255, 0.04)
- Border-radius: 4px 12px 12px 12px (sharp top-left = tail side)
- Padding: 10px 14px
- Font: Inter 400 13px, line-height 1.55, color #E8ECF1
- Timestamp: Inter 400 10px, #505B6B, margin-top 4px
- Margin-bottom: 3px

Outgoing (AI/operator, right-aligned):
- Max-width: 65%
- Background: linear-gradient(135deg, rgba(13, 148, 136, 0.15), rgba(16, 185, 129, 0.08))
- Border: 1px solid rgba(45, 212, 191, 0.1)
- Border-radius: 12px 4px 12px 12px (sharp top-right = tail side)
- Padding: 10px 14px
- Font: Inter 400 13px, line-height 1.55, color #E8ECF1
- Timestamp: Inter 400 10px, rgba(45, 212, 191, 0.4), margin-top 4px
- Margin-bottom: 3px

**Media indicator (audio/image/document):**
- Display: flex, align-items center, gap 6px
- Icon: 14px, color #505B6B
- Label: Inter 400 11px, #505B6B
- Margin-bottom: 4px

**Typing indicator:**
- Align left
- Container: bg #1A2029, border 1px solid rgba(255, 255, 255, 0.04), border-radius 4px 12px 12px 12px
- Padding: 10px 16px
- Three dots:
  - Each: 5px diameter, border-radius 50%
  - Color: #2DD4BF (primary accent -- signals IA is thinking)
  - Gap: 4px
  - Animation: existing typing-bounce with refined timing
  - Dot 1: delay 0ms
  - Dot 2: delay 150ms
  - Dot 3: delay 300ms
  - Above dots: label "NEXUS IA", Inter 500 10px, #505B6B, letter-spacing 0.03em, margin-bottom 4px
- Framer Motion: fade in + slideUp on appear, fade out on disappear, duration 200ms

**Date separator (between message groups):**
- Margin: 20px 0 16px
- Display: flex, align-items center, gap 12px
- Line: flex 1, height 1px, bg rgba(255, 255, 255, 0.04)
- Date text: Inter 400 10px, #505B6B, letter-spacing 0.04em, uppercase, white-space nowrap, padding 0 4px

**New message animation (Framer Motion):**
- Messages entering viewport:
  - Incoming: initial { opacity: 0, x: -8 }, animate { opacity: 1, x: 0 }, duration 250ms
  - Outgoing: initial { opacity: 0, x: 8 }, animate { opacity: 1, x: 0 }, duration 250ms

**Empty state:**
- Centered column
- Icon container: 64px circle, bg #141820, border 1px solid #1E2530
  - MessageCircle icon: 24px, #505B6B
- Text: "Nenhuma mensagem", Inter 400 14px, #505B6B, margin-top 16px
- Framer Motion: scale from 0.95, opacity from 0, duration 400ms

**Skeleton:**
- 5 skeleton bubbles, alternating left/right
- Widths: random 30-60%
- Heights: random 36-56px
- Enhanced shimmer with teal tint
- Stagger: 60ms

#### 4.3.3 Message Input

**Container:**
- Flex-shrink: 0
- Background: var(--glass-bg)
- backdrop-filter: blur(12px) saturate(1.2)
- Border-top: 1px solid rgba(255, 255, 255, 0.04)

**AI warning bar (when AI is ON):**
- Padding: 6px 16px
- Background: rgba(245, 158, 11, 0.04)
- Border-bottom: 1px solid rgba(245, 158, 11, 0.08)
- Display: flex, align-items center, gap 8px
- AlertTriangle icon: 12px, #F59E0B
- Text: Inter 400 11px, #F59E0B, opacity 0.9
- Framer Motion: slideDown on appear (height 0 -> auto, opacity 0 -> 1, duration 200ms)

**Quick replies dropdown:**
- Positioned above input area
- Background: #141820
- Border: 1px solid #1E2530
- Border-radius: 8px 8px 0 0
- Box-shadow: 0 -8px 24px rgba(0, 0, 0, 0.3)
- Max-height: 200px, overflow-y auto
- Each item:
  - Padding: 8px 16px
  - Name: Inter 500 12px, #E8ECF1
  - Shortcut: JetBrains Mono 400 11px, #505B6B, margin-left 8px
  - Preview: Inter 400 11px, #505B6B, truncate, margin-top 2px
  - Hover: bg #1F2733
  - Transition: bg 100ms
- Framer Motion: enter from bottom, scaleY from 0.95, opacity from 0, origin-bottom, duration 200ms

**Input row:**
- Padding: 10px 12px
- Display: flex, align-items flex-end, gap 8px

**Quick reply toggle button:**
- 34px x 34px, border-radius 8px
- Inactive: bg transparent, Zap icon 16px, #505B6B
- Hover: bg #1F2733, icon #8B95A5
- Active (dropdown open): bg rgba(45, 212, 191, 0.08), icon #2DD4BF, border 1px solid rgba(45, 212, 191, 0.1)
- Transition: all 150ms

**Textarea:**
- Flex: 1
- Min-height: 38px, max-height: 120px
- Resize: none
- Background: #0C0F12 (darker than glass bg for depth)
- Border: 1px solid #1E2530
- Border-radius: 10px
- Padding: 9px 14px
- Font: Inter 400 13px, line-height 1.5, color #E8ECF1
- Placeholder: "Digite uma mensagem...", color #505B6B
- Focus: border-color #0D9488, box-shadow 0 0 0 3px rgba(13, 148, 136, 0.1)
- Transition: border-color 200ms, box-shadow 200ms

**Send button:**
- 34px x 34px, border-radius 8px
- Empty input: bg #141820, Send icon 16px, #505B6B, cursor default
- Has text: bg var(--gradient-primary), Send icon 16px, #0C0F12
  - Hover: box-shadow var(--glow-primary), transform translateY(-1px)
  - Active: transform translateY(0)
  - Framer Motion: when transitioning from disabled to enabled, scale from 0.9 to 1 with spring ease
- Transition: all 200ms var(--ease-out-expo)

### 4.4 Detail Panel

**Container:**
- Position: fixed, top 48px, right 0, bottom 0
- Width: 380px
- z-index: var(--z-detail)
- Background: var(--glass-bg) rgba(20, 24, 32, 0.72)
- backdrop-filter: blur(var(--glass-blur)) saturate(1.2)
- Border-left: 1px solid var(--glass-border)
- Display: flex, flex-direction column
- Overflow-y: auto
- Framer Motion: slideInRight variant (x 100% -> 0, duration 300ms, ease out-expo)

**Header:**
- Height: 48px
- Padding: 0 16px
- Display: flex, align-items center, justify-content space-between
- Border-bottom: 1px solid rgba(255, 255, 255, 0.04)
- "Detalhes" text: Inter 600 13px, #E8ECF1
- Close button: 28px x 28px, border-radius 6px, X icon 14px, #505B6B
  - Hover: bg #1F2733, icon #8B95A5

**Accordion sections:**

Each section:
- Border-bottom: 1px solid rgba(255, 255, 255, 0.04)
- Header button:
  - Width: 100%
  - Padding: 10px 16px
  - Display: flex, align-items center, gap 8px
  - Section icon: 14px, #505B6B
  - Title: Inter 500 12px, #8B95A5, flex 1, text-align left
  - Chevron: 14px, #505B6B
    - Framer Motion: rotate 0 -> 180deg on open/close, duration 200ms
  - Hover: bg rgba(31, 39, 51, 0.3), title color #E8ECF1
  - Transition: all 150ms
- Content:
  - Padding: 0 16px 14px
  - Framer Motion AnimatePresence: height auto animation
    - Enter: opacity 0, height 0 -> opacity 1, height auto, duration 250ms
    - Exit: opacity 0, height 0, duration 200ms

**Section: Lead Info**
- Key-value pairs, 2 per row in some cases
- Label: Inter 400 12px, #505B6B
- Value: Inter 400 12px, #E8ECF1
- Phone value: JetBrains Mono 400 11px, #E8ECF1
- Spacing between pairs: 8px
- Hot lead toggle: pill button
  - Hot active: bg rgba(245, 158, 11, 0.1), color #F59E0B, border 1px solid rgba(245, 158, 11, 0.12), Flame icon with glow
  - Not hot: bg #1A2029, color #505B6B, hover color #8B95A5

**Section: AI Control**
- Status display: inline badge (same as chat header AI pill)
- Timer countdown (if OFF_UNTIL): JetBrains Mono 500 12px, #F59E0B
- Three control buttons in a row, gap 6px:
  - Each: height 28px, border-radius 6px, font Inter 500 11px
  - "Ligar": when active green variant (bg rgba(34, 197, 94, 0.1), color #22C55E, border 1px solid rgba(34, 197, 94, 0.15))
  - "Pausar 30min": when active yellow variant
  - "Desligar": when active red variant
  - Inactive: bg #1A2029, color #505B6B, border 1px solid #1E2530, hover bg #1F2733, hover color #8B95A5
  - Transition: all 150ms
  - On click: Framer Motion scale 0.97 -> 1 spring

**Section: Funnel Stage**
- Vertical list of stages
- Each stage row:
  - Padding: 6px 8px
  - Border-radius: 6px
  - Display: flex, align-items center, gap 8px
  - Color dot: 8px circle, bg stageColor
  - Label: Inter 400 12px, #505B6B
  - Current stage: bg rgba of stageColor at 8%, label color #E8ECF1, border-left 2px solid stageColor
    - "atual" label: Inter 500 10px, #2DD4BF, margin-left auto
  - Hover (non-current): bg rgba(31, 39, 51, 0.3), color #8B95A5
  - Cursor: pointer
  - Transition: all 150ms
  - On stage change: Framer Motion layout animation, active indicator slides

**Section: Tags**
- Flex wrap, gap 4px
- Each tag: existing badge with enhanced styling
  - Background: rgba(45, 212, 191, 0.08)
  - Color: #2DD4BF
  - Border: 1px solid rgba(45, 212, 191, 0.1)
  - Padding: 3px 8px
  - Border-radius: 4px
  - Font: Inter 500 11px
  - Delete X: opacity 0, on tag hover opacity 1, 10px, clickable
  - Framer Motion: on add, scale from 0.8 + opacity from 0, duration 200ms; on remove, scale to 0.8 + opacity to 0, duration 150ms
- Input row: same pattern as existing, height 28px, text-xs

**Section: Notes**
- Max-height: 160px, overflow-y auto
- Each note:
  - Padding: 8px 10px
  - Background: #141820
  - Border: 1px solid rgba(255, 255, 255, 0.03)
  - Border-radius: 6px
  - Font: Inter 400 12px, #8B95A5, line-height 1.4
  - Delete button: opacity 0 on default, opacity 1 on hover (parent), Trash2 12px, #505B6B -> hover #EF4444
  - Margin-bottom: 4px
  - Framer Motion: staggerItem on mount, exit scale 0.95 opacity 0

**Section: Quick Replies**
- Same styling as notes section items
- Each reply card:
  - Name: Inter 500 12px, #E8ECF1
  - Content preview: Inter 400 11px, #505B6B, truncate, margin-top 2px
  - Hover: bg #1F2733, border-color #2A3545

**Section: Reminders**
- Same card pattern
- Each reminder:
  - Text: Inter 400 12px, #8B95A5
  - Trigger time: JetBrains Mono 400 11px, #505B6B
  - Status badge: tiny pill, pending=#F59E0B, fired=#22C55E, dismissed=#505B6B
- Create form:
  - Input + select + button in compact row
  - Select: styled native select, height 28px, bg #141820, border #1E2530, border-radius 6px, Inter 400 11px

### 4.5 Empty Chat (no conversation selected)

- Full area centered
- Icon container: 72px circle, bg linear-gradient(135deg, #141820, #1A2029), border 1px solid #1E2530
  - MessageCircle icon: 28px, #505B6B
  - Subtle glow: box-shadow 0 0 40px rgba(45, 212, 191, 0.05)
- "Selecione uma conversa": Inter 500 16px, #8B95A5, margin-top 20px
- Subtext: Inter 400 13px, #505B6B, max-width 280px, text-align center, margin-top 6px
- Framer Motion: fade in, duration 500ms, with scale from 0.98

---

## 5. DASHBOARD PAGE

### 5.1 Page Layout

- Padding: 28px 32px
- Max-width: 1440px, margin: 0 auto
- Lenis smooth scroll enabled
- Framer Motion pageTransition on mount

### 5.2 Page Header

- "Dashboard": Inter 600 24px, #E8ECF1, letter-spacing -0.02em
- Subtitle: Inter 400 13px, #505B6B, "Metricas em tempo real", margin-top 2px
- Right side: period selector (pill buttons: "Hoje" | "7d" | "30d"), same chip styling as sidebar filters
- Margin-bottom: 24px
- Framer Motion: staggerItem

### 5.3 KPI Cards Row

- Display: grid, grid-cols 1 (mobile) / 2 (sm) / 4 (lg)
- Gap: 16px
- Margin-bottom: 28px

**Each KPI card:**

Container:
- Background: var(--glass-bg) rgba(20, 24, 32, 0.72)
- backdrop-filter: blur(12px) saturate(1.2)
- Border: 1px solid var(--glass-border) rgba(255, 255, 255, 0.06)
- Border-radius: 12px (radius-lg)
- Padding: 20px
- Position: relative, overflow: hidden
- Transition: all 300ms var(--ease-out-expo)

Hover state:
- Border-color: accentColor at 20% opacity
- Box-shadow: 0 0 30px accentColor at 10% opacity (glow effect)
- Transform: translateY(-2px)
- The accent gradient becomes slightly more visible

Accent gradient overlay (GSAP):
- Position absolute, inset 0, pointer-events none
- Background: radial-gradient(ellipse at 30% 0%, accentColor at 6% opacity 0%, transparent 70%)
- On mount: GSAP animates opacity from 0 to 1, duration 0.8s, delay staggered per card
- On hover: opacity increases to 1.5x via GSAP

Icon container:
- Width: 40px, height: 40px
- Border-radius: 10px
- Background: accentColor at 10% opacity
- Border: 1px solid accentColor at 12% opacity
- Display: flex, centered
- Icon: 18px, color accentColor

Label:
- Inter 400 12px, #8B95A5, margin-top 14px, line-height 1

Value:
- Inter 700 28px, #E8ECF1, margin-top 6px, line-height 1, letter-spacing -0.02em
- GSAP number counter: on mount, animates from 0 to value over 1.2s with power2.out easing
  - For currency: formats during animation
  - For percentage: appends "%" during animation
  - For time (seconds): formats during animation
  - snap: { innerText: 1 } for integers, snap 0.1 for decimals

Subtitle:
- Inter 400 11px, #505B6B, margin-top 4px

Framer Motion: cardEntrance variant, staggered 80ms per card

**KPI card skeleton:**
- Same dimensions
- Glass bg without blur
- Shimmer on icon, value, label areas
- Staggered entrance

### 5.4 Content Grid (below KPIs)

- Display: grid, grid-cols 12 (lg), gap 20px
- Left column: col-span 7
- Right column: col-span 5
- Mobile: single column

#### 5.4.1 Funnel Chart

**Container:**
- Background: var(--glass-bg)
- backdrop-filter: blur(12px) saturate(1.2)
- Border: 1px solid var(--glass-border)
- Border-radius: 12px
- Padding: 24px

**Header:**
- "Funil de Vendas": Inter 600 14px, #E8ECF1
- Subtitle: Inter 400 11px, #505B6B, margin-top 2px
- Margin-bottom: 20px

**Funnel bars:**
- Each row: display flex, align-items center, gap 12px, margin-bottom 10px
- Stage label: Inter 400 12px, #505B6B, width 120px, truncate
- Bar container: flex 1, height 28px, bg #0C0F12, border-radius 6px, overflow hidden, border 1px solid rgba(255, 255, 255, 0.03)
- Bar fill:
  - Height: 100%, border-radius 6px
  - Background: linear-gradient(90deg, stageColor, stageColor at 80% opacity)
  - Min-width: 8px when count > 0
  - GSAP: on mount, width animates from 0% to percentage over 0.8s, staggered 0.1s per bar, ease power2.out
  - Hover: brightness 1.2, box-shadow 0 0 12px stageColor at 20% opacity
  - Transition: filter 200ms
- Count: Inter 600 12px, #E8ECF1, width 32px, text-align right

**Funnel bar skeleton:**
- 7 rows, each 28px bar with shimmer
- Labels: skeleton shimmer blocks

#### 5.4.2 Sales Table

**Container:**
- Same glass styling as funnel chart
- Padding: 24px

**Header:**
- "Vendas Recentes": Inter 600 14px, #E8ECF1
- Margin-bottom: 16px

**Table:**
- Width: 100%, border-collapse: separate, border-spacing: 0

Table header:
- Font: Inter 500 11px, #505B6B, letter-spacing 0.04em, uppercase
- Padding-bottom: 10px
- Border-bottom: 1px solid rgba(255, 255, 255, 0.04)
- Columns: Nome (left), Telefone (left), Valor (right), Quando (right)

Table rows:
- Padding: 10px 0
- Border-bottom: 1px solid rgba(255, 255, 255, 0.03) (except last)
- Hover: bg rgba(31, 39, 51, 0.3), border-radius 6px (visual only)
- Transition: bg 150ms
- Nome: Inter 400 13px, #E8ECF1
- Telefone: JetBrains Mono 400 11px, #505B6B
- Valor: Inter 600 13px, #22C55E
- Quando: Inter 400 11px, #505B6B

Framer Motion: staggerContainer on rows, staggerItem per row

**Empty state:**
- Centered text "Nenhuma venda registrada", Inter 400 13px, #505B6B
- Padding: 40px 0

#### 5.4.3 Activity List

**Container:**
- Same glass styling
- Padding: 24px

**Header:**
- "Atividade Recente": Inter 600 14px, #E8ECF1
- Right: live indicator
  - live-dot 6px circle #EF4444 with pulse animation
  - "AO VIVO": Inter 600 10px, #EF4444, letter-spacing 0.06em
  - Gap: 6px
- Margin-bottom: 16px

**Event list:**
- Max-height: 480px, overflow-y auto
- Each event row:
  - Padding: 6px 8px
  - Border-radius: 6px
  - Display: flex, align-items center, gap 10px
  - Hover: bg rgba(31, 39, 51, 0.3)
  - Transition: bg 100ms
  - Icon container: 28px x 28px, border-radius 6px, bg eventColor at 8%, centered
    - Icon: 13px, color eventColor
  - Label: Inter 400 12px, #E8ECF1, flex 1
  - Timestamp: Inter 400 10px, #505B6B

- New events animate in from top:
  - Framer Motion: initial { opacity: 0, y: -8, scale: 0.97 }, animate { opacity: 1, y: 0, scale: 1 }, duration 300ms
  - A brief glow flash on the icon container when new (GSAP: box-shadow animates from 0 to eventColor glow and back, duration 600ms)

**Empty state:**
- Centered column
- Radio icon: 24px, #505B6B
- Text: "Nenhuma atividade recente", Inter 400 13px, #505B6B
- Subtext: "Eventos aparecerrao em tempo real", Inter 400 11px, #505B6B

---

## 6. KANBAN BOARD PAGE

### 6.1 Page Layout

- Full height: calc(100vh - 48px)
- Overflow: hidden (no page scroll)
- Display: flex, flex-direction column

### 6.2 Kanban Header

- Padding: 16px 24px
- Display: flex, align-items center, justify-content space-between
- Background: var(--glass-bg), backdrop-filter blur(12px)
- Border-bottom: 1px solid rgba(255, 255, 255, 0.04)
- "Funil de Vendas": Inter 600 20px, #E8ECF1, letter-spacing -0.01em
- Subtitle: Inter 400 12px, #505B6B, margin-top 2px
- Right side: total leads count in a pill badge

### 6.3 Board Container

- Flex: 1, overflow-x auto (with Lenis horizontal scroll override or native with momentum)
- Padding: 16px 20px
- Display: flex, gap 12px
- Scroll-snap-type: x proximity
- Scroll-padding: 20px

### 6.4 Kanban Column

**Container:**
- Width: 280px
- Flex-shrink: 0
- Background: var(--glass-bg) rgba(20, 24, 32, 0.6)
- backdrop-filter: blur(8px) saturate(1.1)
- Border: 1px solid var(--glass-border)
- Border-radius: 12px
- Display: flex, flex-direction column
- Max-height: 100%
- Scroll-snap-align: start
- Transition: all 200ms

**Drop target state (when dragging over):**
- Border-color: stageColor at 40% opacity
- Box-shadow: inset 0 0 0 1px stageColor at 20%, 0 0 30px stageColor at 10%
- Background: stageColor at 3% opacity blended with glass bg
- A dashed 1px border in the card area: stageColor at 20%, border-radius 8px, 2px dash
- Transition: all 200ms

**Column header:**
- Padding: 14px 16px
- Border-bottom: 1px solid rgba(255, 255, 255, 0.04)
- Display: flex, align-items center, justify-content space-between
- Left: color dot (10px circle, bg stageColor, border 2px solid stageColor at 30%) + stage label (Inter 600 13px, #E8ECF1, margin-left 10px)
- Right: count pill (Inter 500 11px, #505B6B, bg #0C0F12, padding 2px 8px, border-radius 9999px, border 1px solid #1E2530)
- Below header: 2px line, width 100%, bg stageColor, opacity 0.3, border-radius 1px

**Card area:**
- Flex: 1, overflow-y auto
- Padding: 8px
- Display: flex, flex-direction column, gap 8px

**Empty column state:**
- Centered in card area
- Text: "Nenhum lead", Inter 400 12px, #505B6B
- Padding: 40px 0

**Column skeleton:**
- Header: shimmer on dot + label
- 3 card skeletons: 80px tall, shimmer

### 6.5 Kanban Card

**Container:**
- Background: #141820 (bg-surface, solid -- not glass, for draggability clarity)
- Border: 1px solid #1E2530
- Border-radius: 10px
- Padding: 12px
- Cursor: grab
- Transition: all 200ms var(--ease-out-expo)

**Default state:**
- As described above

**Hover state:**
- Border-color: #2A3545
- Box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.04)
- Transform: translateY(-1px)

**Dragging state (Framer Motion drag):**
- Scale: 1.03
- Box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(45, 212, 191, 0.15)
- Border-color: rgba(45, 212, 191, 0.2)
- Rotate: 2deg (subtle tilt)
- Cursor: grabbing
- z-index: 100
- Opacity: 0.95
- backdrop-filter: blur(2px) on the placeholder/ghost

**Card content:**
- Row 1: avatar + name + phone
  - Avatar: 30px circle, bg linear-gradient(135deg, #1A2029, #1F2733), Inter 500 10px, #8B95A5
  - Name: Inter 500 13px, #E8ECF1, truncate
  - Phone: JetBrains Mono 400 10px, #505B6B
  - Gap: 8px

- Row 2: badges (margin-top 8px)
  - Display: flex, gap 4px, flex-wrap wrap
  - Status badge: same enhanced styling as sidebar
  - Tag badges: first 2 tags, bg #1A2029, color #8B95A5, border 1px solid #1E2530, Inter 400 10px, padding 2px 6px, border-radius 4px
  - Overflow badge: "+N" same style

- Row 3: metadata (margin-top 8px)
  - Display: flex, justify-content space-between
  - Message count: Inter 400 11px, #505B6B
  - Last contact time: Inter 400 11px, #505B6B

**Framer Motion drag configuration:**
- Use framer-motion's drag="x" (between columns) or reorder capabilities
- dragConstraints: none (free drag)
- dragElastic: 0.1
- dragTransition: { bounceStiffness: 300, bounceDamping: 20 }
- whileDrag: { scale: 1.03, rotate: 2, boxShadow: dragging shadow }
- layout: true (for smooth reorder within columns)
- layoutTransition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] }

**Card entrance (on board load):**
- Framer Motion stagger within each column
- staggerChildren: 0.03
- Each card: cardEntrance variant

---

## 7. FEED PAGE

### 7.1 Page Layout

- Padding: 28px 32px
- Max-width: 800px, margin: 0 auto
- Lenis smooth scroll enabled

### 7.2 Feed Header

- Display: flex, align-items center, justify-content space-between
- Margin-bottom: 24px

**Left:**
- "Feed IA": Inter 600 24px, #E8ECF1, letter-spacing -0.02em
- "Eventos em tempo real do agente NEXUS": Inter 400 13px, #505B6B, margin-top 4px

**Right:**
- Live indicator (when connected):
  - Display: flex, align-items center, gap 8px
  - Live dot: 8px circle, #EF4444, with live-pulse animation
  - "AO VIVO": Inter 700 11px, #EF4444, letter-spacing 0.08em, uppercase
  - Container: padding 4px 12px, border-radius 9999px, bg rgba(239, 68, 68, 0.06), border 1px solid rgba(239, 68, 68, 0.12)
- Disconnected:
  - Same container but #505B6B colors
  - "DESCONECTADO" text
  - No pulse

### 7.3 Feed Entry Card

**Container:**
- Background: var(--glass-bg) rgba(20, 24, 32, 0.72)
- backdrop-filter: blur(12px) saturate(1.2)
- Border: 1px solid var(--glass-border) rgba(255, 255, 255, 0.06)
- Border-radius: 12px
- Padding: 18px 20px
- Margin-bottom: 10px
- Transition: all 200ms
- Hover: border-color rgba(255, 255, 255, 0.08)
- Position: relative
- Overflow: hidden

**Event type accent (left border glow):**
- Position absolute, left 0, top 8px, bottom 8px, width 2px
- Background: eventTypeColor
- Box-shadow: 0 0 8px eventTypeColor at 30%
- Border-radius: 1px

**Header row:**
- Display: flex, align-items center, gap 10px, margin-left 8px (offset for left accent)
- Icon container: 32px x 32px, border-radius 8px, bg eventTypeColor at 8%, border 1px solid eventTypeColor at 10%
  - Icon: 15px, color eventTypeColor
- Event type badge: enhanced pill
  - Font: Inter 600 10px, letter-spacing 0.03em, uppercase
  - Padding: 3px 10px, border-radius 9999px
  - Background: eventTypeColor at 8%, color eventTypeColor, border 1px solid eventTypeColor at 12%
- Timestamp: Inter 400 11px, #505B6B, margin-left auto

**Content section (client message + AI response):**
- Margin-top: 12px, margin-left 8px
- Display: grid, grid-cols 2, gap 10px

Client message block:
- Background: #0C0F12
- Border: 1px solid rgba(255, 255, 255, 0.04)
- Border-radius: 8px
- Padding: 10px 12px
- Label: "CLIENTE", Inter 600 9px, #505B6B, letter-spacing 0.06em, uppercase, margin-bottom 4px
- Content: Inter 400 12px, #E8ECF1, line-height 1.5, line-clamp 3

AI response block:
- Background: rgba(13, 148, 136, 0.05)
- Border: 1px solid rgba(45, 212, 191, 0.08)
- Border-radius: 8px
- Padding: 10px 12px
- Label: "NEXUS IA", Inter 600 9px, rgba(45, 212, 191, 0.5), letter-spacing 0.06em, uppercase, margin-bottom 4px
- Content: Inter 400 12px, #E8ECF1, line-height 1.5, line-clamp 3

**Generic content (non-message events):**
- Margin-top: 8px, margin-left 8px
- Inter 400 12px, #8B95A5, line-height 1.4

**JID footer:**
- Margin-top: 10px, margin-left 8px
- JetBrains Mono 400 10px, #505B6B, opacity 0.6, truncate

**Framer Motion animation (new entries):**
- feedEntry variant: initial { opacity: 0, x: -12, scale: 0.98 }, animate to defaults
- Stagger: 0ms (each entry animates independently as it arrives via socket)
- On first load (existing events): stagger 40ms

**GSAP accent on new event arrival:**
- The left border glow briefly intensifies: box-shadow 0 0 20px eventColor at 50%, then fades to resting 0 0 8px eventColor at 30%, duration 800ms, ease power2.out

### 7.4 Feed Empty State

**Container:**
- Background: var(--glass-bg)
- Border: 1px solid var(--glass-border)
- Border-radius: 12px
- Padding: 56px 24px
- Text-align: center

- Radio icon: 36px, #505B6B, centered
  - GSAP: slow pulse scale 0.95-1.05, duration 3s, infinite, ease sine.inOut
- "Aguardando eventos": Inter 500 16px, #8B95A5, margin-top 16px
- Subtext: Inter 400 13px, #505B6B, max-width 400px, margin 8px auto 0
- Framer Motion: fade in + scale from 0.97, duration 500ms

---

## 8. GLOBAL COMPONENTS (Enhanced)

### 8.1 Button (Enhanced)

Extend existing CVA variants with new visual effects:

**Primary variant enhancement:**
- Background: var(--gradient-primary) instead of flat bg-primary-600
- Color: #0C0F12 (dark text on gradient)
- Hover: box-shadow var(--glow-primary), translateY(-1px), gradient shifts brighter
- Active: translateY(0), box-shadow resets
- Focus-visible: ring 2px #14B8A6 with offset

**Secondary variant enhancement:**
- Background: var(--glass-bg) with backdrop-filter blur(8px)
- Border: 1px solid rgba(255, 255, 255, 0.08)
- Hover: border-color rgba(255, 255, 255, 0.12), bg rgba(31, 39, 51, 0.6)

**Ghost variant enhancement:**
- Hover: bg rgba(31, 39, 51, 0.4) (softer)

**All buttons:**
- Transition: all 150ms var(--ease-out-expo)
- Framer Motion: whileTap { scale: 0.97 }

### 8.2 Input (Enhanced)

- Background: #0C0F12 (darker than surface for depth)
- Border: 1px solid #1E2530
- Focus: border-color #0D9488, box-shadow 0 0 0 3px rgba(13, 148, 136, 0.12), 0 0 12px rgba(13, 148, 136, 0.05)
- Transition: all 200ms var(--ease-out-expo)

### 8.3 Badge (Enhanced)

Add new pill shape option and border treatment:
- All badges get a subtle 1px border matching their bg color at 2x opacity
- Example: primary badge bg rgba(45, 212, 191, 0.08), border 1px solid rgba(45, 212, 191, 0.16)

### 8.4 Modal (Enhanced with Framer Motion)

**Overlay:**
- Background: rgba(0, 0, 0, 0.65) with backdrop-filter blur(4px)
- Framer Motion: opacity 0 -> 1, duration 200ms

**Content:**
- Background: var(--glass-bg) rgba(20, 24, 32, 0.85)
- backdrop-filter: blur(var(--glass-blur-heavy) 24px) saturate(1.3)
- Border: 1px solid var(--glass-border)
- Border-radius: 14px
- Box-shadow: var(--shadow-elevated), 0 0 80px rgba(0, 0, 0, 0.4)
- Framer Motion: modalContent variant (scale 0.95, y 10 -> scale 1, y 0)

### 8.5 Toast (Enhanced)

- Background: var(--glass-bg) rgba(20, 24, 32, 0.85)
- backdrop-filter: blur(16px) saturate(1.3)
- Border: 1px solid rgba(255, 255, 255, 0.06)
- Border-radius: 10px
- Box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4)
- Left accent line: 2px, color based on toast type (success=#22C55E, error=#EF4444, etc.)
- Font: Inter 400 13px, #E8ECF1
- Enter: slide from right + opacity, exit: slide right + opacity
- Framer Motion animation

### 8.6 Skeleton Shimmer (Enhanced)

- Base gradient: linear-gradient(90deg, #141820 25%, rgba(45, 212, 191, 0.04) 50%, #141820 75%)
- This adds a very subtle teal tint to the shimmer pass, making it feel "alive"
- Background-size: 200% 100%
- Animation: 1.8s ease-in-out infinite (slightly slower for more elegance)
- Border-radius: 6px

### 8.7 Scrollbar (Enhanced)

- Width: 4px (existing)
- Track: transparent (existing)
- Thumb: #1E2530 with border-radius 2px (existing)
- Thumb hover: #2A3545 (existing)
- New: thumb transitions opacity (0.4 -> 1 on container hover) for cleaner look

---

## 9. MICRO-INTERACTIONS CATALOG

### 9.1 Button Hover Glow

All primary action buttons on hover:
- Box-shadow transitions from none to var(--glow-primary) over 200ms
- Transform: translateY(-1px)
- On mouseLeave: shadow fades over 300ms (slightly slower for afterglow effect)

### 9.2 Badge Pulse (Hot Lead)

When a lead is marked hot:
- Flame icon: GSAP timeline, opacity oscillates 0.6-1.0, scale oscillates 0.95-1.05, duration 2s, infinite
- Left border (sidebar item): box-shadow 0 0 8px rgba(245, 158, 11, 0.2), pulsing with same timing

### 9.3 Typing Indicator (Enhanced)

- Three dots with teal color (#2DD4BF) instead of muted
- Each dot: scale animation 1.0 -> 1.3 -> 1.0 instead of just translateY
- "NEXUS IA" label above with fade-in

### 9.4 Tooltip Enter/Exit

- Framer Motion: initial { opacity: 0, y: 4, scale: 0.95 }, animate { opacity: 1, y: 0, scale: 1 }
- Duration: 150ms enter, 100ms exit
- Background: #1A2029, border 1px solid #1E2530, border-radius 6px
- Font: Inter 400 12px, #E8ECF1
- Padding: 4px 10px
- Box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3)

### 9.5 Number Counter (Dashboard KPIs)

GSAP on mount and on data refresh:
- Duration: 1.2s
- Easing: power2.out
- Snap to integers (or 0.1 for decimals)
- The number visually counts up from 0 (or from previous value on refresh)

### 9.6 Funnel Bar Animation

GSAP on mount:
- Each bar width animates from 0% to target%
- Duration: 0.8s per bar
- Stagger: 0.08s between bars
- Easing: power2.out
- On data change: bars smoothly transition to new widths over 0.5s

### 9.7 Kanban Card Reorder

Framer Motion layout animation:
- When a card moves between columns, it animates to new position over 250ms
- Other cards in both source and target columns shift smoothly (layout: true)
- The moved card has a brief scale pulse (1.0 -> 1.02 -> 1.0, 300ms)

### 9.8 Feed Entry Arrival

For real-time socket events:
- New entry pushes existing entries down (Framer Motion layout)
- New entry enters with feedEntry variant
- Left accent border glows brighter momentarily (GSAP, 800ms)
- A subtle background flash: bg-color briefly becomes eventColor at 3% opacity then fades

### 9.9 Page Transitions

Framer Motion AnimatePresence wrapping page content:
- Exit: opacity 0, y -4, duration 150ms
- Enter: opacity 0, y 8 -> opacity 1, y 0, duration 300ms
- Mode: "wait" (exit completes before enter starts)

### 9.10 Detail Panel Sections (Accordion)

- Framer Motion AnimatePresence on section content
- Open: height 0 -> auto, opacity 0 -> 1, duration 250ms, ease out-expo
- Close: height auto -> 0, opacity 1 -> 0, duration 200ms
- Chevron rotation: 0 -> 180deg, spring animation

---

## 10. RESPONSIVENESS

### 10.1 Breakpoints

```
xs: 0 - 639px      (mobile)
sm: 640 - 767px     (small tablet)
md: 768 - 1023px    (tablet)
lg: 1024 - 1279px   (laptop)
xl: 1280 - 1535px   (desktop)
2xl: 1536px+        (wide desktop)
```

### 10.2 Conversations Page

- >= 1024px: sidebar 320px + chat + detail panel 380px (full layout)
- 768-1023px: sidebar collapses to 64px (icons only), chat expands, detail panel becomes overlay (full-screen slide-in from right)
- < 768px: sidebar becomes bottom sheet or full-screen overlay, chat is full width, detail panel is full-screen overlay

Sidebar collapsed mode (768-1023px):
- Width: 64px
- Only avatars visible (no text, no search, no filters)
- Hover: expands to 320px as overlay with box-shadow
- Transition: width 300ms var(--ease-out-expo)

### 10.3 Dashboard Page

- >= 1280px: 4 KPI cols, 12-col grid (7+5)
- 1024-1279px: 4 KPI cols, 12-col grid (7+5)
- 768-1023px: 2 KPI cols, single column (funnel, table, activity stacked)
- < 768px: 1 KPI col, single column, padding reduces to 16px

### 10.4 Kanban Page

- >= 1024px: all 7 columns visible with scroll
- 768-1023px: columns 240px wide (narrower)
- < 768px: single column view with horizontal swipe between stages, or vertical stacked view with collapsible columns

### 10.5 Feed Page

- >= 768px: max-width 800px centered
- < 768px: full width with 16px padding, grid becomes single column (client msg on top, AI msg below)

---

## 11. ACCESSIBILITY NOTES

- All interactive elements: focus-visible ring 2px #14B8A6 with 2px offset
- Color contrast: #E8ECF1 on #0C0F12 = 13.8:1 (AAA), #8B95A5 on #0C0F12 = 5.7:1 (AA), #505B6B on #0C0F12 = 3.2:1 (use only for decorative/non-essential text)
- Motion: respect prefers-reduced-motion media query
  - If prefers-reduced-motion: reduce, disable GSAP animations, set Framer Motion durations to 0, disable Lenis smooth scroll
- Keyboard navigation: all interactive elements reachable via Tab, Enter/Space to activate
- Screen reader: proper ARIA labels on icon-only buttons, live regions for real-time updates

---

## 12. THREE.JS / REACT THREE FIBER (Optional)

### 12.1 Login Page Background Particles

If implemented:
- Canvas: full viewport behind login card, pointer-events none
- Particles: 60 small spheres (1-2px visual radius)
- Color: #2DD4BF at 10-30% opacity (randomized per particle)
- Distribution: random 3D space within a 10x10x5 unit box
- Movement: each particle drifts with a sine-based wobble, max speed 0.3 units/sec
- Depth: particles at different z-depths create parallax feel
- Camera: perspective, slight follow on mouse position (multiply mouse offset by 0.02 for subtle effect)
- Performance: use instancedMesh for all particles, single draw call
- On low-end devices: detect via navigator.hardwareConcurrency < 4, skip R3F entirely and use CSS gradient fallback

### 12.2 Dashboard 3D Chart (Future consideration)

Not for initial implementation. If pursued later:
- A 3D funnel visualization replacing/augmenting the 2D bar chart
- 7 stacked translucent rings, each representing a funnel stage
- Ring diameter proportional to count
- Color: stage colors with emission
- Rotate slowly (0.2 RPM)
- Hover on ring: expands slightly, shows tooltip with count

---

## 13. PERFORMANCE GUARDRAILS

- Glassmorphism (backdrop-filter): limit to max 4 concurrent elements with blur on any given view. On low-end devices, degrade to solid backgrounds
- GSAP: use will-change on animated properties, remove after animation completes
- Framer Motion: use layout prop only where necessary (kanban reorder, tab indicator)
- Lenis: only initialize on pages that benefit (Feed, Dashboard). Do not apply to conversation message list
- Three.js: lazy-load, suspense boundary, respect prefers-reduced-motion
- Image avatars (future): use Next.js Image with blur placeholder
- Bundle: GSAP, Lenis, and R3F should be dynamically imported (next/dynamic)

---

--- SPECS DE DESIGN ---
Telas/Componentes: Login Page, TopBar (App Shell), Conversations Page (Sidebar + Chat Area + Detail Panel), Dashboard Page (KPI Cards + Funnel Chart + Activity List + Sales Table), Kanban Board Page (Columns + Cards + Drag-and-Drop), Feed Page (Feed Entries + Live Indicator)

[LOGIN PAGE]
Layout: Full viewport centered, glass card 420px max-width with gradient mesh background, optional R3F particle layer
Cores: bg #0C0F12, card rgba(20,24,32,0.72) glass, gradient-primary #14B8A6->#10B981 on CTA, glow rgba(45,212,191,0.15), error #EF4444 at 8%, success #22C55E
Tipografia: Inter 700 28px logo, Inter 600 20px heading, Inter 400 13px body, Inter 500 14px button, Inter 400 12px labels
Spacing: card p-40px, input h-44px pl-40px, button h-44px mt-20px, heading mb-4px, subheading mb-28px, label mb-6px, footer mt-32px
Estados: idle (form visible), loading (spinner+pulse on button, input disabled), success (AnimatePresence swap, checkmark with GSAP glow), error (error box fade-in)
Animacoes: card entrance 600ms ease-out-expo with scale, GSAP gradient mesh drift 20s loop, GSAP logo glow pulse on mount 1s, form->success AnimatePresence crossfade 200-300ms
Responsivo: >=768px 420px card p-40px, <768px full-width mx-16px p-28px, <480px p-24px icon-28px heading-18px
Notas: gradient mesh sufficient without R3F; particles are enhancement only

[TOPBAR]
Layout: fixed top, h-48px, 3 zones: logo 320px left, nav tabs center flex-1, actions right
Cores: glass bg rgba(20,24,32,0.72), border rgba(255,255,255,0.06), active tab #2DD4BF, inactive #8B95A5, connected badge #22C55E, disconnected #EF4444
Tipografia: logo Inter 600 14px, tab Inter 500 13px, connection badge Inter 500 11px
Spacing: logo zone px-20px, tabs gap-2px each px-18px h-48px, actions px-16px gap-10px
Estados: tab default/hover/active with layoutId sliding indicator, connection online/offline, notification badge with GSAP scale bounce on new
Animacoes: Framer Motion layoutId on active tab indicator (slides between tabs), notification badge GSAP back.out(2) 400ms on increment
Responsivo: <768px logo collapses to icon only, tabs become hamburger menu or bottom nav
Notas: backdrop-filter blur(16px) saturate(1.3) for glass effect

[SIDEBAR (Conversation List)]
Layout: fixed left, w-320px, top-48px bottom-0, flex column: search 12px pad, filter chips, scrollable list, footer
Cores: glass bg, search input #0C0F12, active chip #2DD4BF at 8%, selected item rgba(37,48,64,0.6) with #14B8A6 left border, hot lead #F59E0B left border
Tipografia: search Inter 400 13px, chip Inter 500 11px, name Inter 500 13px, preview Inter 400 12px, timestamp Inter 400 11px, badge Inter 500 10px
Spacing: search p-12px h-36px, chips px-12px pb-10px gap-4px, item p-10px-12px mx-6px gap-10px, avatar 38px, badges mt-6px gap-4px
Estados: item default/hover/selected/hot, search default/focus, chip inactive/hover/active, loading skeleton x6, empty state centered
Animacoes: Framer Motion stagger list 40ms, filter chip layoutId morph, AI thinking gradient bar GSAP translateX loop 1.5s, hot lead flame GSAP pulse 2s
Responsivo: >=1024px 320px visible, 768-1023px collapses to 64px icons, <768px overlay/bottom sheet
Notas: native scroll not Lenis; Ctrl+K shortcut hint in search

[CHAT AREA]
Layout: flex-1 ml-320px, flex column: header 56px, message list flex-1, input area
Cores: header glass bg, messages #0C0F12, incoming bubble #1A2029, outgoing gradient rgba(13,148,136,0.15)->rgba(16,185,129,0.08), typing dots #2DD4BF
Tipografia: header name Inter 500 14px, phone JetBrains Mono 400 11px, message Inter 400 13px lh-1.55, timestamp Inter 400 10px, input Inter 400 13px
Spacing: header px-20px, messages p-20px-24px, bubbles max-w-65% p-10px-14px mb-3px, input area p-10px-12px, textarea p-9px-14px
Estados: empty chat (no selection), loading skeletons, messages loaded, typing indicator visible, AI warning bar visible, quick replies open
Animacoes: Framer Motion incoming messages x:-8, outgoing x:8 250ms, typing indicator fade+slideUp 200ms, AI warning slideDown 200ms, send button enable scale spring, detail panel margin transition 300ms
Responsivo: adapts with sidebar collapse, detail panel overlay on <1024px
Notas: native scroll on message list for scroll-to-bottom; date separators between groups

[DETAIL PANEL]
Layout: fixed right, w-380px, top-48px bottom-0, flex column: header 48px, accordion sections scrollable
Cores: glass bg, section headers hover rgba(31,39,51,0.3), stage rows use stageColor, tags #2DD4BF, notes bg #141820
Tipografia: header Inter 600 13px, section title Inter 500 12px, label Inter 400 12px, value Inter 400 12px, phone JetBrains Mono 400 11px
Spacing: header px-16px, sections px-16px pb-14px, section header py-10px px-16px, key-value gap-8px
Estados: loading skeleton x4, sections open/closed, AI toggle active states, tag add/remove animations, note add/delete
Animacoes: Framer Motion slideInRight 300ms, accordion height auto 250ms, chevron rotate spring, tag add scale-from-0.8 200ms, tag remove scale-to-0.8 150ms, button tap scale-0.97
Responsivo: >=1024px inline 380px, <1024px fullscreen overlay slide-from-right
Notas: multiple sections with AnimatePresence for open/close

[DASHBOARD PAGE]
Layout: p-28px-32px, max-w-1440px centered, KPI grid 4cols mb-28px, content grid 12cols (7+5)
Cores: glass bg on all cards, KPI accent colors (#3B82F6 info, #22C55E success, #14B8A6 primary, #F59E0B warning), funnel stageColors, table success for values
Tipografia: page title Inter 600 24px ls:-0.02em, KPI value Inter 700 28px ls:-0.02em, KPI label Inter 400 12px, KPI subtitle Inter 400 11px, section headers Inter 600 14px, table header Inter 500 11px uppercase ls:0.04em, table body Inter 400 13px
Spacing: page p-28px-32px, KPI grid gap-16px, KPI card p-20px, content grid gap-20px, sections p-24px, funnel bars gap-10px mb-10px, table rows py-10px
Estados: loading (KPI skeletons, funnel skeletons, table skeletons), data loaded with GSAP counters, hover glow on KPI cards, activity list live updates
Animacoes: Framer Motion pageTransition on mount, KPI cardEntrance stagger 80ms, GSAP number counters 1.2s power2.out, GSAP funnel bars width 0->target 0.8s stagger 0.08s, activity list new items y:-8 scale:0.97 300ms with icon glow flash 600ms, KPI hover glow 300ms
Responsivo: >=1280px 4+12(7+5), 768-1023px 2+1col, <768px 1col p-16px
Notas: Lenis smooth scroll; period selector in header; live indicator on activity list

[KANBAN BOARD PAGE]
Layout: full height, flex column: header + board container flex-1, board is horizontal flex gap-12px overflow-x-auto
Cores: columns glass bg rgba(20,24,32,0.6), cards solid #141820, column headers use stageColor dots, drop target stageColor glow
Tipografia: page title Inter 600 20px, column header Inter 600 13px, count pill Inter 500 11px, card name Inter 500 13px, card phone JetBrains Mono 400 10px, card meta Inter 400 11px
Spacing: header p-16px-24px, board p-16px-20px gap-12px, column w-280px, column header p-14px-16px, card area p-8px gap-8px, card p-12px
Estados: loading (column skeletons x7), default, column drop-target (border glow + dashed zone), card default/hover/dragging, empty column
Animacoes: Framer Motion drag on cards (scale 1.03, rotate 2deg, elevated shadow), layout animation for reorder 250ms, drop target border+glow transition 200ms, card entrance stagger 30ms per card, card reorder layout spring
Responsivo: >=1024px all 7 columns w-280px, 768-1023px w-240px, <768px single column swipe or vertical stacked
Notas: scroll-snap-type x proximity on board; Framer Motion drag with dragElastic 0.1

[FEED PAGE]
Layout: p-28px-32px, max-w-800px centered, header + event cards list gap-10px
Cores: cards glass bg, left accent line eventTypeColor, client block #0C0F12, AI block rgba(13,148,136,0.05), live indicator #EF4444
Tipografia: page title Inter 600 24px, subtitle Inter 400 13px, event badge Inter 600 10px uppercase, content Inter 400 12px, labels Inter 600 9px uppercase, JID JetBrains Mono 400 10px
Spacing: header mb-24px, card p-18px-20px mb-10px, content grid gap-10px mt-12px, content blocks p-10px-12px
Estados: empty (Radio icon with GSAP pulse, waiting message), connected live indicator, disconnected indicator, new event arrival with glow flash
Animacoes: Framer Motion feedEntry per card (x:-12 scale:0.98 350ms), stagger 40ms on initial load, 0ms on live arrival, GSAP left accent glow intensify on new 800ms, Framer Motion layout for push-down, Lenis smooth scroll
Responsivo: >=768px max-w-800px 2-col content grid, <768px full-width 1-col content stacked p-16px
Notas: Lenis smooth scroll enabled; socket events push entries to top with layout animation

Design system:
Cores primarias: #2DD4BF (primary-400), #14B8A6 (primary-500), #0D9488 (primary-600), #0F766E (primary-700), #115E59 (primary-800), #10B981 (emerald accent for gradients)
Cores secundarias: #3B82F6 (info), #8B5CF6 (discovery stage purple)
Cores de estado: success #22C55E, error #EF4444, warning #F59E0B, info #3B82F6
Background: base #0C0F12, surface #141820, elevated #1A2029, hover #1F2733, active #253040
Surface: glass rgba(20,24,32,0.72) with backdrop-filter blur(16px) saturate(1.2-1.3)
Border: default #1E2530, hover #2A3545, active #0D9488, glass rgba(255,255,255,0.06)
Tipografia base: Inter 400 13px (0.8125rem), mono JetBrains Mono
Border radius: badge 4px, input 6px, card 8px, modal 10px, lg 12px, xl 16px, pill 9999px
Shadows: sm 0 1px 2px rgba(0,0,0,0.3), md 0 4px 12px rgba(0,0,0,0.4), lg 0 8px 32px rgba(0,0,0,0.5), elevated 0 8px 32px rgba(0,0,0,0.5)+inset-border, glow-sm/md/lg for primary teal glow

Veredicto: SPECS_COMPLETAS
---
