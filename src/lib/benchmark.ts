// Fixed persona-consistency benchmark (brief §6). Same scenes and seeds every
// run, so workflows and models can be compared fairly.
export const BENCHMARK_SCENES = [
  { key: "portrait_front", prompt: "head and shoulders portrait, facing camera, neutral studio backdrop, soft key light" },
  { key: "portrait_34", prompt: "three-quarter view portrait, looking slightly away, window light" },
  { key: "profile", prompt: "side profile portrait, rim light, dark background" },
  { key: "fullbody_street", prompt: "full body shot walking on a sunny Mediterranean street, casual outfit" },
  { key: "fullbody_studio", prompt: "full body standing pose, plain studio, fashion catalogue style" },
  { key: "cafe_indoor", prompt: "sitting in a cafe holding a coffee cup, warm indoor light" },
  { key: "beach_golden", prompt: "on the beach at golden hour, wind in hair, smiling" },
  { key: "night_neon", prompt: "city at night, neon reflections, evening outfit" },
  { key: "gym", prompt: "in a gym wearing sportswear, mid-workout, bright light" },
  { key: "product_bottle", prompt: "holding a plain glass skincare bottle toward the camera, product clearly visible" },
  { key: "selfie", prompt: "smartphone selfie, arm extended, casual home setting" },
  { key: "low_angle", prompt: "low angle shot from below, confident pose, blue sky" },
] as const;

export const BENCHMARK_BASE_SEED = 777000;
