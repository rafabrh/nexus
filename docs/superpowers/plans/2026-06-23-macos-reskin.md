# NEXUS — Reskin macOS (dual-theme) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reskin completo da plataforma NEXUS para a estética macOS (Apple Design Resources / Liquid Glass), com dois temas (light/dark) comutáveis pelo usuário, mantendo a lógica de negócio intocada.

**Architecture:** Token-first. O `globals.css` passa a definir dois conjuntos de CSS vars comutados por `html[data-theme="light"|"dark"]`; como todos os componentes consomem tokens via Tailwind (`var(--token)`), a maioria das telas migra na cascata. Poucos primitivos novos (Button glass/primary, Switch, SegmentedControl) e um mecanismo de tema (store + anti-FOUC script). A camada cinematográfica (aurora, three.js, glows neon) é removida; o film grain é mantido só na abertura.

**Tech Stack:** Next.js 14 (App Router, telas `'use client'`), Tailwind CSS 3.4 (tokens em CSS vars), Radix UI, framer-motion 11, zustand (persist), next/font (Inter). Spec: `docs/superpowers/specs/2026-06-23-macos-reskin-design.md`.

## Verificação (sem test runner no apps/web)

`apps/web` **não tem runner de testes** (só `dev/build/lint`). A verificação de cada task usa:
- **Typecheck:** `cd apps/web && npx tsc --noEmit`
- **Lint:** `cd apps/web && npm run lint`
- **Build:** `cd apps/web && npm run build` (nas tasks de fechamento de fase)
- **Visual:** `cd apps/web && npm run dev` → abrir a rota e conferir o resultado nos dois temas.

A única lógica pura testável (`resolveTheme`) ganha um teste leve em Node (sem framework) na Task 5.

## File Structure

**Criados:**
- `apps/web/src/lib/theme.ts` — lógica pura de resolução de tema (`resolveTheme`, tipos) + a string do script anti-FOUC.
- `apps/web/src/components/theme/theme-provider.tsx` — provider client que aplica `data-theme` e reage a mudanças/`matchMedia`.
- `apps/web/src/components/ui/switch.tsx` — switch macOS (knob branco + sombras).
- `apps/web/src/components/ui/segmented-control.tsx` — segmented control macOS.
- `apps/web/src/components/ui/theme-toggle.tsx` — controle `Sistema · Claro · Escuro`.
- `apps/web/src/lib/theme.test.mjs` — teste Node puro de `resolveTheme`.

**Modificados (alto nível):**
- `apps/web/src/app/globals.css` — tokens dual-theme, remoção da camada cinematográfica, utilitários macOS.
- `apps/web/tailwind.config.ts` — novos tokens (accent, vibrancy, macOS shadows), remoção dos glow.
- `apps/web/src/app/layout.tsx` — Inter, script anti-FOUC, ThemeProvider, remover `dark` fixo.
- `apps/web/src/stores/settings.store.ts` — campo `theme`.
- `apps/web/src/components/ui/button.tsx` — variantes macOS + `glass`.
- `apps/web/src/components/layout/{top-bar,sidebar,detail-panel}.tsx`
- `apps/web/src/components/chat/{chat-header,message-list,message-bubble,message-input}.tsx`
- `apps/web/src/components/{kanban,dashboard,feed}/*` + `ui/{input,badge,toast-provider}.tsx`
- `apps/web/src/app/login/page.tsx`, `apps/web/src/app/(app)/settings/page.tsx`
- `apps/web/src/components/cinematic/film-grain.tsx` (escopar) + remover `three/*`.

**Removidos:** `apps/web/src/components/three/ambient-network.tsx`, `apps/web/src/components/three/login-particles.tsx`.

---

## Fase 0 — Fundação de tokens

### Task 1: Tokens dual-theme no globals.css

**Files:**
- Modify: `apps/web/src/app/globals.css` (bloco `:root` → blocos `html[data-theme=...]`)

- [ ] **Step 1: Substituir o bloco `:root` por tokens compartilhados + dois temas**

**ATENÇÃO — preservar tokens legados no `:root` compartilhado.** O `globals.css` hoje é um único `:root` (tema dark fixo). Só mover para os blocos `data-theme` os tokens **de cor/material**. Manter no `:root` compartilhado, sem renomear, TODOS estes tokens invariáveis que já têm consumidores (no CSS e no `tailwind.config.ts`):
`--text-xs..2xl`, os radii legados `--radius-badge/input/card/modal/lg/xl/pill`, `--shadow-sm/md/lg`, `--glass-blur`/`--glass-blur-heavy`, todas as `--duration-*`, todos os `--ease-*`/`--ease-out-expo` etc., e todos os `--z-*`. Remover apenas os tokens de cor que migram (backgrounds, primary→accent, text, border, semantic, ai, glass-bg/border, gradientes/glows). Usar os valores do spec:

