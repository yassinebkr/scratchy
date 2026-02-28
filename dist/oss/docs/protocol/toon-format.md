# TOON Format

TOON (Token-Oriented Object Notation) is a compact data format for LLM communication.
Saves ~30-40% tokens compared to JSON while remaining human-readable.

## Syntax

- `key: value` for simple properties
- 2-space indentation for nested objects
- `key[N]: val1,val2` for inline arrays
- `key[N]{f1,f2}: + rows` for tabular arrays
- `---` separates multiple documents
- Quoted strings preserve commas and colons

## When to Use

Use TOON for structured data in LLM prompts: tool docs, search results, manifests.
Use JSON only for deeply nested structures or array-of-arrays.
