precision lowp float;

uniform int
	maxRayBounces
;

uniform float
    u_time
;

uniform vec2
    u_resolution,
    u_mouse,
    u_toggle,
		u_trigger
;

uniform vec3
		u_tiltView,
		u_freeView,
    u_freeMove,
    u_clock
;

uniform vec4
	u_stick
;

uniform sampler2D
    hdri,
    texture0,
    texture1,
    spectrum
;

varying vec2 vTexCoord;

//---- Math Constant ----//

const float
    E = 2.7182818284,
    K = 2.6854520010,
    PI = 3.1415926536,
    TAU = 6.2831853072,
    PHI = 1.6180339887,
    SQRT075 = 0.8660254038,
    SQRT2 = 1.4142135623,
    SQRT3 = 1.7320508075;


//---- Math Equation ----//

#define nsin(n)(sin(n) * .5 + .5)
#define ncos(n)(cos(n) * .5 + .5)
#define ntan(n)(tan(n) * .5 + .5)
#define rad(deg)(deg * PI / 180.)


//---- Math Function ----//

float ndot(vec2 a, vec2 b) {
    return a.x * b.x - a.y * b.y;
}

// float mod(float a, float b){ return a - b * floor(a / b); }

float loop(float n) {
    return fract(n / TAU) * TAU;
}

vec2 ratio(vec2 n) {
    return vec2(min(n.x, n.y) / max(n.x, n.y), 1.0);
}

vec2 scale(vec2 pos, vec2 scale) {
    scale = max(scale, vec2(1.0 / 1024.0));
    return pos * mat2(1.0 / scale.x, 0.0, 0.0, 1.0 / scale.y);
}

vec2 scale(vec2 pos, vec2 scale, vec2 dimension) {
    scale = max(scale, vec2(1.0 / 1024.0));
    vec2 R = ratio(dimension);
    R = dimension.x > dimension.y ? R.xy : R.yx;
    return pos / scale * R * 0.5 + 0.5;
}

float angle(vec2 origin, vec2 target) {
    return atan(target.y - origin.y, target.x - origin.x);
}

vec2 rotate(vec2 p, float angle) {
    return p * mat2(
        cos(angle), sin(angle),
        -sin(angle), cos(angle)
    );
}

vec2 rotate(vec2 p, vec2 origin, vec2 target) {
    return rotate(p - origin, angle(origin, target));
}


//---- Random Number ----//

float random21(vec2 n) {
    n = fract(n * vec2(268.91, 530.47));
    n += dot(n, n + (PI * E) / TAU);
    return fract(n.x * n.y);
}

vec3 hash3(vec2 p) {
    vec3 q = vec3(dot(p, vec2(127.1, 311.7)),
        dot(p, vec2(269.5, 183.3)),
        dot(p, vec2(419.2, 371.9)));
    return fract(sin(q) * 43758.5453);
}

float noise (vec2 p) {
    vec2
        i = floor(p),
        f = fract(p);
    
    float a = random21(i),
          b = random21(i + vec2(1.0, 0.0)),
          c = random21(i + vec2(0.0, 1.0)),
          d = random21(i + vec2(1.0, 1.0));

    vec2 u = smoothstep(0.0, 1.0, f);

    return mix(a, b, u.x) +
            (c - a) * u.y * (1.0 - u.x) +
            (d - b) * u.x * u.y;
}

float voronoise( in vec2 p, float u, float v) {
    float k = 1.0 + 63.0 * pow(1.0 - v, 6.0);

    vec2 i = floor(p);
    vec2 f = fract(p);

    vec2 a = vec2(0.0, 0.0);
    for (int y = -2; y <= 2; y++)
        for (int x = -2; x <= 2; x++) {
            vec2 g = vec2(x, y);
            vec3 o = hash3(i + g) * vec3(u, u, 1.0);
            vec2 d = g - f + o.xy;
            float w = pow(1.0 - smoothstep(0.0, 1.414, length(d)), k);
            a += vec2(o.z * w, w);
        }

    return a.x / a.y;
}

//---- 2D mapping ----//

vec2 square2circle(vec2 p) {
    return vec2(
        sqrt(2.0 + 2.0 * SQRT2 * p.x + p.x * p.x - p.y * p.y) / 2.0 - sqrt(2.0 - 2.0 * SQRT2 * p.x + p.x * p.x - p.y * p.y) / 2.0,
        sqrt(2.0 + 2.0 * SQRT2 * p.y - p.x * p.x + p.y * p.y) / 2.0 - sqrt(2.0 - 2.0 * SQRT2 * p.y - p.x * p.x + p.y * p.y) / 2.0
    );
}

vec2 circle2square(vec2 p) {
    return vec2(
        p.x * sqrt(1.0 - 0.5 * p.y * p.y),
        p.y * sqrt(1.0 - 0.5 * p.x * p.x)
    );
}

vec2 cartesian2polar(vec2 p) {
    float angle = atan(p.y, p.x);
    float radius = length(p);
    return vec2(angle, radius);
}


//---- 2D Render Tools ----//

const float sN = 512.0;
float draw(float sdf) {
    return smoothstep(1.0 / sN, -1.0 / sN, sdf);
}

vec3 draw(vec3 sdf) {
    return smoothstep(1.0 / sN, -1.0 / sN, sdf);
}


