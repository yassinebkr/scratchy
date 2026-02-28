# card

Simple content card with title and text body.
Used for short prose descriptions, notes, or summaries.

## Data Fields

- title: Card heading (string, required)
- text: Card body text (string, supports markdown line breaks and basic formatting)
- icon: Optional emoji icon displayed alongside the title

## Usage Notes

Keep card text under 150 characters when possible.
For longer or structured content, use more appropriate components like `table`, `kv`, or `timeline`.
Card is for short prose only — never cram structured data into a card text field.
