/* 数据层：同一套接口，两种存法
   - 本地模式：存在当前浏览器的 localStorage 里（没配置 Supabase 时）
   - 云端模式：通过 Supabase 的数据库函数读写，每次都带上共同暗号

   所有数据都是「一条条记录」：{ id, kind, data, created_at, updated_at }
   kind 区分用途（milestone / dish / order ...），data 里放具体字段。
   以后加新功能不需要改数据库，换个 kind 就行。 */
import { SUPABASE_URL, SUPABASE_KEY } from "../config.js";
import { saved } from "./dom.js";

const CODE_KEY  = "hq:code";
const LOCAL_KEY = "hq:items";

export const isCloud = Boolean(SUPABASE_URL && SUPABASE_KEY);

export class AuthError extends Error {}
export class NetError extends Error {}

const nowIso = () => new Date().toISOString();
const newId = () =>
  crypto.randomUUID?.() ??
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
const byCreated = (a, b) => a.created_at.localeCompare(b.created_at);

/* ---------- 本地模式 ---------- */

const local = {
  all() { return saved.get(LOCAL_KEY, []); },
  write(items) { saved.set(LOCAL_KEY, items); },

  async verify() { return { ok: true }; },
  async list(kind) { return this.all().filter((i) => i.kind === kind).sort(byCreated); },
  async save(kind, data, id) {
    const items = this.all();
    const t = nowIso();
    let item = id && items.find((i) => i.id === id);
    if (item) { item.data = data; item.updated_at = t; }
    else { item = { id: id || newId(), kind, data, created_at: t, updated_at: t }; items.push(item); }
    this.write(items);
    return item;
  },
  async remove(id) { this.write(this.all().filter((i) => i.id !== id)); return true; },
};

/* ---------- 云端模式 ---------- */

async function rpc(fn, args) {
  const headers = { "Content-Type": "application/json", apikey: SUPABASE_KEY };
  // 旧版 anon key 是 JWT，还要放在 Authorization 里；新版 publishable key 只放 apikey
  if (SUPABASE_KEY.startsWith("eyJ")) headers.Authorization = `Bearer ${SUPABASE_KEY}`;

  let res;
  try {
    res = await fetch(`${SUPABASE_URL.replace(/\/+$/, "")}/rest/v1/rpc/${fn}`, {
      method: "POST", headers, body: JSON.stringify(args),
    });
  } catch {
    throw new NetError("network");
  }
  let out = null;
  try { out = await res.json(); } catch { /* ignore */ }
  if (!res.ok) throw new NetError(out?.message || `http_${res.status}`);
  if (out?.ok !== true) {
    if (out?.error === "wrong_code" || out?.error === "locked") throw new AuthError(out.error);
    throw new NetError(out?.error || "unknown");
  }
  return out;
}

const cloud = {
  code() { return saved.get(CODE_KEY, ""); },
  async call(fn, args) {
    try {
      return await rpc(fn, { p_code: String(this.code()), ...args });
    } catch (e) {
      if (e instanceof AuthError) {
        saved.remove(CODE_KEY);
        window.dispatchEvent(new CustomEvent("hq:locked", { detail: e.message }));
      }
      throw e;
    }
  },

  async verify(code) {
    try {
      await rpc("hq_verify", { p_code: String(code) });
      return { ok: true };
    } catch (e) {
      if (e instanceof AuthError) return { ok: false, error: e.message };
      return { ok: false, error: "network" };
    }
  },
  async list(kind) { return (await this.call("hq_list", { p_kind: kind })).items || []; },
  async save(kind, data, id) { return (await this.call("hq_save", { p_kind: kind, p_id: id || null, p_data: data })).item; },
  async remove(id) { await this.call("hq_remove", { p_id: id }); return true; },
};

/* ---------- 对外接口 ---------- */

const backend = isCloud ? cloud : local;

export const store = {
  isCloud,
  hasCode: () => !isCloud || Boolean(saved.get(CODE_KEY, "")),
  setCode: (code) => saved.set(CODE_KEY, String(code)),
  forget: () => saved.remove(CODE_KEY),

  verify: (code) => backend.verify(code),
  list:   (kind) => backend.list(kind),
  save:   (kind, data, id) => backend.save(kind, data, id),
  remove: (id) => backend.remove(id),
};
