// Copyright 2024, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

declare module "@modelcontextprotocol/sdk/client/index.js" {
    export interface ClientConfig {
        name: string;
        version: string;
        resources?: { subscribe?: boolean };
        tools?: Record<string, any>;
        sampling?: Record<string, any>;
    }

    export class Client {
        constructor(config: ClientConfig);
        request(request: any, schema: any): Promise<any>;
        notify(notification: any): void;
    }
}

declare module "@modelcontextprotocol/sdk/client" {
    import { z } from "zod";

    export const ResourceSchema: z.ZodType;
    export const SubscribeRequestSchema: z.ZodType;
    export const ReadResourceRequestSchema: z.ZodType;
    export const CreateMessageRequestSchema: z.ZodType;
}
