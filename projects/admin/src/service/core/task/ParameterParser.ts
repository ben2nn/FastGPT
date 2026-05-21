import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import weekOfYear from 'dayjs/plugin/weekOfYear';
import { DEFAULT_TIMEZONE } from '@/web/common/constants';

// 扩展 dayjs 插件
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(weekOfYear);

/**
 * 参数解析器
 * 负责解析任务参数配置，支持固定值和动态模板
 */
export class ParameterParser {
  private timezone: string;

  constructor(timezone: string = DEFAULT_TIMEZONE) {
    this.timezone = timezone;
  }

  /**
   * 解析参数配置
   * @param config 参数配置对象
   * @returns 解析后的参数对象
   */
  parse(config: Record<string, any>): Record<string, any> {
    if (!config || typeof config !== 'object') {
      return {};
    }

    const result: Record<string, any> = {};

    for (const [key, value] of Object.entries(config)) {
      result[key] = this.parseValue(value);
    }

    return result;
  }

  /**
   * 解析单个参数值
   * @param value 参数值
   * @returns 解析后的值
   */
  private parseValue(value: any): any {
    // 如果是字符串且包含模板标记，则解析为动态模板
    if (typeof value === 'string' && this.isTemplate(value)) {
      return this.parseDynamicTemplate(value);
    }

    // 如果是对象，递归解析
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return this.parse(value);
    }

    // 如果是数组，解析每个元素
    if (Array.isArray(value)) {
      return value.map((item) => this.parseValue(item));
    }

    // 固定值直接返回
    return value;
  }

  /**
   * 判断是否为模板字符串
   * @param value 字符串值
   * @returns 是否为模板
   */
  private isTemplate(value: string): boolean {
    return /\{\{.+\}\}/.test(value);
  }

  /**
   * 解析动态参数模板
   * @param template 模板字符串，格式：{{template_name}}
   * @returns 计算后的值
   */
  private parseDynamicTemplate(template: string): any {
    // 提取模板名称
    const match = template.match(/\{\{(.+?)\}\}/);
    if (!match) {
      return template;
    }

    const templateName = match[1].trim();

    // 查找并执行对应的模板函数
    if (this.templates[templateName]) {
      return this.templates[templateName]();
    }

    // 如果没有找到对应的模板，返回原始字符串
    console.warn(`Unknown template: ${templateName}`);
    return template;
  }

  /**
   * 时间模板映射
   * 支持的模板：
   * - yesterday.start: 昨天开始时间
   * - yesterday.end: 昨天结束时间
   * - today.start: 今天开始时间
   * - today.end: 今天结束时间
   * - lastHour.start: 上一小时开始时间
   * - lastHour.end: 上一小时结束时间
   * - lastWeek.start: 上周开始时间
   * - lastWeek.end: 上周结束时间
   * - lastMonth.start: 上月开始时间
   * - lastMonth.end: 上月结束时间
   */
  private templates: Record<string, () => any> = {
    // 昨天
    'yesterday.start': () => {
      // 在指定时区获取昨天的开始时间
      const date = dayjs().tz(this.timezone).subtract(1, 'day').startOf('day');
      return date.toDate();
    },
    'yesterday.end': () => {
      // 在指定时区获取昨天的结束时间
      const date = dayjs().tz(this.timezone).subtract(1, 'day').endOf('day');
      return date.toDate();
    },

    // 今天
    'today.start': () => {
      const date = dayjs().tz(this.timezone).startOf('day');
      return date.toDate();
    },
    'today.end': () => {
      const date = dayjs().tz(this.timezone).endOf('day');
      return date.toDate();
    },

    // 上一小时
    'lastHour.start': () => {
      const date = dayjs().tz(this.timezone).subtract(1, 'hour').startOf('hour');
      return date.toDate();
    },
    'lastHour.end': () => {
      const date = dayjs().tz(this.timezone).subtract(1, 'hour').endOf('hour');
      return date.toDate();
    },

    // 上周
    'lastWeek.start': () => {
      const date = dayjs().tz(this.timezone).subtract(1, 'week').startOf('week');
      return date.toDate();
    },
    'lastWeek.end': () => {
      const date = dayjs().tz(this.timezone).subtract(1, 'week').endOf('week');
      return date.toDate();
    },

    // 上月
    'lastMonth.start': () => {
      const date = dayjs().tz(this.timezone).subtract(1, 'month').startOf('month');
      return date.toDate();
    },
    'lastMonth.end': () => {
      const date = dayjs().tz(this.timezone).subtract(1, 'month').endOf('month');
      return date.toDate();
    },

    // 当前时间
    now: () => {
      const date = dayjs().tz(this.timezone);
      return date.toDate();
    },

    // 当前时间戳（毫秒）
    timestamp: () => {
      return dayjs().tz(this.timezone).valueOf();
    },

    // ISO 格式的当前时间
    'now.iso': () => {
      return dayjs().tz(this.timezone).toISOString();
    }
  };

  /**
   * 获取支持的模板列表
   * @returns 模板名称数组
   */
  getSupportedTemplates(): string[] {
    return Object.keys(this.templates);
  }

  /**
   * 添加自定义模板
   * @param name 模板名称
   * @param fn 模板函数
   */
  addTemplate(name: string, fn: () => any): void {
    this.templates[name] = fn;
  }
}
