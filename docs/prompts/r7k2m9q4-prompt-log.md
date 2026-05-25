# Prompt Log

- Timestamp: 2026-05-11 21:45:00
- Task ID: r7k2m9q4

## User Prompt

> necestio que uses el github cli para anlizar este poryecto y puedas escribir este informe.
> Objetivo: Analizar cómo trabajó el equipo durante el sprint anterior y tomar decisiones concretas para mejorar la forma de trabajo en el próximo sprint. La revisión debe enfocarse en el proceso (no solo en lo técnico): organización, coordinación y ejecución.
> Debe cubrir: reuniones y ceremonias, comunicación, carga de trabajo, disponibilidad, Definition of Done, gestión del tablero/backlog. Resultados obligatorios: al menos 3 cosas a mantener, al menos 3 cosas a corregir con cambio concreto + cómo implementar + cómo verificar.
> Entregable: informe breve (máx. 1-2 páginas) en markdown para luego pasar a PDF.
> Referencia del tablero: https://github.com/users/mateo-khalil/projects/2 — usar contexto de Sprints 1 y 2.
> Ejemplo de mejora: las cards tienen que estar prontas para testear máximo el viernes para no testear domingo a última hora.

## Agent Main Actions

- Consulté el proyecto GitHub #2 de mateo-khalil con `gh project` y `gh api repos/.../milestones`, exportando 58 items y 61 PRs para analizar cards, estimaciones, asignados y estados por milestone (Sprints 1, 2, 3).
- Calculé métricas por sprint: cards Done vs estimación, distribución de carga por integrante, conteo de PRs mergeados/cerrados, y detecté el cuello de botella en `michelcap` (50-75% del trabajo desde Sprint 2) y la acumulación de 7 cards en *Ready for test* en Sprint 3.
- Generé `docs/retrospectiva-sprint-1-2.md` con hitos de Sprint 1/2, diagnóstico por aspecto (ceremonias, comunicación, carga, DoD, backlog), 4 cosas a mantener y 4 mejoras concretas con cambio + implementación + métrica verificable.
