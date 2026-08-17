/* ════════════════════════════════════════════════════════════════
   Motor de nube de puntos — lógica pura, sin DOM.
   Portado de assets/v4.js (buildRoom + proyección de makeViewer).
   ════════════════════════════════════════════════════════════════ */

export interface CloudPoint {
  x: number;
  y: number;
  z: number;
  /** brillo base del punto (0..1) */
  b: number;
}

/** Dimensiones de la habitación escaneada (unidades arbitrarias). */
const ROOM_W = 2.6;
const ROOM_H = 1.7;
const ROOM_D = 2.2;

/**
 * Genera el conjunto de puntos que simula el escaneo de una habitación:
 * aristas del volumen, tres caras con ruido, tres muebles y el marco de una puerta.
 *
 * @param density multiplicador de cantidad de puntos (1 = hero, 1.5 = visor orbital)
 */
export function buildRoom(density = 1): CloudPoint[] {
  const points: CloudPoint[] = [];
  const d = density;

  /** Puntos repartidos a lo largo de una arista, con temblor aleatorio. */
  const edge = (a: number[], b: number[], n: number, jitter: number): void => {
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      points.push({
        x: a[0] + (b[0] - a[0]) * t + (Math.random() - 0.5) * jitter,
        y: a[1] + (b[1] - a[1]) * t + (Math.random() - 0.5) * jitter,
        z: a[2] + (b[2] - a[2]) * t + (Math.random() - 0.5) * jitter,
        b: 0.6 + Math.random() * 0.4,
      });
    }
  };

  /** Puntos dispersos sobre el paralelogramo definido por origen + dos vectores. */
  const face = (
    o: number[], u: number[], v: number[], n: number, jitter: number, bias: number,
  ): void => {
    for (let i = 0; i < n; i++) {
      const a = Math.random();
      const c = Math.random();
      points.push({
        x: o[0] + u[0] * a + v[0] * c + (Math.random() - 0.5) * jitter,
        y: o[1] + u[1] * a + v[1] * c + (Math.random() - 0.5) * jitter,
        z: o[2] + u[2] * a + v[2] * c + (Math.random() - 0.5) * jitter,
        b: bias + Math.random() * 0.3,
      });
    }
  };

  /** Las 12 aristas de una caja centrada en (cx, cy, cz). */
  const box = (
    cx: number, cy: number, cz: number,
    sx: number, sy: number, sz: number,
    n: number, jitter: number,
  ): void => {
    const x0 = cx - sx / 2, x1 = cx + sx / 2;
    const y0 = cy - sy / 2, y1 = cy + sy / 2;
    const z0 = cz - sz / 2, z1 = cz + sz / 2;
    const c = [
      [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1],
      [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1],
    ];
    const edges = [
      [0, 1], [1, 2], [2, 3], [3, 0],
      [4, 5], [5, 6], [6, 7], [7, 4],
      [0, 4], [1, 5], [2, 6], [3, 7],
    ];
    for (const [i, j] of edges) edge(c[i], c[j], n, jitter);
  };

  // Volumen de la habitación
  box(0, 0, 0, ROOM_W, ROOM_H, ROOM_D, Math.round(46 * d), 0.012);

  // Suelo, pared del fondo y pared lateral
  face([-ROOM_W / 2, -ROOM_H / 2, -ROOM_D / 2], [ROOM_W, 0, 0], [0, 0, ROOM_D], Math.round(460 * d), 0.02, 0.34);
  face([-ROOM_W / 2, -ROOM_H / 2, -ROOM_D / 2], [ROOM_W, 0, 0], [0, ROOM_H, 0], Math.round(280 * d), 0.02, 0.30);
  face([-ROOM_W / 2, -ROOM_H / 2, -ROOM_D / 2], [0, ROOM_H, 0], [0, 0, ROOM_D], Math.round(210 * d), 0.02, 0.28);

  // Mobiliario
  box(-0.55, -0.55, 0.2, 0.7, 0.6, 0.5, Math.round(14 * d), 0.01);
  box(0.7, -0.35, -0.4, 0.5, 1.0, 0.5, Math.round(14 * d), 0.01);
  box(0.1, -0.7, 0.7, 0.9, 0.18, 0.5, Math.round(12 * d), 0.01);

  // Marco de puerta
  edge([-0.3, -ROOM_H / 2, ROOM_D / 2], [-0.3, 0.4, ROOM_D / 2], 20, 0.012);
  edge([0.3, -ROOM_H / 2, ROOM_D / 2], [0.3, 0.4, ROOM_D / 2], 20, 0.012);
  edge([-0.3, 0.4, ROOM_D / 2], [0.3, 0.4, ROOM_D / 2], 12, 0.012);

  return points;
}

/** Distancia focal de la proyección en perspectiva. */
export const FOV = 2.0;

/** Grosor del plano de barrido que ilumina los puntos en dorado. */
export const SCAN_BAND = 0.18;

/** Estado precalculado de rotación, para no repetir sin/cos por punto. */
export interface Rotation {
  cosY: number;
  sinY: number;
  cosX: number;
  sinX: number;
}

export function rotationOf(rotY: number, rotX: number): Rotation {
  return {
    cosY: Math.cos(rotY), sinY: Math.sin(rotY),
    cosX: Math.cos(rotX), sinX: Math.sin(rotX),
  };
}

export interface Projected {
  /** x en pantalla (px CSS) */
  sx: number;
  /** y en pantalla (px CSS) */
  sy: number;
  /** profundidad tras rotar; <= 0.1 significa detrás de la cámara */
  depth: number;
  /** factor de escala en perspectiva */
  f: number;
}

/**
 * Proyecta un punto del espacio a coordenadas de pantalla.
 * Devuelve null si el punto queda detrás de la cámara.
 */
export function project(
  p: CloudPoint, r: Rotation, cx: number, cy: number, scale: number,
): Projected | null {
  const x = p.x * r.cosY - p.z * r.sinY;
  const z = p.x * r.sinY + p.z * r.cosY;
  const y2 = p.y * r.cosX - z * r.sinX;
  const z2 = p.y * r.sinX + z * r.cosX;

  const depth = FOV + z2;
  if (depth <= 0.1) return null;

  const f = scale / (depth * 1.7);
  return { sx: cx + x * f, sy: cy - y2 * f, depth, f };
}
