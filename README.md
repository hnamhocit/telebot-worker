# TeleBot - Telegram Bot on Cloudflare Workers ⚡

> Telegram Bot serverless chạy trực tiếp trên nền tảng **Cloudflare Workers** (V8 Isolate Edge), sử dụng framework **Hono** và **grammY**.

**Domain Worker:** `https://telebot.hnamhocit.workers.dev`

---

## 🚀 Tính năng

- ⚡ **Siêu nhanh & Không độ trễ:** Chạy trên mạng lưới toàn cầu Cloudflare edge gần người dùng nhất.
- 🔒 **Bảo mật cao:** Hỗ trợ xác thực webhook bằng `secret_token` (`X-Telegram-Bot-Api-Secret-Token`) và `ADMIN_SECRET`.
- 🛠️ **Quản lý Webhook tự động:** Hỗ trợ endpoint `/set-webhook`, `/webhook-info`, `/delete-webhook` để kích hoạt webhook mà không cần cấu hình curl phức tạp.
- 💬 **Đầy đủ lệnh bot:**
  - `/start` - Lời chào & Menu nút bấm tương tác (Inline Keyboard)
  - `/help` - Xem hướng dẫn sử dụng và danh sách lệnh
  - `/ping` - Đo độ trễ phản hồi và thời gian máy chủ Edge
  - `/id` - Lấy Chat ID, User ID, Username và loại Chat
  - `/echo <tin nhắn>` - Lặp lại tin nhắn
  - `/info` - Thông tin kiến trúc và mã nguồn bot
  - Hỗ trợ phản hồi các nút bấm tương tác (Callback Query)
  - Xử lý tin nhắn văn bản thông thường (Fallback)

---

## 📁 Cấu trúc thư mục

```
telebot/
├── src/
│   ├── bot/
│   │   ├── commands.ts     # Các lệnh bot (/start, /ping, /id,...) & nút bấm
│   │   └── index.ts        # Quản lý khởi tạo Bot grammY & cache handler
│   ├── types.ts            # Định nghĩa Bindings / Environment
│   └── index.ts            # Hono Web Server, Webhook & API endpoints
├── test/
│   └── bot.test.ts         # Unit tests với Bun Test
├── .dev.vars.example       # Mẫu biến môi trường chạy local
├── package.json
├── tsconfig.json
└── wrangler.jsonc          # Cấu hình Cloudflare Worker
```

---

## 🛠️ Hướng dẫn cài đặt & Triển khai

### 1. Lấy Telegram Bot Token

1. Mở Telegram và tìm bot [@BotFather](https://t.me/BotFather).
2. Gõ lệnh `/newbot` và làm theo hướng dẫn để đặt tên và username cho bot.
3. Sao chép chuỗi **HTTP API Token** (dạng `123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ`).

### 2. Chạy thử nghiệm ở môi trường Local

Tạo file `.dev.vars` từ file mẫu:

```bash
cp .dev.vars.example .dev.vars
```

Mở `.dev.vars` và điền token của bạn:

```ini
TELEGRAM_BOT_TOKEN=123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ
# TELEGRAM_SECRET_TOKEN=chuoi_bi_mat_tuy_chon
# ADMIN_SECRET=chuoi_quan_tri_vien_tuy_chon
```

Khởi chạy local dev:

```bash
bun run dev
# hoặc: npm run dev
```

Truy cập: `http://localhost:8787` để xem giao diện trạng thái của bot.

---

### 3. Triển khai lên Cloudflare Workers

#### Bước 3.1: Đẩy code lên Cloudflare

```bash
bun run deploy
# hoặc: npm run deploy
```

Worker sẽ được triển khai tới địa chỉ:
👉 **`https://telebot.hnamhocit.workers.dev`**

#### Bước 3.2: Thiết lập Secret Token trên Cloudflare

Chạy lệnh sau trên terminal để lưu Telegram Bot Token một cách bảo mật:

```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
```
*(Dán token từ @BotFather vào và ấn Enter)*

*(Tùy chọn)* Nếu muốn tăng cường bảo mật Webhook:
```bash
npx wrangler secret put TELEGRAM_SECRET_TOKEN
npx wrangler secret put ADMIN_SECRET
```

#### Bước 3.3: Kích hoạt Webhook cho Telegram Bot

Sau khi deploy và set secret, bạn chỉ cần mở trình duyệt và truy cập:

👉 **`https://telebot.hnamhocit.workers.dev/set-webhook`**

Hoặc chạy lệnh curl:
```bash
curl -X GET "https://telebot.hnamhocit.workers.dev/set-webhook"
```

Telegram sẽ xác nhận:
```json
{
  "ok": true,
  "message": "Webhook registered successfully!",
  "webhook_url": "https://telebot.hnamhocit.workers.dev/webhook",
  "result": true
}
```

Bây giờ bạn có thể mở bot trên Telegram và gõ `/start`! 🎉

---

## 📡 Danh sách Endpoints

| Phương thức | Đường dẫn | Chức năng |
|---|---|---|
| `GET` | `/` | Trang thông tin trạng thái & Dashboard trực quan |
| `GET` | `/health` | Kiểm tra trạng thái hoạt động (Health check) |
| `POST` | `/webhook` | Endpoint nhận sự kiện cập nhật từ Telegram |
| `GET` | `/set-webhook` | Đăng ký URL webhook với Telegram API |
| `GET` | `/webhook-info`| Kiểm tra thông tin & trạng thái webhook hiện tại |
| `GET` | `/delete-webhook`| Hủy đăng ký webhook |

---

## 🧪 Chạy Kiểm Thử (Tests)

```bash
bun test
```
