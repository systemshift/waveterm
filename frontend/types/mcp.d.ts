// Copyright 2024, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

interface MCPCommand {
    type: string;
    targetBlock: string;
    action: string;
    payload: any;
    metadata?: {
        description?: string;
        risk?: 'low' | 'medium' | 'high';
    };
}

interface MCPResponse {
    commands?: MCPCommand[];
    error?: string;
}

interface MCPResource {
    type: string;
    content: string;
    metadata?: {
        [key: string]: any;
    };
}

export type { MCPCommand, MCPResponse, MCPResource };
