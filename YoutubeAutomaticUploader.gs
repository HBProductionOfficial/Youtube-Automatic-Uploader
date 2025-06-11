function uploadScheduledVideo() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const data = sheet.getDataRange().getValues();
  const now = new Date();

  const folder = (() => {
    try {
      return DriveApp.getFoldersByName("ShortsToUpload").next();
    } catch (e) {
      Logger.log("❌ Folder 'ShortsToUpload' not found");
      return null;
    }
  })();
  if (!folder) return;

  const candidates = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const [filename, , , , , scheduledTime, status] = row;
    if (status !== "UPLOADED" && filename && scheduledTime && now >= new Date(scheduledTime)) {
      candidates.push({ rowIndex: i, rowData: row });
    }
  }

  if (candidates.length === 0) {
    Logger.log("📭 No upload candidates available.");
    return;
  }

  while (candidates.length > 0) {
    const index = Math.floor(Math.random() * candidates.length);
    const { rowIndex: i, rowData } = candidates.splice(index, 1)[0];
    const [filename, title, desc, tags, language, , , playlists, subtitleFlag, localizeFlag, privacy] = rowData;

    const files = folder.getFilesByName(filename);
    if (!files.hasNext()) {
      Logger.log("❌ File not found: " + filename);
      continue;
    }

    const file = files.next();
    const blob = file.getBlob();
    const parsedTags = tags.split(",").map(s => s.trim()).filter(Boolean);

    const resource = {
      snippet: {
        title,
        description: desc,
        tags: parsedTags,
        defaultLanguage: language,
        categoryId: "28" // Science & Technology
      },
      status: {
        privacyStatus: privacy || "public"
      }
    };

    let location;
    try {
      const initResponse = UrlFetchApp.fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + ScriptApp.getOAuthToken(),
          "Content-Type": "application/json; charset=UTF-8",
          "X-Upload-Content-Length": blob.getBytes().length,
          "X-Upload-Content-Type": blob.getContentType()
        },
        payload: JSON.stringify(resource),
        muteHttpExceptions: true
      });
      location = initResponse.getHeaders()["Location"];
      if (!location) {
        Logger.log("❌ No upload URL received.");
        Logger.log(initResponse.getContentText());
        continue;
      }
    } catch (e) {
      Logger.log("❌ Upload init failed: " + e.message);
      continue;
    }

    let videoId;
    try {
      const uploadResponse = UrlFetchApp.fetch(location, {
        method: "PUT",
        headers: {
          Authorization: "Bearer " + ScriptApp.getOAuthToken(),
          "Content-Type": blob.getContentType()
        },
        payload: blob.getBytes(),
        muteHttpExceptions: true
      });
      const result = JSON.parse(uploadResponse.getContentText());
      videoId = result.id;
      if (!videoId) throw new Error("Video ID missing");
      sheet.getRange(i + 1, 7).setValue("UPLOADED");
      Logger.log("✅ Uploaded: " + filename);
    } catch (e) {
      Logger.log("❌ Upload failed: " + e.message);
      continue;
    }

    if (playlists) {
      const list = playlists.split(",").map(s => s.trim());
      for (const plName of list) {
        try {
          const playlistId = getPlaylistIdByName(plName);
          if (!playlistId) continue;
          UrlFetchApp.fetch("https://www.googleapis.com/youtube/v3/playlistItems?part=snippet", {
            method: "POST",
            contentType: "application/json",
            headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() },
            payload: JSON.stringify({
              snippet: {
                playlistId: playlistId,
                resourceId: { kind: "youtube#video", videoId }
              }
            })
          });
          Logger.log("📥 Added to playlist: " + plName);
        } catch (e) {
          Logger.log("❌ Playlist error: " + e.message);
        }
      }
    }

    if (subtitleFlag === "yes") {
      try {
        const subFile = folder.getFilesByName(filename.replace(/\.[^.]+$/, ".sbv"));
        if (subFile.hasNext()) {
          const subBlob = subFile.next().getBlob();
          UrlFetchApp.fetch("https://www.googleapis.com/upload/youtube/v3/captions?part=snippet", {
            method: "POST",
            contentType: "application/json",
            headers: {
              Authorization: "Bearer " + ScriptApp.getOAuthToken(),
              "X-Upload-Content-Type": subBlob.getContentType()
            },
            payload: JSON.stringify({
              snippet: {
                videoId,
                language: "en",
                name: "English",
                isDraft: false
              }
            })
          });
          Logger.log("📝 Subtitles uploaded");
        } else {
          Logger.log("⚠️ Subtitle not found: " + filename);
        }
      } catch (e) {
        Logger.log("❌ Subtitle upload failed: " + e.message);
      }
    }

    if (localizeFlag === "yes") {
      const translations = getTranslations(title, desc);
      Logger.log("🌐 Translations generated:");
      Logger.log(JSON.stringify(translations, null, 2));

      try {
        const response = UrlFetchApp.fetch("https://www.googleapis.com/youtube/v3/videos?part=snippet,localizations", {
          method: "PUT",
          contentType: "application/json",
          headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() },
          payload: JSON.stringify({
            id: videoId,
            snippet: {
              title: title || "Untitled",
              description: desc || "No description.",
              categoryId: "28",
              tags: parsedTags
            },
            localizations: translations
          }),
          muteHttpExceptions: true
        });
        const resultCode = response.getResponseCode();
        const body = response.getContentText();
        if (resultCode >= 200 && resultCode < 300) {
          Logger.log("🌍 Localization applied");
        } else {
          Logger.log("❌ Localization failed — status " + resultCode);
          Logger.log(body);
        }
      } catch (e) {
        Logger.log("❌ Failed to apply localizations: " + e.message);
      }
    }

    break; // Only upload one video per run
  }
}

