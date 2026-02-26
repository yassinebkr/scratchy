# write

Write content to a file. Creates the file if it doesn't exist, overwrites if it does.
Automatically creates parent directories as needed.

## Parameters

- file_path: Path to the file to write (required)
- content: Content to write to the file (required)

## Notes

Use this for creating new files or fully replacing existing file content.
For partial edits to existing files, prefer the `edit` tool instead.
