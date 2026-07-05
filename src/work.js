/**
 * Cloudflare Worker - 俄罗斯方块 AI 闭环后端
 * 
 * 功能:
 * - 接收前端发送的游戏截图
 * - 调用豆包多模态大模型分析游戏状态
 * - 返回操作序列给前端执行
 * - 形成 AI 自动玩游戏的闭环
 * 
 * 路由: POST /api/screenshot
 */

// 豆包 API 配置
const DOUBAO_API_URL = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions'
const DOUBAO_MODEL = 'doubao-seed-evolving'

// CORS 响应头
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json;charset=UTF-8',
}

/**
 * 调用豆包多模态 API 分析游戏截图
 */
async function analyzeWithDoubao(imageBase64, apiKey) {
  const prompt = `你是一个俄罗斯方块专家。请分析这张俄罗斯方块游戏截图，决定当前方块的最佳落子位置。

游戏规则：
- 游戏区域宽10格，高20格
- 当前方块从顶部落下
- 目标是消除尽可能多的行，同时避免堆到顶部
- 可以左右移动、旋转方块，然后让它落下

请仔细观察：
1. 当前正在下落的方块是什么形状和颜色
2. 游戏区域中已有的方块分布
3. 右侧预览的下一个方块是什么

请输出最优的操作序列，操作类型包括：
- "left" - 向左移动一格
- "right" - 向右移动一格  
- "rotate" - 顺时针旋转90度
- "drop" - 直接落下到底部（硬降）

操作策略建议：
- 优先考虑消除行数
- 保持盘面平整，减少空洞
- 避免在左侧或右侧堆积过高
- I型方块尽量留着消四行

请严格按照以下 JSON 格式返回，不要包含任何其他文字：
{
  "thought": "简要说明你的分析思路",
  "actions": ["rotate", "right", "right", "drop"]
}

actions 数组中的操作将按顺序执行，最后一个应该是 "drop" 让方块落下。`

  const response = await fetch(DOUBAO_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: DOUBAO_MODEL,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: prompt,
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/png;base64,${imageBase64}`,
              },
            },
          ],
        },
      ],
      temperature: 0.3,
      max_tokens: 500,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Doubao API error: ${response.status} - ${errorText}`)
  }

  const data = await response.json()
  const aiResponse = data.choices[0].message.content

  // 尝试解析 JSON
  try {
    // 有时候 AI 会在 JSON 外加 markdown 代码块，需要处理
    const jsonMatch = aiResponse.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0])
    }
    return JSON.parse(aiResponse)
  } catch (e) {
    console.warn('Failed to parse AI response as JSON:', aiResponse)
    return {
      thought: 'Failed to parse AI response',
      actions: ['drop'], // 默认直接落下
    }
  }
}

/**
 * 处理 POST /api/screenshot 请求
 */
async function handleScreenshot(request, env) {
  try {
    // 解析请求体
    const { image, timestamp, blocksDropped, totalLines, ...gameData } = await request.json()

    // 验证必要字段
    if (!image || !image.startsWith('data:image/png;base64,')) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid image data. Expected base64 encoded PNG.',
        }),
        {
          status: 400,
          headers: corsHeaders,
        }
      )
    }

    // 提取 base64 数据
    const base64Data = image.replace(/^data:image\/png;base64,/, '')

    // 获取 API Key（优先从环境变量获取，也支持直接传入）
    const apiKey = env.DOUBAO_API_KEY 

    // 调用豆包 API 分析游戏
    let aiResult
    try {
      aiResult = await analyzeWithDoubao(base64Data, apiKey)
    } catch (apiError) {
      console.error('Doubao API call failed:', apiError.message)
      // API 调用失败时，返回默认操作（直接落下），保证游戏能继续
      aiResult = {
        thought: `API error: ${apiError.message}`,
        actions: ['drop'],
      }
    }

    // 验证操作序列
    const validActions = ['left', 'right', 'rotate', 'drop']
    const actions = (aiResult.actions || []).filter(a => validActions.includes(a))

    // 确保最后有 drop 操作
    if (actions.length === 0 || actions[actions.length - 1] !== 'drop') {
      actions.push('drop')
    }

    // 返回响应
    return new Response(
      JSON.stringify({
        success: true,
        message: 'AI analysis complete',
        data: {
          timestamp: timestamp || Date.now(),
          blocksDropped,
          totalLines,
          ...gameData,
        },
        ai: {
          thought: aiResult.thought || '',
          actions: actions,
        },
      }),
      {
        status: 200,
        headers: corsHeaders,
      }
    )
  } catch (error) {
    console.error('Screenshot processing error:', error)

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Internal server error',
      }),
      {
        status: 500,
        headers: corsHeaders,
      }
    )
  }
}

/**
 * Worker 主入口
 */
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)

    // 处理 OPTIONS 预检请求
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: corsHeaders,
      })
    }

    // 路由: POST /api/screenshot
    if (request.method === 'POST' && url.pathname === '/api/screenshot') {
      return handleScreenshot(request, env)
    }

    // 根路径 - 简单的健康检查
    if (url.pathname === '/' || url.pathname === '') {
      return new Response(
        JSON.stringify({
          status: 'ok',
          service: 'Tetris AI Worker',
          endpoints: {
            'POST /api/screenshot': '接收游戏截图，返回 AI 操作序列',
          },
        }),
        {
          headers: {
            'Content-Type': 'application/json;charset=UTF-8',
            ...corsHeaders,
          },
        }
      )
    }

    // 404
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Not found',
      }),
      {
        status: 404,
        headers: corsHeaders,
      }
    )
  },
}
