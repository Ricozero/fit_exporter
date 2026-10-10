# fit_exporter

用于在行者网页中导出 GPX 和 FIT 轨迹文件的 Tampermonkey 用户脚本。项目使用 TypeScript、Vite、`vite-plugin-monkey` 和 Garmin FIT SDK 开发。

## 当前功能

- 支持轨迹详情页：`https://www.imxingzhe.com/workouts/{id}`；
- 页面缺少“导出Fit”按钮时，补充按钮；
- 单条和批量导出的文件名统一为 `{id}.gpx` / `{id}.fit`；
- 请求轨迹详情和完整采样流，生成并下载 FIT Activity 文件；
- FIT 支持徒步、跑步、骑行、游泳、滑雪、训练、室内骑行和虚拟骑行，其他类型使用通用活动；
- 写入时间、坐标、海拔、距离、速度、心率、踏频，以及可用的功率计数据；
- 写入 `lap`、`session` 和 `activity` 汇总消息；
- 轨迹列表页 `/workouts/list` 提供“批量导出GPX”和“批量导出Fit”。

## 已知 API

| 接口 | 作用 | 说明 |
| --- | --- | --- |
| `/api/v1/pgworkout/` | 轨迹列表 | 默认返回 20 条；支持通过 `offset` 翻页，通过 `year`、`month` 和 `sport` 筛选 |
| `/api/v1/pgworkout/{id}` | 轨迹详情 | 包含标题、运动类型、起止时间、距离、统计信息和设备信息等 |
| `/api/v1/pgworkout/{id}/gpx/` | GPX 文件 | 直接下载 GPX 文件 |
| `/api/v1/pgworkout/{id}/stream` | 完整采样流 | 按字段保存为多个数组，相同下标共同组成一个采样点 |
| `/api/v1/pgworkout/{id}/points` | 轨迹点 | `points` 按采样点组织，坐标单独保存在 `encoding_points` 中 |
| `/api/v1/pgworkout/{id}/cvp` | 未确认 | 当前包含 `cv.x/mm/start/end` 和 `cp`，暂不作为 FIT 导出的依赖 |

### `stream` 与 `points`

两者保存的是相近的轨迹数据，但组织方式不同：

- `stream` 是列式结构（SoA），例如 `timestamp[i]`、`location[i]`、`altitude[i]` 和 `heartrate[i]` 共同组成第 `i` 个采样点；
- `points` 是对象数组（AoS），每个元素包含时间、海拔、速度、心率、踏频和功率等数据，坐标则单独保存在 `encoding_points` 中；
- 当前样例中，两种接口都包含 749 个采样点。

FIT 导出目前优先使用 `stream`，因为时间、坐标和传感器字段已经按下标对齐。`points` 可用于交叉验证，或作为后续的备用数据源。

## 项目结构

```text
src/
├─ main.ts          # 用户脚本入口和页面分发
├─ route.ts         # 根据 URL 判断详情页或列表页
├─ single.ts        # 单条轨迹按钮和导出流程
├─ batch.ts         # 批量按钮、进度和取消界面
├─ batch-filters.ts # 页面筛选
├─ batch-export.ts  # 分页、顺序请求、重试和统一打包
├─ archive.ts       # ZIP 打包
├─ icons.ts         # 共用静态导出图标
├─ api.ts           # 行者 API 请求
├─ types.ts         # API 响应和轨迹数据类型
├─ normalize.ts     # 将 stream 列式数据转换为轨迹点
├─ fit.ts           # 使用 Garmin FIT SDK 编码
└─ download.ts      # 触发浏览器文件下载
```

`example/` 保存开发和测试使用的 API 响应及 HTML 样例。

## 开发流程

建议使用 Node.js 22。

```powershell
npm install
npm run dev
```

启动开发服务器后访问：

```text
http://127.0.0.1:5173/
```

在 Tampermonkey 中安装开发脚本，然后打开行者轨迹详情页或列表页。开发过程中保持 Vite 运行，修改源码后刷新页面即可测试。

## 检查与构建

```powershell
npm run typecheck
npm run test
npm run lint
npm run build
```

测试覆盖 API 请求、筛选、分页、重试、取消和 ZIP 内容，并通过 Garmin SDK Decoder 检查 FIT 文件完整性、CRC、采样点和汇总字段。

生产构建输出：

```text
dist/fit-exporter.user.js
```

将该文件安装到 Tampermonkey 后，即可脱离 Vite 开发服务器运行。