function getPlaylistIdByName(name) {
  const res = UrlFetchApp.fetch("https://www.googleapis.com/youtube/v3/playlists?part=snippet&mine=true&maxResults=50", {
    method: "GET",
    headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() }
  });
  const playlists = JSON.parse(res.getContentText()).items;
  const pl = playlists.find(p => p.snippet.title === name);
  return pl ? pl.id : null;
}

function getTranslations(enTitle, enDesc) {
  const languages = ["ka", "de", "fr", "fil", "es", "it", "pt", "tr", "ru", "hi", "ms", "id", "ar", "ja", "ko", "vi", "th", "uk", "pl", "nl", "he", "zh-CN", "zh-TW", "ur", "uz", "bn", "ro", "ne", "kk", "ta", "si", "am"];
  const translations = {};
  const TITLE_LIMIT = 100;
  const DESC_LIMIT = 5000;

  for (const lang of languages) {
    try {
      let translatedTitle = LanguageApp.translate(enTitle, "en", lang);
      let translatedDesc = LanguageApp.translate(enDesc, "en", lang);
      if (translatedTitle.length > TITLE_LIMIT) translatedTitle = translatedTitle.substring(0, TITLE_LIMIT - 1).trim();
      if (translatedDesc.length > DESC_LIMIT) translatedDesc = translatedDesc.substring(0, DESC_LIMIT - 1).trim();

      translations[lang] = {
        title: translatedTitle,
        description: translatedDesc
      };
    } catch (e) {
      Logger.log(`⚠️ Translation failed for '${lang}': ${e.message}`);
    }
  }

  return translations;
}

function cleanupUploadedFiles() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const data = sheet.getDataRange().getValues();
  const folder = (() => {
    try {
      return DriveApp.getFoldersByName("ShortsToUpload").next();
    } catch (e) {
      Logger.log("❌ Folder not found");
      return null;
    }
  })();
  if (!folder) return;

  let deleted = 0;
  for (let i = 1; i < data.length; i++) {
    const [filename, , , , , , status] = data[i];
    if (status === "UPLOADED" && filename) {
      const files = folder.getFilesByName(filename);
      while (files.hasNext()) {
        try {
          const file = files.next();
          file.setTrashed(true);
          deleted++;
        } catch (e) {
          Logger.log("⚠️ Failed to delete: " + filename);
        }
      }
    }
  }

  Logger.log(`🗑️ Cleanup complete. Files deleted: ${deleted}`);
}

