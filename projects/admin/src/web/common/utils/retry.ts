/**
 * 重试工具函数
 * 用于在操作失败时自动重试
 */

/**
 * 重试选项配置
 */
export interface RetryOptions {
  /** 最大重试次数 */
  maxAttempts: number;
  /** 重试延迟（毫秒） */
  delay: number;
  /** 重试回调函数 */
  onRetry?: (attempt: number, error: Error) => void;
  /** 是否应该重试的判断函数 */
  shouldRetry?: (error: Error) => boolean;
}

/**
 * 默认重试选项
 */
const DEFAULT_RETRY_OPTIONS: Partial<RetryOptions> = {
  maxAttempts: 3,
  delay: 5000,
  shouldRetry: () => true
};

/**
 * 带重试机制的函数执行器
 * @param fn 要执行的异步函数
 * @param options 重试选项
 * @returns 函数执行结果
 * @throws 如果所有重试都失败，抛出最后一次的错误
 *
 * @example
 * ```typescript
 * const result = await withRetry(
 *   async () => await database.connect(),
 *   {
 *     maxAttempts: 3,
 *     delay: 5000,
 *     onRetry: (attempt, error) => {
 *       console.log(`重试第 ${attempt} 次，错误: ${error.message}`);
 *     }
 *   }
 * );
 * ```
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const config: RetryOptions = {
    ...DEFAULT_RETRY_OPTIONS,
    ...options
  } as RetryOptions;

  let lastError: Error;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // 检查是否应该重试
      const shouldRetry = config.shouldRetry?.(lastError) ?? true;

      if (attempt < config.maxAttempts && shouldRetry) {
        // 调用重试回调
        config.onRetry?.(attempt, lastError);

        // 等待指定的延迟时间后重试
        await new Promise((resolve) => setTimeout(resolve, config.delay));
      } else {
        // 已达到最大重试次数或不应该重试，抛出错误
        break;
      }
    }
  }

  throw lastError!;
}

/**
 * 指数退避重试
 * 每次重试的延迟时间呈指数增长
 * @param fn 要执行的异步函数
 * @param options 重试选项
 * @returns 函数执行结果
 *
 * @example
 * ```typescript
 * const result = await withExponentialBackoff(
 *   async () => await api.call(),
 *   {
 *     maxAttempts: 5,
 *     initialDelay: 1000,
 *     maxDelay: 30000
 *   }
 * );
 * ```
 */
export async function withExponentialBackoff<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    initialDelay?: number;
    maxDelay?: number;
    onRetry?: (attempt: number, error: Error, delay: number) => void;
  } = {}
): Promise<T> {
  const { maxAttempts = 3, initialDelay = 1000, maxDelay = 30000, onRetry } = options;

  let lastError: Error;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt < maxAttempts) {
        // 计算指数退避延迟: initialDelay * 2^(attempt-1)
        const delay = Math.min(initialDelay * Math.pow(2, attempt - 1), maxDelay);

        onRetry?.(attempt, lastError, delay);

        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError!;
}
