# gauge

Circular or arc gauge for displaying a single metric as a percentage or value.
Ideal for CPU usage, disk space, completion percentage, etc.

## Data Fields

- label: Metric name (string, required)
- value: Current value (number, required)
- max: Maximum value for the scale (number, default 100)
- unit: Display unit (string, e.g. "%", "GB", "ms")
- color: Gauge color (string, e.g. "orange", "blue", "#ff5500")

## Usage Notes

Use gauge for single numeric metrics. For multiple related metrics, consider using a `stats` component instead.
Color should reflect severity: green for good, orange for warning, red for critical.
