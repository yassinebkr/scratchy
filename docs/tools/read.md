# read

Read the contents of a file. Supports text files and images (jpg, png, gif, webp).

## Parameters

- file_path: Path to the file to read (required)
- offset: Line number to start reading from, 1-indexed (optional)
- limit: Maximum number of lines to read (optional)

## Notes

Output is truncated to 2000 lines or 50KB (whichever is hit first).
For large files, use offset/limit to paginate through content.
Images are sent as inline attachments.
