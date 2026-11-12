"use client";

import { useEffect, useRef } from "react";
import { onPulse, onWarp, prefersReducedMotion } from "./fx";

// The living sky behind Nebula: a full-screen WebGL fragment shader (domain-
// warped fbm nebula + twinkling stars). It reacts to the house:
//  - `energy` (share of things switched on) brightens and warms the gas,
//  - pointer position bends the light towards the cursor,
//  - pulses (a control toggled) send a coloured shockwave from that point,
//  - warps (navigation) make the gas surge and zoom.
// Cheap on purpose: rendered at a fraction of screen resolution (it is soft
// anyway) with adaptive scaling, paused while the tab is hidden, and a single
// still frame under prefers-reduced-motion. Without WebGL the CSS sky in
// globals.css shows through.

const VERT = `attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}`;

const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uMouse;
uniform float uEnergy;
uniform float uWarp;
uniform vec4 uP[4];
uniform vec3 uPh[4];

float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1.,0.)),u.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),u.x),u.y);}
float fbm(vec2 p){float v=0.,a=.5;mat2 m=mat2(1.6,1.2,-1.2,1.6);
  for(int i=0;i<5;i++){v+=a*noise(p);p=m*p;a*=.5;}return v;}

void main(){
  float s=min(uRes.x,uRes.y);
  vec2 uv=gl_FragCoord.xy/uRes;
  vec2 p=(gl_FragCoord.xy-.5*uRes)/s;
  vec2 m=(uMouse*uRes-.5*uRes)/s;

  // Warp: zoom towards the centre while navigating.
  p*=1.-uWarp*.18;

  // Shockwaves: displace the gas outward along each ring, and light the ring.
  vec3 ringCol=vec3(0.);
  for(int i=0;i<4;i++){
    vec4 P=uP[i];
    if(P.z>=0.){
      vec2 c=(P.xy*uRes-.5*uRes)/s;
      vec2 dv=p-c;float d=length(dv);
      float r=P.z*1.25;
      float e=(d-r)/.07;
      float k=exp(-e*e)*exp(-P.z*1.8)*P.w;
      p+=dv/(d+1e-4)*k*.06;
      ringCol+=uPh[i]*k*.55;
    }
  }

  float t=uTime*.035;
  vec2 q=vec2(fbm(p*1.3+t),fbm(p*1.3+vec2(5.2,1.3)-t));
  vec2 r=vec2(fbm(p*1.7+3.*q+vec2(1.7,9.2)+t*1.4+m*.25),fbm(p*1.7+3.*q+vec2(8.3,2.8)-t*1.1));
  float f=fbm(p*1.5+2.6*r);

  vec3 deep=vec3(.008,.012,.04);
  vec3 violet=vec3(.32,.11,.62);
  vec3 cyan=vec3(.04,.52,.86);
  vec3 rose=vec3(.92,.22,.6);
  vec3 amber=vec3(1.,.55,.18);

  vec3 col=deep;
  col=mix(col,violet,smoothstep(.15,.95,f));
  col=mix(col,cyan,smoothstep(.35,1.05,length(q))*.6);
  col=mix(col,rose,smoothstep(.5,1.,r.x)*.45);
  col=mix(col,amber,smoothstep(.62,1.,r.y)*.35*uEnergy);
  col*=.4+1.05*f*f*(1.+uEnergy*.7+uWarp*.6);

  // Stars: sparse hashed cells, each twinkling at its own rate.
  vec2 g=floor(gl_FragCoord.xy/2.);
  float h=hash(g);
  float tw=.55+.45*sin(uTime*(1.+h*3.)+h*80.);
  col+=step(.9968,h)*tw*vec3(.85,.9,1.)*(1.-f*.6);

  // Cursor light.
  col+=vec3(.22,.32,.85)*exp(-length(p-m)*3.2)*.22;
  col+=ringCol;

  // Vignette.
  vec2 vv=uv-.5;
  col*=1.-dot(vv,vv)*1.25;
  gl_FragColor=vec4(pow(col,vec3(.92)),1.);
}`;

type Pulse = { x: number; y: number; start: number; strength: number; hue: [number, number, number] };

export default function NebulaBackground({ energy }: { energy: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const energyRef = useRef(energy);
  energyRef.current = energy;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { antialias: false, alpha: false, powerPreference: "high-performance" });
    if (!gl) {
      canvas.style.display = "none";
      return;
    }

    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      return sh;
    };
    const prog = gl.createProgram()!;
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      canvas.style.display = "none";
      return;
    }
    gl.useProgram(prog);
    canvas.style.display = "";

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "a");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const U = (n: string) => gl.getUniformLocation(prog, n);
    const uRes = U("uRes");
    const uTime = U("uTime");
    const uMouse = U("uMouse");
    const uEnergy = U("uEnergy");
    const uWarp = U("uWarp");
    const uP = U("uP");
    const uPh = U("uPh");

    const reduced = prefersReducedMotion();
    let scale = Math.min(window.devicePixelRatio || 1, 2) * 0.5;
    const resize = () => {
      canvas.width = Math.max(1, Math.round(window.innerWidth * scale));
      canvas.height = Math.max(1, Math.round(window.innerHeight * scale));
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();

    // Eased inputs.
    const mouse = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 };
    let shownEnergy = energyRef.current;
    let warp = 0;
    let simTime = Math.random() * 100;
    const pulses: Pulse[] = [];

    const onMove = (e: PointerEvent) => {
      mouse.tx = e.clientX / window.innerWidth;
      mouse.ty = 1 - e.clientY / window.innerHeight;
    };
    const offPulse = onPulse((d) => {
      pulses.push({ x: d.x / window.innerWidth, y: 1 - d.y / window.innerHeight, start: performance.now(), strength: d.strength, hue: d.hue });
      if (pulses.length > 4) pulses.shift();
      if (reduced) draw(performance.now());
    });
    const offWarp = onWarp(() => {
      warp = 1;
    });

    const pArr = new Float32Array(16);
    const hArr = new Float32Array(12);

    function draw(now: number) {
      mouse.x += (mouse.tx - mouse.x) * 0.04;
      mouse.y += (mouse.ty - mouse.y) * 0.04;
      shownEnergy += (energyRef.current - shownEnergy) * 0.02;
      for (let i = 0; i < 4; i++) {
        const p = pulses[i];
        const age = p ? (now - p.start) / 1000 : -1;
        const alive = p && age < 2.6;
        pArr.set(alive ? [p.x, p.y, age, p.strength] : [0, 0, -1, 0], i * 4);
        hArr.set(alive ? p.hue : [0, 0, 0], i * 3);
      }
      gl!.uniform2f(uRes, canvas!.width, canvas!.height);
      gl!.uniform1f(uTime, simTime);
      gl!.uniform2f(uMouse, mouse.x, mouse.y);
      gl!.uniform1f(uEnergy, shownEnergy);
      gl!.uniform1f(uWarp, warp);
      gl!.uniform4fv(uP, pArr);
      gl!.uniform3fv(uPh, hArr);
      gl!.drawArrays(gl!.TRIANGLES, 0, 3);
    }

    let raf = 0;
    let last = performance.now();
    let slowFrames = 0;
    let frames = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      // Navigation surge: time runs faster while the warp decays.
      simTime += dt * (1 + warp * 9);
      warp = Math.max(0, warp - dt * 1.6);
      draw(now);
      // Adaptive resolution: if frames are slow, render fewer pixels.
      frames++;
      if (dt > 0.024) slowFrames++;
      if (frames >= 90) {
        if (slowFrames > 30 && scale > 0.3) {
          scale = Math.max(0.3, scale * 0.8);
          resize();
        }
        frames = 0;
        slowFrames = 0;
      }
      raf = requestAnimationFrame(loop);
    };

    const start = () => {
      cancelAnimationFrame(raf);
      last = performance.now();
      raf = requestAnimationFrame(loop);
    };
    const onVis = () => (document.hidden ? cancelAnimationFrame(raf) : !reduced && start());

    window.addEventListener("resize", resize);
    if (reduced) {
      draw(performance.now());
    } else {
      window.addEventListener("pointermove", onMove, { passive: true });
      document.addEventListener("visibilitychange", onVis);
      start();
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("visibilitychange", onVis);
      offPulse();
      offWarp();
      // Free the GL objects but keep the context: a remount (React's dev
      // double-mount, HMR) gets the same context back from this canvas, and a
      // lost one would leave it blank.
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-[1] h-full w-full"
      style={{ imageRendering: "auto" }}
    />
  );
}
