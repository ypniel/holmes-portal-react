import React, { useRef, useEffect } from "react"

const AURORA_VERT = `#version 300 es
in vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }
`

const AURORA_FRAG = `#version 300 es
precision highp float;
uniform float uTime;
uniform float uAmplitude;
uniform vec3 uColorStops[3];
uniform vec2 uResolution;
uniform float uBlend;
out vec4 fragColor;

vec3 permute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }

float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
  m = m * m * m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

struct ColorStop { vec3 color; float position; };

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  ColorStop colors[3];
  colors[0] = ColorStop(uColorStops[0], 0.0);
  colors[1] = ColorStop(uColorStops[1], 0.5);
  colors[2] = ColorStop(uColorStops[2], 1.0);
  int idx = 0;
  for (int i = 0; i < 2; i++) { if (colors[i].position <= uv.x) idx = i; }
  float range = colors[idx+1].position - colors[idx].position;
  float lerpFactor = (uv.x - colors[idx].position) / range;
  vec3 rampColor = mix(colors[idx].color, colors[idx+1].color, lerpFactor);
  float height = snoise(vec2(uv.x * 2.0 + uTime * 0.1, uTime * 0.25)) * 0.5 * uAmplitude;
  height = exp(height);
  height = (uv.y * 2.0 - height + 0.2);
  float intensity = clamp(0.6 * height, 0.0, 1.0);
  float midPoint = 0.20;
  float auroraAlpha = smoothstep(midPoint - uBlend * 0.5, midPoint + uBlend * 0.5, intensity);
  float alpha = intensity * auroraAlpha;
  fragColor = vec4(rampColor * alpha, alpha);
}
`

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "")
  return [parseInt(h.slice(0,2),16)/255, parseInt(h.slice(2,4),16)/255, parseInt(h.slice(4,6),16)/255]
}

export const HOLMES_AURORA_COLORS = ["#991b1b", "#b91c1c", "#7f1d1d"]

export function AuroraBackground({
  colorStops = HOLMES_AURORA_COLORS,
  amplitude = 1.0,
  blend = 0.5,
  speed = 1.0,
}: {
  colorStops?: string[]
  amplitude?: number
  blend?: number
  speed?: number
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const ctn = ref.current
    if (!ctn) return
    const canvas = document.createElement("canvas")
    canvas.style.cssText = "width:100%;height:100%;display:block"
    ctn.appendChild(canvas)
    const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: true })
    if (!gl) return () => { if (canvas.parentNode === ctn) ctn.removeChild(canvas) }

    gl.clearColor(0, 0, 0, 0)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)

    const vs = gl.createShader(gl.VERTEX_SHADER)!
    gl.shaderSource(vs, AURORA_VERT); gl.compileShader(vs)
    const fs = gl.createShader(gl.FRAGMENT_SHADER)!
    gl.shaderSource(fs, AURORA_FRAG); gl.compileShader(fs)
    const prog = gl.createProgram()!
    gl.attachShader(prog, vs); gl.attachShader(prog, fs)
    gl.linkProgram(prog); gl.useProgram(prog)

    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,3,-1,-1,3,-1]), gl.STATIC_DRAW)
    const pos = gl.getAttribLocation(prog, "position")
    gl.enableVertexAttribArray(pos)
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0)

    const uTime = gl.getUniformLocation(prog, "uTime")
    const uAmp = gl.getUniformLocation(prog, "uAmplitude")
    const uColors = gl.getUniformLocation(prog, "uColorStops")
    const uRes = gl.getUniformLocation(prog, "uResolution")
    const uBlendLoc = gl.getUniformLocation(prog, "uBlend")

    gl.uniform1f(uAmp, amplitude)
    gl.uniform1f(uBlendLoc, blend)
    gl.uniform3fv(uColors, colorStops.map(hexToRgb).flat())

    function resize() {
      const w = ctn!.offsetWidth, h = ctn!.offsetHeight
      const dpr = Math.min(window.devicePixelRatio, 2)
      canvas.width = w * dpr; canvas.height = h * dpr
      gl!.viewport(0, 0, canvas.width, canvas.height)
      gl!.uniform2f(uRes, canvas.width, canvas.height)
    }
    resize()
    window.addEventListener("resize", resize)

    let raf = 0
    const render = (t: number) => {
      raf = requestAnimationFrame(render)
      gl!.uniform1f(uTime, t * 0.01 * speed * 0.1)
      gl!.clear(gl!.COLOR_BUFFER_BIT)
      gl!.drawArrays(gl!.TRIANGLES, 0, 3)
    }
    raf = requestAnimationFrame(render)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("resize", resize)
      if (canvas.parentNode === ctn) ctn.removeChild(canvas)
      gl.getExtension("WEBGL_lose_context")?.loseContext()
    }
  }, [])

return <div ref={ref} style={{ position: "absolute", inset: 0, backgroundColor: "#0c0a09" }} />
}
