# edit

Edit a file by replacing exact text. The old text must match exactly including whitespace.
Use this for precise, surgical edits to existing files.

## Parameters

- file_path: Path to the file to edit (required)
- old_string: Exact text to find and replace (required, must match exactly)
- new_string: New text to replace the old text with (required)

## Notes

The oldText must be an exact substring of the file contents.
If the old text appears multiple times, only the first occurrence is replaced.
For creating new files or full replacements, use the `write` tool instead.
