# fit_exporter

在行者网页中导出轨迹数据的 Tampermonkey 用户脚本。第一阶段只做**当前单条轨迹导出 FIT**；批量导出以后再考虑限速和风控。

## 技术方案

使用以下工具：

- TypeScript：主要开发语言，可视为带静态类型的 JavaScript；
- Vite：开发服务器和构建工具；
- `vite-plugin-monkey`：把 TypeScript 项目构建成 Tampermonkey 可安装的 `.user.js`；
- `@garmin/fitsdk`：Garmin 官方 JavaScript FIT SDK，负责消息编码、文件头和 CRC；
- Vitest：测试数据转换和 FIT 编码；
- Tampermonkey：脚本运行环境，复用用户在行者网页中的登录状态。

不使用 React/Vue。界面只有导出按钮和状态提示，直接操作 DOM 即可。

## 已知 API

当前样例保存在 `data/`，共五个 GET 接口：

| 接口 | 作用 | 当前认识 |
| --- | --- | --- |
| `/api/v1/pgworkout/` | 轨迹列表 | 默认返回 20 条，可通过 `offset` 翻页 |
| `/api/v1/pgworkout/{id}` | 轨迹详情 | 标题、运动类型、时间、距离、统计信息、设备信息等 |
| `/api/v1/pgworkout/{id}/stream` | 完整采样流 | 按字段组织的列式数据，各数组用相同下标对应同一采样点 |
| `/api/v1/pgworkout/{id}/points` | 轨迹点 | `points` 按采样点组织；`encoding_points` 是编码后的坐标串 |
| `/api/v1/pgworkout/{id}/cvp` | 未确认 | 当前包含 `cv.x/mm/start/end` 和 `cp`，暂不作为 FIT 导出的依赖 |

### `stream` 与 `points`

两者是不同的数据组织方式：

- `stream` 类似结构分离数组（SoA）：`timestamp[i]`、`location[i]`、`altitude[i]`、`heartrate[i]` 等共同组成第 `i` 个采样点；
- `points` 类似对象数组（AoS）：每个元素包含时间、海拔、速度、心率、踏频、功率等，但坐标单独放在 `encoding_points` 中；
- 当前样例中两者都有 749 个采样点。

FIT 导出优先使用 `stream`，因为坐标、时间和各传感器字段已经按下标对齐。`points` 可用于交叉验证，或在 `stream` 不可用时作为备选。

### `pgworkout` 中的 `pg`

目前没有足够证据确认 `pg` 的正式含义。它可能与 page/paged、PostgreSQL 或项目内部命名有关，但这些都只是猜测，不影响接口使用，因此代码和文档中不要依赖这个缩写的含义。

## 分页与总数

当前 `pgworkout.json` 的结构是：

```text
{
  code,
  data: {
    data: [20 条轨迹]
  },
  msg
}
```

响应中没有 Django REST framework 常见的 `count`、`next`、`previous` 字段，也没有总页数。因此：

- **只拿到一页 JSON 时，无法精确知道总共有多少条数据**；
- 返回 20 条只能说明这一页已满，不能说明后面一定还有数据；
- 已验证：`offset` 超过数据范围时仍返回 `code: 0`，并且 `data.data` 是空数组；
- 返回少于 20 条时可以处理后结束；如果最后一页正好有 20 条，则下一次请求会得到空数组；
- 也应检查 HTTP 响应头是否存在 `X-Total-Count`、`Content-Range` 等总数信息，目前样例 JSON 本身没有。

遍历方式：

```text
offset = 0
limit = 20

循环请求 offset = 0, 20, 40, ...
收到 0 条：结束
收到 1..19 条：处理后结束
收到 20 条：处理后继续下一页
```

遍历完成后，将各页数组长度累加即可得到实际总数；但在遍历结束前仍无法从单页 JSON 提前知道总数。批量导出阶段必须串行、限速，并在 401、403、429 或验证码出现时立即停止。

## 单轨迹导出流程

```text
打开轨迹详情页
  → 从 URL 或页面数据取得 workout id
  → 插入“导出 FIT”按钮
  → 请求详情和 stream
  → 校验各 stream 数组长度
  → 转换时间、坐标和传感器字段
  → 生成 FIT
  → 用 Blob 下载到本地
```

详情接口主要用于文件名、运动类型、起止时间和汇总信息。FIT 的逐点记录主要来自 `stream`。

第一版需要支持：

- 时间戳、经纬度、海拔、距离、速度；
- 可选的心率、踏频、功率和温度；
- 空数组或字段缺失；
- 登录失效、无权限和限流；
- 防止重复点击和重复挂载按钮。

`cvp` 在确认用途前不参与导出，避免把未知的派生数据错误写入 FIT。

## FIT SDK

