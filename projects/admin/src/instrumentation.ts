/**
 * Next.js Instrumentation Hook
 * 在服务器启动时执行，用于初始化应用
 *
 * 文档: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  // 只在 Node.js 环境中执行
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { addLog } = await import('@fastgpt/service/common/system/log');

    addLog.info('Next.js Instrumentation: 服务器启动');

    addLog.info('NEXT_PUBLIC_BASE_URL: ' + process.env.NEXT_PUBLIC_BASE_URL);

    // 导入 init 模块，触发自动初始化
    // 初始化会在 setImmediate 中异步执行，不会阻塞服务器启动
    await import('@/service/init');

    addLog.info('Next.js Instrumentation: 初始化模块已加载');
  }
}
