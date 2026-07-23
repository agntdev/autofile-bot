import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";

const composer = new Composer<Ctx>();

// admin:addchat callback — from main menu button
composer.callbackQuery("admin:addchat", async (ctx) => {
  await ctx.answerCallbackQuery();
  
  if (!ctx.from) return;
  
  ctx.session.step = "awaiting_addchat";
  await ctx.editMessageText(
    "Send the chat ID or invite link to add a new chat to the index.\n\n" +
    "You can send:\n" +
    "• A numeric chat ID (e.g., -1001234567890)\n" +
    "• An invite link (e.g., https://t.me/chatname)",
    {
      reply_markup: inlineKeyboard([[inlineButton("Cancel", "menu:main")]]),
    }
  );
});

export default composer;
