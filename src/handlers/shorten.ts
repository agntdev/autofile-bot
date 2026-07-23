import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard, copyTextButton } from "../toolkit/index.js";
import {
  addShortLink,
  getShortLink,
  revokeShortLink,
  getShortLinksByUser,
  incrementClickCount,
  getShortLinksByFileId,
  addShortLinkToFileIndex,
  getFileRecord,
  isAdmin,
  type ShortLink,
} from "../storage.js";

const composer = new Composer<Ctx>();

const BITLY_API_KEY = process.env.BITLY_API_KEY;
const BOT_HOST = process.env.BOT_HOST || "t.me";
const DEFAULT_TTL_DAYS = 7;

// Admin settings for link shortening
const adminSettings: {
  enabled: boolean;
  defaultTtlDays: number;
  singleUseTokens: boolean;
} = {
  enabled: true,
  defaultTtlDays: 7,
  singleUseTokens: false,
};

function generateToken(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

async function createBitlyShortUrl(longUrl: string): Promise<string | null> {
  if (!BITLY_API_KEY) return null;
  
  try {
    const response = await fetch("https://api-ssl.bitly.com/v4/shorten", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${BITLY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ long_url: longUrl, domain: "bit.ly" }),
    });
    
    if (!response.ok) return null;
    
    const data = await response.json() as { link?: string };
    return data.link ?? null;
  } catch {
    return null;
  }
}

function formatExpiry(expiresAt: number): string {
  const now = Date.now();
  const diff = expiresAt - now;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h`;
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return `${minutes}m`;
}

composer.callbackQuery(/^shorten:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const fileId = ctx.match?.[1] ?? "";
  
  if (!ctx.from) return;
  
  const file = await getFileRecord(fileId);
  if (!file) {
    await ctx.reply("File not found. It may have been removed.");
    return;
  }
  
  const existingLinks = await getShortLinksByFileId(fileId);
  const existingLink = existingLinks.find(
    (l) => l.creator_user_id === ctx.from!.id && l.is_active
  );
  
  if (existingLink) {
    const shortUrl = existingLink.original_url.includes("bit.ly")
      ? `https://bit.ly/${existingLink.token}`
      : `https://${BOT_HOST}/s/${existingLink.token}`;
    
    await ctx.reply(
      `📎 You already have a short link for this file:\n\n${shortUrl}`,
      {
        reply_markup: inlineKeyboard([
          [copyTextButton("📋 Copy link", shortUrl)],
          [inlineButton("🗑 Revoke", `shorten:revoke:${existingLink.token}`)],
          [inlineButton("⬅️ Back to menu", "menu:main")],
        ]),
      }
    );
    return;
  }
  
  const token = generateToken();
  const createdAt = Date.now();
  const expiresAt = createdAt + adminSettings.defaultTtlDays * 24 * 60 * 60 * 1000;
  
  const longUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN ?? ""}/${file.file_id}`;
  
  let shortUrl = await createBitlyShortUrl(longUrl);
  if (!shortUrl) {
    shortUrl = `https://${BOT_HOST}/s/${token}`;
  }
  
  const link: ShortLink = {
    token,
    original_url: longUrl,
    file_id: fileId,
    creator_user_id: ctx.from.id,
    created_at: createdAt,
    expires_at: expiresAt,
    click_count: 0,
    is_single_use: adminSettings.singleUseTokens,
    is_active: true,
  };
  
  await addShortLink(link);
  await addShortLinkToFileIndex(token, fileId);
  
  await ctx.reply(
    `📎 Short link created:\n\n${shortUrl}\n\nExpires in ${adminSettings.defaultTtlDays} days.`,
    {
      reply_markup: inlineKeyboard([
        [copyTextButton("📋 Copy link", shortUrl)],
        [inlineButton("🗑 Revoke", `shorten:revoke:${token}`)],
        [inlineButton("⬅️ Back to menu", "menu:main")],
      ]),
    }
  );
});

composer.callbackQuery(/^shorten:revoke:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const token = ctx.match?.[1] ?? "";
  
  const revoked = await revokeShortLink(token);
  
  if (revoked) {
    await ctx.reply(
      "🗑 Short link revoked. It will no longer work.",
      {
        reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
      }
    );
  } else {
    await ctx.reply(
      "Couldn't find that short link. It may have already been revoked.",
      {
        reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
      }
    );
  }
});

