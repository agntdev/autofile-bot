import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { isAdmin, addChatSource, type ChatSource } from "../storage.js";

const composer = new Composer<Ctx>();

// /addchat command — admin only, add a new chat to index
composer.command("addchat", async (ctx) => {
  if (!ctx.from) return;
  
  ctx.session.step = "awaiting_addchat";
  await ctx.reply(
    "Send the chat ID or invite link to add a new chat to the index.\n\n" +
    "You can send:\n" +
    "• A numeric chat ID (e.g., -1001234567890)\n" +
    "• An invite link (e.g., https://t.me/chatname)",
    {
      reply_markup: inlineKeyboard([[inlineButton("Cancel", "menu:main")]]),
    }
  );
});

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

// Handle chat ID or invite link input
composer.on("message:text", async (ctx, next) => {
  if (ctx.session.step !== "awaiting_addchat") {
    return next();
  }
  
  if (!ctx.from) return;
  
  const admin = await isAdmin(ctx.from.id);
  if (!admin) {
    ctx.session.step = "idle";
    await ctx.reply("Only admins can add chats. Ask an admin to add you as admin.");
    return;
  }
  
  const input = ctx.message.text.trim();
  ctx.session.step = "idle";
  
  // Parse chat ID or invite link
  let chatId: string;
  let chatName: string;
  let isPublic: boolean;
  
  // Check if it's an invite link
  const linkMatch = input.match(/(?:https?:\/\/)?t\.me\/([a-zA-Z0-9_]+)/);
  if (linkMatch) {
    chatId = linkMatch[1];
    chatName = `@${chatId}`;
    isPublic = true;
  } else if (/^-?\d+$/.test(input)) {
    // It's a numeric chat ID
    chatId = input;
    chatName = `Chat ${chatId}`;
    isPublic = false;
  } else {
    await ctx.reply(
      "That doesn't look like a valid chat ID or invite link. Please try again.",
      {
        reply_markup: inlineKeyboard([[inlineButton("Cancel", "menu:main")]]),
      }
    );
    return;
  }
  
  // Create the chat source record
  const chat: ChatSource = {
    chat_id: chatId,
    name: chatName,
    is_public: isPublic,
    added_by: ctx.from.id,
    date_added: Date.now(),
    indexed: true,
  };
  
  // Save to storage
  await addChatSource(chat);
  
  await ctx.reply(
    `✅ Chat added successfully!\n\n` +
    `Name: ${chatName}\n` +
    `ID: ${chatId}\n` +
    `Type: ${isPublic ? "Public" : "Private"}\n\n` +
    `The bot will start indexing files from this chat.`,
    {
      reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
    }
  );
});

export default composer;
