# Mandates Watcher

Theo dõi thư mục [`phase3/mandates`](https://github.com/TechX-Corp/xbrain-learners/tree/main/phase3/mandates)
trong repo `TechX-Corp/xbrain-learners` (repo không thuộc quyền quản trị của bạn), và gửi thông báo
qua **Telegram** (WhatsApp/Zalo cũng được hỗ trợ sẵn, để dùng sau khi cần) mỗi khi có commit mới
đụng tới thư mục đó.

Vì không có quyền admin trên repo gốc nên không dùng được webhook — thay vào đó, một
**GitHub Action chạy theo lịch (cron) trong repo này** sẽ gọi GitHub REST API công khai để kiểm tra
commit mới nhất trong đường dẫn đó, so sánh với lần kiểm tra trước, và gửi tin nhắn nếu có gì mới.

## Giới hạn cần biết

- Lịch chạy tối thiểu của GitHub Actions là mỗi 5 phút (`*/5 * * * *`). Đây gần như "ngay lập tức"
  nhưng không phải tức thời — dưới tải cao GitHub có thể trễ vài phút.
- GitHub **tự tắt** scheduled workflow nếu repo này không có hoạt động (không commit) trong 60 ngày.
  Occasionally push 1 commit nhỏ (hoặc vào tab Actions bấm "Enable workflow") để giữ nó chạy.
- Repo `xbrain-learners` phải là **repo public**, hoặc bạn cần một Personal Access Token có quyền đọc
  repo đó (biến `GH_READ_TOKEN`) nếu nó là private.

## Cấu trúc

```
.github/workflows/watch-mandates.yml   # chạy mỗi 5 phút
scripts/check-and-notify.mjs           # logic kiểm tra + gửi tin (Telegram/WhatsApp/Zalo)
scripts/zalo-oauth-helper.mjs          # helper 1 lần để lấy Zalo refresh_token ban đầu (nếu dùng Zalo)
state/last_sha.txt                     # commit SHA cuối cùng đã thấy (tự động cập nhật)
state/zalo_refresh_token.txt          # refresh_token Zalo hiện tại (chỉ tạo nếu bạn dùng Zalo)
```

## Bước 1 — Đưa code này lên một repo GitHub của bạn

```bash
git remote add origin <URL_REPO_CUA_BAN>
git push -u origin main
```

(Repo cục bộ đã `git init` + commit sẵn.)

## Bước 2 — Tạo Telegram bot (mất ~2 phút)

1. Mở Telegram, chat với **@BotFather**, gõ `/newbot`, đặt tên bất kỳ → BotFather trả về một
   **bot token** dạng `123456789:AAExxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`.
2. Lấy `chat_id` để bot biết gửi tin cho ai:
   - **Nhắn riêng cho bot**: mở chat với bot vừa tạo, bấm Start, gửi 1 tin bất kỳ (vd "hi").
   - **Hoặc thêm bot vào 1 group** (khuyến nghị nếu cả nhóm cần nhận) rồi gửi 1 tin bất kỳ trong group.
   - Sau đó mở trình duyệt, truy cập:
     `https://api.telegram.org/bot<TOKEN>/getUpdates`
     (thay `<TOKEN>` bằng token ở bước 1). Tìm trường `"chat":{"id": ...}` trong JSON trả về — đó
     chính là `chat_id` (với group, id thường là số âm, vd `-1001234567890`).
3. Thêm 2 secrets vào repo GitHub (**Settings → Secrets and variables → Actions → New repository
   secret**):

| Secret | Giá trị |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Token lấy từ BotFather |
| `TELEGRAM_CHAT_ID` | chat_id lấy ở bước trên. Nhiều người/group thì cách nhau dấu phẩy |

Không có giới hạn "cửa sổ 24h" hay template duyệt trước như WhatsApp/Zalo — bot có thể chủ động
nhắn bất cứ lúc nào, đây là lý do Telegram đơn giản hơn nhiều để bắt đầu.

## Bước 3 — Kiểm tra thủ công

Vào tab **Actions** của repo → chọn workflow "Watch phase3/mandates" → **Run workflow** để chạy thử
ngay mà không cần chờ lịch. Lần chạy đầu chỉ ghi baseline (không gửi thông báo) để tránh spam toàn bộ
lịch sử — từ commit thứ 2 trở đi mới có thông báo thật.

## Test cục bộ (tuỳ chọn)

```bash
TELEGRAM_BOT_TOKEN=... TELEGRAM_CHAT_ID=... npm run check
```

---

## (Tuỳ chọn, làm sau) WhatsApp Cloud API

Cần Meta Business account. Nếu sau này có, thêm secrets:

| Secret | Giá trị |
|---|---|
| `WHATSAPP_TOKEN` | Access token (Permanent token khuyến nghị) |
| `WHATSAPP_PHONE_ID` | Phone Number ID trong Meta App Dashboard |
| `WHATSAPP_TO` | Số điện thoại người nhận, định dạng quốc tế không dấu `+`, cách nhau dấu phẩy |

Lưu ý: người nhận phải nhắn tin cho số đó trong 24h gần nhất, nếu không phải dùng template đã duyệt.

## (Tuỳ chọn, làm sau) Zalo OA

1. Vào https://developers.zalo.me, tạo/chọn 1 **Official Account (OA)** và tạo App liên kết.
2. Lấy `App ID` và `App Secret`.
3. Mở link sau (đăng nhập tài khoản quản trị OA):
   `https://oauth.zaloapp.com/v4/oa/permission?app_id=APP_ID&redirect_uri=REDIRECT_URI`
   → Đồng ý → copy `code` từ URL redirect.
4. Đổi code lấy token:
   ```bash
   ZALO_APP_ID=xxx ZALO_APP_SECRET=xxx ZALO_AUTH_CODE=xxx npm run zalo:auth
   ```
5. Dán `refresh_token` in ra vào `state/zalo_refresh_token.txt`, commit + push.
6. Thêm secrets: `ZALO_APP_ID`, `ZALO_APP_SECRET`, `ZALO_TO` (user_id người nhận, cách nhau dấu phẩy).

Lưu ý: Zalo OA chỉ cho gửi tin tới người đã từng nhắn/quan tâm OA trong 7 ngày gần nhất, trừ khi dùng
ZNS (template duyệt trước, phức tạp hơn).
