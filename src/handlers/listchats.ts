import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { listChatSources } from "../storage.js";

const composer = new Composer<Ctx>();

// /listchats command — show all indexed chats
composer.command("listchats", async (ctx) => {
  await showChats(ctx);
});

// admin:listchats callback — from main menu button
composer.callbackQuery("admin:listchats", async (ctx) => {
  await ctx.answerCallbackQuery();
  await showChats(ctx);
});

async function showChats(ctx: Ctx) {
  const chats = await listChatSources();
  
  if (chats.length === 0) {
    await ctx.reply(
      "No chats in the index yet. Tap ➕ Add chat to add one.",
      {
        reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
      }
    );
    return;
  }
  
  // Format chat list
  const lines = chats.map((chat, i) => {
    const type = chat.is_public ? "Public" : "Private";
    const date = new Date(chat.date_added).toLocaleDateString();
    return `${i + 1}. ${chat.name}\n   ID: ${chat.chat_id}\n   Type: ${type}\n   Added: ${date}`;
  });
  
  await ctx.reply(
    `Indexed chats (${chats.length}):\n\n` + lines.join("\n\n"),
    {
      reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
    }
  );
}

export default composer;
