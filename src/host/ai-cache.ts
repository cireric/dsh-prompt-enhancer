/**
 * AI 结果缓存（Issue #3 / T2a）：内存 LRU + TTL，纯模块零依赖。
 *
 * - 参数为 MVP 常数：TTL 30 分钟、LRU 上限 50，不进设置。
 * - 键 = 哈希(system + user + route)：换模型（route 不同）不命中旧缓存。
 * - 重启即清、无持久化（模块级实例与进程同生共死）。
 * - 失败结果（工厂抛错或返回 undefined，本仓 AI 失败约定）不入缓存。
 *
 * 本模块不 import 任何宿主包；接入点由 T3 收尾完成（本票不改现有文件）。
 */

/** MVP 常数（规格定死，不进设置）。 */
export const AI_CACHE_TTL_MS = 30 * 60 * 1000;
export const AI_CACHE_MAX_ENTRIES = 50;

export interface AiCacheKeyInput {
  system: string;
  user: string;
  /** 形如 `provider/model` 的路由标识。 */
  route: string;
}

export interface AiResultCacheOptions {
  /** 容量上限，默认 `AI_CACHE_MAX_ENTRIES`。 */
  maxEntries?: number;
  /** 存活时长（ms），默认 `AI_CACHE_TTL_MS`。 */
  ttlMs?: number;
  /** 时钟注入（测试用），默认 `Date.now`。 */
  now?: () => number;
}

/** FNV-1a 32 位哈希：非加密用途（仅缓存键去重），零依赖、无碰撞聚合边界问题。 */
function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

/**
 * 规范化待哈希串：每个字段前置长度。
 *
 * 拼接歧义防御：`a|bc` 与 `ab|c` 规范化后必然不同，
 * 不依赖哈希本身的抗碰撞性。
 */
export function canonicalCacheInput(input: AiCacheKeyInput): string {
  const parts = [input.system, input.user, input.route];
  return parts.map((p) => `${p.length}:${p}`).join("|");
}

/** 键 = 哈希(system + user + route)。 */
export function hashCacheKey(input: AiCacheKeyInput): string {
  return fnv1a(canonicalCacheInput(input));
}

interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

/** 内存 LRU + TTL 缓存。TTL 过期与容量淘汰都在读取路径惰性完成。 */
export class AiResultCache {
  private readonly entries = new Map<string, CacheEntry>();
  private readonly maxEntries: number;
  private readonly ttlMs: number;
  private readonly now: () => number;

  constructor(options: AiResultCacheOptions = {}) {
    this.maxEntries = options.maxEntries ?? AI_CACHE_MAX_ENTRIES;
    this.ttlMs = options.ttlMs ?? AI_CACHE_TTL_MS;
    this.now = options.now ?? Date.now;
  }

  /** 命中返回缓存值；未命中或已过期返回 undefined（过期条目顺带清除）。 */
  get(key: string): unknown {
    const entry = this.entries.get(key);
    if (entry === undefined) return undefined;
    if (this.now() >= entry.expiresAt) {
      this.entries.delete(key);
      return undefined;
    }
    // Map 迭代序 = 插入序：删除再插入把它移到「最新」端，即 LRU 触碰。
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  /** 写入并按容量淘汰最久未用条目（TTL 到期时间以写入时刻计）。 */
  set(key: string, value: unknown): void {
    this.entries.delete(key); // 先删，保证重新插入移到最新端
    this.entries.set(key, { value, expiresAt: this.now() + this.ttlMs });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      this.entries.delete(oldest.value);
    }
  }

  delete(key: string): void {
    this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }
}

/** 进程级单例：重启即清、无持久化。 */
export const aiResultCache = new AiResultCache();
