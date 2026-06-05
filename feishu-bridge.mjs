// Feishu Message Bridge - v2 with timestamp-based dedup
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ID = "cli_aaabed70433adcd8";
const APP_SECRET = "e6SFOmT4o5wGhRSM7zyHkfv44sd6vKaN";
const CHAT_ID = "oc_8cfb84ca65f51b5c28ec45cf0372dba7";
const USER_OID = "ou_e8d5e31a3b413466ec8e20027201abef";
const DATA_DIR = resolve(__dirname, "feishu-data");
const STATE_FILE = resolve(DATA_DIR, "state.json");
const PENDING_FILE = resolve(DATA_DIR, "pending.txt");

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

async function getToken() {
  const res = await fetch("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_id: APP_ID, app_secret: APP_SECRET }),
  });
  return (await res.json()).tenant_access_token;
}

async function main() {
  const cmd = process.argv[2];
  const token = await getToken();

  if (cmd === "check") {
    // Use timestamp + seen-set (message_id strings are NOT sorted by time!)
    let lastTime = "0";
    let seenIds = [];
    try {
      const state = JSON.parse(readFileSync(STATE_FILE, "utf-8"));
      lastTime = state.last_create_time || "0";
      seenIds = state.seen_ids || [];
    } catch {}

    const res = await fetch(
      `https://open.feishu.cn/open-apis/im/v1/messages?container_id_type=chat&container_id=${CHAT_ID}&sort_type=ByCreateTimeDesc&page_size=10`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const data = await res.json();
    if (data.code !== 0) { console.log(JSON.stringify({ error: data.msg })); return; }

    const newMsgs = [];
    for (const m of data.data?.items || []) {
      if (m.create_time <= lastTime) break;       // timestamp comparison (reliable)
      if (m.sender?.sender_type !== "user") continue;
      if (seenIds.includes(m.message_id)) continue; // extra safety

      let text = "";
      try {
        const body = JSON.parse(m.body?.content || "{}");
        text = body.text || "";
        if (!text && body.content) {
          text = body.content.map(c => c.map(t => t.text || "").join("")).join("\n");
        }
      } catch { text = m.body?.content || ""; }
      newMsgs.unshift({ message_id: m.message_id, text, create_time: m.create_time });
    }

    if (newMsgs.length > 0) {
      writeFileSync(PENDING_FILE, newMsgs.map(m => `[MID:${m.message_id}] ${m.text}`).join("\n---\n"), "utf-8");
      const maxTime = Math.max(...newMsgs.map(m => Number(m.create_time))).toString();
      const newSeen = [...new Set([...seenIds, ...newMsgs.map(m => m.message_id)])].slice(-100);
      writeFileSync(STATE_FILE, JSON.stringify({ last_create_time: maxTime, seen_ids: newSeen }), "utf-8");
      console.log(`NEW:${newMsgs.length}`);
      for (const m of newMsgs) console.log(`[${m.message_id}] ${m.text}`);
    } else {
      console.log("NONE");
    }
  } else if (cmd === "send") {
    const text = process.argv[3];
    if (!text) { console.log("ERR:notext"); return; }
    const res = await fetch(
      "https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=open_id",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ receive_id: USER_OID, msg_type: "text", content: JSON.stringify({ text }) }),
      }
    );
    const result = await res.json();
    if (result.code !== 0) console.log(`ERR:${result.msg}`);
    else console.log(`OK:${result.data?.message_id}`);
  } else if (cmd === "send-image") {
    const filePath = process.argv[3];
    if (!filePath) { console.log("ERR:no path"); return; }
    const { existsSync: ex, readFileSync: rf } = await import("fs");
    const { basename } = await import("path");
    if (!ex(filePath)) { console.log("ERR:file not found"); return; }
    const buf = rf(filePath);
    const form = new FormData();
    form.append("image_type", "message");
    form.append("image", new Blob([buf]), basename(filePath));
    const upRes = await fetch("https://open.feishu.cn/open-apis/im/v1/images", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const upData = await upRes.json();
    if (upData.code !== 0) { console.log(`ERR_UP:${upData.msg}`); return; }
    const imageKey = upData.data.image_key;
    const res = await fetch(
      "https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=open_id",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ receive_id: USER_OID, msg_type: "image", content: JSON.stringify({ image_key: imageKey }) }),
      }
    );
    const result = await res.json();
    if (result.code !== 0) console.log(`ERR:${result.msg}`);
    else console.log(`OK:${result.data?.message_id}`);
  } else if (cmd === "send-file") {
    const filePath = process.argv[3];
    if (!filePath) { console.log("ERR:no path"); return; }
    const { existsSync: ex, readFileSync: rf } = await import("fs");
    const { basename } = await import("path");
    if (!ex(filePath)) { console.log("ERR:file not found"); return; }
    const buf = rf(filePath);
    const ext = basename(filePath).split(".").pop().toLowerCase();
    const fileTypeMap = { pdf: "pdf", doc: "doc", docx: "doc", xls: "xls", xlsx: "xls", ppt: "ppt", pptx: "ppt", mp3: "opus", mp4: "mp4", wav: "opus", ogg: "opus" };
    const fileType = fileTypeMap[ext] || "stream";
    const form = new FormData();
    form.append("file_type", fileType);
    form.append("file", new Blob([buf]), basename(filePath));
    const upRes = await fetch("https://open.feishu.cn/open-apis/im/v1/files", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const upData = await upRes.json();
    if (upData.code !== 0) { console.log(`ERR_UP:${upData.msg}`); return; }
    const fileKey = upData.data.file_key;
    const res = await fetch(
      "https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=open_id",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ receive_id: USER_OID, msg_type: "file", content: JSON.stringify({ file_key: fileKey }) }),
      }
    );
    const result = await res.json();
    if (result.code !== 0) console.log(`ERR:${result.msg}`);
    else console.log(`OK:${result.data?.message_id}`);
  } else {
    console.log("Usage: node feishu-bridge.mjs check|send [text]|send-image <path>|send-file <path>");
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