//---- 2D SDF ----//

float circle(vec2 p, float r) {
    return length(p) - r;
}

float vesica(vec2 p, float r) {
    r /= SQRT075;
    return circle(abs(p) + vec2(r / 2.0, 0.0), r);
}

float vesica(vec2 p, vec2 a, vec2 b) {
    float r = distance(a, b) / 2.0 / SQRT075;
    p = rotate(p - mix(a, b, 0.5), angle(a, b));
    return circle(abs(p) + vec2(0.0, r / 2.0), r);
}

float line(vec2 p, vec2 a, vec2 b, float w) {
    float
    t = clamp(dot(p - a, b - a) / dot(b - a, b - a), 0.0, 1.0),
        d = length((p - a) - (b - a) * t);
    return d - w;
}

float rect(vec2 p, vec2 s) {
    vec2 d = abs(p) - s;
    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

float rect(vec2 p, vec2 s, float r) {
    r *= min(s.x, s.y);
    vec2 d = abs(p) - s + r;
    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r;
}

float squircle(vec2 p, vec2 s, float r) {
    return length(pow(abs(p / s), 1.0 / r / min(s.x, s.y) * s)) - 1.0;
}

float rhombus(vec2 p, vec2 s, float r) {
    p = abs(p);
    r = min(min(s.x, s.y) - 1.0 / 1024.0, min(s.x, s.y) * r);
    s -= r;
    float
    h = clamp((-2.0 * ndot(p, s) + ndot(s, s)) / dot(s, s), -1.0, 1.0),
        d = length(p - 0.5 * s * vec2(1.0 - h, 1.0 + h));
    return d * sign(p.x * s.y + p.y * s.x - s.x * s.y) - r;
}

float poly(vec2 p, float ap, float n) {
    p = rotate(p, PI);
    ap *= cos(PI / n);
    n = PI * 2.0 / n;
    float a = atan(p.x, p.y);
    return cos(floor(0.5 + a / n) * n - a) * length(p) - ap;
}

//---- other 2D shapes ----//

float wave(vec2 p, float f, float a) {
    return p.y + cos(p.x * f) * a;
}

vec3 wave(vec2 p, vec3 f, vec3 a) {
    return p.y + cos(p.x * f) * a;
}

//---- Color Formulas ----//

#define uRGB(r, g, b) vec3(r, g, b) / 255.0

vec3 rgb2hsv(vec3 c) {
    vec4
    K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0),
        p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g)),
        q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
    float
    d = q.x - min(q.w, q.y),
        e = 1.0e-10;
    return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

#define uHSV(h, s, v) vec3(h / 360.0, s / 100.0, b / 100.0)

vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}


//---- Color Definitions ----//

#define grey vec3(0.5)
#define red vec3(1.0, 0.0, 0.0)
#define green vec3(0.0, 1.0, 0.0)
#define blue vec3(0.0, 0.0, 1.0)


//---- Blend Modes ----//

vec4 normal(vec4 a, vec4 b) {
    return mix(a, b, b.a);
}
vec4 multiply(vec4 a, vec4 b) {
    return vec4((a * b).rgb, b.a);
}
vec4 linearBurn(vec4 a, vec4 b) {
    return vec4(((a + b) - 1.0).rgb, b.a);
}
vec4 colorBurn(vec4 a, vec4 b) {
    return vec4((1.0 - (1.0 - a) / b).rgb, b.a);
}
vec4 darken(vec4 a, vec4 b) {
    return vec4(min(a, b).rgb, b.a);
}
vec4 lighten(vec4 a, vec4 b) {
    return vec4(max(a, b).rgb, b.a);
}
vec4 screen(vec4 a, vec4 b) {
    return vec4((1.0 - (1.0 - a) * (1.0 - b)).rgb, b.a);
}
vec4 add(vec4 a, vec4 b) {
    return vec4((a + b).rgb, b.a);
}
vec4 colorDodge(vec4 a, vec4 b) {
    return vec4((a / (1.0 - b)).rgb, b.a);
}
vec4 overlay(vec4 a, vec4 b) {
    vec4 c = vec4(0.0);
    c.r = a.r < 0.5 ? multiply(a, 2.0 * b).r : screen(a, 2.0 * (b - 0.5)).r;
    c.g = a.g < 0.5 ? multiply(a, 2.0 * b).g : screen(a, 2.0 * (b - 0.5)).g;
    c.b = a.b < 0.5 ? multiply(a, 2.0 * b).b : screen(a, 2.0 * (b - 0.5)).b;
    c.a = b.a;
    return normal(a, c);
}
vec4 hardLight(vec4 a, vec4 b) {
    vec4 c = vec4(0.0);
    c.r = b.r < 0.5 ? multiply(a, 2.0 * b).r : screen(a, 2.0 * (b - 0.5)).r;
    c.g = b.g < 0.5 ? multiply(a, 2.0 * b).g : screen(a, 2.0 * (b - 0.5)).g;
    c.b = b.b < 0.5 ? multiply(a, 2.0 * b).b : screen(a, 2.0 * (b - 0.5)).b;
    c.a = b.a;
    return normal(a, c);
}

