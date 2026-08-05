precision lowp float;

uniform sampler2D u_noise;

uniform vec2 u_resolution;
uniform vec2 u_offset;

uniform float u_tile_size;
uniform float u_grain_size;
uniform float u_opacity;

varying vec2 vTexCoord;

void main() {
    vec2 grainPixel = vTexCoord * u_resolution / u_grain_size;
    vec2 tileUv = fract(grainPixel / u_tile_size + u_offset);
    vec2 broadUv = fract(
        grainPixel / (u_tile_size * 2.75) +
        u_offset * 0.35 +
        vec2(0.37, 0.61)
    );
    float fine = texture2D(u_noise, tileUv).r * 2.0 - 1.0;
    float broad = texture2D(u_noise, broadUv).r * 2.0 - 1.0;
    float grain = fine * 0.72 + broad * 0.28;
    float amount = pow(abs(grain), 1.55) * u_opacity;
    vec3 tone = grain < 0.0 ? vec3(0.0) : vec3(1.0);
    gl_FragColor = vec4(tone, amount);
}