```css
:root {
  /* Fonts */
  --font-sans: -apple-system, BlinkMacSystemFont, 'Inter', system-ui, sans-serif;
  --font-mono: 'SF Mono', var(--font-geist-mono), 'JetBrains Mono', monospace;
  /* Font sizes / radii / durations / easings / z-index: MANTER como já estão */
  /* Radii macOS */
  --radius-control: 6px;   /* push button, segmented, text field */
  --radius-list-item: 5px;
  --radius-panel: 18px;
  --radius-pill: 9999px;
}

html[data-theme='light'] {
  color-scheme: light;
  --bg-base: #ECECEC;
  --bg-surface: #FFFFFF;
  --bg-elevated: #FFFFFF;
  --bg-hover: rgba(0,0,0,0.04);
  --bg-active: rgba(0,0,0,0.08);
  --window: #FFFFFF;
  --vibrancy-bg: rgba(246,246,246,0.7);
  --vibrancy-fallback: #F6F6F6;
  --accent-500: #007AFF;
  --accent-600: #0066D6;
  --ai-400: #8B5CF6; --ai-500: #8B5CF6; --ai-600: #7C3AED;
  --text-primary: #1A1A1A;
  --text-secondary: rgba(0,0,0,0.5);
  --text-muted: rgba(0,0,0,0.26);
  --text-inverse: #FFFFFF;
  --separator: #D9D9D9;
  --control-fill: #FFFFFF;
  --control-shadow: rgba(0,0,0,0.08);
  --border-default: rgba(0,0,0,0.10);
  --border-hover: rgba(0,0,0,0.16);
  --border-active: #007AFF;
  --success: #34C759; --warning: #FF9500; --error: #FF3B30; --info: #007AFF;
  --ai-on: #34C759; --ai-paused: #FF9500; --ai-off: #8E8E93; --ai-thinking: #8B5CF6;
  --bubble-them: #E9E9EB;
  /* Funil S0..S6 */
  --stage-s0:#8E8E93; --stage-s1:#32ADE6; --stage-s2:#5856D6; --stage-s3:#FF9500;
  --stage-s4:#FF3B30; --stage-s5:#34C759; --stage-s6:#00C7BE;
  --glass-bg: rgba(255,255,255,0.6);
  --glass-border: rgba(0,0,0,0.08);
  --shadow-control: 0 1px 2px rgba(0,0,0,0.08);
  --shadow-panel: 0 8px 40px rgba(0,0,0,0.12);
}

html[data-theme='dark'] {
  color-scheme: dark;
  --bg-base: #1E1E1E;
  --bg-surface: #1C1C1E;
  --bg-elevated: #2C2C2E;
  --bg-hover: rgba(255,255,255,0.06);
  --bg-active: rgba(255,255,255,0.10);
  --window: #1C1C1E;
  --vibrancy-bg: rgba(40,40,42,0.6);
  --vibrancy-fallback: #282829;
  --accent-500: #0A84FF;
  --accent-600: #0A84FF;
  --ai-400: #A78BFA; --ai-500: #A78BFA; --ai-600: #8B5CF6;
  --text-primary: #F5F5F7;
  --text-secondary: rgba(235,235,245,0.6);
  --text-muted: rgba(235,235,245,0.3);
  --text-inverse: #1A1A1A;
  --separator: rgba(255,255,255,0.12);
  --control-fill: #2C2C2E;
  --control-shadow: rgba(0,0,0,0.4);
  --border-default: rgba(255,255,255,0.12);
  --border-hover: rgba(255,255,255,0.20);
  --border-active: #0A84FF;
  --success: #30D158; --warning: #FF9F0A; --error: #FF453A; --info: #0A84FF;
  --ai-on: #30D158; --ai-paused: #FF9F0A; --ai-off: #98989D; --ai-thinking: #A78BFA;
  --bubble-them: #3A3A3C;
  --stage-s0:#98989D; --stage-s1:#64D2FF; --stage-s2:#5E5CE6; --stage-s3:#FF9F0A;
  --stage-s4:#FF453A; --stage-s5:#30D158; --stage-s6:#66D4CF;
  --glass-bg: rgba(40,40,42,0.6);
  --glass-border: rgba(255,255,255,0.10);
  --shadow-control: 0 1px 2px rgba(0,0,0,0.4);
  --shadow-panel: 0 8px 40px rgba(0,0,0,0.5);
}
```

- [ ] **Step 2: Remover a camada cinematográfica do globals.css**

Remover: `body::before` (aurora) e o `@keyframes aurora-drift`; o `body::after` global (mover o film grain para componente na Task 18 — por ora remover o `background` de vinheta global); todos os tokens `--glow-*`, `--gradient-mesh-login`, `--gradient-radial-hero`, `--gradient-primary*`, `--shadow-card-hover` (teal). **Remover também a regra global `html { color-scheme: dark; }`** — o `color-scheme` agora é definido por tema dentro de cada bloco `html[data-theme=...]` (light/dark). Atualizar `.glass`/`.glass-heavy` para usar `--glass-bg`/`--glass-border` com `var(--vibrancy-fallback)` via `@supports`:

