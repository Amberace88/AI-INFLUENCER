import assert from "node:assert/strict";
import { parseJson } from "../src/lib/ai/json";
assert.deepEqual(parseJson('Sure! ```json\n{"a":"x}","b":[1,2]}\n``` hope it helps'), { a: "x}", b: [1, 2] });
assert.deepEqual(parseJson('[{"caption":"Hola \\"tú\\" {}"}] trailing'), [{ caption: 'Hola "tú" {}' }]);
assert.throws(() => parseJson("no json here"));
assert.throws(() => parseJson('{"a": 1'));
console.log("✓ AI JSON parsing");
assert.deepEqual(parseJson('[{"caption":"Línea uno\nLínea dos\twith tab","hashtags":["#a",],}]'), [{ caption: "Línea uno\nLínea dos\twith tab", hashtags: ["#a"] }]);
console.log("✓ AI JSON with raw newlines and trailing commas");
