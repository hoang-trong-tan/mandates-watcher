// One-time local helper to bootstrap a Zalo OA refresh token.
// Usage:
//   ZALO_APP_ID=... ZALO_APP_SECRET=... ZALO_AUTH_CODE=... npm run zalo:auth
//
// Where does ZALO_AUTH_CODE come from?
// 1. Open in a browser (logged in as the OA admin):
//      https://oauth.zaloapp.com/v4/oa/permission?app_id=YOUR_APP_ID&redirect_uri=YOUR_REDIRECT_URI
// 2. Approve access. Zalo redirects to redirect_uri?code=XXXX&oa_id=...
// 3. Copy the "code" value (it is only valid for a short time and single-use).

const appId = process.env.ZALO_APP_ID;
const appSecret = process.env.ZALO_APP_SECRET;
const code = process.env.ZALO_AUTH_CODE;

if (!appId || !appSecret || !code) {
  console.error(
    "Missing env vars. Required: ZALO_APP_ID, ZALO_APP_SECRET, ZALO_AUTH_CODE",
  );
  process.exit(1);
}

const res = await fetch("https://oauth.zaloapp.com/v4/oa/access_token", {
  method: "POST",
  headers: {
    "Content-Type": "application/x-www-form-urlencoded",
    secret_key: appSecret,
  },
  body: new URLSearchParams({
    app_id: appId,
    grant_type: "authorization_code",
    code,
  }),
});

const data = await res.json();

if (!data.access_token) {
  console.error("Failed:", JSON.stringify(data, null, 2));
  process.exit(1);
}

console.log("Success. Save these:\n");
console.log("access_token:", data.access_token, "(valid ~25h, script auto-refreshes)");
console.log("refresh_token:", data.refresh_token);
console.log(
  "\nNext step: put the refresh_token into state/zalo_refresh_token.txt",
  "and commit it (or set it as the ZALO_REFRESH_TOKEN secret for the very first run).",
);
