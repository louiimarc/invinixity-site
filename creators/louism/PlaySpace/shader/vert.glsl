precision mediump float;

attribute vec2 aTexCoord;
attribute vec3 aNormal;
attribute vec3 aPosition;

uniform mat4 uProjectionMatrix;
uniform mat4 uModelViewMatrix;

varying vec2 vTexCoord;
varying vec3 vNormal;
varying vec3 vPosition;

void main() {
    vTexCoord = aTexCoord;
    vNormal = aNormal;
    vPosition = aPosition;

    gl_Position = uProjectionMatrix * uModelViewMatrix * vec4(aPosition, 1.0);
}
