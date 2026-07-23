import { RedisSessionStorage, type RedisLike } from "./toolkit/session/redis.js";
import { MemorySessionStorage } from "./toolkit/session/memory.js";
import type { StorageAdapter } from "grammy";

// Persistent storage for durable domain data — survives restarts.
// Uses Redis in production (REDIS_URL set) or in-memory fallback.
// NOT for session state — that's handled by the bot's session middleware.

export interface ChatSource {
  chat_id: string;
  name: string;
  is_public: boolean;
  added_by: number;
  date_added: number;
  indexed: boolean;
}

export interface FileRecord {
  file_id: string;
  filename: string;
  mime_type: string;
  size: number;
  file_type_tag: string;
  chat_id: string;
  chat_name: string;
  message_id: number;
  caption: string;
  upload_date: number;
  uploader: string;
  extracted_text: string;
  tags: string[];
}

export interface User {
  user_id: number;
  username: string;
  role: "user" | "admin";
  language: string;
  result_limit: number;
}

export interface ShortLink {
  token: string;
  original_url: string;
  file_id: string;
  creator_user_id: number;
  created_at: number;
  expires_at: number;
  click_count: number;
  is_single_use: boolean;
  is_active: boolean;
}

// Storage instances — lazy-initialized on first use
let chatStorage: StorageAdapter<Record<string, ChatSource>> | null = null;
let fileStorage: StorageAdapter<Record<string, FileRecord>> | null = null;
let userStorage: StorageAdapter<Record<string, User>> | null = null;
let indexStorage: StorageAdapter<string[]> | null = null;
let shortLinkStorage: StorageAdapter<Record<string, ShortLink>> | null = null;
let shortLinkIndexStorage: StorageAdapter<string[]> | null = null;

function getStorage<T>(prefix: string): StorageAdapter<T> {
  const env = typeof process === "undefined" ? {} : process.env;
  if (env.REDIS_URL) {
    return new RedisSessionStorage<T>(null as unknown as RedisLike, prefix);
  }
  return new MemorySessionStorage<T>();
}

function getChatStorage(): StorageAdapter<Record<string, ChatSource>> {
  if (!chatStorage) chatStorage = getStorage("chat:");
  return chatStorage;
}

function getFileStorage(): StorageAdapter<Record<string, FileRecord>> {
  if (!fileStorage) fileStorage = getStorage("file:");
  return fileStorage;
}

function getUserStorage(): StorageAdapter<Record<string, User>> {
  if (!userStorage) userStorage = getStorage("user:");
  return userStorage;
}

function getIndexStorage(): StorageAdapter<string[]> {
  if (!indexStorage) indexStorage = getStorage("idx:");
  return indexStorage;
}

function getShortLinkStorage(): StorageAdapter<Record<string, ShortLink>> {
  if (!shortLinkStorage) shortLinkStorage = getStorage("shortlink:");
  return shortLinkStorage;
}

function getShortLinkIndexStorage(): StorageAdapter<string[]> {
  if (!shortLinkIndexStorage) shortLinkIndexStorage = getStorage("shortlinkidx:");
  return shortLinkIndexStorage;
}

// Chat operations
export async function addChatSource(chat: ChatSource): Promise<void> {
  const storage = getChatStorage();
  const key = chat.chat_id;
  await storage.write(key, { [key]: chat });
  
  // Update index
  const indexStorage = getIndexStorage();
  const existing = await indexStorage.read("chat_ids") ?? [];
  if (!existing.includes(key)) {
    existing.push(key);
    await indexStorage.write("chat_ids", existing);
  }
}

export async function getChatSource(chatId: string): Promise<ChatSource | undefined> {
  const storage = getChatStorage();
  const data = await storage.read(chatId);
  return data?.[chatId];
}

export async function removeChatSource(chatId: string): Promise<boolean> {
  const storage = getChatStorage();
  const data = await storage.read(chatId);
  if (!data?.[chatId]) return false;
  
  await storage.delete(chatId);
  
  // Update index
  const indexStorage = getIndexStorage();
  const existing = await indexStorage.read("chat_ids") ?? [];
  const filtered = existing.filter(id => id !== chatId);
  await indexStorage.write("chat_ids", filtered);
  
  return true;
}

export async function listChatSources(): Promise<ChatSource[]> {
  const indexStorage = getIndexStorage();
  const chatIds = await indexStorage.read("chat_ids") ?? [];
  
  const storage = getChatStorage();
  const chats: ChatSource[] = [];
  
  for (const chatId of chatIds) {
    const data = await storage.read(chatId);
    if (data?.[chatId]) {
      chats.push(data[chatId]);
    }
  }
  
  return chats;
}

// File operations
export async function addFileRecord(file: FileRecord): Promise<void> {
  const storage = getFileStorage();
  const key = file.file_id;
  await storage.write(key, { [key]: file });
  
  // Update chat file index
  const indexStorage = getIndexStorage();
  const chatIndexKey = `files:${file.chat_id}`;
  const existing = await indexStorage.read(chatIndexKey) ?? [];
  if (!existing.includes(key)) {
    existing.push(key);
    await indexStorage.write(chatIndexKey, existing);
  }
}

export async function getFileRecord(fileId: string): Promise<FileRecord | undefined> {
  const storage = getFileStorage();
  const data = await storage.read(fileId);
  return data?.[fileId];
}

