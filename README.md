📅 YouTube Auto Uploader with Google Apps Script

This Google Apps Script automates the process of uploading scheduled videos to YouTube directly from Google Drive. It reads scheduling and metadata from a Google Sheet, uploads the video to YouTube, optionally adds it to playlists, attaches subtitles, and applies localized titles and descriptions in multiple languages.

in javascript file, you can change the "timezone" line if you want.

🔧 Features:
- Upload videos from a specific Google Drive folder based on schedule
- Read video metadata (title, description, tags, privacy, etc.) from Google Sheets
- Add uploaded videos to specified playlists
- Upload .sbv subtitle files if available
- Automatically generate and apply translations for titles and descriptions
- Mark videos as "UPLOADED" so it won't be uploaded again on the channel
- There is also a separate function that you can execute. which will put UPLOADED videos into trashbin

📂 Folder Structure:
- Expects videos to be in a folder named YoutubeVideos (you can rename it if you want)
- Subtitle files must have the same name as the video (with .sbv extension. if there is none, program will still work)

✅ Requirements:
- OAuth authorization for Google Apps Script (Drive, YouTube Data API v3)
- Google Sheet with scheduled video data
