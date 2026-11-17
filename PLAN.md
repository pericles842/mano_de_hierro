# PLAN — MANO DE HIERRO

Juego de estrategia y gestión en 3D voxel, en el navegador. Eres el dictador de un país ficticio:
de día administras el régimen (impuestos, presupuesto, reclutamiento, equipo) y cuando estallan
revueltas despliegas tus fuerzas en tiempo real, con cámara desde arriba, arrastrando unidades al mapa.
Cada decisión tiene consecuencias: más mano dura dispersa antes, pero sube la ira, la presión
internacional y el riesgo de golpe de Estado.

---

## 1. Tecnología (decisión)

| Pieza | Elección | Por qué |
|---|---|---|
| Motor 3D | **Three.js** | El estilo voxel es 3D. Phaser es un motor 2D: serviría para sprites isométricos, no para cámara 3D real con rotación y zoom. |
| Lenguaje | **TypeScript** (modo `strict`) | Tipos para unidades, estado y eventos; menos bugs a medida que crece. |
| Build / servidor | **Vite** | Arranque instantáneo, recarga en caliente, build optimizado. |
| UI (menús, barra de unidades, HUD) | **HTML/CSS encima del canvas** | Más fácil de maquetar y de hacer accesible que dibujar la UI en 3D. |
| Tests | **Vitest** | Probar la simulación (economía, IA, combate) sin navegador. |
| Calidad | **ESLint + Prettier** | Estilo uniforme y errores detectados al momento. |
| Control de versiones | **git** | Un commit por cada paso del plan. |

Entorno verificado: Node 24, npm 11, git 2.52.

---

## 2. Arquitectura

Principio central: **la simulación no sabe que existe Three.js.**
La lógica del juego es TypeScript puro (testeable); el renderizado solo *lee* el estado y lo dibuja.

```
            ┌──────────── Input (ratón, teclado, drag & drop) ────────────┐
            ▼                                                             │
   Comandos ("desplegar soldado en x,z", "subir impuestos 5%")            │
            ▼                                                             │
   ┌─────────────────────┐   eventos    ┌────────────────────────┐        │
   │  SIMULACIÓN (pura)  │ ───────────► │  UI (HTML/CSS)         │ ───────┘
   │  entidades + systems│              │  HUD, barra, menús     │
   │  paso fijo 30 Hz    │              └────────────────────────┘
   └─────────┬───────────┘
             │ lectura del estado (cada frame)
             ▼
   ┌─────────────────────┐
   │ RENDER (Three.js)   │  voxels con InstancedMesh, cámara, partículas
   │ interpolado a 60fps │
   └─────────────────────┘
```

Decisiones clave:
- **Game loop de paso fijo** (la simulación avanza a 30 Hz; el render interpola a los fps del monitor). Así el juego se comporta igual en cualquier PC y se puede pausar o acelerar (x1, x2, x4).
- **Entidades + componentes + sistemas (ECS ligero, propio)**: una entidad es un id; los componentes son datos (`Position`, `Health`, `Morale`, `Weapon`...); los sistemas tienen la lógica (`MovementSystem`, `CrowdSystem`, `CombatSystem`...). Añadir una unidad nueva = combinar componentes, sin tocar el resto.
- **Datos separados del código**: unidades, mejoras, políticas y eventos se definen en archivos de configuración (`data/*.ts`). Para equilibrar el juego se cambian números, no lógica.
- **Comandos + bus de eventos**: la UI nunca modifica el estado directamente; envía comandos. La simulación emite eventos (`unidadDesplegada`, `revueltaSofocada`) que la UI escucha.
- **Rendimiento**: multitudes de cientos de manifestantes con `InstancedMesh` (una llamada de dibujo por tipo de modelo) y una *rejilla espacial* para buscar vecinos rápido.
- **Modelos voxel**: definidos como matrices de cubos en código al principio; más adelante, importación de archivos `.vox` de MagicaVoxel si quieres diseñarlos a mano.

