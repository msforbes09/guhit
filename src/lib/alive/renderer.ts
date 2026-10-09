import type { Pose } from "./motion";
import type { Mesh, RigInfo } from "./rig";
import { boneMatrices, MAX_BONES, type Skeleton, type Skin } from "./skeleton";

/**
 * Draws the character as a deformed mesh in WebGL2 (one draw for the
 * shadow, one for the character). All deformation happens in the vertex
 * shader from a handful of uniforms, so a frame costs almost nothing on the
 * CPU and stays at 60 fps on phones.
 */

export interface Placement {
  /** Canvas pixels: feet position when standing at x = 0. */
  centerX: number;
  groundY: number;
  /** Canvas pixels per character height. */
  scale: number;
}

export interface Rigging {
  skeleton: Skeleton;
  skin: Skin;
}

export interface Renderer {
  readonly kind: "webgl2" | "canvas2d";
  /** `rigging` turns on joint mode (skinned limbs); the 2D fallback ignores it. */
  setCharacter(image: TexImageSource, mesh: Mesh, rig: RigInfo, rigging?: Rigging): void;
  resize(width: number, height: number): void;
  draw(pose: Pose, place: Placement, shadow: boolean): void;
  /** Block until the GPU has finished (benchmarks only). */
  finish(): void;
  dispose(): void;
}

const VS = `#version 300 es
in vec2 a_pos;
in vec2 a_uv;
in vec4 a_bi;
in vec4 a_bw;
uniform mat3 u_bones[${MAX_BONES}];
uniform float u_skin;
uniform vec2 u_neck;
uniform vec2 u_res;
uniform vec2 u_root;
uniform float u_scale;
uniform float u_squash;
uniform float u_bend;
uniform float u_lean;
uniform vec2 u_wiggle;
uniform float u_head;
uniform vec4 u_arm;      // pivot.x, pivot.y, angle, side
uniform vec2 u_armSize;  // reach, half height
out vec2 v_uv;

vec2 rot(vec2 p, float a) {
  float c = cos(a), s = sin(a);
  return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
}

void main() {
  vec2 p = a_pos;

  // Joint mode: linear blend skinning over the tapped skeleton.
  if (u_skin > 0.5) {
    vec3 r = vec3(p, 1.0);
    p = (a_bw.x * (u_bones[int(a_bi.x)] * r)
       + a_bw.y * (u_bones[int(a_bi.y)] * r)
       + a_bw.z * (u_bones[int(a_bi.z)] * r)
       + a_bw.w * (u_bones[int(a_bi.w)] * r)).xy;
  }

  // Arm: points past the shoulder on one side swing about it, blending in
  // smoothly so the drawing bends instead of tearing.
  float side = u_arm.w;
  if (u_arm.z != 0.0) {
    float past = (p.x - u_arm.x) * side;
    float w = smoothstep(0.0, u_armSize.x, past)
            * (1.0 - smoothstep(u_armSize.y * 0.6, u_armSize.y * 1.25, abs(p.y - u_arm.y)));
    p = u_arm.xy + rot(p - u_arm.xy, u_arm.z * side * w);
  }

  // Head nod: the upper part tilts about the neck.
  float hw = smoothstep(u_neck.y - 0.18, u_neck.y + 0.18, p.y);
  p = mix(p, u_neck + rot(p - u_neck, u_head), hw);

  // Squash and stretch about the feet, roughly keeping volume.
  p.y *= 1.0 + u_squash;
  p.x *= 1.0 - u_squash * 0.55;

  // Sway and wiggle grow with height so the feet stay planted.
  float h = clamp(p.y, 0.0, 1.6);
  p.x += u_wiggle.x * sin(u_wiggle.y - h * 2.6) * h;
  p.x += u_bend * h * h;

  p = rot(p, u_lean);

  vec2 s = u_root + vec2(p.x, -p.y) * u_scale;
  vec2 clip = s / u_res * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  v_uv = a_uv;
}`;

const FS = `#version 300 es
precision mediump float;
in vec2 v_uv;
uniform sampler2D u_tex;
out vec4 o;
void main() {
  o = texture(u_tex, v_uv);
}`;

const SHADOW_VS = `#version 300 es
in vec2 a_corner;
uniform vec2 u_res;
uniform vec2 u_center;
uniform vec2 u_size;
out vec2 v_p;
void main() {
  vec2 s = u_center + a_corner * u_size;
  vec2 clip = s / u_res * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  v_p = a_corner;
}`;

