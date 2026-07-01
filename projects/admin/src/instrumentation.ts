import { exit } from 'process';

/*
  Init system - Admin 项目启动初始化
*/
export async function register() {
  try {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
      await import('@fastgpt/service/common/proxy');

      // 并行导入所有初始化模块
      const [
        { connectToMongo },
        { initVectorStore },
        { loadSystemModels },
        { connectSignoz },
        { initS3Buckets },
        { initializeDatabase },
        { getInitConfig, initGlobalVariables }
      ] = await Promise.all([
        import('@/service/common/mongo'),
        import('@fastgpt/service/common/vectorDB/controller'),
        import('@fastgpt/service/core/ai/config/utils'),
        import('@fastgpt/service/common/otel/trace/register'),
        import('@fastgpt/service/common/s3'),
        import('@/service/common/task'),
        import('@/service/common/system')
      ]);

      // 初始化可观测性
      connectSignoz();

      // 初始化全局变量（HTTP 代理、用量处理函数等）
      initGlobalVariables();

      // S3
      initS3Buckets();

      console.info('Next.js Instrumentation: 服务器启动');
      console.info('NEXT_PUBLIC_BASE_URL: ' + process.env.NEXT_PUBLIC_BASE_URL);

      // 等待 MongoDB 主库连接完成（依赖 MongoDB 的操作必须在此之后）
      await connectToMongo();

      // 并行：系统配置和模型数据加载（依赖 MongoDB 已连接）
      await Promise.all([getInitConfig(), loadSystemModels(), initVectorStore()]);

      // 任务初始化：PostgreSQL → 表结构 → 任务配置 → 任务管理器（带超时防止进程永久挂起）
      await initializeDatabase();
    }
  } catch (error) {
    console.error('Init system error', error);
    exit(1);
  }
}
