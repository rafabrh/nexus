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

- **Escopo:** reskin macOS completo (identidade teal/violeta anterior passa a secundária).
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

## Valores reais extraídos do kit (modo light)

| Componente | Valores |
|---|---|
| Push Button | raio 6 · SF Pro peso 510 (medium) · 13px · texto `#1A1A1A` |
| Switch | pill · knob branco · sombras empilhadas (blur 44/4/1, ~`#0000001a`) · anel off `#C6C6C6` 1.5px |
| Segmented Control | raio 6 · fundo `#00000005` · separador `#D9D9D9` · label SF Pro 510/13 |
| Text Field | raio 6 · fill `#FFFFFF` · sombra `#00000014` |
| Botão "espelho" (Liquid Glass) | pill · camadas `#333`/`#FFFFFF80`/`#F7F7F7` · efeito GLASS · sombra `0 8 40 rgba(0,0,0,.12)` |
| Sidebar (Example) | painel raio 18 · vibrancy · item raio 5 · section header SF Pro 700/11 @ 50% |
| Menu / Notification | material Liquid Glass (fill + glass effect + sombra suave) |

## Arquitetura de tokens

Reestruturar `apps/web/src/app/globals.css`:

1. **Comutação de tema** por atributo na raiz: `html[data-theme="light"]` / `html[data-theme="dark"]`.
   Cada token CSS var ganha valor nos dois blocos. Default resolvido por `prefers-color-scheme`
   quando não há override; override do usuário força `data-theme`.
2. **Pares de tokens** (exemplos):
   - Material base: light `#ECECEC` / janela `#FFFFFF`; dark `#1E1E1E` / janela `#1C1C1E`.
   - Vibrancy (sidebar/painéis): `rgba(246,246,246,.7)` light / `rgba(40,40,42,.6)` dark,
     `backdrop-filter: blur(20px) saturate(1.1)`.
   - Realce: `#007AFF` / `#0A84FF`.
   - IA (violeta, preservado): `#8B5CF6` / `#A78BFA`.
   - Texto: seguir system colors do macOS (label/secondary/tertiary) nos dois temas.
   - Raios: controle 6 · list-item 5 · painel 18 · pill 9999.
   - Sombras: camadas suaves macOS (substituem `--glow-*`).
3. **Remoção de tokens**: `--glow-*` neon, `--gradient-mesh-login`, `--gradient-radial-hero` (teal),
   `btn-gradient-primary` teal.

## Tipografia

`--font-sans: -apple-system, BlinkMacSystemFont, 'Inter', system-ui, sans-serif`.
Inter self-hosted (já presente como fallback). Pesos: 400 / 500 (≈ SF 510) / 600 / 700.
Escala compacta atual (11–24px) mantida — coincide com densidade do macOS.

## Primitivos / reskins (componentes Figma → telas NEXUS)

- `ui/button` (CVA): variantes `glass` (Liquid Glass "espelho" — ações de janela/topbar),
  `primary` (azul Apple, gradiente especular sutil), `secondary` (push button cinza), `ghost`.
- `ui/switch` (novo) → controle de IA e **toggle de tema** (knob branco + sombras reais).
- `ui/segmented-control` (novo) → chips de filtro da sidebar (`Todos·IA·Humano·Hot`) e abas.
- `ui/input` / `ui/search-field` → busca e composer (raio 6, fill claro/escuro).
- `layout/sidebar` → vibrancy + section headers SF 700/11 @50% + seleção azul (item raio 5).
- `layout/detail-panel`, `ui/modal`, sheets → material translúcido raio 18.
- `layout/top-bar` → menu bar translúcida.

## O que sai (cinematográfico → vibrancy)

- Remover `body::before` (aurora) e `--glow-*` neon de `globals.css`.
- Remover `three/ambient-network.tsx` e `three/login-particles.tsx` (constelação 3D / partículas).
- Login → material macOS limpo (gradiente sutil + janela de vidro), sem partículas.
- **Manter** `cinematic/film-grain.tsx` **apenas** na abertura: `welcome-intro` e `/login`
  (escopar o overlay para esses contextos, não global em `body::after`).

## Rollout

1. Fundação: tokens dual-theme + provider/hook de tema + toggle + persistência.
2. Primitivos: Button / Switch / SegmentedControl / Field.
3. Inbox de conversas (tela-prova): sidebar + chat + detail panel.
4. Varredura: kanban, dashboard, feed, connect, settings, login — ajustar resíduos.

## Acessibilidade

- Contraste de texto validado nos **dois** temas (light é novo — risco maior).
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
