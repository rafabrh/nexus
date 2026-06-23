# NEXUS — Reskin macOS (dual-theme) — Design

> Status: aprovado no brainstorming (2026-06-23). Próximo passo: plano de implementação (writing-plans).

## Objetivo

Aplicar a estética macOS (Apple Design Resources / kit "Liquid Glass" do macOS Tahoe) sobre
toda a plataforma NEXUS, em **reskin completo**, com **dois temas (light + dark) comutáveis pelo
usuário**. Materiais, profundidade, formas e tipografia passam a ser os do macOS; a cor de realce
adota o **azul sistêmico da Apple**; a IA permanece **violeta** como assinatura semântica.

Fonte dos componentes: arquivo Figma do usuário (file key `qh1hcoXzqs9ntKmH0J6uKY`), que contém
o kit macOS oficial. Valores reais foram extraídos via API REST do Figma e estão registrados abaixo.

## Decisões (brainstorming)

- **Escopo:** reskin macOS completo. O **teal** deixa de ser a cor de realce (substituído pelo azul
  Apple). O **violeta da IA é preservado** como assinatura semântica — não é "secundário", é mantido
  com a mesma função de antes.
- **Temas:** light + dark, toggle exposto ao cliente; default = `prefers-color-scheme` do SO,
  com override manual persistido.
- **Realce:** azul Apple (`#007AFF` light / `#0A84FF` dark). Teal deixa de ser o realce.
- **IA:** permanece violeta (`#8B5CF6` / `#A78BFA`) — contraste semântico (azul = sistema/clicável,
  violeta = IA).
- **Tipografia:** stack híbrida — SF Pro nativa em Apple, Inter (self-hosted) como fallback.
  Licença da SF Pro proíbe hospedá-la; por isso `-apple-system` primeiro e Inter depois.
- **Efeitos:** vibrancy/translucidez macOS substituem a camada cinematográfica (aurora, glows neon,
  constelação 3D). **Exceção:** o **film grain é mantido só na abertura** (welcome-intro + login)
  para teste com a nova estética.
- **Estratégia:** token-first (cascata) — reescrita do `globals.css` faz a maioria das telas migrar
  automaticamente; poucos primitivos novos.

> Nota sobre peso de fonte: o kit usa SF Pro peso **510**, que não é mapeável em CSS. Em todo este
> documento e na implementação o alvo CSS é **`font-weight: 500`** (medium). Nunca usar `510`.

## Valores reais extraídos do kit (modo light)

| Componente | Valores |
|---|---|
| Push Button | raio 6 · medium (500) · 13px · texto `#1A1A1A` |
| Switch | pill · knob branco · sombras empilhadas (blur 44/4/1, ~`#0000001a`) · anel off `#C6C6C6` 1.5px |
| Segmented Control | raio 6 · fundo `#00000005` · separador `#D9D9D9` · label medium 13 |
| Text Field | raio 6 · fill `#FFFFFF` · sombra `#00000014` |
| Botão "espelho" (Liquid Glass) | pill · camadas `#333`/`#FFFFFF80`/`#F7F7F7` · efeito GLASS · sombra `0 8 40 rgba(0,0,0,.12)` |
| Sidebar (Example) | painel raio 18 · vibrancy · item raio 5 · section header bold (700)/11 @ 50% |
| Menu / Notification | material Liquid Glass (fill + glass effect + sombra suave) |

### Valores derivados para o modo dark

O kit fornece valores light. Os valores dark abaixo seguem as **system colors documentadas do
macOS dark** (Apple HIG) e são o alvo a implementar; refinar na fase de tokens contra screenshots
nativos do macOS dark:

| Token | Light | Dark |
|---|---|---|
| Material base / janela | `#ECECEC` / `#FFFFFF` | `#1E1E1E` / `#1C1C1E` |
| Vibrancy (sidebar/painel) | `rgba(246,246,246,.7)` | `rgba(40,40,42,.6)` |
| Realce (azul) | `#007AFF` | `#0A84FF` |
| IA (violeta) | `#8B5CF6` | `#A78BFA` |
| Texto label / secondary / tertiary | `#1A1A1A` / `rgba(0,0,0,.5)` / `rgba(0,0,0,.26)` | `#F5F5F7` / `rgba(235,235,245,.6)` / `rgba(235,235,245,.3)` |
| Separador | `#D9D9D9` | `rgba(255,255,255,.12)` |
| Campo (fill control) | `#FFFFFF` | `#2C2C2E` |
| Sombra de controle | `rgba(0,0,0,.08)` | `rgba(0,0,0,.4)` |
| Bolha "them" (chat) | `#E9E9EB` | `#3A3A3C` |

