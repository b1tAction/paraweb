// GLSL fragment shader for the lost_way event animation.
// Progress (uProgress) controls the dissolve amount:
//   0 = fully transparent (no overlay visible)
//   1 = fully opaque black (background completely dissolved)
// Vortex (uVortex) controls the spiral twist distortion:
//   0 = no twist
//   1 = maximum inward spiral twist
//
// The dissolve pattern uses FBM noise, vortex-twisted UVs for spiral
// distortion, glitch displacement in early phase, scan lines, and
// purple spiral ring patterns visible during the vortex phase.
//
// Cross-platform notes:
//   - Uses highp precision for consistent results on all GPU drivers
//   - Uses integer-based hash instead of sin() hash to avoid
//     precision-dependent artifacts on Mesa/Intel Linux drivers

export const LOST_WAY_DISSOLVE_SHADER_NAME = 'lost-way-dissolve';

export const LOST_WAY_DISSOLVE_FRAGMENT_SOURCE = `
precision highp float;

uniform float uProgress;
uniform float uTime;
uniform vec2 uResolution;
uniform float uVortex;

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

// Vortex distortion: twist UV coordinates spiraling inward toward center
vec2 vortexDist(vec2 uv, float vortex) {
    vec2 center = vec2(0.5);
    vec2 dir = uv - center;
    float dist = length(dir);
    // Twist angle: stronger near center, fading outward
    float angle = vortex * 8.0 * (1.0 - smoothstep(0.0, 0.6, dist));
    // Also add a slow continuous rotation driven by time
    angle += vortex * uTime * 2.0 * (1.0 - smoothstep(0.0, 0.4, dist));
    float c = cos(angle);
    float s = sin(angle);
    return center + vec2(dir.x * c - dir.y * s, dir.x * s + dir.y * c);
}

void main() {
    vec2 uv = gl_FragCoord.xy / uResolution;

    // Apply vortex twist to UV before computing dissolve noise
    vec2 twistedUV = vortexDist(uv, uVortex);

    // Animated dissolve noise (twisted so it spirals inward)
    float n = fbm(twistedUV * 3.0 + uTime * 0.3);

    // Dissolve threshold
    float threshold = 1.0 - uProgress;
    float dissolveMask = smoothstep(threshold - 0.08, threshold + 0.02, n);

    // Glitch horizontal displacement (early dissolve phase)
    float glitchIntensity = smoothstep(0.0, 0.35, uProgress) * smoothstep(0.7, 0.35, uProgress);
    float glitchShift = hash(vec2(floor(uv.y * 15.0), floor(uTime * 8.0))) * glitchIntensity * 0.04;

    // Scan lines (early phase)
    float scanLine = sin(uv.y * 80.0 + uTime * 3.0) * 0.5 + 0.5;
    float scanIntensity = smoothstep(0.0, 0.25, uProgress) * smoothstep(0.5, 0.25, uProgress) * 0.15;

    // Spiral ring pattern visible during vortex phase
    vec2 dir = uv - vec2(0.5);
    float dist = length(dir);
    float baseAngle = atan(dir.y, dir.x);
    // Spiral: angle offset increases with distance, animated by time
    float spiralAngle = baseAngle + uTime * 3.0 - dist * 12.0 * uVortex;
    // Create thin spiral arms
    float spiralArm = abs(sin(spiralAngle * 6.0));
    float spiralLine = smoothstep(0.05, 0.0, spiralArm * 0.15);
    // Fade spiral based on distance and vortex intensity
    float spiralFade = uVortex * smoothstep(0.05, 0.35, dist);

    // Dissolve edge glow (reddish-orange)
    float edgeGlow = smoothstep(threshold - 0.04, threshold, n) * smoothstep(threshold + 0.02, threshold, n);
    vec3 edgeColor = vec3(0.6, 0.15, 0.02) * edgeGlow * 3.0;

    // Vortex spiral line color (purple, matching character tint)
    vec3 vortexSpiralColor = vec3(0.35, 0.08, 0.2) * spiralLine * spiralFade;

    // Base dark color
    vec3 color = vec3(0.02, 0.005, 0.0);
    color += vec3(0.05, 0.02, 0.0) * scanLine * scanIntensity;
    color += edgeColor;
    color += vortexSpiralColor;

    // Alpha: dissolve mask + spiral lines visible even in fully dissolved area
    float alpha = max(dissolveMask, spiralLine * spiralFade * 0.5);

    gl_FragColor = vec4(color, alpha);
}
`;
