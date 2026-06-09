# ChatGPT-URL-Extension

[![English README](https://img.shields.io/badge/README-English-blue)](./README.md)

`ChatGPT-URL-Extension` 是一个专门服务于 ChatGPT 的浏览器扩展，核心目标只有一个：  
**通过 URL hash 参数让你在浏览器地址栏里就可以异步发起不同类型的 ChatGPT 对话请求**。

如你可以直接在 Chrome 的自定义搜索引擎里配置 ChatGPT 为 `https://chatgpt.com/#autoSubmit=1&extendedthink=1&prompt=%s` 来快速发起extended thinking对话。而配置一个 ChatGPT-Instant 来使用 `think=0` 快速发起简单的instant对话。

## 支持范围

- 支持网站：`https://chatgpt.com/*`（兼容旧域名 `https://chat.openai.com/*`）

## 主要能力

- 从 URL hash 自动填充 Prompt
- 可选自动提交（`autoSubmit`）
- 通过 hash 控制模型偏好（`think`、`extendedthink`）
- 可选模型调试日志（`debugModel`）

## Hash 参数

| 参数 | 可选值 | 说明 |
|---|---|---|
| `prompt` | 任意字符串 | 自动填入 ChatGPT 输入框的提示词 |
| `autoSubmit` | `1` / `true` | 完成填充/切模后自动点击发送 |
| `think` | `1` / `true` / `0` / `false` | Thinking 模型偏好参数 |
| `extendedthink` | `1` / `true` / `0` / `false` | Extended Thinking 偏好参数 |
| `debugModel` | `1` / `true` | 在控制台输出模型流程日志 |

## 模型决策规则

当前规则：

1. `extendedthink=1`：强制 **Thinking + Extended**
2. 否则若 `think=0`：强制 **Instant**
3. 否则若 `think=1`：强制 **Thinking + 普通思考**
4. 否则：不强制切模型，保持当前/默认模型

## 调试方式

在 ChatGPT 页面打开 DevTools Console，过滤：

- `[ChatGPTToolkit][model]`
- `[ChatGPTToolkit][model][trace]`（`debugModel=1` 时）

## Ref

Forked from [doggy8088/ChatGPTToolkit](https://github.com/doggy8088/ChatGPTToolkitExtension)
