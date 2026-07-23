import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { listChatSources } from "../storage.js";

const composer = new Composer<Ctx>();

// /reindex command — force reindexing of a specific chat
composer.command("reindex", async (ctx) => {
  await showChatList(ctx);
});

// admin:reindex callback — from main menu button
composer.callbackQuery("admin:reindex", async (ctx) => {
  await ctx.answerCallbackQuery();
  await showChatList(ctx);
});

// Handle reindex confirmation
composer.callbackQuery(/^reindex:confirm:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const chatId = ctx.match?.[1] ?? "";
  
  // Simulate reindexing (in real implementation, this would trigger actual indexing)
  await ctx.editMessageText(
    `🔄 Reindexing chat ${chatId}...\n\nThis may take a while depending on the number of files.`,
    {
      reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
    }
  );
  
  // In a real implementation, you would:
  // 1. Fetch recent messages from the chat
  // 2. Extract file metadata
  // 3. Store in FileRecord storage
  // 4. Update chat's indexed status
  
  // For now, we'll just acknowledge the request
  setTimeout(async () => {
    try {
      await ctx.editMessageText(
        `✅ Reindexing started for chat ${chatId}.\n\nThe bot will process files in the background.`,
        {
          reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
        }
      );
    } catch {
      // Message may have been edited already
    }
  }, 1000);
});

// Handle cancel
composer.callbackQuery("reindex:cancel", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText("Cancelled.", {
    reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
  });
});

async function showChatList(ctx: Ctx) {
  const chats = await listChatSources();
  
  if (chats.length === 0) {
    await ctx.reply(
      "No chats in the index yet. Tap ➕ Add chat to add one first.",
      {
        reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
      }
    );
    return;
  }
  
  const lines = chats.map((chat, i) => 
    `${i + 1}. ${chat.name} (${chat.chat_id})`
  );
  
  const buttons = chats.map(chat => [
    inlineButton(`🔄 ${chat.name}`, `reindex:confirm:${chat.chat_id}`),
  ]);
  
  await ctx.reply(
    "Select a chat to reindex:\n\n" + lines.join("\n"),
    {
      reply_markup: inlineKeyboard([
        ...buttons,
        [inlineButton("Cancel", "reindex:cancel")],
      ]),
    }
  );
}

export default composer;
