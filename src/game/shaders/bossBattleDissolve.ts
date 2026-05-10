// GLSL fragment shader for boss battle dissolve animation.
// Progress (uProgress) controls the dissolve amount:
//   0 = fully transparent (no overlay visible)
//   1 = fully opaque pure black (background completely dissolved, like entering another space)
// Center (uCenter) is the starting position in normalized viewport coords (0-1).
// EdgeColor (uEdgeColor) controls the color theme:
//   boss damage/attack: red vec3(0.9, 0.1, 0.05)
//   boss skill: purple vec3(0.5, 0.15, 0.7)
// The dissolve expands outward from uCenter with FBM noise for organic edges.
// During dissolve: edge glow, glitch displacement, scan lines, and pulse waves
// radiate from center, tinted by uEdgeColor. All transient effects fade out
// before reaching progress=1, leaving pure black background (same as lost_way).
//
// Cross-platform notes:
//   - Uses highp precision for consistent results on all GPU drivers
//   - Uses integer-based hash instead of sin() hash to avoid
//     precision-dependent artifacts on Mesa/Intel Linux drivers

export const BOSS_BATTLE_DISSOLVE_SHADER_NAME = 'boss-battle-dissolve';

export const BOSS_BATTLE_DISSOLVE_FRAGMENT_SOURCE = `
precision highp float;

uniform float uProgress;
uniform float uTime;
uniform vec2 uResolution;
uniform vec2 uCenter;
uniform vec3 uEdgeColor;

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

void main() {
    vec2 uv = gl_FragCoord.xy / uResolution;

    // Aspect-corrected direction from dissolve center
    float aspect = uResolution.x / uResolution.y;
    vec2 dir = (uv - uCenter) * vec2(aspect, 1.0);
    float dist = length(dir);

    // Animated dissolve noise (add organic texture to the radial edge)
    float n = fbm(uv * 3.0 + uTime * 0.3);

    // Combine radial distance with noise for organic dissolve edge
    float edgeFactor = dist + n * 0.08;

    // Dissolve mask: inside the expanding radius = opaque (black coverage),
    // outside = transparent. Reversed so progress=1 = full black coverage
    // (matching lost_way behavior: entering another space).
    float maxRadius = 1.5;
    float threshold = uProgress * maxRadius;
    float dissolveMask = smoothstep(threshold + 0.02, threshold - 0.08, edgeFactor);

    // Edge glow (colored by uEdgeColor, like a burning frontier at dissolve edge)
    float edgeGlow = smoothstep(threshold + 0.02, threshold, edgeFactor)
                     * smoothstep(threshold - 0.04, threshold, edgeFactor);
    vec3 edgeGlowColor = uEdgeColor * edgeGlow * 3.0;

    // Glitch horizontal displacement (early dissolve phase)
    float glitchIntensity = smoothstep(0.0, 0.3, uProgress) * smoothstep(0.7, 0.3, uProgress);
    float glitchShift = hash(vec2(floor(uv.y * 15.0), floor(uTime * 8.0))) * glitchIntensity * 0.03;

    // Scan lines (early phase, tinted by edge color)
    float scanLine = sin(uv.y * 80.0 + uTime * 3.0) * 0.5 + 0.5;
    float scanIntensity = smoothstep(0.0, 0.25, uProgress) * smoothstep(0.5, 0.25, uProgress) * 0.12;

    // Pulse waves radiating from center (tinted by edge color, fadeout at high progress)
    float pulseWave = sin(dist * 20.0 - uTime * 8.0 + uProgress * 10.0) * 0.5 + 0.5;
    float pulseIntensity = smoothstep(0.0, 0.3, uProgress) * smoothstep(0.6, 0.4, uProgress) * smoothstep(0.02, 0.3, dist) * 0.2;

    // Base dark color tinted by edge color (fadeout at high progress for pure black)
    vec3 baseTint = uEdgeColor * 0.03 * (1.0 - smoothstep(0.7, 1.0, uProgress));
    vec3 color = vec3(0.02, 0.02, 0.02) + baseTint;
    color += (uEdgeColor * 0.5 + vec3(0.02, 0.02, 0.02)) * scanLine * scanIntensity;
    color += edgeGlowColor;
    color += uEdgeColor * 0.6 * pulseWave * pulseIntensity;

    // Alpha: dissolve mask + edge glow visibility
    float alpha = max(dissolveMask, edgeGlow * 0.7);

    gl_FragColor = vec4(color, alpha);
}
`;
