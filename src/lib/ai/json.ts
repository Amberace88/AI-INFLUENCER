/**
 * Extracts the first JSON object/array from a model reply. Tolerates code fences,
 * text around the JSON, raw line breaks/tabs inside strings (common in captions)
 * and trailing commas.
 */
export function parseJson<T>(text: string): T {
  const cleaned = text.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.search(/[[{]/);
  if (start < 0) throw new Error("AI reply contained no JSON");
  const open = cleaned[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0, inStr = false, esc = false, out = "";
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (inStr) {
      if (esc) { esc = false; out += ch; continue; }
      if (ch === "\\") { esc = true; out += ch; continue; }
      if (ch === '"') { inStr = false; out += ch; continue; }
      if (ch === "\n") { out += "\\n"; continue; }
      if (ch === "\r") { continue; }
      if (ch === "\t") { out += "\\t"; continue; }
      if (ch.charCodeAt(0) < 0x20) { continue; }
      out += ch;
      continue;
    }
    out += ch;
    if (ch === '"') inStr = true;
    else if (ch === open) depth++;
    else if (ch === close && --depth === 0) {
      return JSON.parse(out.replace(/,\s*([}\]])/g, "$1")) as T;
    }
  }
  throw new Error("AI reply JSON was incomplete");
}