```css
.glass {
  background: var(--glass-bg);
  backdrop-filter: blur(20px) saturate(1.1);
  -webkit-backdrop-filter: blur(20px) saturate(1.1);
  border: 1px solid var(--glass-border);
}
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .glass { background: var(--vibrancy-fallback); }
}
```

Atualizar `.focus-ring:focus-visible` para usar `var(--accent-500)` no lugar de `#14B8A6`. Remover `.btn-gradient-primary` e a `.ai-thinking-bar` continua (usa violeta — manter, trocando hex por `var(--ai-500)`/`var(--ai-400)`).

- [ ] **Step 3: Typecheck/lint não se aplica a CSS — verificação visual adiada**

Esta task é validada junto com a Task 4 (quando o `data-theme` é aplicado). Seguir.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/globals.css
git commit -m "feat(web): tokens dual-theme macOS no globals.css; remove camada cinematografica"
```

### Task 2: Atualizar tailwind.config.ts

**Files:**
- Modify: `apps/web/tailwind.config.ts`

- [ ] **Step 1: Trocar darkMode e expor novos tokens**

- Trocar `darkMode: 'class'` por `darkMode: ['selector', '[data-theme="dark"]']` (mantém o util `dark:` funcional caso seja usado no futuro; hoje há 0 usos).
- Em `colors`, adicionar `accent: { 500: 'var(--accent-500)', 600: 'var(--accent-600)' }`, `window: 'var(--window)'`, `vibrancy: 'var(--vibrancy-bg)'`, `separator: 'var(--separator)'`, `bubble: { them: 'var(--bubble-them)' }`, e `stage: { s0..s6: 'var(--stage-sN)' }`. Manter `primary` apontando para `--accent-*` **temporariamente** (alias) para não quebrar consumidores: `primary: { 400:'var(--accent-500)',500:'var(--accent-500)',600:'var(--accent-600)',700:'var(--accent-600)',800:'var(--accent-600)' }`.
- Em `borderRadius`, adicionar `control`, 'list-item', `panel` apontando para os novos tokens.
- Em `boxShadow`, **remover** todas as entradas `glow-*` e `card-hover`; adicionar `control: 'var(--shadow-control)'`, `panel: 'var(--shadow-panel)'`.

- [ ] **Step 2: Verificar**

Run: `cd apps/web && npx tsc --noEmit`
Expected: PASS (config é TS).

- [ ] **Step 3: Commit**

```bash
git add apps/web/tailwind.config.ts
git commit -m "feat(web): tokens macOS (accent/vibrancy/stage) no tailwind; remove glow shadows"
```

### Task 3: Inter via next/font

**Files:**
- Modify: `apps/web/src/app/layout.tsx`

- [ ] **Step 1: Confirmar a estratégia da fonte**

O `apps/web` hoje usa `GeistSans`/`GeistMono` do pacote `geist` — **Inter não está self-hosted**, só aparece como string de fallback. Escolher:
- **Preferido (com rede no build):** `next/font/google` `Inter`. Funciona no build padrão; **falha em build offline/CI sem rede**.
- **Offline/CI:** `next/font/local` apontando para um arquivo `.woff2` do Inter adicionado em `apps/web/src/app/fonts/`.

Confirmar antes se o build tem acesso à rede; se não, usar `next/font/local`. Implementação (variante google):

```tsx
import { Inter } from 'next/font/google';
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
```

Incluir `inter.variable` na `className` da `<html>` e ajustar `--font-sans` no globals.css para incluir `var(--font-inter)` logo após `-apple-system, BlinkMacSystemFont`:
`--font-sans: -apple-system, BlinkMacSystemFont, var(--font-inter), 'Inter', system-ui, sans-serif;`

- [ ] **Step 2: Verificar build da fonte**

Run: `cd apps/web && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/layout.tsx apps/web/src/app/globals.css
git commit -m "feat(web): fonte Inter (fallback da SF Pro) via next/font"
```

---

## Fase 1 — Mecanismo de tema

### Task 4: Lógica pura de tema (lib/theme.ts)

**Files:**
- Create: `apps/web/src/lib/theme.ts`

- [ ] **Step 1: Implementar `resolveTheme` e o script anti-FOUC**

```ts
export type ThemePref = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

/** Resolve a preferência para o tema concreto a aplicar. */
export function resolveTheme(pref: ThemePref, systemPrefersDark: boolean): ResolvedTheme {
  if (pref === 'system') return systemPrefersDark ? 'dark' : 'light';
  return pref;
}

