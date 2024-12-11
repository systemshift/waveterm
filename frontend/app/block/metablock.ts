// Copyright 2024, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { BlockNodeModel, TerminalBlockModel } from "'app/block/blocktypes"' (see below for file content);
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { ClientConfig } from "@modelcontextprotocol/sdk/client/index.js";
import { atom, Atom } from "jotai";
import { atoms, globalStore, WOS } from "../../../app/store/global";
import type { MCPCommand, MCPResponse, MCPResource } from "../../types/mcp";
import type { Block, WaveObj, ViewModel } from "../../types/wave";
import type { IconButtonDecl } from "../../types/icons";

interface BlockContext {
    type: string;
    id: string;
    content: string;
    [key: string]: any;
}

interface TerminalContext extends BlockContext {
    type: 'terminal';
    workingDirectory: string;
}

interface EditorContext extends BlockContext {
    type: 'editor';
    language: string;
    filename?: string;
}

interface BrowserContext extends BlockContext {
    type: 'browser';
    url: string;
}

type AnyBlockContext = TerminalContext | EditorContext | BrowserContext;

export class MetaBlockModel implements ViewModel {
    viewType: string;
    blockId: string;
    blockAtom: Atom<Block>;
    viewIcon: Atom<string | IconButtonDecl>;
    viewName: Atom<string>;
    private mcpClient: Client | null = null;
    private _isActive: boolean = false;
    private _observedBlocks: Set<string> = new Set();
    private _messages: string[] = [];
    private _errors: string[] = [];
    private _maxMessageHistory: number = 50;

    constructor(blockId: string) {
        this.viewType = "metablock";
        this.blockId = blockId;
        this.blockAtom = WOS.getWaveObjectAtom<WaveObj>(`block:${blockId}`) as Atom<Block>;
        this.viewIcon = atom("brain");
        this.viewName = atom("Meta Block");
    }

    get isActive(): boolean {
        return this._isActive;
    }

    get observedBlockCount(): number {
        return this._observedBlocks.size;
    }

    get messages(): string[] {
        return [...this._messages];
    }

    get errors(): string[] {
        return [...this._errors];
    }

    async initialize() {
        if (this.mcpClient) return;

        const config: ClientConfig = {
            name: "wave-meta-block",
            version: "1.0.0",
            resources: { subscribe: true },
            sampling: {}
        };

        this.mcpClient = new Client(config);

        try {
            await this.registerBlockTypes();
            this.addStatusMessage('Meta block initialized');
        } catch (error) {
            console.error('Failed to initialize meta block:', error);
            this.addErrorMessage('Failed to initialize meta block');
        }
    }

    private async registerBlockTypes() {
        const types = ['term', 'web', 'preview'];
        for (const type of types) {
            try {
                await this.client.register(
                    {
                        type: `wave-block-${type}`,
                        description: `A Wave Terminal ${type} block`,
                        schema: {
                            type: 'object',
                            properties: {
                                content: { type: 'string' },
                                metadata: { type: 'object' }
                            }
                        }
                    }
                );
            } catch (error) {
                console.error(`Failed to register block type ${type}:`, error);
                this.addErrorMessage(`Failed to register ${type} block type`);
            }
        }
    }

    async toggleMonitoring(): Promise<void> {
        this._isActive = !this._isActive;
        if (this._isActive) {
            await this.startMonitoring();
        } else {
            await this.stopMonitoring();
        }
    }

    private async startMonitoring(): Promise<void> {
        try {
            const tabBlocks = await this.getTabBlocks();
            for (const blockId of tabBlocks) {
                await this.observeBlock(blockId);
            }
            this._isActive = true;
            this.addStatusMessage('Started monitoring blocks');
        } catch (error) {
            this.addErrorMessage(`Failed to start monitoring: ${error.message}`);
            throw error;
        }
    }

    private async stopMonitoring(): Promise<void> {
        try {
            for (const blockId of this._observedBlocks) {
                await this.unsubscribeBlock(blockId);
            }
            this._observedBlocks.clear();
            this.addStatusMessage('Monitoring stopped');
        } catch (error) {
            this.addErrorMessage(`Failed to stop monitoring: ${error.message}`);
        }
    }

