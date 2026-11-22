# Telebot Worker

Mỗi deployment phục vụ một app và một Telegram bot. Đặt `TELEBOT_APP_ID` thành mã cố định của app và dùng credential backend riêng cho mỗi deployment. Deployment mặc định dùng `vntez_bot` cho bot @vntez_bot. Khi triển khai nhiều app, đặt Worker name và queue/DLQ riêng cho từng deployment. Hai app có thể dùng chung bảng subscriber sau migration.

## Cấu hình

- Đặt `TELEBOT_APP_ID` và `SUPABASE_URL` trong Worker vars.
- Đặt `TELEGRAM_BOT_TOKEN`, `TELEGRAM_SECRET_TOKEN`, `INTERNAL_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` qua Wrangler secrets.
- Tạo queue `telebot-notifications` và `telebot-notifications-dlq` theo Wrangler config.
- Chạy [migration](migrations/001_scope_subscribers.sql) khi chuyển sang phiên bản này. Migration xóa các lượt đăng ký cũ trong cùng transaction với thay đổi khóa chính. Người dùng gửi lại `/start` để đăng ký vào app mới.
- Cấu hình Telegram webhook vào `/webhook` với `secret_token` trùng `TELEGRAM_SECRET_TOKEN`. `/start` bật nhận tin và `/stop` tắt nhận tin trong app.

## API

Contract ở [openapi.json](openapi.json). Flutter/Web gọi backend của app. Backend gửi `X-Internal-Secret` khi gọi hai route notify.

| Route | Body | Kết quả |
|---|---|---|
| `POST /api/notify/direct` | `{chatId, text, parseMode?}` hoặc `{userId, text, parseMode?}` | `200` khi Telegram xác nhận gửi |
| `POST /api/notify/broadcast` | `{text, tag?, parseMode?}` | `202` kèm `accepted`, số người nhận đã đưa vào queue |
| `GET /health` | | Liveness |

Direct theo `userId` yêu cầu UUID IAM đã được liên kết với subscriber qua backend, vì `/start` chỉ biết Telegram chat ID. Backend có thể quản lý mapping trong Supabase. `parseMode` nhận `HTML` hoặc `MarkdownV2`.

Quota xấp xỉ tại mỗi Cloudflare location là 60 direct, 5 broadcast và 300 lượt người nhận broadcast mỗi phút, mỗi app. Một broadcast nhận tối đa 100 chat và trả `422` nếu vượt. `429` trả `Retry-After`. Queue retry lỗi tạm thời Telegram, có thể phát trùng khi kết quả lần gửi trước chưa xác định. `202` xác nhận nhận việc, chưa xác nhận giao tin.