### Estructura de carpetas

```
juego-demo/
├─ index.html
├─ package.json · tsconfig.json · vite.config.ts · eslint/prettier
├─ public/                 # audio, modelos .vox, texturas
└─ src/
   ├─ main.ts              # punto de entrada: crea Game y arranca
   ├─ core/                # GameLoop, EventBus, CommandQueue, Random con semilla
   ├─ ecs/                 # World, entidades, componentes
   ├─ sim/                 # lógica pura del juego
   │  ├─ systems/          # movement, crowd, combat, morale, economy...
   │  ├─ riot/             # una revuelta: mapa, oleadas, condiciones de victoria
   │  └─ regime/           # gestión: tesoro, impuestos, popularidad, lealtad
   ├─ data/                # units.ts, upgrades.ts, policies.ts, events.ts
   ├─ render/              # Three.js: escena, cámara, voxels, instancing, efectos
   ├─ input/               # cámara (pan/zoom/rotar), selección, drag & drop, raycast
   ├─ ui/                  # HUD, barra de unidades, pantallas de gestión
   └─ save/                # guardar/cargar en localStorage
tests/                     # Vitest, espejo de src/sim
```

---

## 3. Diseño del juego

### Bucle principal (cada "día")
1. **Fase de gestión** (por turnos): ajustas impuestos y presupuesto, reclutas, compras equipo, eliges políticas. Ves informes: popularidad, ira por barrio, presión internacional, lealtad del ejército.
2. **Fase de revuelta** (tiempo real): estalla una protesta en una zona de la ciudad. Despliegas fuerzas arrastrándolas desde la barra inferior. Objetivo: proteger edificios clave (palacio, TV estatal, banco) y bajar la "ira" de la multitud antes de que se extienda.
3. **Consecuencias**: el resultado y los métodos usados alteran tus indicadores y el dinero. Pueden aparecer eventos (sanciones, deserciones, huelgas, intento de golpe).

### Indicadores del régimen
- **Tesoro** — sube con impuestos, baja con sueldos, equipo y daños.
- **Popularidad** — baja con impuestos altos y represión; si es muy baja, revueltas más grandes y frecuentes.
- **Presión internacional** — sube con la mano dura; trae sanciones (menos ingresos).
- **Lealtad militar** — baja si no pagas bien o si ordenas represión extrema; a cero = **golpe de Estado (derrota)**.

### Unidades y despliegues (barra inferior, arrastrar y soltar)
| Unidad | Rol |
|---|---|
| Soldado antidisturbios | Básico, barato. Contiene y empuja. |
| Escudos (formación) | Muro móvil; bloquea el paso, muy resistente. |
| Barricada | Estructura fija; corta calles y desvía la multitud. |
| Ballena (camión de agua) | Dispersa grupos grandes a distancia; consume agua. |
| Tanqueta | Imponente: baja la moral de la multitud solo con estar; cara y mal vista internacionalmente. |

### Política de fuerza (antes y durante la revuelta)
Un selector de "nivel de fuerza" — por ejemplo: **Contención → Gas lacrimógeno → Perdigones → Mano dura**.
Cada nivel dispersa más rápido, pero aumenta ira, presión internacional y riesgo de deserción.
La gracia del juego es encontrar el equilibrio.

### Manifestantes (IA)
- Movimiento en grupo (*steering*: cohesión, separación, seguir objetivo).
- Cada uno tiene **ira** y **miedo**; la ira se contagia entre vecinos, el miedo los hace huir.
- Tipos: pacíficos, radicales (lanzan objetos), líderes (si se dispersan, el grupo se debilita).

### Progresión
- Mejoras de equipo (mejores escudos, más presión de agua, blindaje).
- Más barrios desbloqueados y revueltas más grandes con el tiempo.
- Finales: sobrevivir X días, ser derrocado por la revolución o sufrir un golpe militar.

