import { invoke } from '@tauri-apps/api/core';

export type UpdatePhase =
    | 'idle'               // nothing happening — indicator hidden
    | 'checking'           // fetching manifest.json
    | 'downloading'        // streaming .vera-module ZIP
    | 'verifying'          // checksum + signature check
    | 'unpacking'          // extracting to pending/
    | 'pending_restart'    // staged, waiting for user to restart
    | 'swapping'           // apply_pending_swaps running at boot
    | 'success'            // swap completed cleanly
    | 'error';             // something failed

export interface UpdateStatus {
    phase: UpdatePhase;
    moduleId: string | null;    // which module, null for core checks
    percent: number;            // 0-100, used during downloading/unpacking
    message: string;            // human-readable one-liner
    errorDetail: string | null; // full error string, only on phase === 'error'
    swapResults?: any[];        // populated after apply_pending_swaps
}

interface Props {
    status: UpdateStatus;
    onDismiss: () => void;
    onSendBugReport: () => void;
}

export function UpdateStatusIndicator({ status, onDismiss, onSendBugReport }: Props) {
    if (status.phase === 'idle') return null;

    return (
        <div className={`update-indicator update-indicator--${status.phase}`}
             role="status"
             aria-live="polite">

            {/* Spinner — visible during active operations */}
            {isActivePhase(status.phase) && (
                <span className="update-spinner" aria-hidden="true" />
            )}

            {/* Progress bar — visible during downloading/unpacking */}
            {isProgressPhase(status.phase) && (
                <div className="update-progress-track" aria-hidden="true">
                    <div
                        className="update-progress-fill"
                        style={{ width: `${status.percent}%` }}
                    />
                </div>
            )}

            {/* Status message */}
            <span className="update-indicator__message">
                {status.phase === 'success'         && '✓ Update applied'}
                {status.phase === 'pending_restart' && `⏳ ${status.message}`}
                {status.phase === 'error'           && '⚠ Update failed'}
                {isActivePhase(status.phase)        && status.message}
            </span>

            {/* Restart button — only when pending */}
            {status.phase === 'pending_restart' && (
                <button
                    className="update-indicator__action"
                    onClick={() => invoke('restart_app')}
                    aria-label="Restart VERA to apply update">
                    Restart now
                </button>
            )}

            {/* Bug report button — only on error */}
            {status.phase === 'error' && (
                <button
                    className="update-indicator__action update-indicator__action--warn"
                    onClick={onSendBugReport}
                    aria-label="Send bug report">
                    Send report
                </button>
            )}

            {/* Dismiss — visible on success and error */}
            {(status.phase === 'success' || status.phase === 'error') && (
                <button
                    className="update-indicator__dismiss"
                    onClick={onDismiss}
                    aria-label="Dismiss">
                    ✕
                </button>
            )}
        </div>
    );
}

function isActivePhase(phase: UpdatePhase): boolean {
    return ['checking', 'downloading', 'verifying', 'unpacking', 'swapping']
        .includes(phase);
}

function isProgressPhase(phase: UpdatePhase): boolean {
    return ['downloading', 'unpacking'].includes(phase);
}
