# Build: YouTube Metadata Exporter

## Objective

Build a simple web application that retrieves public video metadata from a YouTube channel and exports it to an Excel spreadsheet.

## 1. Frontend

Create an extremely simple, clean, and responsive single-page interface. This is a utility tool, not an analytics dashboard.

The page should include only:

1. **Heading:** YouTube Metadata Exporter
2. **Description:** "Collect video metadata from a YouTube channel and export it to Excel."
3. **Input field:** YouTube Channel URL
4. **Primary button:** Fetch Videos
5. **Progress indicator:** Display while metadata is being retrieved.
6. **Results summary:** Show the total number of videos retrieved.
7. **Download button:** Display Download Excel after successful ingestion.
8. **Error messages:** Clearly explain invalid URLs, API errors, and failed requests.

Use generous whitespace, restrained colors, readable typography, and responsive styling. Avoid sidebars, navigation menus, charts, dashboards, unnecessary cards, and additional configuration options.

The only required user input should be a YouTube channel URL. Support formats such as:

- `https://www.youtube.com/@GoogleDevelopers`
- `https://www.youtube.com/channel/UC...`

## 2. Application Workflow

1. Accept and validate the YouTube channel URL.
2. Resolve the URL to its canonical YouTube channel ID.
3. Retrieve all accessible public videos uploaded by the channel.
4. Collect the required video metadata.
5. Sort the results by publication date, newest first.
6. Generate a downloadable `.xlsx` Excel workbook.
7. Display the number of successfully retrieved videos.
8. Allow the user to download the workbook directly from the browser.

## 3. Excel Export

Generate a valid Excel workbook containing the following columns in this exact order:

| Column | Description |
|---|---|
| `No` | Sequential row number starting at 1, assigned after sorting |
| `title` | Video title |
| `Date` | Video publication date |
| `view_count` | Total view count |
| `like_count` | Total like count |
| `playlist_titles` | Names of playlists containing the video |
| `video_url` | Direct link to the YouTube video |

### Formatting requirements

- Sort records by publication date in descending order.
- Store dates as Excel-compatible date values with readable formatting.
- Freeze the header row and enable column filters.
- Use appropriate column widths and numeric formatting.
- Make video URLs clickable.
- Handle missing or unavailable metadata gracefully without inventing values.
- Generate a descriptive filename based on the channel name and export date.

## 4. Technical Requirements

- Use Next.js and TypeScript.
- Use the official YouTube Data API v3.
- Allow the user to enter their own YouTube API key through a frontend input field.
- Keep all YouTube API requests and API key usage on the server. Never expose the key in client-side code, URLs, logs, or error messages.
- For local development, support an optional `YOUTUBE_API_KEY` environment variable as a default.
- If both a configured environment key and a user-provided key are available, define and document a clear precedence rule.
- Do not persist user-provided API keys in local storage, session storage, cookies, or a database.
- Use ExcelJS or another appropriate library to generate a real `.xlsx` workbook.
- Implement API pagination to retrieve videos beyond the first page.
- Use batching where supported to reduce unnecessary API requests.
- Handle API quota exhaustion, invalid URLs, inaccessible channels, network failures, and unavailable statistics.
- Do not hardcode API responses or generate fake metadata.
- Do not introduce a database unless it is necessary for the initial implementation.
- Do not require users to sign in to retrieve public channel metadata.

### Playlist handling

Use the channel's uploads playlist to discover its uploaded videos. Do not assume this is equivalent to all user-created playlists.

Retrieve playlist names and video membership where feasible, subject to YouTube Data API access and quota limits. A video may belong to multiple playlists. Represent multiple playlist names consistently, such as with semicolon-separated values.

If complete playlist information cannot be retrieved, document the limitation and handle unavailable values gracefully.

### API key security

The browser must send the user-provided API key to a server-side endpoint over HTTPS in production. The server should use it only for the requested operation and must not log or persist it.

Validate inputs, restrict requests to the intended YouTube API operations, and avoid exposing raw upstream API errors to the client. Document the security implications of asking users to provide their own API keys.

## 5. Project Setup and Code Quality

Before implementation:

1. Inspect the existing repository and identify its framework, structure, dependencies, and conventions.
2. Preserve existing conventions where practical.
3. If the repository is empty, initialize a suitable Next.js and TypeScript project.

Keep the ingestion logic, URL validation, and Excel generation modular and testable. Add tests for URL validation, pagination, deduplication, sorting, missing metadata, and workbook generation where practical.

## 6. Definition of Done

Deliver a working application, not just a mockup.

Verify that:

- Valid channel URLs are accepted and resolved correctly.
- Invalid URLs are rejected with clear messages.
- All accessible public uploads are retrieved across API pages.
- Metadata is associated with the correct videos.
- Results are sorted newest to oldest.
- The `No` column starts at 1 and increments sequentially.
- The Excel workbook opens correctly and contains the required columns.
- The download works in the browser.
- API keys are not exposed to the client or persisted.
- Loading states and errors are handled appropriately.
- Linting, type checking, tests, and the production build run successfully.

Fix any issues discovered during verification. Do not claim that checks passed unless they were actually executed.

At completion, summarize the implementation, setup instructions, required environment variables, tests performed, and any remaining limitations.