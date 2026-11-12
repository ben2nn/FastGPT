# Admin 统计模块时区问题修复设计

## 1. 问题现象

统计相关 API 全部返回 400：

```
[Warn] 2026-11-12 17:15:07 [OverviewAPI] 参数验证失败 {"error":"结束时间不能是未来时间"}
[Warn] 2026-11-12 17:15:07 [TrendStatisticsAPI] 参数验证失败 {"error":"结束时间不能是未来时间"}
[Warn] 2026-11-12 17:15:07 [StatusAPI] 参数验证失败 {"error":"结束时间不能是未来时间"}
[Warn] 2026-11-12 17:15:07 [AppStatisticsAPI] 参数验证失败 {"error":"结束时间不能是未来时间"}
[Warn] 2026-11-12 17:15:07 [ModelStatisticsAPI] 参数验证失败 {"error":"结束时间不能是未来时间"}
[Warn] 2026-11-12 17:15:19 [StatisticsListAPI] 参数验证失败 {"error":"结束时间不能是未来时间"}
```

涉及文件：

- `projects/admin/src/service/core/statistics/validation.ts`
- `projects/admin/src/pageComponents/statistics/FilterPanel.tsx`
- `projects/admin/src/pageComponents/statistics/FilterDatePanel.tsx`
- `projects/admin/src/pageComponents/statistics/TrendChart.tsx`
- `projects/admin/src/web/common/utils/time.ts`

## 2. 根因分析

### 2.1 前端「显示时区」与「解析时区」不一致

时间输入框（`datetime-local`）的值是不带时区偏移的墙上时间，原实现中：

- **显示**：`dayjs(initialFilters.endTime).format('YYYY-MM-DDTHH:mm')` —— 使用**浏览器本地时区**
- **提交**：`dayjs.tz(endTime, DEFAULT_TIMEZONE).format()` —— 按**业务时区**（`Asia/Shanghai`）解析

当浏览器时区与 `DEFAULT_TIMEZONE` 不一致时，查询区间会整体平移。若浏览器时区位于业务时区以东
（例如 UTC+9 及以上），平移后的「结束时间」就会落到服务器当前时间之后，触发
`结束时间不能是未来时间`。这是本次报错最可能的直接原因。

`FilterPanel`、`FilterDatePanel` 的初始值、快捷时间（今天/最近 7 天/最近 30 天）、重置、导出参数
都存在同类问题；快捷时间中的 `now.startOf('day')` 也是按浏览器时区取「今天」的边界。

### 2.2 服务端「未来时间」校验过于严格

`validateTimeRange` 直接以 `end.isAfter(now)` 拒绝请求。前端默认区间的结束时间取的是
**浏览器当前时间**，只要浏览器与服务器存在任何时钟漂移（或请求跨秒），请求就会被拒绝，
而统计查询的结束时间在「未来」本身并不会造成数据错误（未来没有数据）。

### 2.3 无时区偏移的字符串在服务端被按「服务器时区」解析

`dayjs('2026-11-12T17:15:07')` 按服务器进程所在时区解析。若服务端运行在 UTC 容器里，
业务时区（+08:00）的墙上时间会被当成 UTC，导致整体偏移 8 小时，同样可能落入「未来」。

## 3. 修复方案

### 3.1 服务端 `validation.ts`

1. 新增 `parseTimeToDayjs(value)`：
   - 带时区偏移（`Z` / `±HH:mm` / `±HHmm`）→ 按绝对时刻解析；
   - 不带偏移 → 按业务时区 `DEFAULT_TIMEZONE` 解析（不再依赖服务器时区）；
   - 非法字符串先做有效性检查，避免 `dayjs.tz` 抛 `RangeError`。
2. `validateTimeRange`：
   - 开始时间在未来 → 报错「开始时间不能是未来时间」；
   - 结束时间在未来且超出时钟漂移容忍上限（24h）→ 报错；否则**收敛到服务器当前时间**，
     不再让页面因为几秒时钟差整体查询失败；
   - 返回归一化后的 `{ startTime, endTime }`（业务时区、带偏移的 ISO 8601 字符串），
     由 `validateAndCleanQuery` 回填到查询参数中。
3. `validateQuerySchema`、`calculateGranularity` 统一使用 `parseTimeToDayjs`，避免同一份
   时间字符串在不同环节被按不同时区解析。

### 3.2 前端时间工具 `web/common/utils/time.ts`

新增三个工具函数，作为「浏览器时区 / 业务时区」之间的唯一转换入口：

| 函数 | 作用 |
| --- | --- |
| `getNowInTimeZone()` | 获取业务时区的当前时间 |
| `formatToTimeZoneInput(time)` | 将时间值格式化为业务时区的 `datetime-local` 显示值 |
| `parseTimeZoneInput(value)` | 将 `datetime-local` 的值按业务时区解析为带偏移的 ISO 字符串 |

### 3.3 组件改造

- `FilterPanel` / `FilterDatePanel`：初始值、快捷时间、查询、重置、导出参数全部改用上述工具；
  「今天」「最近 N 天」的边界改为按业务时区计算。
- `TrendChart`：趋势分桶按业务时区生成，展示时也按业务时区格式化，避免跨时区用户看到的
  日期错位一天。

## 4. 遗留问题（需确认后再处理）

PostgreSQL 中 `model_call_logs.call_timestamp` 是 `TIMESTAMP WITHOUT TIME ZONE`：

- 写入端（`service/core/datacap/storage.ts`）传入 JS `Date`，`pg` 驱动会按**服务器本地时区**
  序列化（带偏移），而 PostgreSQL 对无时区字段**忽略偏移**保存墙上时间 —— 实际存储的是
  服务器本地时间；
- 查询端 `QueryBuilder.buildTimeRangeCondition` 直接比较字符串，同样忽略偏移；
- 趋势 SQL（`buildTrendQuery`）却按「字段存的是 UTC」进行 `AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Shanghai'` 转换。

即：存储格式取决于部署环境的 `TZ`（本地开发为 `Asia/Shanghai`，Docker 镜像未设置 `TZ` 时为 UTC），
趋势分桶与区间比较在两个环境下不可能同时正确。

建议后续统一为**业务时区墙上时间**（或迁移到 `timestamptz`）并对历史数据做一次迁移；
该改动会影响入库与历史数据解读，需单独确认后执行。
