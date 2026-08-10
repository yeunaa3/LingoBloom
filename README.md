# LingoBloom

LingoBloom là web học từ vựng mobile-first với giao diện hồng pastel. Frontend dùng React/Vite, backend dùng Node.js/Express và dữ liệu được lưu trên MongoDB. Một tiến trình Express phục vụ cả API lẫn bản React đã build khi triển khai lên Render.

Dự án phù hợp cho nhu cầu cá nhân hoặc nhóm rất nhỏ (1–2 người). MongoDB Atlas Free đủ rộng rãi cho quy mô này, còn Render Free giúp đưa ứng dụng lên Internet mà không cần quản trị máy chủ.

## Tính năng chính

- Đăng nhập Google OAuth 2.0 hoặc chế độ demo rõ ràng khi chưa cấu hình Google.
- Chọn ngôn ngữ đang học và ngôn ngữ mẹ đẻ.
- Dashboard, tìm kiếm, bookmark và thống kê học tập cơ bản.
- Thêm, sửa qua API và xóa từ vựng/cấu trúc câu.
- Import CSV/TXT UTF-8 và tra từ qua lớp provider từ điển.
- Flashcard lọc theo thời điểm thêm (hôm nay, 7 ngày, 30 ngày, toàn bộ hoặc khoảng tùy chọn), chọn riêng từng mục và lưu lịch ôn tiếp theo.
- Dữ liệu, tài khoản và phiên đăng nhập được lưu trong MongoDB nên không mất khi Render khởi động lại.

## Công nghệ

- Frontend: React, Vite, JavaScript, Lucide React.
- Backend: Node.js, Express, Passport Google OAuth.
- Dữ liệu: MongoDB/MongoDB Atlas qua Mongoose.
- Session: cookie `HttpOnly` và `connect-mongo`; phiên hết hạn sau 30 ngày.
- Kiểm thử: Node.js test runner; build frontend bằng Vite.

## Yêu cầu

- Node.js **22.13.0 trở lên**; khuyến nghị Node.js 24.
- npm đi kèm Node.js, hoặc pnpm phiên bản mới.
- Một MongoDB Atlas connection string. `MONGODB_URI` là bắt buộc khi chạy ngoài test tự động.

Kiểm tra nhanh:

```powershell
node --version
npm.cmd --version
```

Trên Windows, nếu PowerShell báo không được phép chạy `npm.ps1`, hãy dùng `npm.cmd` như các ví dụ bên dưới. Không cần thay Execution Policy.

## Chạy local nhanh

