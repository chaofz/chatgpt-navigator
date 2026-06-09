# ChatGPT Navigator: Sidebar & Table of Contents

Elevate your ChatGPT productivity with a professional navigation sidebar. ChatGPT Navigator automatically generates a Table of Contents for your conversations, allowing you to jump between questions and responses instantly.

## Key Features

- **🚀 Navigation Sidebar** - A fixed, floating sidebar that keeps your conversation structure always accessible.
- **📑 Automatic Outline (ToC)** - Automatically detects user questions and assistant responses to build a clickable Table of Contents.
- **🔒 Smart Scroll Lock** - Stop the page from auto-scrolling to the bottom when ChatGPT is generating a long response. Perfect for focused reading.
- **📍 Scroll Pinning** - "Pin" a specific part of the conversation and return to it instantly with a single click.
- **⚡ URL Hash Automation** - Drive ChatGPT directly from your address bar. Auto-fill prompts, auto-submit, and force specific models (Thinking/Instant) using URL parameters.
- **🎨 Adaptive Design** - Seamlessly matches ChatGPT's light and dark themes. Fully customizable in options.
- **⌨️ Keyboard Shortcuts** - Fast navigation with `Option + Arrow` keys and `Cmd/Ctrl + Enter` for submission.

## Power User: URL Parameters

Configure custom search engines in your browser to launch ChatGPT tasks instantly.

| Parameter | Values | Description |
|---|---|---|
| `prompt` | any string | Text to auto-fill into the composer |
| `autoSubmit` | `1` / `true` | Automatically click send after fill |
| `think` | `1` / `0` | Force Thinking model (1) or Instant model (0) |
| `extendedthink`| `1` / `0` | Enable/Disable Extended Thinking mode |

**Example**: `https://chatgpt.com/#autoSubmit=1&think=1&prompt=Explain+quantum+physics`

## Installation

### From Source (Developer Mode)

1. Download or clone this repository.
2. Open Chrome and go to `chrome://extensions/`.
3. Enable **"Developer mode"** (top right).
4. Click **"Load unpacked"** and select the `chatgpt-navigator` folder.

## Privacy & Security

- **No Data Collection**: Your conversation data never leaves your browser.
- **No External Dependencies**: Built with 100% vanilla JavaScript.
- **Manifest V3**: Follows the latest security standards for Chrome extensions.

## License

MIT

