Tetris.AI
============

In this version of Tetris, the player has a 'hold place', which make it possible to put away one block to that place then take back that block when necessary.
Tetris with 'hold place' is much simpler than Tetris without it.

## ✨ 新增功能: AI 视觉闭环自动玩游戏

通过豆包多模态大模型（doubao-seed-evolving）实现 AI 自动玩俄罗斯方块的完整闭环。

### 工作原理

1. 每次方块落下结算后，自动截图游戏画面
2. 将截图发送到后端 Cloudflare Worker
3. 后端调用豆包多模态大模型分析游戏状态
4. AI 返回最优操作序列（移动、旋转、落下）
5. 前端执行操作序列，方块落下后再次截图
6. 如此循环，形成 AI 自动玩游戏的闭环

### 前端功能

- 页面加载后自动启动 AI 模式
- 方块锁定（落下结算）后自动触发截图
- 截图包含完整游戏画面（游戏区、下一个方块、暂存区）
- 接收 AI 返回的操作序列并自动执行
- 支持的操作：left（左移）、right（右移）、rotate（旋转）、drop（硬降）

### 后端 API (Cloudflare Worker)

#### `POST /api/screenshot`

接收游戏截图，调用豆包 AI 分析，返回操作序列。

#### `GET /`

健康检查接口，返回服务状态和可用端点。

**请求体:**
```json
{
  "image": "data:image/png;base64,...",
  "timestamp": 1234567890,
  "blocksDropped": 42,
  "totalLines": 10,
  "linesSingle": 5,
  "linesDouble": 2,
  "linesTriple": 1,
  "linesQuadro": 0,
  "hold": "i",
  "nextBlock": "t"
}
```

**响应体:**
```json
{
  "success": true,
  "message": "AI analysis complete",
  "data": {
    "timestamp": 1234567890,
    "blocksDropped": 42,
    "totalLines": 10
  },
  "ai": {
    "thought": "当前方块是I型，右侧有一个4格深的洞，适合放I型方块消四行",
    "actions": ["rotate", "right", "right", "right", "right", "drop"]
  }
}
```

### 配置

API Key 配置（二选一）：
1. **推荐**：在 Cloudflare Dashboard 中为 Worker 设置环境变量 `DOUBAO_API_KEY`
2. 直接修改 `src/work.js` 中的默认 API Key

### 部署到 Cloudflare Workers

**前置条件：** 已安装 Wrangler CLI 并登录 Cloudflare 账号

```bash
# 安装依赖（如果需要）
# npm install

# 本地开发调试
npx wrangler dev

# 部署到生产环境
npx wrangler deploy
```

**部署步骤：**
1. 在 `wrangler.jsonc` 中修改项目名称等配置
2. 在 Cloudflare Dashboard 中为 Worker 设置环境变量 `DOUBAO_API_KEY`
3. 运行 `npx wrangler deploy` 部署
4. 部署成功后，将前端 `index.html` 中的 API 地址修改为 Worker 的实际地址

**前端部署：**
- 前端 `index.html` 可以部署到任何静态托管服务（Cloudflare Pages、Netlify、Vercel 等）
- 注意修改前端中的 API 地址为 Worker 的实际域名

### 目录结构
```
Tetris.AI/
├── index.html              # 游戏主页面（含 AI 闭环前端逻辑）
├── wrangler.jsonc          # Cloudflare Worker 配置文件
├── src/
│   ├── work.js             # Worker 入口文件（AI 分析后端）
│   ├── ai.coffee           # 原始内置 AI 源码 (CoffeeScript)
│   ├── state.coffee        # 游戏状态管理源码
│   ├── draw.coffee         # 绘制逻辑源码
│   ├── tetris.coffee       # 主游戏逻辑源码
│   ├── keyHandler.coffee   # 键盘事件处理源码
│   ├── cache.coffee        # 缓存
│   ├── achievements.coffee # 成就系统
│   ├── settings.coffee     # 设置
│   ├── output1.html        # 输出模板1
│   └── output2.html        # 输出模板2
├── lib/                    # 依赖库
│   ├── jquery.min.js
│   ├── coffeescript-concat.coffee
│   └── generic.coffee
├── files/                  # 资源文件
└── README.md
```

Thanks
======
This repo forks from a very nice Tetris game by [avdg](https://github.com/avdg)

This AI bot is based on the bot in [ltris](http://lgames.sourceforge.net/index.php?project=LTris), which is a famous tetris game on Linux.  
