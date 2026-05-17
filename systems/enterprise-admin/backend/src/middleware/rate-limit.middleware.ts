import rateLimit from 'express-rate-limit';

// POS 端點：允許高頻掃描操作，但防止暴力濫用
export const posRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 分鐘
  max: 120,             // 每分鐘最多 120 次（每秒 2 次平均，允許短暫爆發）
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: '請求過於頻繁，請稍後再試' } },
});

// Analytics 端點：計算密集，嚴格限制
export const analyticsRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 分鐘
  max: 30,              // 每分鐘最多 30 次
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: '分析請求過於頻繁，請稍後再試' } },
});

// 全域預設（其他 API）
export const defaultRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: '請求過於頻繁，請稍後再試' } },
});