/**
 * Lê a preferência persistida pelo zustand persist (chave nexus-settings).
 * CONTRATO: o store usa `persist({ name: 'nexus-settings' })` sem `partialize`,
 * então o zustand grava `{ "state": { ...campos, theme }, "version": N }`.
 * `theme` PRECISA permanecer no slice persistido — não adicionar `partialize`
 * que o exclua, senão o anti-FOUC cai no fallback abaixo.
 */
export function readPersistedThemePref(): ThemePref {
  try {
    const raw = localStorage.getItem('nexus-settings');
    const pref = raw ? JSON.parse(raw)?.state?.theme : undefined;
    return pref === 'light' || pref === 'dark' || pref === 'system' ? pref : 'system';
  } catch {
    return 'system';
  }
}

/** String injetada inline no <head> para setar data-theme antes do paint (anti-FOUC). */
export const THEME_INIT_SCRIPT = `
(function(){
  try {
    var raw = localStorage.getItem('nexus-settings');
    var pref = raw ? (JSON.parse(raw).state||{}).theme : 'system';
    if (pref !== 'light' && pref !== 'dark') {
      pref = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', pref);
  } catch(e) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();
`;
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/lib/theme.ts
git commit -m "feat(web): logica pura de resolucao de tema + script anti-FOUC"
```

### Task 5: Teste da lógica de tema (Node puro)

**Files:**
- Create: `apps/web/src/lib/theme.test.mjs`

- [ ] **Step 1: Escrever o teste**

```js
import assert from 'node:assert';
import { resolveTheme } from './theme.ts';
// roda via tsx; valida a tabela-verdade
assert.equal(resolveTheme('light', true), 'light');
assert.equal(resolveTheme('dark', false), 'dark');
assert.equal(resolveTheme('system', true), 'dark');
assert.equal(resolveTheme('system', false), 'light');
console.log('theme.test: OK');
```

- [ ] **Step 2: Rodar e ver passar**

Primeiro checar disponibilidade: `cd apps/web && npx --no-install tsx --version`. Se existir: `npx tsx src/lib/theme.test.mjs` → imprime `theme.test: OK`. Se `tsx` **não** estiver disponível, **não** adicionar dependência: a verificação de `resolveTheme` passa a ser por leitura da tabela-verdade no próprio teste (revisão manual). Anotar qual caminho foi usado.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/theme.test.mjs
git commit -m "test(web): tabela-verdade de resolveTheme"
```

### Task 6: Campo `theme` na settings store

**Files:**
- Modify: `apps/web/src/stores/settings.store.ts`

- [ ] **Step 1: Adicionar `theme` e `setTheme`**

Importar `ThemePref` de `@/lib/theme`. Adicionar à interface `theme: ThemePref;` e `setTheme: (t: ThemePref) => void;`. No estado inicial `theme: 'system'` e `setTheme: (theme) => set({ theme })`. **Não** introduzir `partialize` (o `theme` deve ficar no slice persistido — ver contrato em `lib/theme.ts`). Mantém `{ name: 'nexus-settings' }`.

- [ ] **Step 2: Verificar (typecheck + formato do storage)**

Run: `cd apps/web && npx tsc --noEmit` → PASS.
Verificação manual do contrato anti-FOUC: rodar o dev, alternar o tema, e no console do browser conferir que `JSON.parse(localStorage['nexus-settings']).state.theme` reflete a escolha. Se o caminho `.state.theme` não existir, o anti-FOUC e o `readPersistedThemePref` precisam ser ajustados ao formato real **antes** de seguir.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/stores/settings.store.ts
git commit -m "feat(web): preferencia de tema persistida na settings store"
```

### Task 7: ThemeProvider

**Files:**
- Create: `apps/web/src/components/theme/theme-provider.tsx`

- [ ] **Step 1: Implementar o provider**

```tsx
'use client';
import { useEffect } from 'react';
import { useSettingsStore } from '@/stores/settings.store';
import { resolveTheme } from '@/lib/theme';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSettingsStore((s) => s.theme);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () =>
      document.documentElement.setAttribute('data-theme', resolveTheme(theme, mq.matches));
    apply();
    if (theme === 'system') {
      mq.addEventListener('change', apply);
      return () => mq.removeEventListener('change', apply);
    }
  }, [theme]);
  return <>{children}</>;
}
```

- [ ] **Step 2: Verificar**

Run: `cd apps/web && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/theme/theme-provider.tsx
git commit -m "feat(web): ThemeProvider aplica data-theme e reage a prefers-color-scheme"
```

### Task 8: Injetar script anti-FOUC + provider no layout raiz

**Files:**
- Modify: `apps/web/src/app/layout.tsx`

- [ ] **Step 1: Remover `dark` fixo, injetar script, envolver com ThemeProvider**

- Remover a string `dark` da `className` da `<html>` (manter as font vars: `inter.variable`, e Geist se ainda referenciado pelo mono).
- Adicionar no `<head>` (criar o elemento `<head>` no JSX) um `<script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />`.
- Envolver `{children}` no `<body>` com `<ThemeProvider>`.

```tsx
import { THEME_INIT_SCRIPT } from '@/lib/theme';
import { ThemeProvider } from '@/components/theme/theme-provider';
// ...
return (
  <html lang="pt-BR" className={`${inter.variable} ${GeistMono.variable}`}>
    <head><script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} /></head>
    <body><ThemeProvider>{children}</ThemeProvider></body>
  </html>
);
```

- [ ] **Step 2: Verificar typecheck + visual (anti-FOUC e cascata)**

Run: `cd apps/web && npx tsc --noEmit` → PASS.
Run: `cd apps/web && npm run dev` → abrir `/login` e uma tela do app; confirmar que renderiza nos tokens novos **sem flash**; alternar o SO entre light/dark e recarregar para ver o tema seguir. (Telas ainda terão resíduos hardcoded — esperado, tratado na Fase 3+.)

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/layout.tsx
git commit -m "feat(web): anti-FOUC script + ThemeProvider no layout raiz"
```

