# Sumate Ya - Ficha Tecnica (vision basada en requerimientos)

## 1) Ficha tecnica

- Producto: plataforma para conectar jugadores de futbol amateur con partidos y torneos organizados en clubes.
- Proposito: eliminar la friccion de coordinar partidos por canales informales y permitir sumarse con un flujo simple.
- Objetivo del MVP: publicar oferta de partidos/torneos, facilitar el alta de jugadores y asegurar gestion de cupos y horarios.
- Alcance funcional base:
  - descubrimiento de partidos por zona, formato y horario,
  - creacion de partidos y campeonatos,
  - confirmacion de asistencia y gestion de participantes,
  - visibilidad de clubes, canchas y disponibilidad.

### Tecnologias objetivo propuestas

| Capa         | Tecnologia sugerida                | Justificacion                                  |
| ------------ | ---------------------------------- | ---------------------------------------------- |
| Frontend     | Web app en TypeScript              | Rapidez de iteracion para validar producto     |
| Backend      | API en Express (node) + TypeScript | Desarrollo agil de reglas de negocio           |
| Persistencia | Supabase (PostgreSQL)              | Modelo consistente para entidades y relaciones |

## 2) Arquitectura (objetivo)

- Enfoque propuesto: arquitectura modular por dominios (usuarios, clubes, partidos, torneos).
- Patron sugerido: capas de presentacion, negocio y datos para separar responsabilidades.
- Interaccion principal: cliente consume API HTTP para operar sobre el dominio.
- Persistencia central: modelo relacional con integridad referencial para trazabilidad operativa.

### Capas logicas esperadas

1. Presentacion:
   - interfaces para jugadores, organizadores y clubes.
2. Aplicacion/negocio:
   - reglas de validacion (cupos, formatos, disponibilidad, inscripciones).
3. Datos:
   - repositorios para lectura/escritura de entidades clave.
4. Transversal:
   - autenticacion, autorizacion por rol, logging y manejo de errores.

## 3) Entidades y relaciones

- Ver diagrama resumido en `docs/entidades-relaciones.mmd` (Mermaid).
- Relacionamiento funcional principal:
  - Un club ofrece multiples slots de disponibilidad.
  - Un club puede alojar multiples partidos y torneos.
  - Un partido tiene multiples participantes.
  - Un torneo agrupa multiples jornadas/slots.
  - Un usuario puede actuar como jugador y/o organizador segun su rol.

## 4) Vision board trasladado a definicion tecnica

- Vision tecnica: experiencia de coordinacion de futbol amateur orientada a velocidad, claridad y baja friccion.
- Publico objetivo traducido a roles de sistema:
  - Jugador: descubre opciones cercanas y confirma participacion.
  - Organizador: crea eventos y completa equipos rapidamente.
  - Club: publica disponibilidad y maximiza ocupacion de canchas.
- Necesidades convertidas en requerimientos:
  - filtros utiles para encontrar partidos,
  - datos claros de donde/cuando/como se juega,
  - control de cupos y asistencia,
  - capacidad de estructurar campeonatos.
- Restricciones y riesgos de producto:
  - efecto red (masa critica),
  - calidad y actualidad de la disponibilidad de clubes,
  - evolucion tecnica continua del equipo.

## 5) Casos de uso y flujos principales

1. Onboarding y acceso:
   - alta de cuenta por rol y autenticacion segura.
2. Descubrimiento de oferta:
   - consulta de partidos con filtros de ubicacion, formato y horario.
3. Publicacion de partido:
   - definicion de sede, cupos y condiciones de juego.
4. Participacion en partido:
   - unirse, seleccionar equipo cuando corresponda y cancelar participacion.
5. Creacion de campeonato:
   - configuracion de formato, limites de equipos y calendario.
6. Gestion de clubes:
   - exposicion de canchas, franjas horarias y datos de referencia.

## 6) Definicion de epicas (board completo)

1. Epic 1 - Onboarding y cuentas
   - Registro/login por rol, sesion y verificacion de identidad.
2. Epic 2 - Descubrimiento de partidos
   - Listado con filtros por zona/formato/horario y detalle de disponibilidad.
3. Epic 3 - Creacion de partidos
   - Publicacion de partidos con reglas de cupos, formato y sede.
4. Epic 4 - Participacion y asistencia
   - Unirse, confirmar, asignar equipo y gestionar bajas.
5. Epic 5 - Perfil de jugador
   - Datos personales, posicion preferida e historial deportivo.
6. Epic 6 - Gestion de clubes y canchas
   - Perfil de club, slots disponibles y visibilidad de oferta.
7. Epic 7 - Campeonatos
   - Configuracion de torneos, limites y planificacion de jornadas.
8. Epic 8 - Comunidad y confianza
   - Transparencia de cupos, estado de partidos y compromiso de asistencia.
9. Epic 9 - Impacto y monetizacion
   - Mayor ocupacion de canchas y base para comisiones/suscripciones.