## Arquitetura de tokens

Reestruturar `apps/web/src/app/globals.css`:

1. **Comutação de tema** por atributo na raiz: `html[data-theme="light"]` / `html[data-theme="dark"]`.
   Cada token CSS var ganha valor nos dois blocos. Default resolvido por `prefers-color-scheme`
   quando não há override; override do usuário força `data-theme`.

   **Mecanismo e anti-FOUC (Next.js 14 App Router):**
   - Persistência em `localStorage` (chave `nexus-theme`: `'light' | 'dark' | 'system'`).
   - **Script inline blocante** injetado no `<head>` via `app/layout.tsx` que lê o `localStorage`
     (ou `matchMedia('(prefers-color-scheme: dark)')` quando `'system'`) e seta `data-theme` em
     `document.documentElement` **antes do primeiro paint** — evita flash. Como as telas são
     `'use client'`, isso cobre o SSR sem hydration mismatch (o atributo é setado client-side antes
     do React montar).
   - `ThemeProvider` (client) + hook `useTheme()` em `zustand` (store `settings`, já existente)
     expõem `theme` e `setTheme`, reescrevem `data-theme` e persistem. `'system'` reavalia em
     `matchMedia` change.
2. **Pares de tokens** (exemplos):
   - Material base: light `#ECECEC` / janela `#FFFFFF`; dark `#1E1E1E` / janela `#1C1C1E`.
   - Vibrancy (sidebar/painéis): `rgba(246,246,246,.7)` light / `rgba(40,40,42,.6)` dark,
     `backdrop-filter: blur(20px) saturate(1.1)`.
   - Realce: `#007AFF` / `#0A84FF`.
   - IA (violeta, preservado): `#8B5CF6` / `#A78BFA`.
   - Texto: seguir system colors do macOS (label/secondary/tertiary) nos dois temas.
   - Raios: controle 6 · list-item 5 · painel 18 · pill 9999.
   - Sombras: camadas suaves macOS (substituem `--glow-*`).
3. **Remoção de tokens** (com substituto). Blast radius confirmado por grep — consumidores fora do
   `globals.css`: `ui/button.tsx`, `app/login/page.tsx`, `(app)/settings/page.tsx`.

   | Token removido | Substituto |
   |---|---|
   | `--glow-primary*` / `--glow-ai*` / `--glow-success/warning/error/info` | sombras macOS suaves em camadas (`--shadow-control`, `--shadow-panel`) |
   | `--gradient-mesh-login` / `--gradient-radial-hero` | fundo de login = material macOS (gradiente neutro sutil + janela de vidro) |
   | `btn-gradient-primary` (teal) | variante `primary` do Button (azul Apple + specular sutil) |
   | `--glass-bg` neon-tinted | `--vibrancy-*` (pares light/dark acima) |

4. **`backdrop-filter` (vibrancy) — fallback obrigatório.** Todo material translúcido declara um
   **sólido de fallback** via `@supports not (backdrop-filter: blur(1px))` (light `#F6F6F6`,
   dark `#282829`), garantindo legibilidade onde o blur não é suportado.

## Tipografia

`--font-sans: -apple-system, BlinkMacSystemFont, 'Inter', system-ui, sans-serif`.
Inter self-hosted (já presente como fallback). Pesos: 400 / 500 (≈ SF 510) / 600 / 700.
Escala compacta atual (11–24px) mantida — coincide com densidade do macOS.

## Primitivos / reskins (componentes Figma → telas NEXUS)

- `ui/button` (CVA): variantes `glass` (Liquid Glass "espelho" — ações de janela/topbar),
  `primary` (azul Apple, gradiente especular sutil), `secondary` (push button cinza), `ghost`.
- `ui/switch` (novo) → controle de IA e knob do toggle de tema (knob branco + sombras reais).
- **Toggle de tema (ponto de exposição na UI):** controle segmentado `Sistema · Claro · Escuro`
  no **menu do usuário** da `top-bar` (acesso rápido) **e** replicado em `/settings` na seção de
  aparência. Ambos chamam `setTheme()` do hook.
