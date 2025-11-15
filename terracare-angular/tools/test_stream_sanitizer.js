const assert = require('assert');

// A simplified copy of normalizeFragment + sanitizeText used by the Angular client
function normalizeFragment(fragment) {
  if (!fragment) return '';
  let s = String(fragment).trim();
  s = s.replace(/^\s*(?:data:\s*)+/i, '');
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) s = s.slice(1, -1);
  try {
    const obj = JSON.parse(s);
    if (!obj) return '';
    if (typeof obj.delta === 'string') return obj.delta;
    if (typeof obj.content === 'string') return obj.content;
    if (typeof obj.text === 'string') return obj.text;
    if (Array.isArray(obj.choices)) {
      let out = '';
      for (const ch of obj.choices) {
        if (ch && ch.delta && typeof ch.delta === 'object' && typeof ch.delta.content === 'string') out += ch.delta.content;
        else if (ch && ch.delta && typeof ch.delta === 'string') out += ch.delta;
        else if (ch && ch.message && typeof ch.message.content === 'string') out += ch.message.content;
      }
      return out;
    }
    return '';
  } catch (e) {
    return s.replace(/\bdata:\s*/gi, '').trim();
  }
}

function sanitizeText(text) {
  if (!text) return '';
  let s = String(text);
  s = s.replace(/\\n/g, '\n');
  // preserve code blocks
  const codeBlocks = [];
  s = s.replace(/```[\s\S]*?```/g, (m) => { codeBlocks.push(m); return `___CODE_BLOCK_${codeBlocks.length-1}___`; });
  s = s.replace(/\{[^}]*\"(?:id|object|system_fingerprint|choices|created)\"[^}]*\}/g, '');
  s = s.replace(/\{[^}]*\}/g, '');
  // remove standalone quoted key:value pairs that may appear without enclosing braces
  s = s.replace(/"[^"\s]+"\s*:\s*"[^"\}]+"/g, ' ');
  // remove fingerprint tokens like fp_xxx
  s = s.replace(/\bfp_[A-Za-z0-9_\-]+\b/g, ' ');
  // remove known metadata keys with possible trailing values
  s = s.replace(/\b(object|usage|time_info|system_fingerprint|id|created)\b\s*[:=]\s*[^,\s\}]+/gi, ' ');
  // remove event markers
  s = s.replace(/\bevent\s*:\s*done\b/gi, ' ');
  // collapse stray punctuation leftover from removed JSON
  s = s.replace(/[:,{}\[\]]+/g, ' ');
  s = s.replace(/[ \t]{2,}/g, ' ');
  s = s.replace(/\n{3,}/g, '\n\n');
  s = s.replace(/\s+([.,!?;:])/g, '$1');
  s = s.replace(/___CODE_BLOCK_(\d+)___/g, (_m, idx) => codeBlocks[Number(idx)] || '');
  return s.trim();
}

// Simulate messy SSE stream fragments
const fragments = [
  'data: {"delta":"It"}',
  'data: {"id":"chatcmpl-083748c6-208d-4bd1-9c38-7a40dd426c72","object":"chat.completion.chunk"}',
  'data: {"delta":" seems"}',
  'data: {"delta":" like"}',
  'data: {"delta":" you"}',
  'data: {"delta":"\'re"}',
  'data: {"id":"chatcmpl-083748c6-...","system_fingerprint":"fp_xxx","object":"chat.completion.chunk"}',
  'data: {"delta":" looking"}',
  'data: {"delta":" for some assistance."}',
  'event: done',
  'data: {}'
];

// Apply normalize -> sanitize, filter event frames, and join with spaces (server emits single-line replies)
let pieces = fragments.map(f => normalizeFragment(f)).map(f => sanitizeText(f)).filter(Boolean);
// remove provider event markers that may appear in streams
pieces = pieces.filter(p => !/^event:/i.test(p));
const assembled = pieces.join(' ');

console.log('Pieces:', pieces);
console.log('Assembled:', assembled);

// Expect a clean single sentence
const expected = "It seems like you're looking for some assistance.";
// Fix common contraction spacing introduced by fragment boundaries (e.g. you 're -> you're)
const normalized = assembled.replace(/\s+'([A-Za-z])/g, "'$1").replace(/\s+([.,!?;:])/g, '$1');
assert.strictEqual(normalized, expected, `Assembled did not match expected.\nAssembled: ${normalized}\nExpected: ${expected}`);
console.log('Test passed: assembled output matches expected sentence');

// Additional test: messy single-line sample that includes provider JSON fragments
const messy = 'data: How can I help you today? Do you have a question about ecorprint":"fp_96d06d87d0ffbc02e8e8","object":"chat.completion.chunk"}allenges, need some tips on creating angerprint":"fp_96d06d87d0ffbc02e8e8","object":"chat.completion.chunk"}, or perhaps you\'d likent":"fp_96d06d87d0ffbc02e8e8","object":"chat.completion.chunk"} know more about the TerraCare site?d06d87d0ffbc02e8e8","object":"chat.completion.chunk","usage":{"total_tokens":106},"time_info":{"queue_time":0.00009}} event: done data: {}';

const norm = normalizeFragment(messy);
const clean = sanitizeText(norm);
console.log('\nMessy input -> normalized:', norm);
console.log('After sanitize:', clean);
// Expectations: text should include readable phrases and must not include provider metadata tokens
assert.ok(/How can I help you today\?/i.test(clean), 'Should include greeting sentence');
assert.ok(/TerraCare/i.test(clean), 'Should mention TerraCare');
assert.ok(!(/"object"\s*:|system_fingerprint|fp_[A-Za-z0-9_\-]+/i.test(clean)), 'Should not contain JSON metadata tokens like object:, system_fingerprint:, or fp_...');
console.log('Test passed: messy sample cleaned as expected');