---

## Fase 2 — Primitivos macOS

### Task 9: Button (variantes macOS + glass)

**Files:**
- Modify: `apps/web/src/components/ui/button.tsx`

- [ ] **Step 1: Reescrever variantStyles/variantHover para macOS**

- `primary`: fundo `var(--accent-500)` com gradiente especular sutil (`linear-gradient(180deg, color-mix(in srgb, var(--accent-500) 88%, white), var(--accent-500))`), texto branco, `box-shadow: inset 0 1px 0 rgba(255,255,255,.3), var(--shadow-control)`.
- `secondary`: push button cinza — `background: var(--control-fill)`, `border: 1px solid var(--border-default)`, `box-shadow: var(--shadow-control)`, texto `var(--text-primary)`.
- `ghost`: transparente, hover `var(--bg-hover)`.
- **Nova** `glass` (Liquid Glass "espelho"): `background: var(--glass-bg)`, `backdrop-filter: blur(20px) saturate(1.4)`, `border: 1px solid var(--glass-border)`, `box-shadow: inset 0 1px 0 rgba(255,255,255,.4), var(--shadow-panel)`, `border-radius: var(--radius-pill)`. Fallback `@supports` via classe utilitária `.glass` já existente.
- Trocar o `font-medium` (já existe) — peso CSS 500. Remover refs a `--glow-primary` no hover (usar `var(--shadow-control)` + `y:-1`).
- Atualizar `focus-visible:ring-primary-500` → manter (alias aponta pro accent).

Adicionar `glass` ao enum de `variant` no CVA (com classe base apropriada) e ao `variantStyles`/`variantHover`. **Preservar** as variantes existentes `danger` e `success` do CVA (re-tokenizando os hex para `var(--error)`/`var(--success)`) — não removê-las, pois têm consumidores; rodar `grep` (ferramenta de busca) por `variant="danger"`/`variant="success"` antes para confirmar.

- [ ] **Step 2: Verificar**

Run: `cd apps/web && npx tsc --noEmit` → PASS.
Visual: renderizar os 4 variants nos dois temas (pode usar `/settings` como página de teste temporária ou Storybook-less: conferir nas telas onde já aparecem).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/ui/button.tsx
git commit -m "feat(web): Button macOS (primary/secondary/ghost + glass espelho)"
```

### Task 10: Switch macOS

**Files:**
- Create: `apps/web/src/components/ui/switch.tsx`

- [ ] **Step 1: Implementar sobre Radix Switch**

Usar `@radix-ui/react-switch` (já é dependência). Track pill: off `var(--bg-active)`, on `var(--accent-500)`. Knob branco 20px com as sombras reais do kit: `box-shadow: 0 0 0 .5px rgba(0,0,0,.04), 0 1px 3px rgba(0,0,0,.2), 0 4px 8px rgba(0,0,0,.08)`. Transição 200ms `var(--ease-out-expo)`. Props: `checked`, `onCheckedChange`, `aria-label`.

- [ ] **Step 2: Verificar**

Run: `cd apps/web && npx tsc --noEmit` → PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/ui/switch.tsx
git commit -m "feat(web): Switch macOS (Radix + knob com sombras do kit)"
```

### Task 11: SegmentedControl macOS

**Files:**
- Create: `apps/web/src/components/ui/segmented-control.tsx`

- [ ] **Step 1: Implementar**

Container raio `var(--radius-control)`, fundo `color-mix(in srgb, var(--text-primary) 4%, transparent)`, padding 2px. Segmentos: o ativo ganha `background: var(--control-fill)` + `box-shadow: var(--shadow-control)`; inativos transparentes com `var(--text-secondary)`. Separadores `var(--separator)` entre inativos adjacentes. Indicador deslizante via `framer-motion` `layoutId`. API: `options: {label, value}[]`, `value`, `onChange`.