- `ui/segmented-control` (novo) → chips de filtro da sidebar (`Todos·IA·Humano·Hot`) e abas.
- `ui/input` / `ui/search-field` → busca e composer (raio 6, fill claro/escuro).
- `layout/sidebar` → vibrancy + section headers SF 700/11 @50% + seleção azul (item raio 5).
- `layout/detail-panel`, `ui/modal`, sheets → material translúcido raio 18.
- `layout/top-bar` → menu bar translúcida.

## O que sai (cinematográfico → vibrancy)

- Remover `body::before` (aurora) e `--glow-*` neon de `globals.css`.
- Remover `three/ambient-network.tsx` e `three/login-particles.tsx` (constelação 3D / partículas).
- Login → material macOS limpo (gradiente sutil + janela de vidro), sem partículas.
- **Manter** `cinematic/film-grain.tsx` (`apps/web/src/components/cinematic/film-grain.tsx`)
  **apenas** na abertura. Mecanismo de escopo: o overlay deixa de ser global no `body::after` e
  passa a ser **montado como componente** dentro de dois contextos: `cinematic/welcome-intro.tsx`
  (`apps/web/src/components/cinematic/welcome-intro.tsx`) e a página `/login`
  (`apps/web/src/app/login/page.tsx`). Em qualquer outra rota ele não é renderizado.
- O grain é mantido como teste **nos dois temas** (a opacidade pode precisar de ajuste fino no light,
  onde o `mix-blend-mode: overlay` rende diferente); desativado sob `prefers-reduced-motion`
  (comportamento já existente).

## Rollout

1. Fundação: tokens dual-theme + provider/hook de tema + toggle + persistência.
2. Primitivos: Button / Switch / SegmentedControl / Field.
3. Inbox de conversas (tela-prova): sidebar + chat + detail panel.
4. Varredura: kanban, dashboard, feed, connect, settings, login — ajustar resíduos.

**Telas que NÃO migram só pela cascata (cores hardcoded — exigem toque manual).**
Grep encontrou **77 hex literais em 20 arquivos `.tsx`**. A cascata de tokens cobre o que usa CSS
vars; estes consomem hex direto e precisam ser reescritos para tokens (ou pares light/dark):
`chat/message-bubble`, `chat/message-list`, `chat/message-input`, `chat/chat-header`,
`kanban/kanban-card`, `kanban/kanban-board`, `feed/feed-entry`, `dashboard/activity-list`,
`dashboard/conversion-gauge`, `dashboard/page`, `feed/page`, `layout/top-bar`, `layout/sidebar`,
`ui/button`, `ui/input`, `ui/badge`, `ui/toast-provider`, `app/login/page`,
`(app)/settings/page`, `three/login-particles` (este é removido).
Atenção especial às **cores de funil** (`stageColor` S0–S6) e **status de IA** vindas do backend
como hex literais: decidir se permanecem (são dados semânticos do produto) ou ganham variação por
tema — recomendação: mantê-las, validando contraste sobre os materiais claros e escuros.

## Acessibilidade

- Contraste de texto validado nos **dois** temas (light é novo — risco maior). **Critério: WCAG AA**
  — 4.5:1 para texto normal, 3:1 para texto grande (≥18px/14px bold) e para limites de controles.
  Método: checagem das combinações texto×material de cada tema (foco nas cores de funil/IA sobre
  vibrancy claro e escuro); ferramenta de contraste no review visual antes do merge.
- Foco visível: ring azul sistêmico (`focus-ring` repintado).
- `prefers-reduced-motion` respeitado (já existente); film grain desativado sob reduced-motion.
- Vibrancy não pode reduzir legibilidade do conteúdo.

## Fora de escopo

- Mudanças de comportamento/lógica de negócio (realtime, API, N8N/Evolution — intocáveis).
- Novos recursos de produto. Este trabalho é puramente de design system / aparência.

## Riscos

- **Tema light é novo**: maior superfície de bugs de contraste; exige varredura cuidadosa.
- **Efeito GLASS do Figma** não tem equivalente 1:1 em CSS; aproximar com
  `backdrop-filter: blur()+saturate()` + camadas de fill + sombra especular.
- Regressões visuais em telas que dependiam de glows/aurora para hierarquia.
