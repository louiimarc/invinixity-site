precision highp float;

uniform float u_hue;
varying vec2 vTexCoord;

const float TAU = 6.2831853072;

vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

vec2 discToSquare(vec2 p) {
    return vec2(
        sqrt(max(0.0, 2.0 + 2.0 * 1.4142135623 * p.x + p.x * p.x - p.y * p.y)) * 0.5 -
            sqrt(max(0.0, 2.0 - 2.0 * 1.4142135623 * p.x + p.x * p.x - p.y * p.y)) * 0.5,
        sqrt(max(0.0, 2.0 + 2.0 * 1.4142135623 * p.y - p.x * p.x + p.y * p.y)) * 0.5 -
            sqrt(max(0.0, 2.0 - 2.0 * 1.4142135623 * p.y - p.x * p.x + p.y * p.y)) * 0.5
    );
}

void main() {
    vec2 p = vTexCoord * 2.0 - 1.0;
    float radius = length(p);
    float edge = 0.012;
    float ringOuter = 0.98;
    float ringInner = 0.69;
    float discRadius = 0.58;

    float hue = fract(atan(p.y, p.x) / TAU + 1.0);
    vec3 ringColor = hsv2rgb(vec3(hue, 1.0, 1.0));
    float ringAlpha = smoothstep(ringOuter, ringOuter - edge, radius) *
        smoothstep(ringInner, ringInner + edge, radius);

    vec2 square = clamp(discToSquare(p / discRadius), -1.0, 1.0);
    float saturation = square.x * 0.5 + 0.5;
    float brightness = 0.5 - square.y * 0.5;
    vec3 discColor = hsv2rgb(vec3(u_hue, saturation, brightness));
    float discAlpha = smoothstep(discRadius, discRadius - edge, radius);

    float alpha = max(ringAlpha, discAlpha);
    if (alpha <= 0.001) discard;
    vec3 color = mix(ringColor, discColor, discAlpha);
    gl_FragColor = vec4(color, alpha);
}
