precision lowp float;

uniform sampler2D u_texture;
uniform vec3 u_key_color;
uniform vec3 u_background_color;
uniform float u_opacity;

varying vec2 vTexCoord;

void main() {
    vec3 source = texture2D(u_texture, vTexCoord).rgb;
    float paperDifference = distance(source, u_key_color);
    float painted = smoothstep(0.035, 0.20, paperDifference);

    float maximumChannel = max(source.r, max(source.g, source.b));
    float minimumChannel = min(source.r, min(source.g, source.b));
    float chroma = maximumChannel - minimumChannel;
    float sourceLightness = dot(
        source,
        vec3(0.2126, 0.7152, 0.0722)
    );
    float paleNeutralPaper =
        smoothstep(0.62, 0.92, sourceLightness) *
        (1.0 - smoothstep(0.06, 0.20, chroma));
    float paperMask = max(1.0 - painted, paleNeutralPaper);

    float backgroundLightness = dot(
        u_background_color,
        vec3(0.2126, 0.7152, 0.0722)
    );
    float pigmentBlend = mix(0.16, 0.48, backgroundLightness);
    vec3 embeddedPigment = mix(
        source,
        source * u_background_color,
        pigmentBlend
    );

    gl_FragColor = vec4(
        embeddedPigment,
        (1.0 - paperMask) * u_opacity
    );
}