使用 Garmin 官方的 `@garmin/fitsdk`，不要自行实现 FIT 二进制格式、字段缩放和 CRC。它是运行时依赖，因此不加 `-D`：

```powershell
npm install @garmin/fitsdk
```

基本编码接口：

```ts
import { Encoder, Profile } from "@garmin/fitsdk";

const encoder = new Encoder();

encoder.onMesg(Profile.MesgNum.FILE_ID, {
  type: "activity",
  manufacturer: "development",
  product: 1,
  timeCreated: new Date(startTime),
});

for (const point of points) {
  encoder.onMesg(Profile.MesgNum.RECORD, {
    timestamp: new Date(point.timestamp),
    positionLat: degreesToSemicircles(point.latitude),
    positionLong: degreesToSemicircles(point.longitude),
    altitude: point.altitude,
    distance: point.distance,
    speed: point.speed,
    heartRate: point.heartRate,
    cadence: point.cadence,
    power: point.power,
  });
}

const fitBytes: Uint8Array = encoder.close();
```

经纬度需要从角度转换为 FIT semicircles：

```ts
function degreesToSemicircles(degrees: number): number {
  return Math.round(degrees * (2 ** 31 / 180));
}
```

浏览器下载：

```ts
const blob = new Blob([fitBytes], { type: "application/octet-stream" });
const url = URL.createObjectURL(blob);
const anchor = document.createElement("a");
anchor.href = url;
anchor.download = "activity.fit";
anchor.click();
URL.revokeObjectURL(url);
```

上面只展示 SDK 的调用方式，不是完整 Activity 文件。正式实现还需要按 FIT Activity 规范写入：

```text
file_id
event(start)
record × N
event(stop)
lap
session
activity
```

其中 `lap`、`session` 和 `activity` 要填写开始时间、总耗时、运动时间、距离和运动类型等汇总字段。字段名使用 camelCase；`encoder.close()` 返回包含 FIT 文件头和 CRC 的 `Uint8Array`。

测试时再使用同一个 SDK 的 `Decoder` 和 `Stream` 读回生成结果，并检查：

```ts
import { Decoder, Stream } from "@garmin/fitsdk";

const stream = Stream.fromByteArray([...fitBytes]);
const decoder = new Decoder(stream);

if (!decoder.isFIT() || !decoder.checkIntegrity()) {
  throw new Error("生成的 FIT 文件无效");
}

const { messages, errors } = decoder.read();
```

单元测试至少验证无解码错误、record 数量、首末时间、总距离和坐标。最终还应把文件导入一个实际使用方验证，因为“CRC 正确”不代表 Activity 消息语义一定完整。

## 项目结构

```text
src/
├─ main.ts              # 页面入口和按钮挂载
├─ api.ts               # 五个 API 的类型与请求函数
├─ types.ts             # 接口数据类型
├─ normalize.ts         # stream 转统一采样点
├─ fit.ts               # FIT 编码
└─ download.ts          # Blob 下载

tests/
├─ normalize.test.ts
└─ fit.test.ts
```

浏览器相关代码集中在 `main.ts`，API 数据转换和 FIT 编码保持为普通 TypeScript 函数，便于像测试 C++ 库一样独立测试。

## Node / TypeScript 开发流程

本机已有 nvm、Node 和 npm。建议固定 Node 22 LTS：

```powershell
nvm install 22
nvm use 22
```

项目初始化：

```powershell
npm init -y
npm install @garmin/fitsdk
npm install -D typescript vite vite-plugin-monkey vitest
```

建议脚本：

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  }
}
```

日常流程：

1. `npm run dev` 启动 Vite；
2. 在 Tampermonkey 中安装 Vite 生成的开发脚本；
3. 打开行者轨迹详情页，通过 DevTools Console 和 Network 调试；
4. 纯数据转换运行 `npm test`；
5. 发布前运行 `npm run typecheck` 和 `npm run build`；
6. 向用户发布 `dist` 中的 `.user.js`。

可以把它类比为：npm 管依赖，Vite 类似构建系统，TypeScript 编译器负责静态检查，Vitest 类似单元测试框架，Tampermonkey 是最终运行宿主。

## 开发顺序

1. 初始化 TypeScript + Vite + `vite-plugin-monkey`；
2. 在详情页稳定解析 workout id 并显示按钮；
3. 定义详情和 stream 的 TypeScript 类型；
4. 将 `stream` 归一化为统一的采样点数组；
5. 先导出 JSON，验证坐标、时间和字段对应关系；
6. 接入 FIT 编码并用其他软件验证；
7. 完成错误处理后发布单轨迹版本；
8. 最后再设计批量分页和限速队列。

## 数据样例

`data/` 中的 JSON 用于理解接口和编写测试。提交仓库前应确认其中不包含需要隐藏的账号信息、精确家庭位置或其他隐私数据。
