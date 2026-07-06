import fs from "node:fs";
import path from "node:path";

const REPO = process.env.WATCH_REPO || "TechX-Corp/xbrain-learners";
const WATCH_PATH = process.env.WATCH_PATH || "phase3/mandates";
const BRANCH = process.env.WATCH_BRANCH || "main";

const STATE_DIR = "state";
const SHA_FILE = path.join(STATE_DIR, "last_sha.txt");
const ZALO_REFRESH_FILE = path.join(STATE_DIR, "zalo_refresh_token.txt");

function readState(file) {
  try {
    return fs.readFileSync(file, "utf8").trim();
  } catch {
    return "";
  }
}

function writeState(file, value) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(file, `${value}\n`);
}

async function ghFetch(url) {
  const headers = { Accept: "application/vnd.github+json" };
  if (process.env.GH_READ_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GH_READ_TOKEN}`;
  }
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

function formatMessage(commit) {
  const author = commit.commit?.author?.name || "unknown";
  const firstLine = (commit.commit?.message || "").split("\n")[0];
  return [
    `🔔 New push to ${REPO} (${WATCH_PATH})`,
    `Author: ${author}`,
    `Message: ${firstLine}`,
    commit.html_url,
  ].join("\n");
}

async function sendWhatsApp(text) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  const to = process.env.WHATSAPP_TO;
  if (!token || !phoneId || !to) {
    console.log("[whatsapp] not configured, skipping");
    return;
  }
  for (const number of to.split(",").map((s) => s.trim()).filter(Boolean)) {
    const res = await fetch(
      `https://graph.facebook.com/v20.0/${phoneId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: number,
          type: "text",
          text: { body: text },
        }),
      },
    );
    if (!res.ok) {
      console.error(`[whatsapp] send to ${number} failed:`, await res.text());
    } else {
      console.log(`[whatsapp] sent to ${number}`);
    }
  }
}

async function sendTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const to = process.env.TELEGRAM_CHAT_ID;
  if (!token || !to) {
    console.log("[telegram] not configured, skipping");
    return;
  }
  for (const chatId of to.split(",").map((s) => s.trim()).filter(Boolean)) {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      }),
    });
    const data = await res.json();
    if (!data.ok) {
      console.error(`[telegram] send to ${chatId} failed:`, JSON.stringify(data));
    } else {
      console.log(`[telegram] sent to ${chatId}`);
    }
  }
}

// Zalo OA access tokens expire ~25h; refresh tokens rotate on every use.
// See scripts/zalo-oauth-helper.mjs for the one-time initial authorization.
async function refreshZaloAccessToken() {
  const appId = process.env.ZALO_APP_ID;
  const appSecret = process.env.ZALO_APP_SECRET;
  const refreshToken = readState(ZALO_REFRESH_FILE) || process.env.ZALO_REFRESH_TOKEN;

  if (!appId || !appSecret || !refreshToken) {
    console.log("[zalo] not configured, skipping");
    return null;
  }

  const res = await fetch("https://oauth.zaloapp.com/v4/oa/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      secret_key: appSecret,
    },
    body: new URLSearchParams({
      app_id: appId,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  const data = await res.json();
  if (!data.access_token) {
    console.error("[zalo] token refresh failed:", JSON.stringify(data));
    return null;
  }

  writeState(ZALO_REFRESH_FILE, data.refresh_token);
  return data.access_token;
}

async function sendZalo(text) {
  const to = process.env.ZALO_TO;
  if (!to) {
    console.log("[zalo] no recipients configured, skipping");
    return;
  }
  const accessToken = await refreshZaloAccessToken();
  if (!accessToken) return;

  for (const userId of to.split(",").map((s) => s.trim()).filter(Boolean)) {
    const res = await fetch("https://openapi.zalo.me/v3.0/oa/message/cs", {
      method: "POST",
      headers: {
        access_token: accessToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        recipient: { user_id: userId },
        message: { text },
      }),
    });
    const data = await res.json();
    if (data.error) {
      console.error(`[zalo] send to ${userId} failed:`, JSON.stringify(data));
    } else {
      console.log(`[zalo] sent to ${userId}`);
    }
  }
}

async function main() {
  const commits = await ghFetch(
    `https://api.github.com/repos/${REPO}/commits?path=${encodeURIComponent(WATCH_PATH)}&sha=${BRANCH}&per_page=10`,
  );

  if (!commits.length) {
    console.log("No commits found for watched path");
    return;
  }

  const latestSha = commits[0].sha;
  const lastSha = readState(SHA_FILE);

  if (lastSha === latestSha) {
    console.log("No new commits");
    return;
  }

  if (!lastSha) {
    // First run: record a baseline instead of notifying about entire history.
    writeState(SHA_FILE, latestSha);
    console.log("Initialized baseline with", latestSha);
    return;
  }

  const idx = commits.findIndex((c) => c.sha === lastSha);
  const newCommits = idx === -1 ? [commits[0]] : commits.slice(0, idx).reverse();

  for (const commit of newCommits) {
    const message = formatMessage(commit);
    console.log(message);
    await Promise.allSettled([
      sendTelegram(message),
      sendWhatsApp(message),
      sendZalo(message),
    ]);
  }

  writeState(SHA_FILE, latestSha);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
