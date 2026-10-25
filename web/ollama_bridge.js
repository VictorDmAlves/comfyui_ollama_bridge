import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

// Only affects the single Ollama node; no global UI patches.
const NODE_TYPE = "OllamaLocalChat";

function widgetByName(node, name) {
    return node.widgets?.find((widget) => widget.name === name);
}

async function refreshModels(node, button, force = false) {
    const modelWidget = widgetByName(node, "model");
    const urlWidget = widgetByName(node, "ollama_url");
    if (!modelWidget || !urlWidget) return;

    const requestId = (node._ollamaBridgeRequestId ?? 0) + 1;
    node._ollamaBridgeRequestId = requestId;
    button.options ??= {};
    button.options.tooltip = "Refreshing installed Ollama models...";
    node.setDirtyCanvas?.(true, true);
    try {
        const query = new URLSearchParams({
            url: String(urlWidget.value || "http://localhost:11434"),
            force: force ? "1" : "0",
        });
        const requestedUrl = String(urlWidget.value || "http://localhost:11434");
        const response = await api.fetchApi(`/ollama_bridge/models?${query.toString()}`);
        const data = await response.json();
        if (node._ollamaBridgeRequestId !== requestId) return;
        if (!response.ok || !Array.isArray(data.models)) {
            throw new Error(data.error || `HTTP ${response.status}`);
        }
        if (data.models.length === 0) {
            button.options.tooltip = "Ollama is running but no models are installed.";
            // Keep any previously loaded model value in an existing workflow.
            return;
        }

        const choices = [...new Set(data.models)].sort((a, b) => a.localeCompare(b));
        const currentUrl = String(urlWidget.value || "http://localhost:11434");
        if (currentUrl !== requestedUrl) {
            button.options.tooltip = "Ollama URL changed. Click Refresh Models to update.";
            return;
        }
        const current = modelWidget.value;
        modelWidget.options ??= {};
        modelWidget.options.values = choices;
        if (!choices.includes(current)) {
            modelWidget.value = choices[0];
            modelWidget.callback?.(modelWidget.value);
        }
        button.options.tooltip = `${choices.length} Ollama model(s) loaded. Click to refresh.`;
    } catch (error) {
        if (node._ollamaBridgeRequestId !== requestId) return;
        button.options.tooltip = `Refresh failed: ${error.message || error}`;
        console.warn("[Ollama Bridge] Model refresh failed:", error);
        // The browser console contains the details; keep the prior model list.
    } finally {
        if (node._ollamaBridgeRequestId === requestId) {
            node.setDirtyCanvas?.(true, true);
        }
    }
}

app.registerExtension({
    name: "OllamaBridge.LocalChatUI",
    async nodeCreated(node) {
        if (node.comfyClass !== NODE_TYPE) return;
        node.color = "#26384c";
        node.bgcolor = "#192734";
        const startingSize = node.size ?? [0, 0];
        if (node.setSize) {
            node.setSize([Math.max(startingSize[0], 380), startingSize[1]]);
        }

        // Put the button immediately under the model dropdown, not at the bottom.
        let button;
        button = node.addWidget(
            "button", "Refresh Models", null,
            () => void refreshModels(node, button, true),
            { serialize: false },
        );
        const modelIndex = node.widgets?.findIndex((w) => w.name === "model") ?? -1;
        const buttonIndex = node.widgets?.indexOf(button) ?? -1;
        if (modelIndex >= 0 && buttonIndex >= 0 && buttonIndex !== modelIndex + 1) {
            node.widgets.splice(buttonIndex, 1);
            node.widgets.splice(modelIndex + 1, 0, button);
        }
        const dimensions = node.computeSize?.();
        if (dimensions) {
            const size = node.size ?? startingSize;
            node.setSize?.([Math.max(size[0], dimensions[0], 380), Math.max(size[1], dimensions[1])]);
        }
        // Fetch the latest models when opening or adding the node. The explicit
        // button always bypasses the short server-side cache.
        void refreshModels(node, button, false);
    },
});