    private async getTabBlocks(): Promise<string[]> {
        const blockData = globalStore.get(this.blockAtom) as Block;
        if (!blockData?.meta?.tabId) {
            return [];
        }

        const tabId = blockData.meta.tabId;
        const allBlocks = WOS.getAllBlocks();

        return Object.entries(allBlocks)
            .filter(([_, block]: [string, Block]) =>
                block?.meta?.tabId === tabId &&
                block.id !== this.blockId &&
                ['term', 'web', 'preview'].includes(block.type)
            )
            .map(([id]) => id);
    }

    private async unsubscribeBlock(blockId: string): Promise<void> {
        if (!this.mcpClient) return;

        try {
            await this.mcpClient.request(
                {
                    method: 'resources/unsubscribe',
                    params: { uri: `wave-block://${blockId}` }
                },
                SubscribeRequestSchema
            );
        } catch (error) {
            console.error(`Failed to unsubscribe from block ${blockId}:`, error);
        }
    }

    async observeBlock(blockId: string) {
        if (!this.mcpClient) return;

        try {
            await this.mcpClient.request(
                {
                    method: "resources/subscribe",
                    params: {
                        uri: `wave-block://${blockId}`
                    }
                },
                SubscribeRequestSchema
            );
        } catch (error) {
            console.error(`Failed to observe block ${blockId}:`, error);
        }
    }

    async getRelevantContext() {
        if (!this.mcpClient) return null;

        const contexts: AnyBlockContext[] = [];
        for (const blockId of this._observedBlocks) {
            try {
                const blockContext = await this.getBlockContext(blockId);
                if (blockContext) {
                    contexts.push(blockContext);
                }
            } catch (error) {
                this.addErrorMessage(`Failed to get context for block ${blockId}: ${error.message}`);
            }
        }

        return contexts;
    }

    private async getBlockContext(blockId: string): Promise<MCPResource | null> {
        const blockData = globalStore.get(WOS.getWaveObjectAtom<Block>(`block:${blockId}`)) as Block;
        if (!blockData) {
            throw new Error('Block data not found');
        }

        switch (blockData.type) {
            case 'term':
                return {
                    type: 'terminal',
                    content: blockData.output || '',
                    metadata: {
                        cwd: blockData.cwd || ''
                    }
                };
            case 'web':
                return {
                    type: 'browser',
                    content: blockData.content || '',
                    metadata: {
                        url: blockData.meta?.url || ''
                    }
                };
            case 'preview':
                return {
                    type: 'editor',
                    content: blockData.content || '',
                    metadata: {
                        language: blockData.language || '',
                        filename: blockData.filename || ''
                    }
                };
            default:
                return null;
        }
    }

    private async analyzeContext(query: string): Promise<MCPResponse> {
        if (!this.mcpClient) {
            throw new Error('MCP client not initialized');
        }

        const contexts = await this.getRelevantContext();
        if (!contexts.length) {
            throw new Error('No block contexts available');
        }

        try {
            const result = await this.mcpClient.request(
                {
                    method: 'messages/create',
                    params: {
                        content: query,
                        resources: contexts
                    }
                },
                {} // Empty schema for now
            );

            return result as MCPResponse;
        } catch (error) {
            throw new Error(`Failed to analyze context: ${error.message}`);
        }
    }

    private async handleLLMResponse(response: any) {
        if (!response?.commands) return;

        for (const command of response.commands) {
            try {
                await this.executeCommand(command);
            } catch (error) {
                this.addErrorMessage(`Failed to execute command: ${error.message}`);
            }
        }
    }

    private async executeCommand(command: MCPCommand) {
        if (!this._observedBlocks.has(command.targetBlock)) {
            throw new Error('Target block is not being monitored');
        }

        // Validate command before execution
        if (!this.validateCommand(command)) {
            throw new Error('Invalid or potentially harmful command');
        }

        // Request user consent before execution
        if (!await this.requestUserConsent(command)) {
            throw new Error('Command execution denied by user');
        }

        const blockData = globalStore.get(WOS.getWaveObjectAtom<WaveObj>(`block:${command.targetBlock}`));
        if (!blockData) {
            throw new Error('Block data not found');
        }

        switch (blockData.type) {
            case 'term':
                await this.executeTerminalCommand(command);
                break;
            case 'web':
                await this.executeBrowserCommand(command);
                break;
            case 'preview':
                await this.executeEditorCommand(command);
                break;
            default:
                throw new Error(`Unsupported block type: ${blockData.type}`);
        }
    }