---

## 4. Plan paso a paso

Cada paso termina con algo **jugable o visible** y un commit en git.

| # | Paso | Resultado visible |
|---|---|---|
| 0 | **Proyecto base**: Vite + TS + Three.js + ESLint/Prettier + Vitest + git | Un cubo girando en el navegador; `npm test` pasa. |
| 1 | **Mapa y cámara**: plaza voxel (suelo, calles, edificios simples), cámara cenital con pan, zoom y rotación limitados | Puedes moverte por una plaza de la ciudad. |
| 2 | **Núcleo**: game loop de paso fijo, ECS, bus de eventos, pausa/velocidad | Soldados voxel caminando a puntos del mapa. |
| 3 | **Despliegue**: barra inferior con tipos de unidad, arrastrar al mapa (raycast al suelo), coste en dinero, selección y órdenes de movimiento | Arrastras soldados y barricadas a la plaza. |
| 4 | **Multitudes**: manifestantes con steering, rejilla espacial, InstancedMesh, ira/miedo | Cientos de manifestantes avanzando hacia el palacio. |
| 5 | **Contención**: choques, empuje de escudos, barricadas que bloquean, ballena con chorro de agua, tanqueta | Las unidades contienen y dispersan a la multitud. |
| 6 | **Política de fuerza**: selector de nivel con efectos y consecuencias | Puedes elegir gas, perdigones o mano dura. |
| 7 | **Revuelta completa**: oleadas, edificios a proteger, victoria/derrota, resumen final | Una partida de revuelta de principio a fin. |
| 8 | **Gestión del régimen**: impuestos, presupuesto, reclutamiento, compra de equipo, indicadores | El bucle día → gestión → revuelta funciona. |
| 9 | **Campaña**: días, eventos aleatorios, mejoras, golpe de Estado, finales; guardado | Una campaña completa que se puede guardar. |
| 10 | **Pulido**: partículas (agua, gas, humo), sonido, menús, equilibrio, rendimiento | Versión demo presentable. |

---

## 5. Buenas prácticas que seguiremos
- TypeScript `strict`, sin `any`.
- La lógica de `sim/` sin dependencias de Three.js ni del DOM → tests unitarios de economía, IA y combate.
- Números aleatorios con semilla (partidas reproducibles y fáciles de depurar).
- Liberar recursos de Three.js (`dispose`) al cambiar de escena, para no tener fugas de memoria.
- Un commit pequeño y descriptivo por paso; `npm run lint` y `npm test` antes de cada commit.
- Panel de depuración (FPS, número de entidades) activable con una tecla.

---

## 6. Decidido
- País: **República Popular de Pomposia** (capital: Ciudad Pompón, moneda: pomposos ₱, lema: «¡Orden, Bigote y Progreso!»).
- Dictador (el jugador): **Generalísimo Bartolomé Pomposo III, «El Gran Bigote»**.
- Tono: sátira con humor negro.
- Cada día aparecen 2-4 revueltas en el mapa del país; eliges cuál sofocar y las demás restan popularidad.
- Revueltas inspiradas en protestas célebres, sin ser literales: El Gran Cacerolazo, Los Chalecos Naranjas,
  La Primavera de los Adoquines, La Revuelta de las Flores, La Marcha del Pan, La Huelga del Puerto.

## 7. Estado de la demo (v0.1)
Hecho: pasos 0-8 en versión simplificada (mapa del país, gestión, revuelta jugable completa, consecuencias, 15 días).
Simplificaciones respecto al plan: entidades como objetos tipados en lugar de un ECS completo; sin ESLint/Prettier ni guardado todavía.

## 8. Por decidir más adelante
- Paleta de colores del voxel y estilo de la ciudad.
- ¿Música/sonidos propios o librerías gratuitas?

