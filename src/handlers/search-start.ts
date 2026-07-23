import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";

const composer = new Composer<Ctx>();

// search:start callback — open search interface from main menu
composer.callbackQuery("search:start", async (ctx) => {
  await ctx.answerCallbackQuery();
  
  // Set session state for search
  ctx.session.step = "awaiting_search_query";
  
  await ctx.editMessageText(
    "Send a search query to find files. You can also tap the filter buttons below.",
    {
      reply_markup: inlineKeyboard([
        [inlineButton("📄 Documents", "search:filter:document")],
        [inlineButton("🖼 Images", "search:filter:image")],
        [inlineButton("🎥 Videos", "search:filter:video")],
        [inlineButton("🎵 Audio", "search:filter:audio")],
        [inlineButton("📦 All files", "search:filter:")],
        [inlineButton("⬅️ Back to menu", "menu:main")],
      ]),
    }
  );
});

export default composer;
