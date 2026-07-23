import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { mainMenuKeyboard, registerMainMenuItem } from "../toolkit/index.js";
import { ensureUser, isAdmin } from "../storage.js";

// Register main menu items for this bot's features
registerMainMenuItem({ label: "🔍 Search files", data: "search:start", order: 10 });

// Admin features — only visible to admins in the menu
registerMainMenuItem({ label: "➕ Add chat", data: "admin:addchat", order: 20 });
registerMainMenuItem({ label: "📋 List chats", data: "admin:listchats", order: 30 });
registerMainMenuItem({ label: "🔄 Reindex", data: "admin:reindex", order: 40 });
registerMainMenuItem({ label: "🗑 Remove chat", data: "admin:removechat", order: 50 });

// The /start handler renders the bot's MAIN MENU — the primary way users operate
// a button-first bot. A feature adds its own button by calling
// `registerMainMenuItem(...)` in its own `src/handlers/<slug>.ts`; this handler
// renders whatever is registered (plus a Help button), so you do NOT edit this
// file to add a feature. Send ONE message — no placeholder line above the menu.
const composer = new Composer<Ctx>();

const WELCOME = "👋 Welcome! Tap a button below to get started.";

composer.command("start", async (ctx) => {
  // Ensure user exists in storage
  if (ctx.from) {
    await ensureUser(ctx.from.id, ctx.from.username);
  }
  await ctx.reply(WELCOME, { reply_markup: mainMenuKeyboard() });
});

// "Back to menu" — re-render the main menu in place from any sub-view.
composer.callbackQuery("menu:main", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(WELCOME, { reply_markup: mainMenuKeyboard() });
});

export default composer;