```tsx
'use client';
import { useId } from 'react';
import { motion } from 'framer-motion';
export interface SegOption<T extends string> { label: string; value: T; }
export function SegmentedControl<T extends string>({ options, value, onChange, 'aria-label': ariaLabel }:
  { options: SegOption<T>[]; value: T; onChange: (v: T) => void; 'aria-label'?: string }) {
  const groupId = useId(); // id único por instância — evita colisão de layoutId entre dois controles
  return (
    <div role="radiogroup" aria-label={ariaLabel}
      className="relative inline-flex p-0.5 rounded-control"
      style={{ background: 'color-mix(in srgb, var(--text-primary) 4%, transparent)' }}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button key={opt.value} role="radio" aria-checked={active} onClick={() => onChange(opt.value)}
            className="relative z-10 px-3 h-7 text-sm font-medium rounded-[5px] transition-colors"
            style={{ color: active ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
            {active && (
              <motion.span layoutId={`seg-${groupId}`} className="absolute inset-0 -z-10 rounded-[5px]"
                style={{ background: 'var(--control-fill)', boxShadow: 'var(--shadow-control)' }}
                transition={{ type: 'spring', stiffness: 380, damping: 32 }} />
            )}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Verificar**

Run: `cd apps/web && npx tsc --noEmit` → PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/ui/segmented-control.tsx
git commit -m "feat(web): SegmentedControl macOS"
```

### Task 12: Input / SearchField macOS

**Files:**
- Modify: `apps/web/src/components/ui/input.tsx`

- [ ] **Step 1: Reskin do input**

Raio `var(--radius-control)`, `background: var(--control-fill)`, `border: 1px solid var(--border-default)`, `box-shadow: inset 0 1px 2px var(--control-shadow)`, foco: `border-color: var(--accent-500)` + ring accent. Variante de busca (ícone lupa lucide + clear) se já existir no arquivo; caso contrário, manter escopo no input base.

- [ ] **Step 2: Verificar** — `npx tsc --noEmit` → PASS.
- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/ui/input.tsx
git commit -m "feat(web): Input/SearchField macOS"
```

---

## Fase 3 — Toggle de tema na UI

### Task 13: Componente ThemeToggle

**Files:**
- Create: `apps/web/src/components/ui/theme-toggle.tsx`

- [ ] **Step 1: Montar sobre SegmentedControl**

```tsx
'use client';
import { SegmentedControl } from './segmented-control';
import { useSettingsStore } from '@/stores/settings.store';
import type { ThemePref } from '@/lib/theme';
export function ThemeToggle() {
  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);
  return (
    <SegmentedControl<ThemePref> aria-label="Tema" value={theme} onChange={setTheme}
      options={[{label:'Sistema',value:'system'},{label:'Claro',value:'light'},{label:'Escuro',value:'dark'}]} />
  );
}
```

- [ ] **Step 2: Verificar** — `npx tsc --noEmit` → PASS.
- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/ui/theme-toggle.tsx
git commit -m "feat(web): ThemeToggle (Sistema/Claro/Escuro)"
```

### Task 14: Expor o toggle no UserMenu e em /settings

**Files:**
- Modify: `apps/web/src/components/layout/top-bar.tsx` (UserMenu)
- Modify: `apps/web/src/app/(app)/settings/page.tsx`

