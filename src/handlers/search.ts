import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard, paginate } from "../toolkit/index.js";
import { searchFiles, type FileRecord } from "../storage.js";

const composer = new Composer<Ctx>();

// File type filter options
const FILE_TYPES = [
  { label: "📄 Documents", value: "document" },
  { label: "🖼 Images", value: "image" },
  { label: "🎥 Videos", value: "video" },
  { label: "🎵 Audio", value: "audio" },
  { label: "📦 All files", value: "" },
];

// Format file size for display
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Format date for display
function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// /search command — initiate search with text query
composer.command("search", async (ctx) => {
  const query = ctx.message?.text?.replace("/search", "").trim() ?? "";
  
  if (!query) {
    await ctx.reply("Send a search query to find files. You can also tap the filter buttons below.", {
      reply_markup: inlineKeyboard([
        FILE_TYPES.map(ft => inlineButton(ft.label, `search:filter:${ft.value}`)),
        [inlineButton("⬅️ Back to menu", "menu:main")],
      ]),
    });
    return;
  }
  
  await performSearch(ctx, query, 0);
});

// search:start callback — open search interface from main menu
composer.callbackQuery("search:start", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply("Send a search query to find files. You can also tap the filter buttons below.", {
    reply_markup: inlineKeyboard([
      FILE_TYPES.map(ft => inlineButton(ft.label, `search:filter:${ft.value}`)),
      [inlineButton("⬅️ Back to menu", "menu:main")],
    ]),
  });
});

// Search filter callback
composer.callbackQuery(/^search:filter:(.*)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const fileType = ctx.match?.[1] ?? "";
  
  // Store filter in session and prompt for query
  ctx.session.searchFilter = fileType;
  ctx.session.step = "awaiting_search_query";
  
  await ctx.editMessageText(
    fileType 
      ? `Searching for ${FILE_TYPES.find(ft => ft.value === fileType)?.label ?? "files"}. Send your search query.`
      : "Send your search query to find files.",
    {
      reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
    }
  );
});

// Handle text input for search query
composer.on("message:text", async (ctx, next) => {
  if (ctx.session.step !== "awaiting_search_query") {
    return next();
  }
  
  const query = ctx.message.text.trim();
  if (!query) {
    await ctx.reply("Please enter a search query.");
    return;
  }
  
  ctx.session.step = "idle";
  await performSearch(ctx, query, 0, ctx.session.searchFilter);
});

// Pagination callbacks
composer.callbackQuery(/^search:page:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const page = parseInt(ctx.match?.[1] ?? "0", 10);
  await performSearch(ctx, ctx.session.lastSearchQuery ?? "", page, ctx.session.searchFilter);
});

// File preview callback
composer.callbackQuery(/^file:preview:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const fileId = ctx.match?.[1] ?? "";
  
  // Get file details from storage
  const { getFileRecord } = await import("../storage.js");
  const file = await getFileRecord(fileId);
  
  if (!file) {
    await ctx.reply("File not found. It may have been removed.");
    return;
  }
  
  const details = [
    `📄 ${file.filename}`,
    `Type: ${file.file_type_tag || "Unknown"}`,
    `Size: ${formatSize(file.size)}`,
    `Chat: ${file.chat_name}`,
    `Date: ${formatDate(file.upload_date)}`,
    file.caption ? `Caption: ${file.caption}` : "",
  ].filter(Boolean).join("\n");
  
  await ctx.editMessageText(details, {
    reply_markup: inlineKeyboard([
      [inlineButton("📤 Send file", `file:send:${fileId}`)],
      [inlineButton("⬅️ Back to results", `search:back`)],
    ]),
  });
});

// File send callback
composer.callbackQuery(/^file:send:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const fileId = ctx.match?.[1] ?? "";
  
  const { getFileRecord } = await import("../storage.js");
  const file = await getFileRecord(fileId);
  
  if (!file) {
    await ctx.reply("File not found. It may have been removed.");
    return;
  }
  
  // Send the file to the user
  try {
    await ctx.replyWithDocument(file.file_id, {
      caption: file.filename,
    });
  } catch {
    await ctx.reply("Couldn't send the file. It may no longer be available.");
  }
});

// Search results helper
async function performSearch(
  ctx: Ctx,
  query: string,
  page: number,
  fileType?: string
) {
  ctx.session.lastSearchQuery = query;
  
  const filters = fileType ? { file_type: fileType } : undefined;
  const results = await searchFiles(query, filters);
  
  if (results.length === 0) {
    await ctx.reply(
      `No files found for "${query}". Try different keywords or check your filters.`,
      {
        reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
      }
    );
    return;
  }
  
  // Paginate results (5 per page)
  const { pageItems, controls, page: actualPage, totalPages } = paginate(results, {
    page,
    perPage: 5,
    callbackPrefix: "search:page",
  });
  
  // Format results
  const resultLines = pageItems.map((file: FileRecord, i: number) => {
    const num = actualPage * 5 + i + 1;
    return `${num}. ${file.filename} (${formatSize(file.size)})`;
  });
  
  const header = `Found ${results.length} file${results.length === 1 ? "" : "s"} for "${query}":`;
  const pageInfo = totalPages > 1 ? `\nPage ${actualPage + 1} of ${totalPages}` : "";
  
  // Build keyboard with file buttons and pagination
  const fileButtons = pageItems.map((file: FileRecord) => [
    inlineButton(file.filename, `file:preview:${file.file_id}`),
  ]);
  
  const keyboard = inlineKeyboard([
    ...fileButtons,
    ...controls.inline_keyboard,
    [inlineButton("⬅️ Back to menu", "menu:main")],
  ]);
  
  await ctx.reply(header + pageInfo + "\n\n" + resultLines.join("\n"), {
    reply_markup: keyboard,
  });
}

export default composer;
