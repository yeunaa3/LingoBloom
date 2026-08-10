export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const asyncHandler = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

export function text(value, { name = "value", max = 5000, required = false } = {}) {
  const normalized = value == null ? "" : String(value).trim();
  if (required && !normalized) {
    throw new ApiError(400, "VALIDATION_ERROR", `${name} là bắt buộc.`);
  }
  if (normalized.length > max) {
    throw new ApiError(400, "VALIDATION_ERROR", `${name} không được dài quá ${max} ký tự.`);
  }
  return normalized;
}

export function boolean(value, fallback = false) {
  if (value == null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  return ["1", "true", "yes", "on", "có"].includes(String(value).toLowerCase());
}

export function resourceId(value) {
  const id = value == null ? "" : String(value).trim();
  if (!id || id.length > 128 || !/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new ApiError(400, "INVALID_ID", "ID không hợp lệ.");
  }
  return id;
}

export function pagination(query) {
  const limit = Math.min(200, Math.max(1, Number.parseInt(query.limit || "50", 10) || 50));
  const offset = Math.max(0, Number.parseInt(query.offset || "0", 10) || 0);
  return { limit, offset };
}

export function notFound(label = "Mục") {
  return new ApiError(404, "NOT_FOUND", `${label} không tồn tại.`);
}

export function errorMiddleware(error, _req, res, _next) {
  if (error?.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({
      message: "Tệp nhập không được vượt quá 2 MB.",
      error: { code: "FILE_TOO_LARGE", message: "Tệp nhập không được vượt quá 2 MB." },
    });
  }
  const uniqueConstraint = Number(error?.code) === 11000;
  if (uniqueConstraint) {
    return res.status(409).json({
      message: "Mục này đã có trong danh sách.",
      error: { code: "DUPLICATE_ITEM", message: "Mục này đã có trong danh sách." },
    });
  }
  const status = error?.status || 500;
  const payload = {
    message: status >= 500 ? "Đã có lỗi xảy ra. Vui lòng thử lại." : error.message,
    error: {
      code: error?.code || "INTERNAL_ERROR",
      message: status >= 500 ? "Đã có lỗi xảy ra. Vui lòng thử lại." : error.message,
    },
  };
  if (error?.details) payload.error.details = error.details;
  if (status >= 500 && process.env.NODE_ENV !== "test") console.error(error);
  return res.status(status).json(payload);
}
