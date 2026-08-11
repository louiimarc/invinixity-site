precision lowp float;

uniform int
maxRayBounces;

uniform float
u_time,
u_value,
u_toggle,
u_axis,
u_pointer,
u_gradient,
u_white_backdrop;

uniform vec2
u_resolution,
u_mouse,
u_gradient_center,
u_gradient_size;

uniform vec3
u_dimension,
u_hsb,
u_color0,
u_color1,
u_color2,
u_color3;

uniform float u_gradient_radius;

uniform sampler2D
spectrum,
texture0;

varying vec2 vTexCoord;
varying vec3 vNormal;
varying vec3 vPosition;

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

float noise(vec2 p) {
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

float voronoise(in vec2 p, float u, float v) {
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

#define uHSV(h, s, v) vec3(h / 360.0, s / 100.0, v / 100.0)

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

float map(float v, float low1, float high1, float low2, float high2) {
    return (v - low1) / (high1 - low1) * (high2 - low2);
}

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

#define pow2(x) (x * x)

const float pi = atan(1.0) * 4.0;
const int blurSamples = 12;
const float sigma = 3.0;
const float blurStride = 1.25;

float gaussian(vec2 i) {
    return 1.0 / (2.0 * pi * pow2(sigma)) * exp(-((pow2(i.x) + pow2(i.y)) / (2.0 * pow2(sigma))));
}

vec3 blur(sampler2D sp, vec2 uv, vec2 scale) {
    vec3 col = vec3(0.0);
    float accum = 0.0;
    float weight;
    vec2 offset;

    for (int x = -blurSamples / 2; x < blurSamples / 2; ++x) {
        for (int y = -blurSamples / 2; y < blurSamples / 2; ++y) {
            offset = vec2(x, y);
            weight = gaussian(offset);
            col += texture2D(sp, uv + scale * offset * blurStride).rgb * weight;
            accum += weight;
        }
    }

    return col / accum;
}

//----//

#define time u_time
#define reso u_resolution
#define spec u_spectrum

void main() {
    vec2
    st = gl_FragCoord.xy / reso.xy,
    ST = (st * 2.0 - 1.0) * reso / min(reso.x, reso.y),
    UV = vTexCoord.xy,
    uv = UV * 2.0 - 1.0,
    ps = 1.0 / reso.xy,
    mo = (u_mouse / reso) * 2.0 - 1.0;
    mo *= reso / min(reso.x, reso.y);
    st.y = 1.0 - st.y;

    vec3 dmn = u_dimension;
    dmn.z /= min(dmn.x, dmn.y) / 2.0;
    dmn.z = min(dmn.z, 1.0);
    dmn.xy = dmn.xy / min(dmn.x, dmn.y);
    uv *= dmn.xy;

    float d = rect(uv, dmn.xy, dmn.z);
    d = smoothstep(-0.5, 0.25, d);
    d *= d;

    vec2
    st_ = st + (UV * 2.0 - 1.0) * d / -32.0,
    shift = vec2(2e-3 * d);

    vec4 col = vec4(1.0);
    col.r = blur(texture0, st_ + shift, ps).r;
    col.g = blur(texture0, st_, ps).g;
    col.b = blur(texture0, st_ - shift, ps).b;
    vec3 solidColor = hsv2rgb(u_hsb / vec3(360.0, 100.0, 100.0));
    vec3 gradientColor = mix(u_color0, u_color1, UV.x);
    vec3 gradientTop = mix(u_color0, u_color1, UV.x);
    vec3 gradientBottom = mix(u_color2, u_color3, UV.x);
    vec3 gradientField = mix(gradientTop, gradientBottom, UV.y);
    if (u_gradient > 2.5) {
        vec2 insetSize = max(u_gradient_size, vec2(1.0e-5));
        vec2 insetUv = (UV - u_gradient_center) / insetSize + 0.5;
        vec2 insetPoint = insetUv * 2.0 - 1.0;
        float insetDistance = rect(insetPoint, vec2(1.0), u_gradient_radius);
        float insetMask = smoothstep(0.02, -0.02, insetDistance);
        vec2 insetColorUv = clamp(insetUv, 0.0, 1.0);
        vec3 insetTop = mix(u_color0, u_color1, insetColorUv.x);
        vec3 insetBottom = mix(u_color2, u_color3, insetColorUv.x);
        vec3 insetGradient = mix(insetTop, insetBottom, insetColorUv.y);
        vec3 insetBackdrop = mix(col.rgb, vec3(1.0), u_white_backdrop);
        col.rgb = mix(col.rgb, insetBackdrop * insetGradient, insetMask);
    } else {
        col.rgb = mix(col.rgb, vec3(1.0), u_white_backdrop);
        vec3 controlColor = solidColor;
        if (u_gradient > 1.5) {
            controlColor = gradientField;
        } else if (u_gradient > 0.5) {
            controlColor = gradientColor;
        }
        float sliderAxis = mix(UV.x, 1.0 - UV.y, u_axis);
        float sliderMask = smoothstep(-0.02, 0.02, sliderAxis - (sliderAxis * 2.0 - 1.0) * d / 4.0 - u_value);
        vec3 sliderColor = max(controlColor, vec3(sliderMask));
        vec3 toggleColor = mix(vec3(1.0), controlColor, u_toggle);
        col.rgb *= mix(sliderColor, toggleColor, step(0.001, u_toggle));
    }

    col.xyz = rgb2hsv(col.rgb);
    col.z += smoothstep(-0.25, 2.0, d) / 4.0 - 3e-2;
    col.z *= 0.8;
    col.rgb = hsv2rgb(col.xyz);
    col.rgb = softLight(col, vec4(vec3(max(hsv2rgb(vec3(atan(uv.y, uv.x) / TAU, d * d / 2.0, 1.0)) * smoothstep(0.8, 0.0, length((ST - (UV * 2.0 - 1.0) * vec2(1.0, -1.0) * d) - mo * vec2(1.0, -1.0))) * u_pointer, 0.5)), 1.0)).rgb;
    col.rgb = mix(col.rgb, texture2D(texture0, st).rgb, smoothstep(0.8, 1.0, d));

    gl_FragColor = vec4(col.rgb, 1.0);
}
