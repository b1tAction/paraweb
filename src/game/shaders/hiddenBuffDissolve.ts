// GLSL fragment shader for the hidden_buff event animation.
// This is a FULL-SCREEN overlay (same approach as lost_way dissolve),
// with the effect localized around the character via uCenter uniform.
// It shows fragment scatter + void effects only near the character,
// while the rest of the viewport remains transparent.
//
// Progress (uProgress) controls the dissolve/reassemble amount:
//   0 = fully transparent (no effect visible)
//   1 = fully opaque void (character area dissolved into dimensional rift)
// Disintegrate (uDisintegrate) controls the fragment scatter intensity:
//   0 = no scatter (fragments in original position)
//   1 = maximum scatter (fragments flying outward in all directions)
// Center (uCenter) is the character's normalized position in the viewport (0-1).
//
// The shader uses a local UV coordinate system centered on uCenter,
// aspect-corrected and scaled so all original parameters (noise freq,
// scatter offsets, etc.) produce the same visual result as before.
// The radial fade is computed in viewport space (distance from uCenter),
// eliminating the rectangular boundary artifact of the previous
// localized 200x200 shader quad approach.
//
// Cross-platform notes:
//   - Uses highp precision for consistent results on all GPU drivers
//   - Uses integer-based hash instead of sin() hash to avoid
//     precision-dependent artifacts on Mesa/Intel Linux drivers

export const HIDDEN_BUFF_DISSOLVE_SHADER_NAME = 'hidden-buff-disintegrate';

export const HIDDEN_BUFF_DISSOLVE_FRAGMENT_SOURCE = `
precision highp float;

uniform float uProgress;
uniform float uTime;
uniform vec2 uResolution;
uniform float uDisintegrate;
uniform vec2 uCenter;

// Integer-based hash - deterministic across GPU drivers
float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
        v += a * noise(p);
        p *= 2.0;
        a *= 0.5;
    }
    return v;
}

// Fragment scatter: offset UVs outward from center based on noise and intensity
vec2 scatterOffset(vec2 uv, float intensity) {
    vec2 blockCoord = floor(uv * 8.0);
    float angleHash = hash(blockCoord);
    float distHash = hash(blockCoord + vec2(0.5, 0.73));

    float angle = angleHash * 6.2832;
    // Scatter distance: fragments fly outward from center
    float scatterDist = intensity * (0.02 + distHash * 0.04);

    return uv + vec2(cos(angle), sin(angle)) * scatterDist;
}

void main() {
    vec2 uv = gl_FragCoord.xy / uResolution;

    // Aspect-corrected direction from character center
    float aspect = uResolution.x / uResolution.y;
    vec2 dir = (uv - uCenter) * vec2(aspect, 1.0);
    float dist = length(dir);

    // Radial fade: circular in viewport space, centered on character position.
    // This replaces the previous approach of fading from UV center (0.5, 0.5)
    // which only worked for the localized 200x200 shader quad and caused
    // a visible rectangular boundary when uResolution didn't match actual
    // pixel dimensions (camera zoom mismatch).
    float radialFade = smoothstep(0.18, 0.05, dist);

    // Local UV: maps the effect area around uCenter to a 0-1 square space,
    // aspect-corrected so all original shader parameters produce identical
    // visual results. EFFECT_SCALE controls viewport coverage:
    //   EFFECT_SCALE=7 means the effect area spans ~1/7 of viewport height.
    const float EFFECT_SCALE = 7.0;
    vec2 localUV = dir * EFFECT_SCALE + vec2(0.5);

    // Apply scatter offset in local UV space (same as original localized shader)
    vec2 scatteredUV = scatterOffset(localUV, uDisintegrate);

    // Animated dissolve noise (scattered so fragments fly outward)
    float n = fbm(scatteredUV * 4.0 + uTime * 0.2);

    // Dissolve threshold
    float threshold = 1.0 - uProgress;
    float dissolveMask = smoothstep(threshold - 0.06, threshold + 0.02, n);

    // Fragment edge glow (bright cyan-blue, dimensional rift energy)
    float edgeGlow = smoothstep(threshold - 0.05, threshold, n) * smoothstep(threshold + 0.02, threshold - 0.01, n);
    vec3 edgeColor = vec3(0.3, 0.76, 0.97) * edgeGlow * 3.5;  // #4fc3f7 cyan-blue

    // Inner rift glow (deeper blue)
    float innerEdge = smoothstep(threshold - 0.08, threshold - 0.03, n) * smoothstep(threshold, threshold - 0.05, n);
    vec3 riftColor = vec3(0.1, 0.14, 0.49) * innerEdge * 2.0;  // #1a237e deep indigo

    // Scan lines (subtle, in local UV space)
    float scanLine = sin(localUV.y * 30.0 + uTime * 2.0) * 0.5 + 0.5;
    float scanIntensity = 0.05 + uProgress * 0.06;

    // Star-like particles (sparse, in local UV space)
    float starField = 0.0;
    for (int i = 0; i < 2; i++) {
        vec2 starOffset = vec2(
            hash(vec2(float(i), 0.0)) * 1.0,
            hash(vec2(0.0, float(i))) * 1.0
        );
        vec2 starPos = localUV + starOffset + vec2(uTime * 0.04 * (float(i) + 1.0), uTime * 0.02 * (float(i) + 1.0));
        float starVal = noise(starPos * 20.0);
        starField += smoothstep(0.97, 1.0, starVal) * 0.4;
    }
    starField *= uProgress * radialFade;

    // Base void color (deep indigo-black)
    vec3 color = vec3(0.04, 0.03, 0.08);
    color += vec3(0.05, 0.04, 0.12) * scanLine * scanIntensity * radialFade;
    color += vec3(0.4, 0.3, 0.9) * starField;
    color += edgeColor * radialFade;
    color += riftColor * radialFade;

    // Alpha: dissolve mask + star particles + edge glow, all with radial fade
    float alpha = max(dissolveMask, edgeGlow * 0.7) * radialFade;
    alpha = max(alpha, starField * 0.4);

    gl_FragColor = vec4(color, alpha);
}
`;
