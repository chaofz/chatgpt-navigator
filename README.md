# ChatGPT Navigator

A Chrome extension that adds a navigation sidebar to ChatGPT conversations, allowing you to quickly jump to any question or response in your chat.

## Features

- **Right-side navigation sidebar** - Fixed position sidebar that stays visible while scrolling
- **Nested outline structure** - Questions with responses nested underneath
- **Quick navigation** - Click any outline item to smoothly scroll to that message
- **Auto-updates** - Outline automatically refreshes as new messages are added
- **Minimal design** - Matches ChatGPT's aesthetic with support for light and dark modes
- **Toggle visibility** - Show/hide the sidebar with a button

## Installation

### From Source

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" (toggle in the top right)
4. Click "Load unpacked"
5. Select the `chatgpt-navigator` folder
6. The extension should now be active on ChatGPT pages

## Usage

1. Navigate to [ChatGPT](https://chat.openai.com)
2. Start or open a conversation
3. The navigation sidebar will appear on the right side of the page
4. Click any question or response in the outline to jump to that message
5. Use the × button in the sidebar header to hide it
6. Click the toggle button (appears when sidebar is hidden) to show it again

## How It Works

The extension:
- Observes the ChatGPT page DOM to detect messages
- Identifies user questions and assistant responses
- Builds a nested outline structure
- Provides smooth scrolling navigation when clicking outline items
- Automatically updates as new messages are added to the conversation

## File Structure

```
chatgpt-navigator/
├── manifest.json          # Extension manifest (Manifest V3)
├── content/
│   ├── content.js         # Main content script entry point
│   ├── sidebar.js         # Sidebar logic and ChatGPTNavigator class
│   └── sidebar.css        # Sidebar styling
└── README.md              # This file
```

## Development

The extension uses:
- **Manifest V3** - Latest Chrome extension format
- **Content Scripts** - Injected into ChatGPT pages
- **MutationObserver** - Watches for DOM changes to update outline
- **Vanilla JavaScript** - No external dependencies

## Browser Compatibility

- Chrome (Manifest V3 support required)
- Other Chromium-based browsers (Edge, Brave, etc.)

## Notes

- The extension works by analyzing the ChatGPT DOM structure
- If ChatGPT updates their UI significantly, the message detection may need adjustment
- The extension activates on both `chat.openai.com` and `chatgpt.com` domains

## Debugging

Errors are logged to the browser console. To view them:

1. Open ChatGPT in Chrome
2. Press `F12` or right-click and select "Inspect"
3. Go to the "Console" tab
4. Look for messages prefixed with `[ChatGPT Navigator]`

Common issues:
- **"No messages found"**: ChatGPT's DOM structure may have changed. Check the console for detailed error messages.
- **Sidebar not appearing**: Check the console for initialization errors.
- **Messages not updating**: The DOM observer may not be detecting changes. Check console for observer-related errors.

## License

MIT
