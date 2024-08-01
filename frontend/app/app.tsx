// Copyright 2024, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { Workspace } from "@/app/workspace/workspace";
import { ContextMenuModel } from "@/store/contextmenu";
import { PLATFORM, WOS, atoms, globalStore, setBlockFocus } from "@/store/global";
import * as services from "@/store/services";
import * as keyutil from "@/util/keyutil";
import * as layoututil from "@/util/layoututil";
import * as util from "@/util/util";
import * as csstree from "css-tree";
import {
    deleteLayoutStateAtomForTab,
    getLayoutStateAtomForTab,
    globalLayoutTransformsMap,
} from "frontend/layout/lib/layoutAtom";
import * as jotai from "jotai";
import * as React from "react";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { CenteredDiv } from "./element/quickelems";

import { useWaveObjectValue } from "@/app/store/wos";
import { LayoutTreeActionType, LayoutTreeDeleteNodeAction } from "@/layout/index";
import { layoutTreeStateReducer } from "@/layout/lib/layoutState";
import { getWebServerEndpoint } from "@/util/endpoints";
import clsx from "clsx";
import Color from "color";
import "overlayscrollbars/overlayscrollbars.css";
import "./app.less";

const App = () => {
    let Provider = jotai.Provider;
    return (
        <Provider store={globalStore}>
            <AppInner />
        </Provider>
    );
};

function isContentEditableBeingEdited() {
    const activeElement = document.activeElement;
    return (
        activeElement &&
        activeElement.getAttribute("contenteditable") !== null &&
        activeElement.getAttribute("contenteditable") !== "false"
    );
}

function canEnablePaste() {
    const activeElement = document.activeElement;
    return activeElement.tagName === "INPUT" || activeElement.tagName === "TEXTAREA" || isContentEditableBeingEdited();
}

function canEnableCopy() {
    const sel = window.getSelection();
    return !util.isBlank(sel?.toString());
}

function canEnableCut() {
    const sel = window.getSelection();
    if (document.activeElement?.classList.contains("xterm-helper-textarea")) {
        return false;
    }
    return !util.isBlank(sel?.toString()) && canEnablePaste();
}

function handleContextMenu(e: React.MouseEvent<HTMLDivElement>) {
    e.preventDefault();
    const canPaste = canEnablePaste();
    const canCopy = canEnableCopy();
    const canCut = canEnableCut();
    if (!canPaste && !canCopy && !canCut) {
        return;
    }
    let menu: ContextMenuItem[] = [];
    if (canCut) {
        menu.push({ label: "Cut", role: "cut" });
    }
    if (canCopy) {
        menu.push({ label: "Copy", role: "copy" });
    }
    if (canPaste) {
        menu.push({ label: "Paste", role: "paste" });
    }
    ContextMenuModel.showContextMenu(menu, e);
}

function switchTab(offset: number) {
    const ws = globalStore.get(atoms.workspace);
    const activeTabId = globalStore.get(atoms.tabAtom).oid;
    let tabIdx = -1;
    for (let i = 0; i < ws.tabids.length; i++) {
        if (ws.tabids[i] == activeTabId) {
            tabIdx = i;
            break;
        }
    }
    if (tabIdx == -1) {
        return;
    }
    const newTabIdx = (tabIdx + offset + ws.tabids.length) % ws.tabids.length;
    const newActiveTabId = ws.tabids[newTabIdx];
    console.log("switching tabs", tabIdx, newTabIdx, activeTabId, newActiveTabId, ws.tabids);
    services.ObjectService.SetActiveTab(newActiveTabId);
}

const transformRegexp = /translate3d\(\s*([0-9.]+)px\s*,\s*([0-9.]+)px,\s*0\)/;

function parseFloatFromCSS(s: string | number): number {
    if (typeof s == "number") {
        return s;
    }
    return parseFloat(s);
}

function readBoundsFromTransform(fullTransform: React.CSSProperties): Bounds {
    const transformProp = fullTransform.transform;
    if (transformProp == null || fullTransform.width == null || fullTransform.height == null) {
        return null;
    }
    const m = transformRegexp.exec(transformProp);
    if (m == null) {
        return null;
    }
    return {
        x: parseFloat(m[1]),
        y: parseFloat(m[2]),
        width: parseFloatFromCSS(fullTransform.width),
        height: parseFloatFromCSS(fullTransform.height),
    };
}

function boundsMapMaxX(m: Map<string, Bounds>): number {
    let max = 0;
    for (let p of m.values()) {
        if (p.x + p.width > max) {
            max = p.x + p.width;
        }
    }
    return max;
}

function boundsMapMaxY(m: Map<string, Bounds>): number {
    let max = 0;
    for (let p of m.values()) {
        if (p.y + p.height > max) {
            max = p.y + p.height;
        }
    }
    return max;
}