vec4 softLight(vec4 a, vec4 b) {
    return normal(a, vec4(((1.0 - 2.0 * b) * a * a + 2.0 * b * a).rgb, b.a));
}
vec4 vividLight(vec4 a, vec4 b) {
    vec4 c = vec4(0.0);
    c.r = b.r < 0.5 ? colorBurn(a, 2.0 * b).r : colorDodge(a, 2.0 * (b - 0.5)).r;
    c.g = b.g < 0.5 ? colorBurn(a, 2.0 * b).g : colorDodge(a, 2.0 * (b - 0.5)).g;
    c.b = b.b < 0.5 ? colorBurn(a, 2.0 * b).b : colorDodge(a, 2.0 * (b - 0.5)).b;
    c.a = b.a;
    return normal(a, c);
}
vec4 linearLight(vec4 a, vec4 b) {
    vec4 c = vec4(0.0);
    c.r = b.r < 0.5 ? linearBurn(a, 2.0 * b).r : add(a, 2.0 * (b - 0.5)).r;
    c.g = b.g < 0.5 ? linearBurn(a, 2.0 * b).g : add(a, 2.0 * (b - 0.5)).g;
    c.b = b.b < 0.5 ? linearBurn(a, 2.0 * b).b : add(a, 2.0 * (b - 0.5)).b;
    c.a = b.a;
    return c;
}
vec4 pinLight(vec4 a, vec4 b) {
    vec4 c = vec4(0.0);
    c.r = b.r < 0.5 ? darken(a, 2.0 * b).r : lighten(a, 2.0 * (b - 0.5)).r;
    c.g = b.g < 0.5 ? darken(a, 2.0 * b).g : lighten(a, 2.0 * (b - 0.5)).g;
    c.b = b.b < 0.5 ? darken(a, 2.0 * b).b : lighten(a, 2.0 * (b - 0.5)).b;
    c.a = b.a;
    return normal(a, c);
}
vec4 hardMix(vec4 a, vec4 b) {
    return normal(a, vec4(ceil(linearLight(a, b)).rgb, b.a));
}
vec4 exclusion(vec4 a, vec4 b) {
    return normal(a, vec4(max(a + b - 2.0 * a * b, b.a).rgb, b.a));
}
vec4 difference(vec4 a, vec4 b) {
    return normal(a, vec4(max(abs(a - b), b.a).rgb, b.a));
}
vec4 subtract(vec4 a, vec4 b) {
    return normal(a, vec4(((a + max(1.0 - b, b.a)) - 1.0).rgb, b.a));
}
vec4 vivid(vec4 a, vec4 b) {
    return normal(a, vec4((a / b).rgb, b.a));
}

#define multiply(a, b) normal(a, multiply(a, b))
#define linearBurn(a, b) normal(a, linearBurn(a, b))
#define colorBurn(a, b) normal(a, colorBurn(a, b))
#define darken(a, b) normal(a, darken(a, b))
#define lighten(a, b) normal(a, lighten(a, b))
#define screen(a, b) normal(a, screen(a, b))
#define add(a, b) normal(a, add(a, b))
#define colorDodge(a, b) normal(a, colorDodge(a, b))
#define linearLight(a, b) normal(a, linearLight(a, b))


//--------//

const int MAX_STEPS = 128;
const float MAX_DIST = 512.0;
const float SURF_DIST = 1.0 / 32.0;

const float pdn = 1.0 / 16.0;


//---- Math Functions ----//

vec3 rotate(vec3 p, vec3 a) {

    vec3 c = cos(a), s = sin(a);

    p *= mat3(
        vec3(1.0, 0.0, 0.0),
        vec3(0.0, c.x, -s.x),
        vec3(0.0, s.x, c.x)
    ) * mat3(
        vec3(c.y, 0.0, s.y),
        vec3(0.0, 1.0, 0.0),
        vec3(-s.y, 0.0, c.y)
    ) * mat3(
        vec3(c.z, -s.z, 0.0),
        vec3(s.z, c.z, 0.0),
        vec3(0.0, 0.0, 1.0)
    );

    return p;
}

vec4 suni(vec4 d1, vec4 d2, float k) {
	k = max(k, 1.0/64.0);
    float h = clamp(0.5 + 0.5 * (d2.a - d1.a) / k, 0.0, 1.0);
    return mix(d2, d1, h) - vec2(0.0, k * h * (1.0 - h)).xxxy;
}

vec4 ssub(vec4 d1, vec4 d2, float k) {
	k = max(k, 1.0/64.0);
    float h = clamp(0.5 - 0.5 * (d1.a + d2.a) / k, 0.0, 1.0);
    return mix(d1, vec4(d2.rgb, -d2.a), h) + vec2(0.0, k * h * (1.0 - h)).xxxy;
}

vec4 sint(vec4 d1, vec4 d2, float k) {
	k = max(k, 1.0/64.0);
    float h = clamp(0.5 - 0.5 * (d2.a - d1.a) / k, 0.0, 1.0);
    return mix(d2, d1, h) + vec2(0.0, k * h * (1.0 - h)).xxxy;
}

float extrude(vec3 p, float sdf2d, float h) {
    float d = sdf2d;
    vec2 w = vec2(d, abs(p.z) - h);
    return min(max(w.x, w.y), 0.0) + length(max(w, 0.0));
}


//---- 3D SDF ----//

