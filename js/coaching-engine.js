/**
 * coaching-engine.js — Maestro v3
 * ============================================================
 * COACHING MODULE — simplified, robust, geometry + time based.
 *
 * v3 approach: no velocity thresholds, no const-in-switch bugs.
 * Uses only wrist position relative to landmarks + elapsed time.
 *
 * Phases:
 *   IDLE           → wrist at or below hip level
 *   READY          → wrist above hip, arm raised
 *   BACKSWING      → wrist moved ≥5% laterally from ready position
 *   CONTACT        → auto-triggered 0.8s after BACKSWING starts
 *   FOLLOW THROUGH → wrist has moved ≥10% horizontally from contact point
 * ============================================================
 */

// ── Landmark indices ─────────────────────────────────────────
export const LMKS = {
    LEFT_SHOULDER: 11,
    RIGHT_SHOULDER: 12,
    LEFT_ELBOW: 13,
    RIGHT_ELBOW: 14,
    LEFT_WRIST: 15,
    RIGHT_WRIST: 16,
    LEFT_HIP: 23,
    RIGHT_HIP: 24,
};

// ── Phase names ──────────────────────────────────────────────
export const Phase = {
    IDLE: 'IDLE',
    READY: 'READY',
    BACKSWING: 'BACKSWING',
    CONTACT: 'CONTACT',
    FOLLOW_THROUGH: 'FOLLOW THROUGH',
};

// ── Tunable constants ────────────────────────────────────────
// All distances are in MediaPipe normalised units (0 = left edge, 1 = right edge).
const READY_MAX_WRIST_Y_OFFSET = 0.05;  // wrist must be at most 5% below shoulder y
const BACKSWING_DIST = 0.04;  // wrist travels ≥4% of width to start backswing
const CONTACT_DELAY_MS = 700;   // ms after BACKSWING starts → auto-advance to CONTACT
const FOLLOW_DIST = 0.06;  // wrist travels ≥6% from contact pos → follow-through
const FOLLOW_TIMEOUT_MS = 1500;  // if wrist doesn't reach follow dist, still score after this
const RESET_DELAY_MS = 1200;  // how long FOLLOW THROUGH stays on screen before reset
const HISTORY_MAX = 90;    // frames kept in wrist history

// ─────────────────────────────────────────────────────────────
export class CoachingEngine {
    constructor() {
        this.phase = Phase.IDLE;
        this.swingCount = 0;
        this.lastScore = 0;

        this._phaseStart = performance.now();
        this._readyWristPos = null;  // {x, y} when READY was entered
        this._contactWristPos = null;  // {x, y} at moment of CONTACT
        this._peakElbow = 0;     // max elbow angle during swing (proxy for extension)
        this._lastWristSpeed = 0;     // smoothed speed for display

        this._wristHistory = [];         // [{x, y, t}]
    }

