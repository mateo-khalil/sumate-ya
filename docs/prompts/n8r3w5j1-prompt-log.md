# Prompt Log

- Timestamp: 2026-04-26 19:40:00
- Task ID: n8r3w5j1

## User Prompt

> Estoy en la rama votar-resultado. Necesito resolver los 2 bugs críticos detectados en la auditoría reciente para poder cerrar la User Story "Votar Resultado". También quiero resolver los problemas menores P3, P4 y P5.
>
> P1 — CRÍTICO — Sin validación de match status en proposeMatchResult y voteMatchResult
> P2 — CRÍTICO — Botón "Cargar resultado" desaparece si todas las submissions están REJECTED
> P3 — MENOR — Inline styles violan design-system.md
> P4 — MENOR — Falta test case para match cancelled
> P5 — MENOR — Falta test case para race condition

## Agent Main Actions

- Corrigió P1 en backend (matchResultVoteRepository.ts + matchResultVoteService.ts): agregó `getMatchStatus()` al repository y guards de `status !== 'cancelled'` en `proposeMatchResult` y `voteMatchResult` con mensaje "El partido fue cancelado, no se pueden proponer ni votar resultados". En frontend ([id].astro) agregó `&& !matchCancelled` a la condición `showResultSection`.
- Corrigió P2 (MatchResultsSection.tsx): reemplazó la condición `submissions.length === 0` por `!hasActiveSubmission` (que es `!(hasPending || hasConfirmed)`), cubriendo el caso donde todas las submissions están REJECTED; también ajustó el CTA "Proponer otro resultado" para que no aparezca cuando ya hay un resultado confirmado.
- Corrigió P3 (MatchResultsSection.tsx + ProposeResultForm.tsx): eliminó todos los inline style objects (`S.xxx`), agregó tokens de diseño (`--color-success`, `--font-display`, `--font-condensed`) a globals.css, y reemplazó todos los estilos con clases Tailwind que usan los tokens del @theme. Agregó TC-16 (match cancelado) y TC-17 (race condition) a docs/TESTING-votar-resultado.md. Typecheck pasó con 0 errores.
