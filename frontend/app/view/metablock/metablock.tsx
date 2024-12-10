// Copyright 2024, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { useAtomValue } from "jotai";
import React, { useEffect, useRef } from "react";
import { MetaBlockModel } from "./metablock";
import "./metablock.scss";

interface MetaBlockProps {
    model: MetaBlockModel;
    blockId: string;
}

export const MetaBlock = React.memo(({ model, blockId }: MetaBlockProps) => {
    const metaBlockRef = useRef<HTMLDivElement>(null);
    const viewName = useAtomValue(model.viewName);

    useEffect(() => {
        // Initialize meta-block
        const init = async () => {
            try {
                await model.initialize();
            } catch (error) {
                console.error("Failed to initialize meta-block:", error);
            }
        };
        init();

        // Cleanup on unmount
        return () => {
            model.dispose();
        };
    }, []);

    return (
        <div ref={metaBlockRef} className="metablock">
            <div className="metablock-content">
                <div className="metablock-header">
                    <i className="fa-solid fa-brain"></i>
                    <h3>{viewName}</h3>
                </div>
                <div className="metablock-status">
                    <div className="status-item">
                        <span className="status-label">Status:</span>
                        <span className="status-value">Active</span>
                    </div>
                    <div className="status-item">
                        <span className="status-label">Monitored Blocks:</span>
                        <span className="status-value">0</span>
                    </div>
                </div>
            </div>
        </div>
    );
});

MetaBlock.displayName = "MetaBlock";

export { makeMetaBlockModel } from "./metablock";
