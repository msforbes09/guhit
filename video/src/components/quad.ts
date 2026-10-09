// Corner-pin maths: the projective map that puts a w×h rectangle onto four
// corners (TL, TR, BR, BL), as a CSS matrix3d and as a point mapper.
export type Pt = readonly [number, number];
export type Quad = readonly [Pt, Pt, Pt, Pt];

/** Unit square → quad (Heckbert): returns coefficients a..h. */
function squareToQuad([[x0, y0], [x1, y1], [x2, y2], [x3, y3]]: Quad) {
  const dx1 = x1 - x2;
  const dx2 = x3 - x2;
  const dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2;
  const dy2 = y3 - y2;
  const dy3 = y0 - y1 + y2 - y3;
  let g = 0;
  let h = 0;
  if (dx3 !== 0 || dy3 !== 0) {
    const den = dx1 * dy2 - dx2 * dy1;
    g = (dx3 * dy2 - dx2 * dy3) / den;
    h = (dx1 * dy3 - dx3 * dy1) / den;
  }
  return {
    a: x1 - x0 + g * x1,
    b: x3 - x0 + h * x3,
    c: x0,
    d: y1 - y0 + g * y1,
    e: y3 - y0 + h * y3,
    f: y0,
    g,
    h,
  };
}

/** Where (u, v) in 0..1 on the quad's surface lands in pixels. */
export function quadPoint(q: Quad, u: number, v: number): Pt {
  const { a, b, c, d, e, f, g, h } = squareToQuad(q);
  const w = g * u + h * v + 1;
  return [(a * u + b * v + c) / w, (d * u + e * v + f) / w];
}

/** A sub-rectangle (in 0..1 surface units) of a quad, as its own quad. */
export function subQuad(q: Quad, u0: number, v0: number, u1: number, v1: number): Quad {
  return [quadPoint(q, u0, v0), quadPoint(q, u1, v0), quadPoint(q, u1, v1), quadPoint(q, u0, v1)];
}

/** CSS transform (with transform-origin 0 0) mapping a w×h element onto the quad. */
export function quadMatrix(q: Quad, w: number, h: number): string {
  const { a, b, c, d, e, f, g, h: hh } = squareToQuad(q);
  const m = [a / w, d / w, 0, g / w, b / h, e / h, 0, hh / h, 0, 0, 1, 0, c, f, 0, 1];
  return `matrix3d(${m.map((n) => +n.toFixed(9)).join(",")})`;
}
