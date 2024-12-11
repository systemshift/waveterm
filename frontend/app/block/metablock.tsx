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
    const [isActive, setIsActive] = React.useState(false);
    const [monitoredCount, setMonitoredCount] = React.useState(0);

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

        const updateInterval = setInterval(() => {
            setIsActive(model.isActive);
            setMonitoredCount(model.observedBlockCount);
        }, 1000);

        // Cleanup on unmount
        return () => {
            model.dispose();
            clearInterval(updateInterval);
        };
    }, [model]);

    const handleToggle = async () => {
        try {
            await model.toggleMonitoring();
            setIsActive(model.isActive);
        } catch (error) {
            console.error("Failed to toggle monitoring:", error);
        }
    };

    return (
        <div ref={metaBlockRef} className="metablock">
            <div className="metablock-content">
                <div className="metablock-header">
                    <div className="header-left">
                        <i className="fa-solid fa-brain"></i>
                        <h3>{viewName}</h3>
                    </div>
                    <button
                        onClick={handleToggle}
                        className={`toggle-button ${isActive ? 'active' : ''}`}
                        title={isActive ? 'Stop Monitoring' : 'Start Monitoring'}
                    >
                        <i className={`fa-solid fa-${isActive ? 'stop' : 'play'}`} />
                    </button>
                </div>
                <div className="metablock-status">
                    <div className="status-item">
                        <span className="status-label">Status:</span>
                        <span className={`status-value ${isActive ? 'active' : ''}`}>
                            {isActive ? 'Monitoring' : 'Inactive'}
                        </span>
                    </div>
                    <div className="status-item">
                        <span className="status-label">Monitored Blocks:</span>
                        <span className="status-value">{monitoredCount}</span>
                    </div>
                </div>
                <div className="message-container">
                    {model.errors.map((error, i) => (
                        <div key={`error-${i}`} className="error-message">
                            <i className="fa-solid fa-exclamation-circle" />
                            {error}
                        </div>
                    ))}
                    {model.messages.map((msg, i) => (
                        <div key={`msg-${i}`} className="status-message">
                            <i className="fa-solid fa-info-circle" />
                            {msg}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
});

MetaBlock.displayName = "MetaBlock";

export { makeMetaBlockModel } from "./metablock";
