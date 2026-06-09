(function () {
    "use strict";

    /**
     * Base64 helpers for browser content script.
     */
    function base64EncodeBytes(bytes) {
        let binary = "";
        for (const byte of bytes) binary += String.fromCharCode(byte);
        return btoa(binary);
    }

    function base64DecodeToBytes(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes;
    }

    function b64EncodeUnicode(str) {
        const bytes = new TextEncoder().encode(str);
        return base64EncodeBytes(bytes);
    }

    function b64DecodeUnicode(str) {
        const bytes = base64DecodeToBytes(str);
        return new TextDecoder().decode(bytes);
    }

    function isBase64Unicode(str) {
        // A Base64 string should only include A-Z, a-z, 0-9, +, /, =
        const base64Regex = /^[\w\+\/=]+$/;
        if (!base64Regex.test(str)) return false;

        // keep the original heuristic: too short is unlikely to be our encoded payload
        if (str.length < 32) return false;

        try {
            const bytes = base64DecodeToBytes(str);

            // Decoded bytes should represent a valid UTF-8 sequence.
            // Keep `fatal: false` to preserve previous behavior on malformed input.
            const decoder = new TextDecoder("utf-8");
            decoder.decode(bytes);

            return true;
        } catch (e) {
            return false;
        }
    }

    // Get a query parameter value from a raw "key=value" segment.
    function getUriComponent(segment, name) {
        const idx = segment.indexOf("=");
        if (idx === -1) return;

        const key = segment.substring(0, idx);
        const val = segment.substring(idx + 1);

        if (!key || !val) return;

        if (key === name) {
            return val;
        }
    }

    // Parse prompt safely from hash segments, including malformed cases.
    function flexiblePromptDetection(hash, locationSearch) {
        let prompt = "";
        const knownParamKeys = new Set([
            "prompt",
            "autoSubmit",
            "think",
            "extendedthink",
            "debugModel",
        ]);
        const segments = (hash || "").split("&");
        const promptIndex = segments.findIndex(segment => segment.startsWith("prompt="));
        if (promptIndex === -1) return null;

        const firstPromptSegment = segments[promptIndex];
        prompt = firstPromptSegment.substring("prompt=".length);

        // If prompt was encoded with encodeURI, `&` may remain unescaped.
        // Re-join subsequent segments until a known key is encountered.
        for (let i = promptIndex + 1; i < segments.length; i++) {
            const segment = segments[i];
            if (!segment) continue;

            const eqIndex = segment.indexOf("=");
            if (eqIndex > 0) {
                const key = segment.substring(0, eqIndex);
                if (knownParamKeys.has(key)) {
                    break;
                }
            }

            prompt += `&${segment}`;
        }

        if (!prompt) return null;

        // Chrome site search may use encodeURI when no query string exists.
        // Escape URI-reserved characters explicitly for consistent decoding.
        if (locationSearch === "") {
            prompt = prompt
                .replace(/\;/g, "%3B")
                .replace(/\//g, "%2F")
                .replace(/\?/g, "%3F")
                .replace(/\:/g, "%3A")
                .replace(/\@/g, "%40")
                .replace(/\&/g, "%26")
                .replace(/\=/g, "%3D")
                .replace(/\+/g, "%2B")
                .replace(/\$/g, "%24")
                .replace(/\#/g, "%23");
        }

        // Normalize any plus sign to space encoding.
        prompt = prompt.replace(/\+/g, "%20");

        prompt = decodeURIComponent(prompt);

        // Normalize whitespace and excessive newlines.
        prompt = prompt.replace(/\r/g, "").replace(/\n{3,}/sg, "\n\n").replace(/^\s+/sg, "");

        if (!prompt) return null;

        return prompt;
    }

    /**
     * Parse the extension hash parameters used by this content script.
     *
     * Important behavior notes (kept intentionally):
     * - `flexiblePromptDetection(hash)` can override `URLSearchParams.get('prompt')` even when hash is ill-formed.
     * - If `prompt` looks like Base64Unicode, we decode it *after* flexible prompt parsing, and we do not re-normalize.
     */
    function parseToolkitHash(hash, locationSearch) {
        const qs = new URLSearchParams(hash);

        let prompt = qs.get("prompt");
        const autoSubmit = qs.get("autoSubmit") === "1" || qs.get("autoSubmit") === "true";
        const thinkSpecified = qs.has("think");
        const extendedThinkSpecified = qs.has("extendedthink");
        const think = thinkSpecified && (qs.get("think") === "1" || (qs.get("think") || "").toLowerCase() === "true");
        const extendedThink = extendedThinkSpecified && (qs.get("extendedthink") === "1" || (qs.get("extendedthink") || "").toLowerCase() === "true");
        const debugModelSpecified = qs.has("debugModel");
        const debugModel = debugModelSpecified && (qs.get("debugModel") === "1" || (qs.get("debugModel") || "").toLowerCase() === "true");

        // Apply robust prompt parsing for malformed hash payloads.
        prompt = flexiblePromptDetection(hash, locationSearch) || prompt;

        // Decode prompt if it looks like Base64Unicode.
        if (!!prompt && isBase64Unicode(prompt)) {
            prompt = b64DecodeUnicode(prompt);
        }

        let modelIntent = "keep";
        if (extendedThink) {
            // Highest priority: extended thinking.
            modelIntent = "thinking_extended";
        } else if (thinkSpecified && !think) {
            // Explicit think=0/false means Instant.
            modelIntent = "instant";
        } else if (think) {
            // think=1 (without extendedthink=1) means default Thinking.
            modelIntent = "thinking_default";
        }

        return {
            prompt,
            autoSubmit,
            think,
            thinkSpecified,
            extendedThink,
            extendedThinkSpecified,
            debugModel,
            debugModelSpecified,
            modelIntent,
        };
    }

    const root = typeof globalThis !== "undefined" ? globalThis : window;
    root.ChatGPTToolkitContentUtils = {
        b64EncodeUnicode,
        b64DecodeUnicode,
        isBase64Unicode,
        getUriComponent,
        flexiblePromptDetection,
        parseToolkitHash,
    };
})();