    /**
     * Analyse one frame. Returns CoachingState.
     * @param {Array|null} landmarks  – 33 MediaPipe landmark objects
     */
    analyse(landmarks) {
        const now = performance.now();

        // ── No pose ──────────────────────────────────────────────
        if (!landmarks) {
            this.phase = Phase.IDLE;
            this._phaseStart = now;
            return this._out('cyan', '🎾 Step into view to start', null);
        }

        // ── Extract limb landmarks ────────────────────────────────
        const lw = landmarks[LMKS.LEFT_WRIST];
        const rw = landmarks[LMKS.RIGHT_WRIST];
        const ls = landmarks[LMKS.LEFT_SHOULDER];
        const rs = landmarks[LMKS.RIGHT_SHOULDER];
        const le = landmarks[LMKS.LEFT_ELBOW];
        const re = landmarks[LMKS.RIGHT_ELBOW];
        const lh = landmarks[LMKS.LEFT_HIP];
        const rh = landmarks[LMKS.RIGHT_HIP];

        // Auto-select the arm that is higher in frame (lower y = higher on screen).
        // Fall back to right arm if visibilities are equal.
        const useLeft = (lw.visibility > 0.3 && rw.visibility > 0.3)
            ? (lw.y < rw.y)
            : (lw.visibility > rw.visibility);

        const shoulder = useLeft ? ls : rs;
        const elbow = useLeft ? le : re;
        const wrist = useLeft ? lw : rw;
        const hip = useLeft ? lh : rh;

        // Skip low-confidence frames but don't reset phase
        if (wrist.visibility < 0.25) {
            return this._out('cyan', '🎾 Keep your arm visible', { shoulder, elbow, wrist, useLeft });
        }

        // ── Update history ────────────────────────────────────────
        this._wristHistory.push({ x: wrist.x, y: wrist.y, t: now });
        if (this._wristHistory.length > HISTORY_MAX) this._wristHistory.shift();
        this._lastWristSpeed = this._calcSpeed();

        // Track peak elbow angle this swing
        const elbowAngle = _angle(shoulder, elbow, wrist);
        if (this.phase === Phase.BACKSWING || this.phase === Phase.CONTACT) {
            if (elbowAngle > this._peakElbow) this._peakElbow = elbowAngle;
        }

        const elapsed = now - this._phaseStart;

        // ── State machine (if/else blocks — no switch/const issues) ──

        if (this.phase === Phase.IDLE) {
            // Enter READY when wrist is above or near the shoulder line
            if (wrist.y < shoulder.y + READY_MAX_WRIST_Y_OFFSET) {
                this.phase = Phase.READY;
                this._phaseStart = now;
                this._readyWristPos = { x: wrist.x, y: wrist.y };
                this._peakElbow = elbowAngle;
            }

        } else if (this.phase === Phase.READY) {
            // Drop back to IDLE if arm falls well below shoulder
            if (wrist.y > shoulder.y + 0.12) {
                this.phase = Phase.IDLE;
                this._phaseStart = now;

                // Enter BACKSWING when wrist has moved sideways from ready position
            } else {
                const dx = Math.abs(wrist.x - this._readyWristPos.x);
                const dy = Math.abs(wrist.y - this._readyWristPos.y);
                if (dx > BACKSWING_DIST || dy > BACKSWING_DIST) {
                    this.phase = Phase.BACKSWING;
                    this._phaseStart = now;
                    this._peakElbow = elbowAngle;
                }
            }

        } else if (this.phase === Phase.BACKSWING) {
            // AUTO-ADVANCE to CONTACT after CONTACT_DELAY_MS
            // This eliminates the need to detect peak velocity.
            if (elapsed >= CONTACT_DELAY_MS) {
                this.phase = Phase.CONTACT;
                this._phaseStart = now;
                this._contactWristPos = { x: wrist.x, y: wrist.y };
            }

        } else if (this.phase === Phase.CONTACT) {
            // Two ways to trigger FOLLOW THROUGH:
            //   1. Wrist has moved far enough from contact position
            //   2. Timeout — give the benefit of the doubt after 1.5s
            const travX = wrist.x - this._contactWristPos.x;
            const travY = wrist.y - this._contactWristPos.y;
            const dist = Math.sqrt(travX * travX + travY * travY);

            if (dist >= FOLLOW_DIST || elapsed >= FOLLOW_TIMEOUT_MS) {
                this.swingCount += 1;
                this.lastScore = this._score(elbowAngle, dist);
                this.phase = Phase.FOLLOW_THROUGH;
                this._phaseStart = now;
            }

        } else if (this.phase === Phase.FOLLOW_THROUGH) {
            // Stay in FOLLOW THROUGH briefly, then reset
            if (elapsed >= RESET_DELAY_MS) {
                this.phase = Phase.IDLE;
                this._phaseStart = now;
            }
        }

        // ── Build message ─────────────────────────────────────────
        let color, message;
        const score = this.lastScore;

        if (this.phase === Phase.IDLE) {
            color = 'cyan';
            message = '🎾 Raise your racket arm to start';

        } else if (this.phase === Phase.READY) {
            color = 'cyan';
            message = '✅ Good position — swing!';

        } else if (this.phase === Phase.BACKSWING) {
            // Show countdown so user knows contact is coming
            const remaining = Math.max(0, CONTACT_DELAY_MS - elapsed);
            color = 'yellow';
            message = `🔄 Backswing… contact in ${(remaining / 1000).toFixed(1)}s`;

        } else if (this.phase === Phase.CONTACT) {
            color = 'green';
            message = '💥 Contact! Follow through!';

        } else if (this.phase === Phase.FOLLOW_THROUGH) {
            color = score >= 75 ? 'green' : score >= 50 ? 'yellow' : 'red';
            message = score >= 75
                ? `✨ Great swing! (${score}/100)`
                : score >= 50
                    ? `👍 Nice swing (${score}/100)`
                    : `🔁 Try a fuller follow-through (${score}/100)`;
        }

        return this._out(color, message, { shoulder, elbow, wrist, useLeft });
    }

    // ── Scoring ────────────────────────────────────────────────

    /**
     * Score 0–100 based on:
     *   - Peak elbow angle during swing (higher = more extended arm = better)
     *   - Follow-through distance (how far wrist traveled from contact)
     */
    _score(elbowAtFollowThrough, followDist) {
        // Elbow: 120° = ideal forehand extension → 60 pts
        const elbowPts = Math.min(60, Math.round((this._peakElbow / 120) * 60));
        // Follow distance: FOLLOW_DIST × 3 = full 40 pts
        const distPts = Math.min(40, Math.round((followDist / (FOLLOW_DIST * 3)) * 40));
        return Math.max(0, Math.min(100, elbowPts + distPts));
    }

    // ── Kinematics ─────────────────────────────────────────────

    _calcSpeed() {
        const h = this._wristHistory;
        if (h.length < 4) return 0;
        const a = h[h.length - 4];
        const b = h[h.length - 1];
        const dt = b.t - a.t;
        if (dt <= 0) return 0;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        return Math.sqrt(dx * dx + dy * dy) / dt;
    }

    // ── Helpers ────────────────────────────────────────────────

    _out(color, message, armLandmarks) {
        return {
            phase: this.phase,
            score: this.lastScore,
            color,
            message,
            swingCount: this.swingCount,
            armLandmarks: armLandmarks || null,
        };
    }

    getWristHistory() {
        return [...this._wristHistory];
    }
}

// ─── Geometry utility ─────────────────────────────────────────

/**
 * Interior angle at vertex B (degrees).
 * @param {{x,y}} a @param {{x,y}} b @param {{x,y}} c
 */
function _angle(a, b, c) {
    const bax = a.x - b.x, bay = a.y - b.y;
    const bcx = c.x - b.x, bcy = c.y - b.y;
    const dot = bax * bcx + bay * bcy;
    const mag = Math.sqrt((bax * bax + bay * bay) * (bcx * bcx + bcy * bcy));
    if (mag === 0) return 0;
    return Math.round(Math.acos(Math.max(-1, Math.min(1, dot / mag))) * (180 / Math.PI));
}