export async function searchFiles(
  query: string,
  filters?: {
    file_type?: string;
    chat_source?: string;
    date_from?: number;
    date_to?: number;
    size_min?: number;
    size_max?: number;
  }
): Promise<FileRecord[]> {
  const indexStorage = getIndexStorage();
  const chatIds = filters?.chat_source 
    ? [filters.chat_source]
    : await indexStorage.read("chat_ids") ?? [];
  
  const storage = getFileStorage();
  const results: FileRecord[] = [];
  
  for (const chatId of chatIds) {
    const fileIds = await indexStorage.read(`files:${chatId}`) ?? [];
    
    for (const fileId of fileIds) {
      const data = await storage.read(fileId);
      const file = data?.[fileId];
      if (!file) continue;
      
      // Text match
      const queryLower = query.toLowerCase();
      const matchesQuery = !query || 
        file.filename.toLowerCase().includes(queryLower) ||
        file.caption.toLowerCase().includes(queryLower) ||
        file.extracted_text.toLowerCase().includes(queryLower) ||
        file.tags.some(tag => tag.toLowerCase().includes(queryLower));
      
      if (!matchesQuery) continue;
      
      // Apply filters
      if (filters?.file_type && file.file_type_tag !== filters.file_type) continue;
      if (filters?.date_from && file.upload_date < filters.date_from) continue;
      if (filters?.date_to && file.upload_date > filters.date_to) continue;
      if (filters?.size_min && file.size < filters.size_min) continue;
      if (filters?.size_max && file.size > filters.size_max) continue;
      
      results.push(file);
    }
  }
  
  return results;
}

// User operations
export async function getUser(userId: number): Promise<User | undefined> {
  const storage = getUserStorage();
  const data = await storage.read(String(userId));
  return data?.[String(userId)];
}

export async function setUser(user: User): Promise<void> {
  const storage = getUserStorage();
  const key = String(user.user_id);
  await storage.write(key, { [key]: user });
}

export async function ensureUser(userId: number, username?: string): Promise<User> {
  let user = await getUser(userId);
  if (!user) {
    user = {
      user_id: userId,
      username: username ?? "",
      role: "user",
      language: "en",
      result_limit: 10,
    };
    await setUser(user);
  }
  return user;
}

export async function isAdmin(userId: number): Promise<boolean> {
  const user = await getUser(userId);
  return user?.role === "admin";
}

export async function setAdmin(userId: number, admin: boolean): Promise<void> {
  const user = await getUser(userId);
  if (user) {
    user.role = admin ? "admin" : "user";
    await setUser(user);
  }
}

// ShortLink operations
export async function addShortLink(link: ShortLink): Promise<void> {
  const storage = getShortLinkStorage();
  await storage.write(link.token, { [link.token]: link });
  
  // Update user index
  const indexStorage = getShortLinkIndexStorage();
  const userIndexKey = `user:${link.creator_user_id}`;
  const existing = await indexStorage.read(userIndexKey) ?? [];
  if (!existing.includes(link.token)) {
    existing.push(link.token);
    await indexStorage.write(userIndexKey, existing);
  }
}

export async function getShortLink(token: string): Promise<ShortLink | undefined> {
  const storage = getShortLinkStorage();
  const data = await storage.read(token);
  return data?.[token];
}

export async function updateShortLink(link: ShortLink): Promise<void> {
  const storage = getShortLinkStorage();
  await storage.write(link.token, { [link.token]: link });
}

export async function revokeShortLink(token: string): Promise<boolean> {
  const link = await getShortLink(token);
  if (!link) return false;
  
  link.is_active = false;
  await updateShortLink(link);
  return true;
}

export async function getShortLinksByUser(userId: number): Promise<ShortLink[]> {
  const indexStorage = getShortLinkIndexStorage();
  const userIndexKey = `user:${userId}`;
  const tokens = await indexStorage.read(userIndexKey) ?? [];
  
  const storage = getShortLinkStorage();
  const links: ShortLink[] = [];
  
  for (const token of tokens) {
    const data = await storage.read(token);
    if (data?.[token]) {
      links.push(data[token]);
    }
  }
  
  return links;
}

export async function incrementClickCount(token: string): Promise<void> {
  const link = await getShortLink(token);
  if (link) {
    link.click_count += 1;
    await updateShortLink(link);
  }
}

export async function getShortLinksByFileId(fileId: string): Promise<ShortLink[]> {
  const indexStorage = getShortLinkIndexStorage();
  const fileIndexKey = `file:${fileId}`;
  const tokens = await indexStorage.read(fileIndexKey) ?? [];
  
  const storage = getShortLinkStorage();
  const links: ShortLink[] = [];
  
  for (const token of tokens) {
    const data = await storage.read(token);
    if (data?.[token]) {
      links.push(data[token]);
    }
  }
  
  return links;
}

export async function addShortLinkToFileIndex(token: string, fileId: string): Promise<void> {
  const indexStorage = getShortLinkIndexStorage();
  const fileIndexKey = `file:${fileId}`;
  const existing = await indexStorage.read(fileIndexKey) ?? [];
  if (!existing.includes(token)) {
    existing.push(token);
    await indexStorage.write(fileIndexKey, existing);
  }
}