    private validateCommand(command: MCPCommand): boolean {
        if (!command.type || !command.action || !command.targetBlock) {
            return false;
        }

        const riskyPatterns = [
            /rm\s+-rf/,
            />(>?)\s*\//,
            /chmod\s+777/,
            /eval\(/,
            /sudo/,
        ];

        if (typeof command.payload === 'string' &&
            riskyPatterns.some(pattern => pattern.test(command.payload))) {
            return false;
        }

        return true;
    }

    private async requestUserConsent(command: MCPCommand): Promise<boolean> {
        const riskLevel = command.metadata?.risk || 'medium';
        const description = command.metadata?.description || 'Execute command';

        return window.confirm(
            `Allow command: ${description}\n` +
            `Risk Level: ${riskLevel}\n` +
            `Target: ${command.targetBlock}\n` +
            `Action: ${command.action}`
        );
    }

    private async executeTerminalCommand(command: MCPCommand) {
        const blockData = globalStore.get(WOS.getWaveObjectAtom<Block>(`block:${command.targetBlock}`));
        if (!blockData || blockData.type !== 'term') {
            throw new Error('Invalid terminal block');
        }

        const model = blockData.model as TerminalBlockModel;
        if (!model || typeof model.sendInput !== 'function') {
            throw new Error('Terminal model not found or invalid');
        }

        const input = command.payload as string;
        await model.sendInput(input);
        this.addStatusMessage(`Executed command in terminal ${command.targetBlock}: ${input}`);
    }

    private async executeBrowserCommand(command: MCPCommand) {
        const blockData = globalStore.get(WOS.getWaveObjectAtom<Block>(`block:${command.targetBlock}`));
        if (!blockData || blockData.type !== 'web') {
            throw new Error('Invalid browser block');
        }

        const action = command.payload as { type: string; url?: string; input?: string };
        switch (action.type) {
            case 'navigate':
                this.addStatusMessage(`Browser navigation requested: ${action.url}`);
                break;
            case 'input':
                this.addStatusMessage(`Browser input requested: ${action.input}`);
                break;
            default:
                throw new Error(`Unsupported browser action: ${action.type}`);
        }
    }

    private async executeEditorCommand(command: MCPCommand) {
        const blockData = globalStore.get(WOS.getWaveObjectAtom<Block>(`block:${command.targetBlock}`));
        if (!blockData || blockData.type !== 'preview') {
            throw new Error('Invalid editor block');
        }

        const action = command.payload as { type: string; content?: string; file?: string };
        switch (action.type) {
            case 'update':
                this.addStatusMessage(`Editor update requested: ${action.content?.substring(0, 50)}...`);
                break;
            case 'open':
                this.addStatusMessage(`Editor file open requested: ${action.file}`);
                break;
            default:
                throw new Error(`Unsupported editor action: ${action.type}`);
        }
    }

    private addStatusMessage(message: string): void {
        this._messages = [message, ...this._messages].slice(0, this._maxMessageHistory);
        console.log(`[MetaBlock] Status: ${message}`);
        this.emit('statusMessage', message);
        this.logAction('status', { message });
    }

    private addErrorMessage(message: string): void {
        this._errors = [message, ...this._errors].slice(0, this._maxMessageHistory);
        console.error(`[MetaBlock] Error: ${message}`);
        this.emit('errorMessage', message);
        this.logAction('error', { message });
    }

    private emit(event: string, data: any): void {
        const customEvent = new CustomEvent(event, { detail: data });
        window.dispatchEvent(customEvent);
    }

    private logAction(action: string, details: any): void {
        const timestamp = new Date().toISOString();
        console.log(`[MetaBlock] ${timestamp} - ${action}:`, details);
    }

    private async handleError(error: Error, context: string): Promise<void> {
        const errorMessage = `Error in ${context}: ${error.message}`;
        this.addErrorMessage(errorMessage);
        this.logAction('error', { context, error: error.message });
    }

    dispose() {
        this.stopMonitoring();
        this.mcpClient = null;
    }
}

export function makeMetaBlockModel(blockId: string): MetaBlockModel {
    return new MetaBlockModel(blockId);
}