composer.command("shortstats", async (ctx) => {
  if (!ctx.from) return;
  
  const admin = await isAdmin(ctx.from.id);
  if (!admin) {
    await ctx.reply("Only admins can view short link statistics.");
    return;
  }
  
  const links = await getShortLinksByUser(ctx.from.id);
  
  if (links.length === 0) {
    await ctx.reply(
      "No short links created yet.",
      {
        reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
      }
    );
    return;
  }
  
  const activeLinks = links.filter((l) => l.is_active);
  const totalClicks = links.reduce((sum, l) => sum + l.click_count, 0);
  
  const lines = activeLinks.slice(0, 5).map((link, i) => {
    const shortUrl = `https://${BOT_HOST}/s/${link.token}`;
    return `${i + 1}. ${shortUrl}\n   Clicks: ${link.click_count} | Expires: ${formatExpiry(link.expires_at)}`;
  });
  
  await ctx.reply(
    `📊 Short Link Statistics\n\n` +
    `Active links: ${activeLinks.length}\n` +
    `Total clicks: ${totalClicks}\n\n` +
    (lines.length > 0 ? lines.join("\n\n") : "No active links."),
    {
      reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
    }
  );
});

// Admin settings callback
composer.callbackQuery("admin:shortsettings", async (ctx) => {
  await ctx.answerCallbackQuery();
  
  if (!ctx.from) return;
  
  const admin = await isAdmin(ctx.from.id);
  if (!admin) {
    await ctx.reply("Only admins can access settings.");
    return;
  }
  
  const status = adminSettings.enabled ? "✅ Enabled" : "❌ Disabled";
  const singleUse = adminSettings.singleUseTokens ? "✅ Yes" : "❌ No";
  
  await ctx.reply(
    `⚙️ Link Shortening Settings\n\n` +
    `Status: ${status}\n` +
    `Default TTL: ${adminSettings.defaultTtlDays} days\n` +
    `Single-use tokens: ${singleUse}`,
    {
      reply_markup: inlineKeyboard([
        [inlineButton(
          adminSettings.enabled ? "❌ Disable" : "✅ Enable",
          "admin:shortsettings:toggle"
        )],
        [inlineButton("📅 Change TTL", "admin:shortsettings:ttl")],
        [inlineButton("🔑 Toggle single-use", "admin:shortsettings:singleuse")],
        [inlineButton("⬅️ Back to menu", "menu:main")],
      ]),
    }
  );
});

composer.callbackQuery("admin:shortsettings:toggle", async (ctx) => {
  await ctx.answerCallbackQuery();
  
  if (!ctx.from) return;
  
  const admin = await isAdmin(ctx.from.id);
  if (!admin) {
    await ctx.reply("Only admins can access settings.");
    return;
  }
  
  adminSettings.enabled = !adminSettings.enabled;
  const status = adminSettings.enabled ? "✅ Enabled" : "❌ Disabled";
  
  await ctx.reply(
    `Link shortening ${status}.`,
    {
      reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
    }
  );
});

composer.callbackQuery("admin:shortsettings:ttl", async (ctx) => {
  await ctx.answerCallbackQuery();
  
  if (!ctx.from) return;
  
  const admin = await isAdmin(ctx.from.id);
  if (!admin) {
    await ctx.reply("Only admins can access settings.");
    return;
  }
  
  await ctx.reply(
    `Current default TTL: ${adminSettings.defaultTtlDays} days\n\n` +
    "Send a number (1-30) to set the new default TTL.",
    {
      reply_markup: inlineKeyboard([[inlineButton("Cancel", "admin:shortsettings")]]),
    }
  );
  
  ctx.session.step = "awaiting_ttl_input";
});

composer.on("message:text", async (ctx, next) => {
  if (ctx.session.step !== "awaiting_ttl_input") {
    return next();
  }
  
  if (!ctx.from) return;
  
  const admin = await isAdmin(ctx.from.id);
  if (!admin) {
    ctx.session.step = "idle";
    await ctx.reply("Only admins can access settings.");
    return;
  }
  
  const input = ctx.message.text.trim();
  const ttl = parseInt(input, 10);
  
  if (isNaN(ttl) || ttl < 1 || ttl > 30) {
    await ctx.reply(
      "Please enter a number between 1 and 30.",
      {
        reply_markup: inlineKeyboard([[inlineButton("Cancel", "admin:shortsettings")]]),
      }
    );
    return;
  }
  
  adminSettings.defaultTtlDays = ttl;
  ctx.session.step = "idle";
  
  await ctx.reply(
    `✅ Default TTL updated to ${ttl} days.`,
    {
      reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
    }
  );
});

composer.callbackQuery("admin:shortsettings:singleuse", async (ctx) => {
  await ctx.answerCallbackQuery();
  
  if (!ctx.from) return;
  
  const admin = await isAdmin(ctx.from.id);
  if (!admin) {
    await ctx.reply("Only admins can access settings.");
    return;
  }
  
  adminSettings.singleUseTokens = !adminSettings.singleUseTokens;
  const singleUse = adminSettings.singleUseTokens ? "✅ Yes" : "❌ No";
  
  await ctx.reply(
    `Single-use tokens: ${singleUse}.`,
    {
      reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
    }
  );
});

export default composer;