## Cambios v0.2
- Título: **MANO DE HIERRO**. Al empezar, el jugador escribe su nombre de dictador y el de la capital.
- Colocación: clic en la tropa → vista previa transparente bajo el ratón → clic para colocar. Shift = hilera; Shift + rueda = cuántas.
- Molestia social (0-100) persistente entre días: sube con la represión, las revueltas ignoradas y los impuestos altos.
- Fases de la multitud según su ira: Pacífica (marchan y se detienen a cantar) → Tensa (piedras) → Disturbios (palos) → Caos (bombas incendiarias).
  15 s de concentración inicial para colocar barricadas; oleadas más frecuentes cuanto más enfadada está la gente; la contención calma.
- Sonido sintetizado con Web Audio (sin archivos): multitud, consignas, cacerolas, agua, gas, perdigones, sirenas, fuego.

## Cambios v0.4
- Unidades: granadero de gas (nubes que arrastra el viento), escopetero, motorizados, equipo de captura (arresta líderes),
  negociador, camión lanzagás, topadora (apaga cauchos), helicóptero (vuela, reflector), camión de suministros (recarga).
- Ejército: solo con Estado de Excepción (decreto diario). Con lealtad baja puede negarse a actuar o desertar.
- Manifestantes: escuderos, prensa (si usas la fuerza cerca, sube la presión internacional), brigadas médicas, máscaras caseras.
- Munición limitada, moral de la infantería (se repliega), tecla R para girar la hilera, barra de tropas por pestañas.
- Noticiero en vivo (TV PATRIA oficial vs MUNDO 24H internacional) en el menú y durante la revuelta.
- Despacho rediseñado con pestañas: Revueltas · Economía · Ejército · Diplomacia (6 acciones diplomáticas diarias).

## Cambios v0.5
- Botón 🛠 DEV (temporal, quitar antes de publicar): desbloquea todas las tropas en el despacho y en la revuelta.
- Presos políticos: se acumulan con los arrestos, cuestan presión y molestia cada día; se liberan eligiendo cuántos (gesto o canje).
- Alertas en el despacho con acciones directas (sanciones, presos, arcas vacías, cuarteles, popularidad).
- Estatus internacional y presos visibles en la barra superior.
- Ritmo de las protestas: primero protestan en la plaza y se avalanchan en un momento aleatorio (antes si hay más ira o más gente);
  la tensión sube sola según la molestia y el tamaño; si se calman, se repliegan.
- Perder el palacio no termina la revuelta: queda tomado, se puede recuperar, y el castigo depende del tiempo de ocupación.

## Cambios v0.6
- Perder la protesta (palacio a 0) no cuesta el día: reintentar es gratis; el día solo avanza con «Terminar el día sin intervenir».
- Infantería activa: según el nivel de fuerza sale a enfrentar a la multitud dentro de un radio (contención = mantiene posición).
- Fuego real: el ejército dispara desde «Perdigones»; la policía solo con «Mano dura» (alerta obligatoria de DDHH, pausa el juego).
  Escopetas con munición letal y fusiles AK (mejora «Armamento pesado»). Muertos y heridos en el suelo (voxel, sin gore).
- Manifestantes con armas de fuego si la molestia social es muy alta y la protesta está en caos: pueden matar agentes (cuerpos).
- Relaciones: médicos levantan heridos; líder asesinado = mártir (furia y avalancha); prensa graba muertes (doble presión).
- Unidades rediseñadas: motorizados (embestida, persecución, cortar oleadas), camión lanzagás (grupo más denso, cortina de gas,
  tecla F), helicóptero (marca líderes, gas aéreo, aviso de oleadas, luz nocturna), topadora (barre, inmune al fuego, repara
  barricadas), tanqueta (zona de miedo visible, atrae proyectiles, cuesta presión por segundo), equipo de captura (defiende,
  sale solo a por líderes poco protegidos, clic derecho sobre un líder, 120 de integridad).
- Equipo visible del antidisturbios: porra → bate, visera, máscara, escudo de policarbonato y AK con mano dura.
