# Mandates Watcher

Theo dõi thư mục [`phase3/mandates`](https://github.com/TechX-Corp/xbrain-learners/tree/main/phase3/mandates)
trong repo `TechX-Corp/xbrain-learners` (repo không thuộc quyền quản trị của bạn), và gửi thông báo
qua **WhatsApp** + **Zalo** mỗi khi có commit mới đụng tới thư mục đó.

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
scripts/check-and-notify.mjs           # logic kiểm tra + gửi tin
scripts/zalo-oauth-helper.mjs          # helper 1 lần để lấy Zalo refresh_token ban đầu
state/last_sha.txt                     # commit SHA cuối cùng đã thấy (tự động cập nhật)
state/zalo_refresh_token.txt           # refresh_token Zalo hiện tại (tự động xoay vòng)
```

## Bước 1 — Đưa code này lên một repo GitHub của bạn

```bash
git init
git add .
git commit -m "init mandates watcher"
git branch -M main
git remote add origin <URL_REPO_CUA_BAN>
git push -u origin main
```

## Bước 2 — Cấu hình WhatsApp Cloud API (Meta)

Bạn đã có Meta Business/WhatsApp Cloud API, cần các thông tin sau, thêm vào
**Settings → Secrets and variables → Actions** của repo:

| Secret | Giá trị |
|---|---|
| `WHATSAPP_TOKEN` | Access token (Permanent token khuyến nghị, không dùng token tạm 24h) |
| `WHATSAPP_PHONE_ID` | Phone Number ID trong Meta App Dashboard |
| `WHATSAPP_TO` | Số điện thoại người nhận, định dạng quốc tế không dấu `+`, cách nhau bằng dấu phẩy nếu nhiều người, vd: `84901234567,84987654321` |

Lưu ý: Nếu người nhận **chưa nhắn tin cho bạn trong 24h gần nhất**, Meta yêu cầu gửi bằng
template đã duyệt trước (không phải tin nhắn tự do). Cách đơn giản nhất để test: mỗi người nhận
tự nhắn "hi" vào số WhatsApp Business của bạn trước, mở cửa sổ 24h.

## Bước 3 — Đăng ký & cấu hình Zalo OA

1. Vào https://developers.zalo.me, tạo/chọn 1 **Official Account (OA)** và tạo App liên kết với OA đó.
2. Trong App, lấy `App ID` và `App Secret` (Cấu hình → Thông tin ứng dụng).
3. Cấp quyền OAuth cho app để lấy `access_token` + `refresh_token` lần đầu — mở link sau trên trình
   duyệt (đăng nhập bằng tài khoản quản trị OA):

   ```
   https://oauth.zaloapp.com/v4/oa/permission?app_id=APP_ID&redirect_uri=REDIRECT_URI
   ```

   `REDIRECT_URI` là URL bất kỳ bạn khai báo trong App (có thể là `https://oa.zalo.me/home` tạm thời,
   miễn khớp với domain đã đăng ký trong App settings). Sau khi bấm "Đồng ý", trình duyệt sẽ chuyển
   hướng tới `REDIRECT_URI?code=XXXX` — copy giá trị `code` (chỉ dùng được 1 lần, hết hạn nhanh).

4. Chạy helper có sẵn để đổi `code` lấy `access_token`/`refresh_token`:

   ```bash
   ZALO_APP_ID=xxx ZALO_APP_SECRET=xxx ZALO_AUTH_CODE=xxx npm run zalo:auth
   ```

5. Copy `refresh_token` in ra, dán vào file `state/zalo_refresh_token.txt`, commit + push file đó
   (hoặc tạm thời set secret `ZALO_REFRESH_TOKEN` để dùng cho lần chạy đầu — script ưu tiên đọc từ
   file `state/` nếu đã có).
6. Thêm secrets vào repo:

| Secret | Giá trị |
|---|---|
| `ZALO_APP_ID` | App ID |
| `ZALO_APP_SECRET` | App Secret |
| `ZALO_TO` | User ID Zalo của người nhận (người đã từng nhắn/quan tâm OA), cách nhau dấu phẩy |
| `ZALO_REFRESH_TOKEN` | (tuỳ chọn, chỉ cần cho lần chạy đầu nếu bạn không commit `state/zalo_refresh_token.txt`) |

Lưu ý quan trọng: Zalo OA chỉ cho phép gửi tin nhắn (message/cs) tới người dùng **đã từng nhắn tin
hoặc quan tâm OA của bạn trong 7 ngày gần nhất** — giống cơ chế customer service window. Nếu cần gửi
broadcast không giới hạn, phải dùng **ZNS (Zalo Notification Service)** với template được Zalo duyệt
trước — phức tạp hơn, có thể mất phí. Với nhu cầu "báo nội bộ cho vài người trong nhóm", cách đơn giản
nhất là mỗi người nhắn "hi" cho OA trước để mở cửa sổ nhắn tin.

## Bước 4 — Kiểm tra thủ công

Vào tab **Actions** của repo → chọn workflow "Watch phase3/mandates" → **Run workflow** để chạy thử
ngay mà không cần chờ lịch. Lần chạy đầu chỉ ghi baseline (không gửi thông báo) để tránh spam toàn bộ
lịch sử — từ commit thứ 2 trở đi mới có thông báo thật.

## Test cục bộ (tuỳ chọn)

```bash
WHATSAPP_TOKEN=... WHATSAPP_PHONE_ID=... WHATSAPP_TO=... \
ZALO_APP_ID=... ZALO_APP_SECRET=... ZALO_TO=... \
npm run check
```
