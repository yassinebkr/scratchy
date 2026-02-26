# web-search

Search the web using the Brave Search API.
Supports region-specific and localized search results.

## Parameters

- query: Search query string (required)
- count: Number of results to return, 1-10 (optional, default 5)
- country: 2-letter country code for region filtering (optional, default US)
- freshness: Time filter — pd (past day), pw (past week), pm (past month)

## Output

Returns titles, URLs, and snippets for each result.
Useful for finding current information, verifying facts, or researching topics.
