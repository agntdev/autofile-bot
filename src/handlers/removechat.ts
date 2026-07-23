import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { listChatSources, removeChatSource } from "../storage.js";

const composer = new Composer<Ctx>();

// /removechat command — remove a chat from index
composer.command("removechat", async (ctx) => {
  await showChatList(ctx);
});

// admin:removechat callback — from main menu button
composer.callbackQuery("admin:removechat", async (ctx) => {
  await ctx.answerCallbackQuery();
  await showChatList(ctx);
});

// Handle remove confirmation
composer.callbackQuery(/^removechat:confirm:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const chatId = ctx.match?.[1] ?? "";
  
  const removed = await removeChatSource(chatId);
  
  if (removed) {
    await ctx.editMessageText(
      "✅ Chat removed from the index. Files from this chat will no longer appear in search results.",
      {
        reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
      }
    );
  } else {
    await ctx.editMessageText(
      "Couldn't find that chat. It may have already been removed.",
      {
        reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
      }
    );
  }
});

// Handle cancel
composer.callbackQuery("removechat:cancel", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText("Cancelled.", {
    reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
  });
});

async function showChatList(ctx: Ctx) {
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
  
  const lines = chats.map((chat, i) => 
    `${i + 1}. ${chat.name} (${chat.chat_id})`
  );
  
  const buttons = chats.map(chat => [
    inlineButton(`🗑 ${chat.name}`, `removechat:confirm:${chat.chat_id}`),
  ]);
  
  await ctx.reply(
    "Select a chat to remove from the index:\n\n" + lines.join("\n"),
    {
      reply_markup: inlineKeyboard([
        ...buttons,
        [inlineButton("Cancel", "removechat:cancel")],
      ]),
    }
  );
}

export default composer;
