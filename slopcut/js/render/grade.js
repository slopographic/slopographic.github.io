/* SlopCut: colour adjustments (brightness, contrast, saturation, temperature) on the GPU with one
   shared WebGL canvas. grade(src, w, h, clip) returns a canvas to draw immediately. Without WebGL
   it falls back to a Canvas2D filter string (no temperature). */
(function () {
  'use strict';
  const SE = window.SE, U = SE.util;
  const G = SE.grade = {};
  let gl = null, cv = null, prog = null, tex = null, loc = null, failed = false;

  const VS = 'attribute vec2 p;varying vec2 v;void main(){v=vec2(p.x*.5+.5,.5-p.y*.5);gl_Position=vec4(p,0.,1.);}';
  const FS = 'precision mediump float;varying vec2 v;uniform sampler2D t;uniform float br,ct,sa,tp;' +
    'void main(){vec4 s=texture2D(t,v);float a=s.a;vec3 c=a>0.?s.rgb:vec3(0.);' +
    'c+=br;c=(c-.5)*ct+.5;float l=dot(c,vec3(.2126,.7152,.0722));c=mix(vec3(l),c,sa);' +
    'c.r+=tp;c.g+=tp*.2;c.b-=tp;c=clamp(c,0.,1.);gl_FragColor=vec4(c*a,a);}';

  function init() {
    if (gl || failed) return !!gl;
    try {
      cv = document.createElement('canvas');
      gl = cv.getContext('webgl', { premultipliedAlpha: true, preserveDrawingBuffer: true, antialias: false });
      if (!gl) throw new Error('no webgl');
      const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
      prog = gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('link failed');
      gl.useProgram(prog);
      const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const pl = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(pl); gl.vertexAttribPointer(pl, 2, gl.FLOAT, false, 0, 0);
      tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      loc = { br: gl.getUniformLocation(prog, 'br'), ct: gl.getUniformLocation(prog, 'ct'), sa: gl.getUniformLocation(prog, 'sa'), tp: gl.getUniformLocation(prog, 'tp') };
      return true;
    } catch (e) { console.warn('SlopCut: WebGL colour grading unavailable, using 2D filters', e); gl = null; failed = true; return false; }
  }
  G.needed = (c) => !!(c.bright || c.contrast || c.sat || c.temp);
  G.params = (c) => ({ br: (c.bright || 0) / 100 * 0.5, ct: 1 + (c.contrast || 0) / 100, sa: 1 + (c.sat || 0) / 100, tp: (c.temp || 0) / 100 * 0.12 });
  /** CSS filter equivalent (fallback). */
  G.filter = (c) => `brightness(${1 + (c.bright || 0) / 100}) contrast(${1 + (c.contrast || 0) / 100}) saturate(${1 + (c.sat || 0) / 100})` + (c.temp > 0 ? ` sepia(${c.temp / 400})` : '');
  /** Grade src (any CanvasImageSource) at w×h. Returns a canvas or null (use G.filter then). */
  G.apply = function (src, w, h, c) {
    if (!init()) return null;
    w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    gl.viewport(0, 0, w, h);
    try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src); } catch (e) { return null; }
    const P = G.params(c);
    gl.uniform1f(loc.br, P.br); gl.uniform1f(loc.ct, P.ct); gl.uniform1f(loc.sa, P.sa); gl.uniform1f(loc.tp, P.tp);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return cv;
  };
  /** CPU reference of the same maths (tests). rgb in 0..255. */
  G.cpu = function (rgb, c) {
    const P = G.params(c);
    let [r, g, b] = rgb.map((x) => x / 255 + P.br);
    [r, g, b] = [r, g, b].map((x) => (x - 0.5) * P.ct + 0.5);
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    [r, g, b] = [r, g, b].map((x) => l + (x - l) * P.sa);
    r += P.tp; g += P.tp * 0.2; b -= P.tp;
    return [r, g, b].map((x) => Math.round(U.clamp(x, 0, 1) * 255));
  };
})();
