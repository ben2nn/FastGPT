-- ============================================
-- PostgreSQL 数据库表结构定义
-- ============================================

-- ============================================
-- 1. 模型调用日志表
-- ============================================
CREATE TABLE IF NOT EXISTS model_call_logs (
  id SERIAL PRIMARY KEY,
  call_id VARCHAR(50) UNIQUE NOT NULL,
  app_id VARCHAR(50) NOT NULL,
  app_name VARCHAR(255),
  model_id VARCHAR(100) NOT NULL,
  model_name VARCHAR(100) NOT NULL,
  call_timestamp TIMESTAMP NOT NULL,
  call_status VARCHAR(50),
  chat_id VARCHAR(50) NOT NULL,
  data_id VARCHAR(50),
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  total_points DECIMAL(10, 2) DEFAULT 0,
  source VARCHAR(50),
  source_name VARCHAR(255),
  model_category VARCHAR(50) DEFAULT 'chat',
  usage_scenario VARCHAR(100),
  running_time DECIMAL(10, 2),
  error_text TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 模型调用日志表索引
CREATE INDEX IF NOT EXISTS idx_call_timestamp ON model_call_logs(call_timestamp);
CREATE INDEX IF NOT EXISTS idx_app_id ON model_call_logs(app_id);
CREATE INDEX IF NOT EXISTS idx_chat_id ON model_call_logs(chat_id);
CREATE INDEX IF NOT EXISTS idx_data_id ON model_call_logs(data_id);
CREATE INDEX IF NOT EXISTS idx_model_name ON model_call_logs(model_name);
CREATE INDEX IF NOT EXISTS idx_call_status ON model_call_logs(call_status);
CREATE INDEX IF NOT EXISTS idx_model_category ON model_call_logs(model_category);

-- 复合索引 - 用于统计查询优化
CREATE INDEX IF NOT EXISTS idx_timestamp_app ON model_call_logs(call_timestamp, app_id);
CREATE INDEX IF NOT EXISTS idx_timestamp_model ON model_call_logs(call_timestamp, model_name);
CREATE INDEX IF NOT EXISTS idx_timestamp_status ON model_call_logs(call_timestamp, call_status);
CREATE INDEX IF NOT EXISTS idx_timestamp_app_model ON model_call_logs(call_timestamp, app_id, model_name) 
  INCLUDE (total_tokens, total_points, call_status);

-- ============================================
-- 2. 任务配置表
-- ============================================
CREATE TABLE IF NOT EXISTS task_configs (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  cron_expression VARCHAR(100) NOT NULL,
  timezone VARCHAR(50) DEFAULT 'Asia/Shanghai',
  enabled BOOLEAN DEFAULT true,
  executor_name VARCHAR(100) NOT NULL,
  default_params JSONB,
  max_execution_time INTEGER DEFAULT 3600000,
  retry_count INTEGER DEFAULT 0,
  retry_interval INTEGER DEFAULT 60000,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 任务配置表索引
CREATE INDEX IF NOT EXISTS idx_task_enabled ON task_configs(enabled);

-- ============================================
-- 3. 任务执行历史表
-- ============================================
CREATE TABLE IF NOT EXISTS task_executions (
  id SERIAL PRIMARY KEY,
  task_id VARCHAR(50) NOT NULL,
  task_name VARCHAR(255) NOT NULL,
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP,
  status VARCHAR(20) NOT NULL,
  params JSONB,
  result JSONB,
  error_message TEXT,
  execution_time_ms INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES task_configs(id) ON DELETE CASCADE
);

-- 任务执行历史表索引
CREATE INDEX IF NOT EXISTS idx_task_executions_task_id ON task_executions(task_id);
CREATE INDEX IF NOT EXISTS idx_task_executions_status ON task_executions(status);
CREATE INDEX IF NOT EXISTS idx_task_executions_start_time ON task_executions(start_time DESC);
CREATE INDEX IF NOT EXISTS idx_task_executions_composite ON task_executions(task_id, start_time DESC);