function findBlockAtPoint(m: Map<string, Bounds>, p: Point): string {
    for (let [blockId, bounds] of m.entries()) {
        if (p.x >= bounds.x && p.x <= bounds.x + bounds.width && p.y >= bounds.y && p.y <= bounds.y + bounds.height) {
            return blockId;
        }
    }
    return null;
}

function switchBlock(tabId: string, offsetX: number, offsetY: number) {
    console.log("switch block", offsetX, offsetY);
    if (offsetY == 0 && offsetX == 0) {
        return;
    }
    const tabAtom = WOS.getWaveObjectAtom<Tab>(WOS.makeORef("tab", tabId));
    const transforms = globalLayoutTransformsMap.get(tabId);
    if (transforms == null) {
        return;
    }
    const layoutTreeState = globalStore.get(getLayoutStateAtomForTab(tabId, tabAtom));
    const curBlockId = globalStore.get(atoms.waveWindow)?.activeblockid;
    const curBlockLeafId = layoututil.findLeafIdFromBlockId(layoutTreeState, curBlockId);
    if (curBlockLeafId == null) {
        return;
    }
    const blockPos = readBoundsFromTransform(transforms[curBlockLeafId]);
    if (blockPos == null) {
        return;
    }
    var blockPositions: Map<string, Bounds> = new Map();
    for (let leaf of layoutTreeState.leafs) {
        if (leaf.id == curBlockLeafId) {
            continue;
        }
        const pos = readBoundsFromTransform(transforms[leaf.id]);
        if (pos != null) {
            blockPositions.set(leaf.data.blockId, pos);
        }
    }
    const maxX = boundsMapMaxX(blockPositions);
    const maxY = boundsMapMaxY(blockPositions);
    const moveAmount = 10;
    let curX = blockPos.x + 1;
    let curY = blockPos.y + 1;
    while (true) {
        curX += offsetX * moveAmount;
        curY += offsetY * moveAmount;
        if (curX < 0 || curX > maxX || curY < 0 || curY > maxY) {
            return;
        }
        const blockId = findBlockAtPoint(blockPositions, { x: curX, y: curY });
        if (blockId != null) {
            setBlockFocus(blockId);
            return;
        }
    }
}

function AppSettingsUpdater() {
    const settings = jotai.useAtomValue(atoms.settingsConfigAtom);
    React.useEffect(() => {
        const isTransparentOrBlur = (settings?.window?.transparent || settings?.window?.blur) ?? false;
        const opacity = util.boundNumber(settings?.window?.opacity ?? 0.8, 0, 1);
        let baseBgColor = settings?.window?.bgcolor;
        console.log("window settings", settings.window);
        if (isTransparentOrBlur) {
            document.body.classList.add("is-transparent");
            const rootStyles = getComputedStyle(document.documentElement);
            if (baseBgColor == null) {
                baseBgColor = rootStyles.getPropertyValue("--main-bg-color").trim();
            }
            const color = new Color(baseBgColor);
            const rgbaColor = color.alpha(opacity).string();
            document.body.style.backgroundColor = rgbaColor;
        } else {
            document.body.classList.remove("is-transparent");
            document.body.style.opacity = null;
        }
    }, [settings?.window]);
    return null;
}

function encodeFileURL(file: string) {
    const webEndpoint = getWebServerEndpoint();
    return webEndpoint + `/wave/stream-file?path=${encodeURIComponent(file)}&no404=1`;
}

(window as any).csstree = csstree;

function processBackgroundUrls(cssText: string): string {
    if (util.isBlank(cssText)) {
        return null;
    }
    cssText = cssText.trim();
    if (cssText.endsWith(";")) {
        cssText = cssText.slice(0, -1);
    }
    const attrRe = /^background(-image):\s*/;
    cssText = cssText.replace(attrRe, "");
    const ast = csstree.parse("background: " + cssText, {
        context: "declaration",
    });
    let hasJSUrl = false;
    csstree.walk(ast, {
        visit: "Url",
        enter(node) {
            const originalUrl = node.value.trim();
            if (originalUrl.startsWith("javascript:")) {
                hasJSUrl = true;
                return;
            }
            const newUrl = encodeFileURL(originalUrl);
            node.value = newUrl;
        },
    });
    if (hasJSUrl) {
        console.log("invalid background, contains a 'javascript' protocol url which is not allowed");
        return null;
    }
    const rtnStyle = csstree.generate(ast);
    if (rtnStyle == null) {
        return null;
    }
    return rtnStyle.replace(/^background:\s*/, "");
}

const backgroundAttr = "url(/Users/mike/Downloads/wave-logo_appicon.png) repeat-x fixed";