float sphere(vec3 p, float r) {
    return length(p) - r;
}

float cylinder( vec3 p, float h, float r) {
  vec2 d = abs(vec2(length(p.xz), p.y)) - vec2(r, h);
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

float capsule(vec3 p, float h, float r) {
    p.y -= clamp(p.y, 0.0, h);
    return length(p) - r;
}

float box(vec3 p, vec3 s) {
    p = abs(p) - s;
    return length(max(p, 0.0)) + min(max(p.x, max(p.y, p.z)), 0.0);
}

float boxFrame(vec3 p, vec3 b, float e) {
    p = abs(p) - b;
    vec3 q = abs(p + e) - e;
    return min(min(
            length(max(vec3(p.x, q.y, q.z), 0.0)) + min(max(p.x, max(q.y, q.z)), 0.0),
            length(max(vec3(q.x, p.y, q.z), 0.0)) + min(max(q.x, max(p.y, q.z)), 0.0)),
        length(max(vec3(q.x, q.y, p.z), 0.0)) + min(max(q.x, max(q.y, p.z)), 0.0));
}

float torus(vec3 p, vec2 r) {
    vec2 q = vec2(length(p.xz) - r.x, p.y);
    return length(q) - r.y;
}

float cone(vec3 p, vec2 c, float h) {
    vec2
    q = h * vec2(c.x / c.y, -1.0),
        w = vec2(length(p.xz), p.y),
        a = w - q * clamp(dot(w, q) / dot(q, q), 0.0, 1.0),
        b = w - q * vec2(clamp(w.x / q.x, 0.0, 1.0), 1.0);
    float
    k = sign(q.y),
        d = min(dot(a, a), dot(b, b)),
        s = max(k * (w.x * q.y - w.y * q.x), k * (w.y - q.y));
    return sqrt(d) * sign(s);
}

float octahedron(vec3 p, float s) {
    p = abs(p);
    float m = p.x + p.y + p.z - s;
    vec3 q;
    if (3.0 * p.x < m) q = p.xyz;
    else if (3.0 * p.y < m) q = p.yzx;
    else if (3.0 * p.z < m) q = p.zxy;
    else return m * 0.57735027;

    float k = clamp(0.5 * (q.z - q.y + s), 0.0, s);
    return length(vec3(q.x, q.y - s + k, q.z - k));
}


//---- 3D Render Tools ----//

vec2 edge(vec2 p) {
    vec2 p2 = abs(p);
    if (p2.x > p2.y) return vec2(p.x < 0.0 ? -1.0 : 1.0, 0.0);
    else return vec2(0.0, p.y < 0.0 ? -1.0 : 1.0);
}

vec3 material(vec3 c, int m) {
    vec2 id = vec2(-1.0, 1.0);
    c += pdn;
    c *= (m == 0 ? id.xxx : m == 1 ? id.xyy : m == 2 ? id.yxy : m == 3 ? id.yyx : m == 4 ? id.xxy : vec3(1.0));
    return c;
}


//---- Ray Marcher ----//

vec4 getDist(vec3 p);

vec4 rayMarch(vec3 ro, vec3 rd, float side) {
    vec4 dO = vec4(0.0);

    for (int i = 0; i < MAX_STEPS; i++) {
        if (dO.a > MAX_DIST) break;
        vec3 p = ro + rd * dO.a;
        vec4 dS = getDist(p) * side;
        if (dS.a < SURF_DIST) break;
        dO += dS;
    }

    return dO;
}

vec3 getNormal(vec3 p) {
    float d = getDist(p).a;
    vec2 e = vec2(0.001, 0.0);

    vec3 n = d - vec3(
        getDist(p - e.xyy).a,
        getDist(p - e.yxy).a,
        getDist(p - e.yyx).a
    );

    return normalize(n);
}

vec4 getLight(vec3 p, vec3 n, vec3 lp, vec3 lc) {
    vec3 l = normalize(lp - p);

    vec4
        dif = vec4(clamp(dot(n, l), 0.0, 1.0)),
        d = rayMarch(p + n * SURF_DIST / 0.5, l, 1.0);

    if (d.a < length(lp - p)) {

        if (d.x > 0.0 && d.y > 0.0 && d.z > 0.0) {
            //experimental
        }

        dif.a /= 2.0;
    }

    return vec4(lc, 1.0) * smoothstep(-0.5, 1.5, dif);
}


//---- 3D Projections ----//

float map(float v, float low1, float high1, float low2, float high2) {
    return (v - low1) / (high1 - low1) * (high2 - low2);
}

vec2 cubemap(vec3 p) {
    vec3
    b = abs(p),
        v = (b.x > b.y && b.x > b.z) ? p.xyz :
        (b.y > b.x && b.y > b.z) ? p.yzx :
        p.zxy;
    vec2 q = v.yx / v.x;
    q *= 1.25 - 0.25 * q * q;
    return q;
}

vec2 equimap(vec3 p) {
    p = normalize(p);
    return
    vec2(
        map(atan(p.x, -p.z), 0.0, PI, 0.0, 1.0),
        map(asin(p.y), 0.0, -PI / 2.0, 0.0, 1.0)
    );
}

vec3 equiunwrap(vec2 p) {
    float
    lon = map(p.x, 0.0, 1.0, -PI, PI),
        lat = map(p.y, 0.0, 1.0, -PI / 2.0, PI / 2.0),
        x = sin(lat) * sin(lon),
        y = cos(lat),
        z = sin(lat) * cos(lon);
    return vec3(x, -y, z);
}


//---- 3D renderer ----//

vec4 render(
    inout vec3 ro, inout vec3 rd,
    vec3 lp, vec3 lc,
    inout int bn,
    inout float mr, float IOR,
    bool last
);


//---- input value ----//

float spectrumValue(int value) {
    float x = mod(float(value), 8.0);
    float y = float(value) / 8.0;
    return texture2D(spectrum, vec2(x, y) / 8.0).x / 0.625;
}

////

// Simplex noise function
vec4 permute(vec4 x) {
    return mod(((x * 34.0) + 1.0) * x, 289.0);
}

vec4 taylorInvSqrt(vec4 r) {
    return 1.79284291400159 - 0.85373472095314 * r;
}

vec2 fade(vec2 t) {
    return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}

float noize(vec2 P) {
    vec4 Pi = floor(P.xyxy) + vec4(0.0, 0.0, 1.0, 1.0);
    vec4 Pf = fract(P.xyxy) - vec4(0.0, 0.0, 1.0, 1.0);
    Pi = mod(Pi, 289.0);
    vec4 ix = Pi.xzxz;
    vec4 iy = Pi.yyww;
    vec4 fx = Pf.xzxz;
    vec4 fy = Pf.yyww;
    vec4 i = permute(permute(ix) + iy);
    vec4 gx = fract(i * 0.0243902439) * 2.0 - 1.0;
    vec4 gy = abs(gx) - 0.5;
    vec4 tx = floor(gx + 0.5);
    gx = gx - tx;
    vec2 g00 = vec2(gx.x, gy.x);
    vec2 g10 = vec2(gx.y, gy.y);
    vec2 g01 = vec2(gx.z, gy.z);
    vec2 g11 = vec2(gx.w, gy.w);
    vec4 norm = taylorInvSqrt(vec4(dot(g00, g00), dot(g10, g10), dot(g01, g01), dot(g11, g11)));
    g00 *= norm.x;
    g10 *= norm.y;
    g01 *= norm.z;
    g11 *= norm.w;
    float n00 = dot(g00, vec2(fx.x, fy.x));
    float n10 = dot(g10, vec2(fx.y, fy.y));
    float n01 = dot(g01, vec2(fx.z, fy.z));
    float n11 = dot(g11, vec2(fx.w, fy.w));
    vec2 fade_xy = fade(Pf.xy);
    vec2 n_x = mix(vec2(n00, n01), vec2(n10, n11), fade_xy.x);
    float n_xy = mix(n_x.x, n_x.y, fade_xy.y);
    return 2.3 * n_xy;
}

float fbm(vec2 P) {
    float value = 0.0;
    float amplitude = 0.5;
    float frequency = 0.0;
    for (int i = 0; i < 6; i++) {
        value += amplitude * noize(P);
        P *= 2.0;
        amplitude *= 0.5;
    }
    return value;
}

//----//

#define reso u_resolution
#define time u_time
#define spec u_spectrum

void main() {
		vec2
			ratio = vec2(min(reso.x, reso.y) / max(reso.x, reso.y), 1.0),
			st = vTexCoord,
			uv = st / 0.5 - 1.0;
		
		uv /= reso.x > reso.y ? ratio.xy : ratio.yx;
		
		vec2 UV = uv;

    vec4 col = vec4(1.0);
		
//		uv.x += UV.x < 1.0 ? 1.0 : -2.0;
    
    // 3D setups //
    
    vec3
        ro = vec3(0.0, -4.0, 0.0).xzy,
        lp = vec3(32.0, 0.0, 64.0).xzy,
        lc = vec3(0.8, 0.75, 0.64);
    
    lc *= lc *= max(smoothstep(12.0, 0.0, abs(u_clock.x - 12.0)), 0.4); // lighting based on clock
        
    float
        mode = 0.0,
        stereoscopic = 0.0,
        eyeDistance = stereoscopic / 8.0;
        
    uv.x = mix(uv.x, mod(uv.x, 2.0) - 1.0, stereoscopic * (1.0 - mode));
    uv.y = mix(uv.y, mod(uv.y, 1.0) - 0.5, stereoscopic * mode);

    float zoom = true // UV.x < 1.0
			? 1.25 - 0.25 * ncos(time) + u_trigger.x / 8.0 * u_stick.y * u_stick.y * u_stick.y
			: 0.8 - u_trigger.y / 2.5;
    
    vec3 rd = mix(
        normalize(vec3(uv.xy, zoom)),
        rotate(normalize(equiunwrap(scale(uv, vec2(1.0), vec2(2.0, 1.0))) * vec2(1.0, zoom).xxy), vec3(0.0, PI, 0.0)),
        0.0625
    );
    vec3
				T = u_tiltView,
        R = u_freeView,
        M = u_freeMove;
		
		/*
		if (UV.x > 1.0) {
			ro.zy = vec2(1.0, -2.0);
			T.xz = (R.xz = vec2(PI / 2.0, 0.0)).yy;
		}
		*/
    
    ro -= vec3(sin(fract(time / 16.0) * TAU) / 4.0, -cos(fract(time / 8.0) * TAU) / 32.0, cos(fract(time / 2.0) * TAU) / 8.0);
    rd = rotate(rd, vec3(0.0, 0.0, sin(fract(time / 12.0) * TAU) / 48.0));
    
    vec2 eyeRotation = vec2(cos(-R.y), sin(-R.y));
    
    ro.xz += mix(UV.x, UV.y, mode) < 0.0 ? -eyeDistance * eyeRotation : eyeDistance * eyeRotation;
		
		T.x /= 8.0;
		T.z = -T.z;
		
    ro = rotate(rotate(ro, T), R);
    rd = rotate(rotate(rd, T), R);
    
    // 3D render //
    
    float DOP = rayMarch(ro, rd, 1.0).a;
    
    float
        mr = 0.0,
        mx = 1.0;
        
    float IOR = 1.45;
    
    int bn = 0;

    vec4 canvas = render(ro, rd, lp, lc, bn, mr, IOR, false);

    const int NUM_BOUNCES = 4;
    
    for (int i = NUM_BOUNCES; i > 0; i--) {
			if(NUM_BOUNCES - bn < i){
        mx *= mr;
        vec4 bounce = mx * render(ro, rd, lp, lc, bn, mr, IOR, (i == 1));
        
        canvas.rgb = normal(canvas, bounce).rgb;
			}
    }
    
    col.rgb = normal(col, canvas).rgb;
    
    col.rgb = hsv2rgb(rgb2hsv(col.rgb) * vec2(1.0, smoothstep(2.0, 0.2, length(st))).xxy);
		
    col.rgb = smoothstep(-0.125, 0.5, col.rgb);
		
    col.a = 1.0;
    gl_FragColor = vec4(col.rgb, 1.0);
}

vec4 getDist(vec3 p) {
    
    vec2
        st = gl_FragCoord.xy / reso.xy,
        uv = (gl_FragCoord.xy - reso.xy / 2.0) / 0.5 / (reso.x < reso.y ? reso.x : reso.y),
        UV = uv;
    
    vec3
				T = u_tiltView,
        R = u_freeView,
        M = u_freeMove;
		
    // sky
    
    vec4 space = vec4(material(vec3(1.0), 0), abs(sphere(p - vec2(64.0, 0.0).yxy, 256.0)));
		
    // ground
    
    vec3 k = p;
    k.y += 16.0;
    k -= M;
    
    vec4 ground = mix(
        texture2D(texture0, fract(k.xz / 16.0 / mix(0.8, 1.25, smoothstep(-0.25, 0.25, noise(k.xz / 32.0))))),
        texture2D(texture1, fract(k.xz / 32.0)),
        smoothstep(0.4, 0.8, noise(k.xz / 16.0))
    );
    
    ground.rgb *= smoothstep(0.0, 0.8, ground.a);
		
		
		float elv = (M.y + 16.0) / 27.0;
		
		float zoom = mix(1.0, 0.25, u_trigger.y) * mix(0.5, 2.0, elv * elv),
		
		laser = rect(rotate(p.xz, -R.y), vec2(2.0 / zoom) / 4.0) - 2.0;
		laser = min(laser, min(cos(laser - time / 0.5), 12.0 / zoom - laser / 0.5));
		laser = max(min(rect(fract(p.xz / 2.0 - M.xz) - 0.5, vec2(0.5 - 0.125)) / 2.0, laser), 0.125 - abs(laser + 0.0625));
		laser = mix(laser, min(laser, sin(rotate((p + M).xz, -R.y) * zoom / 6.0 + loop(time / 0.015625)).y), 0.03125);
		laser = smoothstep(0.0, 0.125, laser);
		laser *= smoothstep(1.0, 1.25, length(p.xz) * u_toggle.y);
		
		ground.rgb = overlay(ground, vec4(normalize(abs(rotate(p, vec3(-time)) / 4.0)) / 0.25, laser)).rgb;
		
		// terrain
    
    float terrain = mix(0.0, 12.0, smoothstep(0.0, 1.25, noise(k.xz / 16.0) + noise(k.xz / 8.0 - 4.0) / 4.0));
    terrain *= max(smoothstep(-0.125, 0.8, length(p.xz / 128.0)), 0.25);
	terrain *= smoothstep(4.0, 0.5, length(p / 128.0));
    
    float heightMap = (ground.r + ground.g + ground.b) / 3.0;
    heightMap = smoothstep(0.0, 1.25, heightMap) / 0.8;

    vec4 o = vec4(material(ground.rgb, laser > 0.0 ? 4 : 5), k.y - terrain);
    o.a = abs(o.a - heightMap);
    o.a /= 4.0;

    space = suni(space, o, 0.0);
    
    // nuclear wastes
    
    vec2
        l = (k.xz - time) / 4.0,
        t = vec2(time) / vec2(2.4, 1.8);
    float len = length(l);
    l.x = l.x + sin(l.y + cos(len-pow(ncos(len), 4.0))) + cos(t.x);
    l.y = l.y - cos(l.x + sin(len-pow(nsin(len), 4.0))) + sin(t.y);
    len = length(l);
    l.x = l.x - sin(l.y + cos(len-pow(ncos(len), 2.0))) + cos(t.x);
    l.y = l.y + cos(l.x + sin(len-pow(nsin(len), 2.0))) + sin(t.y);
    len = length(l);
    l.x = l.x + sin(l.y + cos(len-pow(ncos(len), 2.0))) + cos(t.x);
    l.y = l.y - cos(l.x + sin(len-pow(nsin(len), 2.0))) + sin(t.y);
    len = length(l);
    l.x = l.x - sin(l.y + cos(len-pow(ncos(len), 4.0))) + cos(t.x);
    l.y = l.y + cos(l.x + sin(len-pow(nsin(len), 4.0))) + sin(t.y);
    
    float ripples =  noise(k.xz / 2.0 - (l + len) / 2.0) / 16.0;
    ripples *= smoothstep(4.0, 0.5, length(p / 128.0));
		
    o.rgb = material(softLight(ground, vec4(0.1, 0.125, 0.0625, 1.0)).rgb, 2);
    o.a = ssub(terrain - k.yyyy, 2.0 - k.yyyy + ripples, 0.5).a / 1.6 + 0.125;
    
    space = suni(space, o, 0.0);
		
		// space ship
		
		vec3 q = p;
		q.xz = rotate(q.xz, -R.y);
		q.yz = rotate(q.yz, R.x);
		q = rotate(q - vec2(sin(time) / 8.0, 0.0).yxy, time / 2.0 / vec3(0.8, 1.25, 2.0));
		
		o.rgb = material(vec3(1.0, 0.6, 0.8), 3);
		o.a = abs(sphere(q, 1.0 + 0.25 * ncos(time / 0.25))) - 0.125;
		o.a = sint(vec4(o.a), vec4(abs(rotate(rotate(p, vec2(0.0, -R.y).xyx), vec3(T.xz / 0.8, 0.0).xzy).y) - 0.6), 0.2).a;
		
		space = suni(space, o, 0.0);
		
		o.a = sphere(abs(q) - 1.0 / SQRT3, 0.4);
		o.a = suni(vec4(o.a), vec4(sphere(vec3(abs(rotate(q.xz, PI / 4.0)) - 1.0 / SQRT2, q.y).xzy, 0.4)), 0.2).a;
		o.a = suni(vec4(o.a), vec4(sphere(vec3(q.xz, abs(q.y) - 1.0).xzy, 0.4)), 0.2).a;
		
		space = ssub(space, o, 0.2);
		
		o.rgb = abs(length(q) - 0.8) > 0.0625 ? material(vec3(0.4, 0.8, 0.6), 2) : material(hsv2rgb(vec3(0.08, 1.0, 0.25 + 0.75 * ncos(time / 0.4))), 4);
		o.a = suni(vec4(o.a + 0.2), vec4(sphere(q, 0.6)), 0.4).a;
		
		space = suni(space, o, 0.0);
		
		o.rgb = material(hsv2rgb(vec3(0.08, 1.0, 0.25 + 0.75 * ncos(time / 0.4))), 4);
		o.a = sphere(p, 0.2 + 0.4 * nsin(time / 0.4));
		
//		space = suni(space, o, 0.0);
		
		//
		
		vec3 secretPos = vec3(PHI, 0.0, K) * SQRT075 * 256.0;
		
		o.rgb = material(vec3(0.4, 0.0, 0.2), 3);
		o.a = octahedron((p - M + secretPos) / vec2(1.0, 2.0).xyx, 4.0);
		o.a = max(o.a, cylinder(p - M + secretPos, 10.0, 2.0));
		
//		space = suni(space, o, 0.0);
    
//		space.a = max(space.a, - rotate(p.xz, -R.y).y - 32.0);
		
		k = p;
		k.xz = rotate(k.xz, -R.y);
		k.yz = rotate(k.yz, R.x);
		k.z += 4.0;
		space.a = ssub(space, vec4(sphere(k, 2.0)), 0.25).a;
		
    return space;
}

vec4 render(
    inout vec3 ro, inout vec3 rd,
    vec3 lp, vec3 lc,
    inout int bn,
    inout float mr, float IOR,
    bool last
) {
    vec2
        st = gl_FragCoord.xy / reso.xy,
        uv = (gl_FragCoord.xy - reso.xy / 2.0) / 0.5 / (reso.x < reso.y ? reso.x : reso.y),
        UV = uv;
    
    vec4 canvas = vec4(0.0);
    
    vec4 d = rayMarch(ro, rd, 1.0);
    
    mr = 0.0;
    
    
    vec3
				T = u_tiltView,
        R = u_freeView,
        M = u_freeMove;
        
        float tiltAngle = min(nsin(R.y), nsin(-R.x));
    
    
    if (d.a < MAX_DIST) {
        vec3
            p = ro + rd * d.a,
            n = getNormal(p),
            rfl = reflect(rd, n)
        ;
        
        vec4
            dif = max(
                getLight(p, n, lp, lc),
                0.3
            ),
            c = getDist(p)
        ;
        
        c.a = step(0.0, c.a);
        
        
        // spotlight
        
        float spotlight = smoothstep(mix(16.0, 32.0, smoothstep(2.0, -16.0, M.y)), -2.0, cone(rotate(rotate(p, vec2(-R.y, 0.0).yxy) + vec2(4.0, 0.0).yxy, vec2(PI/4.0, 0.0).xyy), vec2(1.0, 2.0), 64.0) - 0.25);
        spotlight *= u_toggle.x;
        
        dif = max(dif, spotlight / 1.25);
        lc = mix(lc, max(lc, spotlight / 0.8), smoothstep(4.0, -4.0, p.y));
				
        
        // texturing
        
        canvas.a = c.a;
        
        dif.a = max(0.64, dif.a);
        
        // custom texture
        canvas.rgb = softLight(c, vec4(dif.a)).rgb;
        mr = 0.03125;
        
        const int k = 1; // 0 for cubemap, 1 for equirectangular
        
        vec3 envMap = rotate(p, vec3(0.0, PI/4.0, 0.0));
        
        envMap.xy = (k != 0 ? scale(equimap(envMap), vec2(1.0), vec2(1.0)) : scale(cubemap(envMap), vec2(1.0), reso));
        envMap.xy /= vec2(1.0, 1.0 + 1.0/16.0);
        
        vec4 envTex = texture2D(hdri, envMap.xy);
        /* mix(
            texture2D(hdri, envMap.xy),
            texture2D(hdri, envMap.xy + vec2(0.0, 0.5)),
            tiltAngle // * float(UV.x < 1.0)
        ); */ // hdri
        
        // background environment texture
        if (c.x < 0.0 && c.y < 0.0 && c.z < 0.0) {
            c = -c;
            canvas.rgb = multiply(c, envTex).rgb;
            lc = max(lc, (canvas.r + canvas.g + canvas.b) / 3.0);
            lc *= max(smoothstep(12.0, 0.0, abs(u_clock.x - 12.0)), 0.4); // lighting based on clock
            mr = 0.0;
            dif = vec4(1.0);
            bn = 0;
        }
        
        float
        fl = clamp(1.0 + dot(rd, n), 0.0, 1.0),
            fresnel = fl * fl * fl * fl;

        // rough texture
        if (c.x < 0.0 && c.y > 0.0 && c.z > 0.0) {
            c.x = -c.x;
            canvas.rgb = overlay(vec4(dif.a), c).rgb;
            mr = mix(0.03125, 0.25, fresnel);
            bn = 1;
        }
        
        envMap = rfl;
        envMap.xy = (k != 0 ? scale(equimap(envMap), vec2(1.0), vec2(1.0)) : scale(cubemap(envMap), vec2(1.0), reso));
        
        vec4 metal = vec4(dif.a);
        if (last) metal.rgb = texture2D(hdri, envMap.xy).rgb;
        
        // metalic texture
        if (c.x > 0.0 && c.y < 0.0 && c.z > 0.0) {
            c.y = -c.y;
            canvas.rgb = colorBurn(metal, overlay(c, metal)).rgb;
            mr = 0.84;
            ro = p + n * SURF_DIST / 0.25;
            rd = rfl;
            bn = 2;
        }
        
        vec4 trans = vec4(dif.a);
        vec3
        rdIn = refract(rd, n, 1.0 / IOR),
            pEnter = p - n * SURF_DIST / 0.25,
            dIn = vec3(rayMarch(pEnter, rdIn, -1.0).a),
            pExit = pEnter + rdIn * dIn,
            nExit = -getNormal(pExit),
            rdOut = refract(rdIn, nExit, IOR),
            optDist = exp(-dIn / 16.0);
        if (dot(rdOut, rdOut) == 0.0) rdOut = reflect(rdIn, nExit);
        
        envMap = rdOut;
        envMap.xy = (k != 0 ? scale(equimap(envMap), vec2(1.0), vec2(1.0)) : scale(cubemap(envMap), vec2(1.0), reso));
        
        if (last) trans = texture2D(hdri, envMap.xy);
        
        // translucent texture
        if (c.x > 0.0 && c.y > 0.0 && c.z < 0.0) {
            c.z = -c.z;
            canvas.rgb = softLight(trans, colorBurn(trans, c)).rgb;
            canvas.rgb *= optDist;
            mr = mix(0.93, 0.63, fresnel);
            ro = pExit - nExit * SURF_DIST / 0.25;
            rd = rdOut;
            bn = 3;
        }
        
        // bright texture
        if (c.x < 0.0 && c.y < 0.0 && c.z > 0.0) {
            c.xy = -c.xy;
            canvas.rgb = linearLight(vec4(dif.a), c).rgb;
            lc = max(lc, 1.0);
            mr = 0.03125;
            bn = 1;
        }
        
        vec4 fog = mix(vec4(1.0, 0.8, 0.6, 0.8), vec4(1.0, 0.4, 0.2, 0.8), smoothstep(-64.0, 1024.0, p.y));
        canvas.rgb = mix(softLight(canvas, vec4(0.6, 0.27, 0.48, 0.24)).rgb, fog.rgb, smoothstep(-8.0, 128.0, d.a * smoothstep(0.4, -0.8, p.y/128.0))).rgb;
        canvas.rgb = mix(canvas.rgb, darken(canvas, vec2(smoothstep(1.25, 0.0, tiltAngle), 0.25).xxxy).rgb, smoothstep(0.2, -0.2, p.y/128.0));
        
        canvas.rgb -= vec3(pdn);
        canvas.rgb *= lc;
    }
    
    return canvas;
}
