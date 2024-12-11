// Copyright 2024, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { Atom } from 'jotai';
import { BlockNodeModel } from '@/app/block/blocktypes';

export interface WaveObj {
    type: string;
    id: string;
    otype: string;
    oid: string;
    version: number;
    meta?: {
        tabId?: string;
        icon?: string;
        edit?: boolean;
        url?: string;
        pinnedurl?: string;
    };
    output?: string;
    content?: string;
    cwd?: string;
    language?: string;
    filename?: string;
}

export interface Block extends WaveObj {
    type: 'term' | 'web' | 'preview';
    model?: BlockNodeModel;
}

export interface ViewModel {
    viewType: string;
    blockId: string;
    blockAtom: Atom<Block>;
}
