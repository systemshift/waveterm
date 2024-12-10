// Copyright 2024, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { Client, ClientConfig } from "@modelcontextprotocol/sdk/client/index.js";
import { 
    ResourceSchema,
    SubscribeRequestSchema,
    ReadResourceRequestSchema,
    CreateMessageRequestSchema
} from "@modelcontextprotocol/sdk/client";
import { atom, Atom } from "jotai";
import { atoms, globalStore, WOS } from "../../../app/store/global";

export class MetaBlockModel implements ViewModel {
    viewType: string;
    blockId: string;
    blockAtom: Atom<WaveObj>;
    viewIcon: Atom<string | IconButtonDecl>;
    viewName: Atom<string>;
    mcpClient: Client | null = null;
    
    constructor(blockId: string) {
        this.viewType = "metablock";
        this.blockId = blockId;
        this.blockAtom = WOS.getWaveObjectAtom<WaveObj>(`block:${blockId}`);
        this.viewIcon = atom("brain"); // Using brain icon to represent meta-block
        this.viewName = atom("Meta Block");
    }

    async initialize() {
        if (this.mcpClient) return;

        // Initialize MCP client
        const config: ClientConfig = {
            name: "wave-meta-block",
            version: "1.0.0",
            resources: { subscribe: true },
            tools: {},
            sampling: {}
        };

        this.mcpClient = new Client(config);

        try {
            // Register block types as resources
            await this.registerBlockTypes();
        } catch (error) {
            console.error("Failed to initialize MCP:", error);
        }
    }

    private async registerBlockTypes() {
        if (!this.mcpClient) return;

        // Register each block type as an MCP resource
        const blockTypes = ["term", "web", "preview", "waveai"];
        for (const type of blockTypes) {
            try {
                await this.mcpClient.request(
                    {
                        method: "resources/register",
                        params: {
                            uri: `wave-block://${type}`,
                            name: `Wave ${type} Block`,
                            description: `A Wave Terminal ${type} block`
                        }
                    },
                    ResourceSchema
                );
            } catch (error) {
                console.error(`Failed to register block type ${type}:`, error);
            }
        }
    }

    // Method to observe a block's content
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

    // Method to get relevant context from blocks
    async getRelevantContext() {
        if (!this.mcpClient) return null;

        const blockData = globalStore.get(this.blockAtom);
        if (!blockData) return null;

        // Get context from visible/active blocks
        const visibleBlocks = []; // TODO: Implement getting visible blocks
        const contexts = [];

        for (const block of visibleBlocks) {
            try {
                const result = await this.mcpClient.request(
                    {
                        method: "resources/read",
                        params: { uri: `wave-block://${block.id}` }
                    },
                    ReadResourceRequestSchema
                );
                if (result && 'contents' in result) {
                    contexts.push(result.contents[0]);
                }
            } catch (error) {
                console.error(`Failed to get context for block ${block.id}:`, error);
            }
        }

        return contexts;
    }

    // Method to analyze context and take actions
    async analyzeContext(query: string) {
        if (!this.mcpClient) return;

        const contexts = await this.getRelevantContext();
        if (!contexts) return;

        try {
            const result = await this.mcpClient.request(
                {
                    method: "sampling/createMessage",
                    params: {
                        messages: [{
                            role: "user",
                            content: {
                                type: "text",
                                text: query
                            }
                        }],
                        includeContext: "thisServer",
                        modelPreferences: {
                            intelligencePriority: 1
                        }
                    }
                },
                CreateMessageRequestSchema
            );

            // Handle the LLM response
            this.handleLLMResponse(result);
        } catch (error) {
            console.error("Failed to analyze context:", error);
        }
    }

    private handleLLMResponse(response: any) {
        // TODO: Implement handling LLM responses and taking actions
        console.log("LLM Response:", response);
    }

    dispose() {
        // Cleanup when the block is destroyed
        this.mcpClient = null;
    }
}

export function makeMetaBlockModel(blockId: string): MetaBlockModel {
    return new MetaBlockModel(blockId);
}