- [ ] **Step 1: top-bar** — adicionar uma linha "Tema" com `<ThemeToggle />` no dropdown do UserMenu (acima de "Configurações"). Reskin do dropdown para material macOS (`var(--glass-bg)`, `var(--glass-border)`, `box-shadow: var(--shadow-panel)`), avatar do botão para `var(--accent-500)` no lugar do gradiente teal.
- [ ] **Step 2: settings** — adicionar uma seção "Aparência" com `<ThemeToggle />`.
- [ ] **Step 3: Verificar** — `npx tsc --noEmit` → PASS; visual: alternar o tema pelos dois pontos e confirmar que aplica/persiste e segue após reload.
- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/layout/top-bar.tsx apps/web/src/app/(app)/settings/page.tsx
git commit -m "feat(web): toggle de tema no menu do usuario e em settings"
```

---

## Fase 4 — Inbox (tela-prova)

> Padrão de trabalho destas tasks: substituir cores hardcoded por tokens (`var(--...)` / classes Tailwind `bg-window`, `text-text-primary`, `bg-vibrancy`, `bg-accent-500`, `border-separator`, etc.), aplicar materiais macOS (vibrancy nas laterais, raio de control/list-item/panel) e validar nos dois temas. Verificação por task: `npx tsc --noEmit` + visual nos 2 temas.

### Task 15: Sidebar (vibrancy + seleção azul)

**Files:**
- Modify: `apps/web/src/components/layout/sidebar.tsx`

- [ ] **Step 1:** Material vibrancy (`.glass` + `var(--vibrancy-bg)`), section headers `font-bold text-[11px] text-text-secondary`, itens raio `list-item`, selecionado `background: var(--accent-500)` texto branco (no lugar da borda teal), hot mantém âmbar `var(--warning)`. Chips de filtro → trocar por `SegmentedControl` (`Todos·IA·Humano·Hot`).
- [ ] **Step 2:** Verificar — `npx tsc --noEmit` + visual.
- [ ] **Step 3:** Commit `feat(web): sidebar macOS (vibrancy, selecao azul, filtros segmentados)`.

### Task 16: Chat header + message list/bubble/input

**Files:**
- Modify: `apps/web/src/components/chat/chat-header.tsx`, `message-list.tsx`, `message-bubble.tsx`, `message-input.tsx`

- [ ] **Step 1:** Bolha "me" `background: var(--accent-500)` texto branco; bolha "them" `var(--bubble-them)`; raio 14–16. Indicador "IA digitando" mantém violeta (`var(--ai-thinking)`). Composer usa o Input macOS + Button `glass`/`primary`. Header com material e ações em botões `glass`.
- [ ] **Step 2:** Verificar — `npx tsc --noEmit` + visual.
- [ ] **Step 3:** Commit `feat(web): chat macOS (bolhas, composer, header)`.

### Task 17: DetailPanel

**Files:**
- Modify: `apps/web/src/components/layout/detail-panel.tsx`

- [ ] **Step 1:** Material translúcido raio `panel`, controle de IA usa `Switch`, estágio usa cores `var(--stage-sN)`, notas/tags em campos macOS.
- [ ] **Step 2:** Verificar — `npx tsc --noEmit` + visual.
- [ ] **Step 3:** Commit `feat(web): detail-panel macOS`.

### Task 17b: Fechamento do inbox

- [ ] **Step 1:** Run `cd apps/web && npm run build` → PASS.
- [ ] **Step 2:** Visual completo do `/conversations` nos dois temas (seleção, IA on/off/thinking, hot, estágios).
- [ ] **Step 3:** Commit (se houver ajustes) `fix(web): ajustes finos do inbox macOS`.

---

## Fase 5 — Telas restantes + remoção da camada cinematográfica

> **Estado intermediário esperado:** a Task 1 remove o `body::after` global (grain), mas o grain só volta como componente nesta Task 18. Entre a Fase 0 e aqui, a abertura (login/welcome) fica **sem grain** — isso é esperado, não é regressão.

### Task 18: Escopar o film grain só na abertura

**Files:**
- Modify: `apps/web/src/components/cinematic/film-grain.tsx`
- Modify: `apps/web/src/components/cinematic/welcome-intro.tsx`, `apps/web/src/app/login/page.tsx`

- [ ] **Step 1:** Garantir que `FilmGrain` é um componente montável (overlay `fixed inset-0 pointer-events-none`) e **não** depende do `body::after` global (removido na Task 1). Renderizar `<FilmGrain />` apenas dentro de `welcome-intro.tsx` e em `/login`. Confirmar que nenhuma outra rota o monta. Manter `prefers-reduced-motion` desativando a animação.
- [ ] **Step 2:** Verificar — `npx tsc --noEmit` + visual: grain aparece em login/abertura e **não** nas telas internas.
- [ ] **Step 3:** Commit `feat(web): film grain escopado a abertura (login + welcome-intro)`.

### Task 19: Remover three.js (ambient-network + login-particles)

**Files:**
- Delete: `apps/web/src/components/three/ambient-network.tsx`, `apps/web/src/components/three/login-particles.tsx`
- Modify: consumidores (provável `(app)/layout.tsx` ou onde `AmbientNetwork` é montado; `login/page.tsx` para `LoginParticles`)

- [ ] **Step 1:** Localizar consumidores com a **ferramenta de busca do agente** (Grep) por `AmbientNetwork`, `LoginParticles`, `login-particles`, `ambient-network` em `apps/web/src` (não usar `grep` de shell — ambiente primário é PowerShell). Remover imports/usos e deletar os arquivos. Login ganha fundo macOS (gradiente neutro sutil + janela de vidro).
- [ ] **Step 2:** Verificar — `npx tsc --noEmit` → PASS (sem refs órfãs).
- [ ] **Step 3:** Commit `chore(web): remove constelacao 3D e particulas de login (three.js)`.

> Nota: avaliar remover `three`, `@react-three/*`, `gsap`/`lenis` do `package.json` se ficarem sem uso — **somente** após grep confirmar zero referências. Se `gsap` ainda for usado (top-bar usa), manter.

### Task 20: Kanban + cores de funil

**Files:**
- Modify: `apps/web/src/components/kanban/kanban-board.tsx`, `kanban-card.tsx`

- [ ] **Step 1:** Cards como material macOS (raio `panel`/`card`, sombra `var(--shadow-control)`), colunas com header section, cores de estágio via `var(--stage-sN)`. O mapeamento `stage → token` é no frontend (não usar mais o `stageColor` hex cru do backend para pintar).
- [ ] **Step 2:** Verificar — `npx tsc --noEmit` + visual.
- [ ] **Step 3:** Commit `feat(web): kanban macOS + cores de funil reinterpretadas`.

### Task 21: Dashboard

**Files:**
- Modify: `apps/web/src/components/dashboard/*` (`kpi-card`, `funnel-chart`, `conversion-gauge`, `sales-table`, `activity-list`), `app/(app)/dashboard/page.tsx`

- [ ] **Step 1:** KPI cards e tabelas em material macOS; charts usando tokens de estágio/accent/semantic; remover glows.
- [ ] **Step 2:** Verificar — `npx tsc --noEmit` + visual.
- [ ] **Step 3:** Commit `feat(web): dashboard macOS`.

### Task 22: Feed + connect

**Files:**
- Modify: `apps/web/src/components/feed/feed-entry.tsx`, `app/(app)/feed/page.tsx`, tela `/connect`

- [ ] **Step 1:** Feed entries em material macOS, ícones de evento usando tokens (IA = violeta, pagamento = success, etc.). `/connect` (QR + estados) em superfícies macOS.
- [ ] **Step 2:** Verificar — `npx tsc --noEmit` + visual.
- [ ] **Step 3:** Commit `feat(web): feed + connect macOS`.

### Task 23: Login

**Files:**
- Modify: `apps/web/src/app/login/page.tsx`

- [ ] **Step 1:** Fundo macOS (gradiente neutro sutil) + cartão de vidro (Liquid Glass), botão `primary`, wordmark NEXUS. Film grain mantido (Task 18). Remover refs a mesh/aurora/partículas.
- [ ] **Step 2:** Verificar — `npx tsc --noEmit` + visual nos dois temas.
- [ ] **Step 3:** Commit `feat(web): login macOS`.

### Task 24: Varredura de resíduos hardcoded

**Files:**
- Modify: `ui/badge.tsx`, `ui/toast-provider.tsx`, `ui/modal.tsx`, e qualquer hex remanescente (incluir command-palette se existir)

- [ ] **Step 1:** Buscar hex remanescentes com a **ferramenta de busca do agente** (Grep), padrão `#[0-9A-Fa-f]{6}` em `apps/web/src` — não usar `grep` no shell (ambiente primário é PowerShell; evita fricção de shell). Garantir que a busca cobre também `ui/modal.tsx`, `ui/badge.tsx`, `ui/toast-provider.tsx` e qualquer `command-palette`. Para cada hex restante, decidir: token de tema ou cor semântica de produto (funil/IA — já tokenizadas). Substituir os que faltam; modal/sheets e toast em material macOS (vibrancy + raio `panel`).
- [ ] **Step 2:** Verificar — `npx tsc --noEmit` + visual.
- [ ] **Step 3:** Commit `chore(web): varredura final de cores hardcoded`.

---

## Fase 6 — Acessibilidade e fechamento

### Task 25: Passe de acessibilidade

**Files:** vários (ajustes pontuais)

- [ ] **Step 1: Contraste WCAG AA** — checar combinações texto×material nos dois temas (foco em cores de funil/IA sobre vibrancy claro e escuro): 4.5:1 texto normal, 3:1 texto grande/limites de controle. Ajustar tokens que falharem.
- [ ] **Step 2: Foco e fallback** — confirmar `focus-ring` accent visível em todos os controles; confirmar fallback `@supports not (backdrop-filter)` aplica sólido legível; `prefers-reduced-motion` desativa grain e transições.
- [ ] **Step 3: Commit** `fix(web): contraste AA, foco e fallback de vibrancy nos dois temas`.

### Task 26: Build final e limpeza de tokens órfãos

- [ ] **Step 1:** Run `cd apps/web && npm run build` → PASS.
- [ ] **Step 2:** Remover o alias temporário `primary → accent` do tailwind.config **se** todos os consumidores já usarem `accent`/tokens (grep `primary-` em `src`); caso contrário, manter o alias e anotar. Remover quaisquer CSS vars não mais referenciadas.
- [ ] **Step 3:** Run `cd apps/web && npm run lint` → PASS.
- [ ] **Step 4: Commit** `chore(web): build final do reskin macOS; remove tokens orfaos`.

---

## Riscos e notas de execução

- **Tema light é novo**: maior superfície de bugs de contraste — a Fase 6 é obrigatória, não opcional.
- **`color-mix`**: suportado nos navegadores-alvo modernos; se precisar suportar versões antigas, pré-calcular os tons especulares como tokens. (Decidir na Task 9 se houver problema.)
- **Alias `primary→accent`**: andaime para não quebrar consumidores durante a migração; remover no fim (Task 26).
- **GLASS do Figma** não tem equivalente 1:1 em CSS; aproximação por `backdrop-filter` + camadas de fill + sombra especular (já refletido nas Tasks 9 e nos materiais).
- Lógica de negócio (realtime, API, N8N/Evolution) é **intocável** — nenhuma task altera comportamento.
