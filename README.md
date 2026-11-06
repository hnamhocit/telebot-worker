# TeleBot API - Cloudflare Worker ⚡

> Telegram Bot & Web Integration REST API serverless chạy trên **Cloudflare Workers** (V8 Isolate Edge).  
> Tối ưu hóa để tích hợp với ứng dụng Web (Astro, Next.js, React, Vue, Svelte, backend microservices).

**Worker URL:** `https://telebot.hnamhocit.workers.dev`

---

## 🌐 Các tính năng tích hợp Web

- ✉️ **Send Message API:** Gửi tin nhắn đến Telegram User / Group từ Web (Form liên hệ, thông báo đơn hàng, OTP, cảnh báo lỗi, CI/CD).
- 🖼️ **Send Photo API:** Gửi ảnh kèm chú thích và nút bấm.
- 📢 **Broadcast API:** Gửi đồng thời thông báo tới danh sách nhiều `chat_id`.
- 🔐 **Telegram Login Widget Verification:** Xác thực dữ liệu đăng nhập Telegram trên Web bằng HMAC-SHA256 theo chuẩn Telegram.
- 📱 **Telegram Mini App (TMA) InitData Validation:** Xác thực chuỗi `initData` từ Telegram Web Apps bằng HMAC-SHA256 (`WebAppData`).
- ⚡ **Webhook Management:** Tra cứu thông tin, đăng ký hoặc xóa Webhook qua REST API.
- 🌍 **Full CORS:** Hỗ trợ gọi trực tiếp từ Frontend trình duyệt.

---

## 📡 REST API Reference

### 1. `GET /` - API Discovery
Trả về danh mục toàn bộ API endpoints, mô tả và trạng thái hệ thống.

```bash
curl -X GET https://telebot.hnamhocit.workers.dev/
```

---

### 2. `POST /api/send-message` - Gửi tin nhắn
Gửi tin nhắn văn bản, hỗ trợ định dạng HTML/Markdown và hàng nút bấm (Inline Keyboard).

**Request Headers:**
```http
Content-Type: application/json
X-API-Key: your_api_key (tùy chọn nếu cấu hình API_KEY)
```

**Request Body:**
```json
{
  "chat_id": 123456789,
  "text": "<b>Thông báo mới:</b> Có đơn hàng #1002 vừa được thanh toán!",
  "parse_mode": "HTML",
  "buttons": [
    [
      { "text": "Xem chi tiết", "url": "https://example.com/orders/1002" },
      { "text": "Hỗ trợ", "url": "https://t.me/vntez_bot" }
    ]
  ],
  "disable_notification": false
}
```

**Response (200 OK):**
```json
{
  "ok": true,
  "message_id": 42,
  "chat_id": 123456789,
  "date": 1730912345,
  "result": { ... }
}
```

---

### 3. `POST /api/send-photo` - Gửi ảnh
Gửi ảnh bằng URL hoặc Telegram `file_id`.

**Request Body:**
```json
{
  "chat_id": 123456789,
  "photo": "https://example.com/receipt.png",
  "caption": "Hoá đơn thanh toán dịch vụ",
  "parse_mode": "HTML"
}
```

---

### 4. `POST /api/broadcast` - Gửi hàng loạt
Gửi tin nhắn đến danh sách nhiều `chat_id`.

**Request Body:**
```json
{
  "chat_ids": [123456789, 987654321],
  "text": "📢 Hệ thống sẽ bảo trì định kỳ lúc 02:00 AM.",
  "parse_mode": "HTML"
}
```

**Response (200 OK):**
```json
{
  "ok": true,
  "total": 2,
  "success_count": 2,
  "failure_count": 0,
  "results": [
    { "chat_id": 123456789, "ok": true, "message_id": 105 },
    { "chat_id": 987654321, "ok": true, "message_id": 106 }
  ]
}
```

---

### 5. `POST /api/auth/verify-widget` - Xác thực Telegram Login Widget
Xác thực dữ liệu callback từ nút "Log in with Telegram" trên website.

**Request Body:**
```json
{
  "id": 123456789,
  "first_name": "Nam",
  "username": "hnamhocit",
  "photo_url": "https://t.me/i/userpic/320/avatar.jpg",
  "auth_date": 1730910000,
  "hash": "4f9d2a8b..."
}
```

**Response (200 OK):**
```json
{
  "ok": true,
  "verified": true,
  "user": {
    "id": 123456789,
    "first_name": "Nam",
    "username": "hnamhocit",
    "photo_url": "https://t.me/i/userpic/320/avatar.jpg",
    "auth_date": 1730910000
  }
}
```

---

### 6. `POST /api/auth/validate-init-data` - Xác thực Telegram Mini App (TMA)
Xác thực chuỗi `Telegram.WebApp.initData` trong ứng dụng Telegram Mini App.

**Request Body:**
```json
{
  "init_data": "query_id=AAHdF6IQAAAAAN0XohC...&user=%7B%22id%22%3A123456789...%7D&auth_date=1730910000&hash=...",
  "max_age_seconds": 86400
}
```

**Response (200 OK):**
```json
{
  "ok": true,
  "verified": true,
  "data": {
    "query_id": "AAHdF6IQAAAAAN0XohC...",
    "user": {
      "id": 123456789,
      "first_name": "Nam",
      "username": "hnamhocit"
    },
    "auth_date": 1730910000
  }
}
```

---

### 7. `GET /api/me` - Thông tin Bot
Lấy thông tin Bot từ Telegram API (`getMe`).

```bash
curl -X GET https://telebot.hnamhocit.workers.dev/api/me
```

---

### 8. Webhook Management
- `GET /api/webhook`: Xem thông tin trạng thái webhook.
- `GET /api/webhook/set` hoặc `POST /api/webhook/set`: Đăng ký Webhook.
- `GET /api/webhook/delete` hoặc `POST /api/webhook/delete`: Hủy Webhook.

---

## 🔒 Bảo mật API (Tùy chọn)

Để bảo vệ các endpoints `/api/*` khỏi truy cập trái phép, bạn có thể thiết lập `API_KEY`:

```bash
npx wrangler secret put API_KEY
```

Khi đó các request gửi tới `/api/*` cần đính kèm một trong các cách sau:
- Header: `X-API-Key: <your_key>`
- Header: `Authorization: Bearer <your_key>`
- Query parameter: `?api_key=<your_key>`

*(Endpoint nhận webhook `/webhook` từ Telegram vẫn hoạt động độc lập và được xác thực bằng `TELEGRAM_SECRET_TOKEN`)*

---

## 🚀 Triển khai (Deploy)

```bash
bun run deploy
```