function AppBackground() {
    const tabId = jotai.useAtomValue(atoms.activeTabId);
    const [tabData] = useWaveObjectValue<Tab>(WOS.makeORef("tab", tabId));
    const bgAttr = tabData?.meta?.bg;
    const style: React.CSSProperties = {};
    if (!util.isBlank(bgAttr)) {
        try {
            const processedBg = processBackgroundUrls(bgAttr);
            if (!util.isBlank(processedBg)) {
                const opacity = util.boundNumber(tabData?.meta?.["bg:opacity"], 0, 1) ?? 0.5;
                style.opacity = opacity;
                style.background = processedBg;
                const blendMode = tabData?.meta?.["bg:blendmode"];
                if (!util.isBlank(blendMode)) {
                    style.backgroundBlendMode = blendMode;
                }
            }
        } catch (e) {
            console.error("error processing background", e);
        }
    }
    return <div className="app-background" style={style} />;
}

function genericClose(tabId: string) {
    const tabORef = WOS.makeORef("tab", tabId);
    const tabAtom = WOS.getWaveObjectAtom<Tab>(tabORef);
    const tabData = globalStore.get(tabAtom);
    if (tabData == null) {
        return;
    }
    if (tabData.blockids == null || tabData.blockids.length == 0) {
        // close tab
        services.WindowService.CloseTab(tabId);
        deleteLayoutStateAtomForTab(tabId);
        return;
    }
    // close block
    const activeBlockId = globalStore.get(atoms.waveWindow)?.activeblockid;
    if (activeBlockId == null) {
        return;
    }
    const layoutStateAtom = getLayoutStateAtomForTab(tabId, tabAtom);
    const layoutTreeState = globalStore.get(layoutStateAtom);
    const curBlockLeafId = layoututil.findLeafIdFromBlockId(layoutTreeState, activeBlockId);
    const deleteAction: LayoutTreeDeleteNodeAction = {
        type: LayoutTreeActionType.DeleteNode,
        nodeId: curBlockLeafId,
    };
    globalStore.set(layoutStateAtom, layoutTreeStateReducer(layoutTreeState, deleteAction));
    services.ObjectService.DeleteBlock(activeBlockId);
}

const AppInner = () => {
    const client = jotai.useAtomValue(atoms.client);
    const windowData = jotai.useAtomValue(atoms.waveWindow);
    const tabId = jotai.useAtomValue(atoms.activeTabId);
    if (client == null || windowData == null) {
        return (
            <div className="mainapp">
                <AppBackground />
                <CenteredDiv>invalid configuration, client or window was not loaded</CenteredDiv>
            </div>
        );
    }

    function handleKeyDown(waveEvent: WaveKeyboardEvent): boolean {
        // global key handler for now (refactor later)
        if (keyutil.checkKeyPressed(waveEvent, "Cmd:]") || keyutil.checkKeyPressed(waveEvent, "Shift:Cmd:]")) {
            switchTab(1);
            return true;
        }
        if (keyutil.checkKeyPressed(waveEvent, "Cmd:[") || keyutil.checkKeyPressed(waveEvent, "Shift:Cmd:[")) {
            switchTab(-1);
            return true;
        }
        if (keyutil.checkKeyPressed(waveEvent, "Cmd:ArrowUp")) {
            switchBlock(tabId, 0, -1);
            return true;
        }
        if (keyutil.checkKeyPressed(waveEvent, "Cmd:ArrowDown")) {
            switchBlock(tabId, 0, 1);
            return true;
        }
        if (keyutil.checkKeyPressed(waveEvent, "Cmd:ArrowLeft")) {
            switchBlock(tabId, -1, 0);
            return true;
        }
        if (keyutil.checkKeyPressed(waveEvent, "Cmd:ArrowRight")) {
            switchBlock(tabId, 1, 0);
            return true;
        }
        if (keyutil.checkKeyPressed(waveEvent, "Cmd:w")) {
            // close block, if no more blocks, close tab
            genericClose(tabId);
            return true;
        }
        return false;
    }
    React.useEffect(() => {
        const staticKeyDownHandler = keyutil.keydownWrapper(handleKeyDown);
        document.addEventListener("keydown", staticKeyDownHandler);
        return () => {
            document.removeEventListener("keydown", staticKeyDownHandler);
        };
    }, []);

    const isFullScreen = jotai.useAtomValue(atoms.isFullScreen);
    return (
        <div className={clsx("mainapp", PLATFORM, { fullscreen: isFullScreen })} onContextMenu={handleContextMenu}>
            <AppBackground />
            <AppSettingsUpdater />
            <DndProvider backend={HTML5Backend}>
                <Workspace />
            </DndProvider>
        </div>
    );
};

export { App };