Trước tiên hãy tạo cluster Atlas theo phần [Thiết lập MongoDB Atlas Free](#thiết-lập-mongodb-atlas-free), sau đó mở Terminal tại thư mục có `package.json` và chạy:

```powershell
Copy-Item .env.example .env
npm.cmd install
```

Mở `.env`, dán connection string thật vào `MONGODB_URI`, rồi chạy:

```powershell
npm.cmd run dev
```

Mở [http://localhost:5173](http://localhost:5173). API chạy tại `http://localhost:3001`; Vite tự chuyển tiếp các yêu cầu `/api` trong lúc phát triển.

Trên macOS/Linux, dùng `cp .env.example .env`, `npm install` và `npm run dev`. Với pnpm, dùng `pnpm install` và `pnpm dev`.

Lần đầu kết nối một database mới, backend tự tạo các collection/index cần thiết, tài khoản demo và dữ liệu mẫu. Seed có đánh dấu nên việc khởi động lại không chủ ý nhân đôi dữ liệu mẫu. Có thể chạy seed riêng bằng:

```powershell
npm.cmd --prefix server run seed
```

## Thiết lập MongoDB Atlas Free

Atlas Free (M0) không hết hạn và có 512 MB dung lượng, đủ cho nhu cầu 1–2 người của dự án này. Xem [hướng dẫn Free cluster chính thức của MongoDB](https://www.mongodb.com/docs/atlas/tutorial/deploy-free-tier-cluster/).

### 1. Tạo cluster

1. Đăng nhập [MongoDB Atlas](https://www.mongodb.com/atlas/database) và tạo một Project.
2. Chọn **Create/Build a Database**.
3. Chọn gói **Free / M0**, nhà cung cấp và khu vực miễn phí phù hợp.
4. Đặt tên cluster, ví dụ `LingoBloom`, rồi tạo cluster.

### 2. Tạo database user

1. Vào **Security → Database Access → Add New Database User**.
2. Tạo username riêng cho ứng dụng, ví dụ `lingobloom_app`.
3. Dùng mật khẩu dài, ngẫu nhiên và lưu lại. Đây là tài khoản database, không phải tài khoản đăng nhập Atlas.
4. Cấp quyền `readWrite` cho database `lingobloom` nếu giao diện cho phép chọn phạm vi; không cần cấp quyền quản trị Atlas.

Nếu mật khẩu chứa ký tự như `@`, `:`, `/`, `?`, `#` hoặc `%`, các ký tự đó phải được URL-encode trong connection string. Cách ít lỗi nhất là sao chép URI từ màn hình **Connect → Drivers** của Atlas và thay đúng phần `<password>`.

### 3. Cho phép kết nối mạng

Vào **Security → Network Access**:

- Để chạy local, chọn **Add Current IP Address**.
- Để Render Free kết nối đơn giản, thêm `0.0.0.0/0` (**Allow access from anywhere**).

`0.0.0.0/0` cho phép thử kết nối từ mọi địa chỉ IP, vì vậy bắt buộc dùng mật khẩu database mạnh, không đưa `MONGODB_URI` lên GitHub và không gửi nó cho người khác. Sau này có thể thu hẹp danh sách IP theo outbound ranges của khu vực Render nếu muốn quản lý chặt hơn. Atlas chỉ nhận kết nối từ IP/CIDR nằm trong Network Access; xem [hướng dẫn xử lý kết nối của Atlas](https://www.mongodb.com/docs/atlas/troubleshoot-connection/).

### 4. Lấy connection string

1. Trở lại cluster, chọn **Connect → Drivers**.
2. Chọn driver Node.js và sao chép chuỗi bắt đầu bằng `mongodb+srv://`.
3. Thay username/password rồi đặt vào `.env`:

```dotenv
MONGODB_URI=mongodb+srv://lingobloom_app:your-password@your-cluster.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB_NAME=lingobloom
```

Không đặt URI trong frontend và không commit `.env`. Backend dùng `MONGODB_DB_NAME=lingobloom` nếu biến này bị bỏ trống.

## Triển khai miễn phí lên Render

### Bước 1: Đưa mã nguồn lên GitHub

Tạo một repository GitHub mới, sau đó chạy tại thư mục gốc dự án:

```powershell
git init
git add .
git commit -m "Deploy LingoBloom"
git branch -M main
git remote add origin https://github.com/<ten-github>/<ten-repository>.git
git push -u origin main
```

Không tải `node_modules` hoặc `.env` lên GitHub. `.gitignore` của dự án đã loại các tệp này.

### Bước 2: Triển khai bằng `render.yaml` (khuyên dùng)

1. Trước khi push, mở `render.yaml` và đổi `name: lingobloom` thành một tên riêng, ví dụ `lingobloom-tenban`.
2. Đăng nhập [Render Dashboard](https://dashboard.render.com/), chọn **New → Blueprint** và kết nối repository.
3. Render đọc `render.yaml`. Khi được hỏi, nhập `MONGODB_URI`: URI Atlas đầy đủ.
4. Chọn tạo Blueprint và chờ lần deploy đầu hoàn tất.

Ứng dụng tự đọc `RENDER_EXTERNAL_HOSTNAME`, vì vậy không cần đoán `CLIENT_URL` trước khi deploy.

`render.yaml` đã cấu hình đúng:

```text
Runtime: Node
Plan: Free
Build Command: npm install --include=dev && npm run build
Start Command: npm start
Health Check: /api/health
```

`SESSION_SECRET` được Render tự sinh và không được ghi trong repository. `MONGODB_URI` dùng `sync: false`, nghĩa là Render hỏi secret này khi tạo Blueprint. Đây là cách được mô tả trong [Blueprint YAML Reference của Render](https://render.com/docs/blueprint-spec).

### Cách tạo Web Service thủ công

Nếu không dùng Blueprint, chọn **New → Web Service**, kết nối repository, chọn Node/Free rồi nhập các lệnh:

```text
Build Command: npm install --include=dev && npm run build
Start Command: npm start
Health Check Path: /api/health
```

Trong **Environment**, thêm:

```dotenv
NODE_ENV=production
SERVE_CLIENT=true
SECURE_COOKIES=true
VITE_API_URL=/api
MONGODB_URI=mongodb+srv://...
MONGODB_DB_NAME=lingobloom
SESSION_SECRET=<chuoi-dai-ngau-nhien>
DEMO_AUTH_ENABLED=true
APP_TIME_ZONE_OFFSET_MINUTES=420
DICTIONARY_PROVIDER=free_dictionary
DICTIONARY_API_BASE_URL=https://api.dictionaryapi.dev/api/v2/entries
```

Không cần tự đặt `PORT`; Render truyền cổng cho ứng dụng. Express phục vụ `client/dist`, nên frontend và API dùng chung một URL và giữ `VITE_API_URL=/api`.

### Bước 3: Kiểm tra

Khi trạng thái là **Live**, mở:

```text
https://<ten-service>.onrender.com/api/health
```

Kết quả hợp lệ có `status: "ok"` và database MongoDB. Sau đó mở URL gốc và thử đăng nhập demo, thêm một từ, tải lại trang rồi kiểm tra dữ liệu còn nguyên.

## Bật Google OAuth sau khi deploy

Nên deploy với demo trước để biết chính xác URL Render, rồi mới cấu hình Google:

1. Trong [Google Cloud Console](https://console.cloud.google.com/), tạo/chọn project và cấu hình OAuth consent screen.
2. Tạo OAuth Client ID loại **Web application**.
3. Thêm **Authorized JavaScript origin**:

   ```text
   https://<ten-service>.onrender.com
   ```

4. Thêm **Authorized redirect URI** chính xác:

   ```text
   https://<ten-service>.onrender.com/api/auth/google/callback
   ```

5. Trong Render → service → **Environment**, thêm:

   ```dotenv
   GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your-client-secret
   ```

6. Lưu thay đổi, chờ Render deploy/restart và kiểm tra đăng nhập Google.
7. Khi Google đã hoạt động, đặt `DEMO_AUTH_ENABLED=false` nếu không muốn người có đường link truy cập tài khoản demo chung.

Origin và callback phải khớp tuyệt đối, gồm `https`, hostname và đường dẫn. Không thêm dấu `/` cuối callback.

Với subdomain `onrender.com`, backend tự suy ra URL frontend và callback từ `RENDER_EXTERNAL_HOSTNAME`. Chỉ cần đặt `CLIENT_URL` và `GOOGLE_CALLBACK_URL` khi dùng custom domain hoặc muốn ghi đè URL tự động.

## Chế độ demo và bảo mật

Khi `DEMO_AUTH_ENABLED=true`, mọi người biết URL đều có thể vào cùng tài khoản demo và nhìn thấy/chỉnh sửa dữ liệu demo chung. Chỉ giữ chế độ này để thử nghiệm hoặc khi bạn chấp nhận cách dùng chung đó. Sau khi Google hoạt động, nên tắt demo.

Session được lưu trong collection `sessions` của cùng MongoDB và có TTL 30 ngày. Cookie đăng nhập là `HttpOnly`, `SameSite=Lax`; ở Render phải giữ `SECURE_COOKIES=true` để cookie chỉ gửi qua HTTPS. `SESSION_SECRET`, `MONGODB_URI` và `GOOGLE_CLIENT_SECRET` phải nằm trong Render Environment, không nằm trong mã nguồn.

## Giới hạn của gói miễn phí

- Render Free đưa web service vào trạng thái ngủ sau 15 phút không có lưu lượng. Lần mở tiếp theo có thể mất khoảng một phút để khởi động lại. Đây là bình thường; xem [giới hạn Render Free](https://render.com/docs/free).
- Filesystem của Render Free là tạm thời. Project không lưu database trên filesystem nữa; dữ liệu nằm trên Atlas nên vẫn còn sau khi Render ngủ, restart hoặc deploy lại.
- Atlas Free không hết hạn và có 512 MB, phù hợp cho ứng dụng nhỏ này. Nên kiểm tra định kỳ dung lượng và bảo mật tài khoản.

## Dữ liệu SQLite cũ không tự chuyển sang MongoDB

Bản MongoDB không đọc tệp `server/data/lingobloom.sqlite` của bản cũ. Việc deploy hoặc điền `MONGODB_URI` **không tự động mang dữ liệu SQLite/localStorage cũ sang Atlas**.

Database MongoDB mới sẽ bắt đầu với seed mẫu. Nếu cần giữ từ đã học, hãy xuất chúng từ bản cũ thành CSV/TXT rồi import lại trong giao diện MongoDB. Project hiện không kèm công cụ migration SQLite tự động; tệp SQLite cũ không bị xóa và có thể giữ làm bản sao lưu.

## Biến môi trường

Backend đọc `.env` ở thư mục gốc hoặc `server/.env`. Mẫu đầy đủ nằm trong [`.env.example`](./.env.example).

| Biến | Mặc định | Ý nghĩa |
| --- | --- | --- |
| `PORT` | `3001` | Cổng Express; Render tự truyền biến này. |
| `CLIENT_URL` | local hoặc hostname Render tự nhận | Origin frontend được phép và nơi redirect sau đăng nhập; chỉ cần đặt tay khi local/custom domain. |
| `VITE_DEV_API_TARGET` | `http://localhost:3001` | Đích proxy `/api` khi chạy Vite local. |
| `VITE_API_URL` | `/api` | Base URL API được đóng vào frontend lúc build. |
| `MONGODB_URI` | không có | Connection string MongoDB; bắt buộc ngoài test. |
| `MONGODB_DB_NAME` | `lingobloom` | Tên database chứa dữ liệu và session. |
| `MONGODB_CONNECT_TIMEOUT_MS` | `10000` | Thời gian tối đa chờ kết nối ban đầu, tính bằng mili giây. |
| `MONGODB_MAX_POOL_SIZE` | `10` | Số kết nối MongoDB tối đa trong pool; mặc định đã dư cho 1–2 người. |
| `SESSION_COLLECTION` | `sessions` | Collection mà `connect-mongo` dùng để lưu phiên đăng nhập. |
| `SESSION_SECRET` | chỉ có fallback local | Khóa ký cookie session; bắt buộc thay khi deploy. |
| `DEMO_AUTH_ENABLED` | `true` | Cho phép tài khoản demo chung. |
| `GOOGLE_CLIENT_ID` | trống | Google OAuth Client ID. |
| `GOOGLE_CLIENT_SECRET` | trống | Google OAuth Client Secret. |
| `GOOGLE_CALLBACK_URL` | local hoặc hostname Render tự nhận | Redirect URI đã đăng ký với Google; chỉ cần đặt tay khi local/custom domain. |
| `DICTIONARY_PROVIDER` | `free_dictionary` | Provider tra từ. |
| `DICTIONARY_API_BASE_URL` | DictionaryAPI.dev | Endpoint nền của provider mặc định. |
| `SERVE_CLIENT` | `true` | Express phục vụ bản build `client/dist`. |
| `NODE_ENV` | `development` | Dùng `production` trên Render. |
| `SECURE_COOKIES` | theo production | Chỉ gửi cookie qua HTTPS khi bật. |
| `APP_TIME_ZONE_OFFSET_MINUTES` | `420` | Múi giờ thống kê; `420` là UTC+7. |

## Import CSV/TXT

Tệp phải là UTF-8, không lớn hơn 2 MB và tối đa 2.000 dòng dữ liệu. Tệp mẫu nằm trong `samples/`.

Từ vựng CSV:

```csv
term,translation,partOfSpeech,pronunciation,example,notes
serendipity,sự tình cờ may mắn,noun,/ˌser.ənˈdɪp.ə.ti/,Finding this cafe was pure serendipity.,Từ cần ôn
gentle,dịu dàng,adjective,/ˈdʒen.təl/,Be gentle with yourself.,
```

Cấu trúc câu dùng `pattern,meaning,example,notes`. TXT ổn định nhất khi ngăn các trường bằng Tab theo thứ tự `term`, `translation`, `example`, `notes`. Ngôn ngữ được lấy từ cặp ngôn ngữ đang chọn trong hồ sơ.

## Build, kiểm tra và chạy production local

```powershell
npm.cmd test
npm.cmd run build
```

Kiểm tra cả test và build:

```powershell
npm.cmd run check
```

Chạy giống production trên máy cá nhân (vẫn cần `MONGODB_URI` trong `.env`):

```powershell
npm.cmd run build
npm.cmd start
```

Express phục vụ cả API và React tại [http://localhost:3001](http://localhost:3001). Khi chạy HTTP local, giữ `SECURE_COOKIES=false`.

## Xử lý lỗi thường gặp

- `MONGODB_URI is required`: chưa tạo `.env` hoặc Render chưa có biến `MONGODB_URI`.
- `MongoServerSelectionError`/timeout: thêm IP hiện tại hoặc `0.0.0.0/0` vào Atlas Network Access, rồi chờ rule áp dụng.
- `Authentication failed`: kiểm tra database user, mật khẩu và URL-encode ký tự đặc biệt trong URI.
- Render báo deploy thành công nhưng trang lỗi: xem **Logs**, kiểm tra `MONGODB_URI`, `MONGODB_DB_NAME` và `/api/health`.
- Google báo `redirect_uri_mismatch`: callback trong Google Cloud chưa giống URL `/api/auth/google/callback` mà ứng dụng đang dùng; chỉ đặt `GOOGLE_CALLBACK_URL` để ghi đè khi cần.
- Đăng nhập xong quay lại màn hình login: kiểm tra `SECURE_COOKIES=true`; nếu dùng custom domain, kiểm tra thêm `CLIENT_URL` và `GOOGLE_CALLBACK_URL`.
- Lần mở đầu mất lâu: Render Free đang khởi động lại sau thời gian ngủ.
- PowerShell chặn `npm.ps1`: dùng `npm.cmd install` và `npm.cmd run dev`.

## Cấu trúc thư mục

```text
.
├─ client/                 React + Vite, giao diện mobile-first
├─ server/                 Express + MongoDB
│  ├─ src/                 auth, API, model/repository và service
│  └─ test/                test backend
├─ samples/                CSV/TXT mẫu
├─ .env.example            cấu hình local mẫu
├─ render.yaml             Render Blueprint
└─ package.json            lệnh chung của dự án
```