const SHADOW_FS = `#version 300 es
precision mediump float;
in vec2 v_p;
uniform float u_alpha;
out vec4 o;
void main() {
  float d = length(v_p);
  float a = (1.0 - smoothstep(0.25, 1.0, d)) * u_alpha;
  o = vec4(vec3(0.12, 0.16, 0.3) * a, a);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    gl.deleteShader(s);
    throw new Error("shader: " + log);
  }
  return s;
}

function program(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const p = gl.createProgram()!;
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error("link: " + gl.getProgramInfoLog(p));
  return p;
}

type Uniforms = Record<string, WebGLUniformLocation | null>;

function uniforms(gl: WebGL2RenderingContext, p: WebGLProgram, names: string[]): Uniforms {
  const u: Uniforms = {};
  for (const n of names) u[n] = gl.getUniformLocation(p, n);
  return u;
}

export function createRenderer(canvas: HTMLCanvasElement): Renderer {
  const gl = canvas.getContext("webgl2", {
    alpha: true,
    premultipliedAlpha: true,
    antialias: true,
  });
  if (gl) {
    try {
      return new GLRenderer(canvas, gl);
    } catch (err) {
      console.warn("[alive] WebGL2 renderer failed, using Canvas 2D", err);
    }
  }
  return new Canvas2DRenderer(canvas);
}

class GLRenderer implements Renderer {
  readonly kind = "webgl2" as const;
  private prog: WebGLProgram;
  private shadowProg: WebGLProgram;
  private u: Uniforms;
  private su: Uniforms;
  private vao: WebGLVertexArrayObject | null = null;
  private shadowVao: WebGLVertexArrayObject;
  private buffers: WebGLBuffer[] = [];
  private tex: WebGLTexture | null = null;
  private count = 0;
  private rig: RigInfo | null = null;
  private rigging: Rigging | null = null;
  private bones = new Float32Array(MAX_BONES * 9);

  constructor(
    private canvas: HTMLCanvasElement,
    private gl: WebGL2RenderingContext,
  ) {
    this.prog = program(gl, VS, FS);
    this.shadowProg = program(gl, SHADOW_VS, SHADOW_FS);
    this.u = uniforms(gl, this.prog, [
      "u_res",
      "u_root",
      "u_scale",
      "u_squash",
      "u_bend",
      "u_lean",
      "u_wiggle",
      "u_head",
      "u_arm",
      "u_armSize",
      "u_tex",
      "u_bones",
      "u_skin",
      "u_neck",
    ]);
    this.su = uniforms(gl, this.shadowProg, ["u_res", "u_center", "u_size", "u_alpha"]);

    this.shadowVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.shadowVao);
    const sb = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, sb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(this.shadowProg, "a_corner");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    this.buffers.push(sb);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }

  setCharacter(image: TexImageSource, mesh: Mesh, rig: RigInfo, rigging?: Rigging) {
    const gl = this.gl;
    this.rig = rig;
    this.rigging = rigging ?? null;
    if (this.tex) gl.deleteTexture(this.tex);
    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    // Premultiplied upload: transparent pixels carry no colour, so scaled-down
    // edges blend cleanly with no dark or white fringe.
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    if (this.vao) gl.deleteVertexArray(this.vao);
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    const put = (name: string, data: Float32Array, size: number) => {
      const loc = gl.getAttribLocation(this.prog, name);
      if (loc < 0) return;
      const b = gl.createBuffer()!;
      this.buffers.push(b);
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    };
    put("a_pos", mesh.positions, 2);
    put("a_uv", mesh.uvs, 2);
    if (rigging) {
      put("a_bi", rigging.skin.index, 4);
      put("a_bw", rigging.skin.weight, 4);
    }
    const ib = gl.createBuffer()!;
    this.buffers.push(ib);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    this.count = mesh.indices.length;
  }

  resize(width: number, height: number) {
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  draw(pose: Pose, place: Placement, shadow: boolean) {
    const gl = this.gl;
    const W = this.canvas.width,
      H = this.canvas.height;
    gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (!this.vao || !this.rig) return;
    const rig = this.rig;
    const rootX = place.centerX + pose.x * place.scale;
    const rootY = place.groundY - pose.lift * place.scale;

    if (shadow) {
      gl.useProgram(this.shadowProg);
      gl.bindVertexArray(this.shadowVao);
      const shrink = 1 - 0.45 * Math.min(1, pose.air);
      const half = (rig.footHalf * 1.25 + 0.08) * place.scale * shrink * (1 - pose.squash * 0.4);
      gl.uniform2f(this.su.u_res, W, H);
      gl.uniform2f(this.su.u_center, rootX + pose.lean * 0.05 * place.scale, place.groundY + 0.01 * place.scale);
      gl.uniform2f(this.su.u_size, half, Math.max(4, half * 0.2));
      gl.uniform1f(this.su.u_alpha, 0.32 * (1 - 0.55 * Math.min(1, pose.air)));
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.uniform1i(this.u.u_tex, 0);
    gl.uniform2f(this.u.u_res, W, H);
    gl.uniform2f(this.u.u_root, rootX, rootY);
    gl.uniform1f(this.u.u_scale, place.scale);
    gl.uniform1f(this.u.u_squash, pose.squash);
    gl.uniform1f(this.u.u_bend, pose.bend);
    gl.uniform1f(this.u.u_lean, pose.lean);
    gl.uniform2f(this.u.u_wiggle, pose.wiggleAmp, pose.wigglePhase);
    const rg = this.rigging;
    if (rg) {
      // Bones carry the arms, legs and head; the region-based arm and nod step aside.
      boneMatrices(rg.skeleton, pose, this.bones);
      gl.uniformMatrix3fv(this.u.u_bones, false, this.bones);
      gl.uniform1f(this.u.u_skin, 1);
      gl.uniform1f(this.u.u_head, 0);
      gl.uniform2f(this.u.u_neck, rg.skeleton.neck[0], rg.skeleton.neck[1]);
      gl.uniform4f(this.u.u_arm, rig.arm.pivotX, rig.arm.pivotY, 0, rig.arm.side);
    } else {
      gl.uniform1f(this.u.u_skin, 0);
      gl.uniform1f(this.u.u_head, pose.head);
      gl.uniform2f(this.u.u_neck, 0, 0.6);
      gl.uniform4f(this.u.u_arm, rig.arm.pivotX, rig.arm.pivotY, pose.arm, rig.arm.side);
    }
    gl.uniform2f(this.u.u_armSize, rig.arm.reach, rig.arm.halfHeight);
    gl.drawElements(gl.TRIANGLES, this.count, gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(null);
  }

  finish() {
    this.gl.finish();
  }

  dispose() {
    const gl = this.gl;
    if (this.tex) gl.deleteTexture(this.tex);
    for (const b of this.buffers) gl.deleteBuffer(b);
    if (this.vao) gl.deleteVertexArray(this.vao);
    gl.deleteVertexArray(this.shadowVao);
    gl.deleteProgram(this.prog);
    gl.deleteProgram(this.shadowProg);
  }
}

/**
 * Fallback for devices without WebGL2: affine squash, lean and lift only
 * (no mesh bending), which still reads as alive.
 */
class Canvas2DRenderer implements Renderer {
  readonly kind = "canvas2d" as const;
  private ctx: CanvasRenderingContext2D;
  private image: TexImageSource | null = null;
  private rig: RigInfo | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2D canvas");
    this.ctx = ctx;
  }

  setCharacter(image: TexImageSource, _mesh: Mesh, rig: RigInfo) {
    this.image = image;
    this.rig = rig;
  }

  resize(width: number, height: number) {
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  draw(pose: Pose, place: Placement, shadow: boolean) {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (!this.image || !this.rig) return;
    const rig = this.rig;
    const rootX = place.centerX + pose.x * place.scale;
    const rootY = place.groundY - pose.lift * place.scale;
    if (shadow) {
      const half = (rig.footHalf * 1.25 + 0.08) * place.scale * (1 - 0.45 * Math.min(1, pose.air));
      ctx.save();
      ctx.globalAlpha = 0.3 * (1 - 0.55 * Math.min(1, pose.air));
      ctx.fillStyle = "rgb(30,40,76)";
      ctx.beginPath();
      ctx.ellipse(rootX, place.groundY, half, Math.max(3, half * 0.2), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    const k = place.scale / rig.unit;
    ctx.save();
    ctx.translate(rootX, rootY);
    ctx.rotate(-pose.lean);
    ctx.transform(1, 0, -(pose.bend + pose.head * 0.3), 1, 0, 0);
    ctx.scale(k * (1 - pose.squash * 0.55), k * (1 + pose.squash));
    ctx.drawImage(this.image as CanvasImageSource, -rig.anchorX, -rig.anchorY);
    ctx.restore();
  }

  finish() {}

  dispose() {}
}
