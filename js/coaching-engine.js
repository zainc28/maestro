/**
 * coaching-engine.js — Maestro
 * ============================================================
 * COACHING MODULE — pure logic, zero rendering dependencies.
 *
 * Takes an array of 33 MediaPipe pose landmarks and returns a
 * CoachingState object that the renderer and UI can consume.
 *
 * Swing phases detected:
 *   IDLE         → no arm movement detected
 *   READY        → racket arm raised, elbow bent (preparing)
 *   BACKSWING    → wrist moving backward / upward
 *   CONTACT      → arm near full extension (simulated contact)
 *   FOLLOW_THROUGH → wrist continuing across body after contact
 *
 * To replace this with a more sophisticated ML model later,
 * just keep the same analyse(landmarks) → CoachingState interface.
 * ============================================================
 */

// ── Landmark indices (MediaPipe BlazePose 33-keypoint model) ────
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

// ── Phase enum ───────────────────────────────────────────────────
export const Phase = {
    IDLE: 'IDLE',
    READY: 'READY',
    BACKSWING: 'BACKSWING',
    CONTACT: 'CONTACT',
    FOLLOW_THROUGH: 'FOLLOW THROUGH',
};

// ── Thresholds (tune these for your coaching style) ─────────────
const ELBOW_READY_ANGLE_MIN = 50;    // deg — elbow must be bent at least this much
const ELBOW_CONTACT_ANGLE_MAX = 35;    // deg — nearly straight at contact point
const WRIST_VELOCITY_SWING = 0.005; // px/ms threshold to consider "in swing"
const FOLLOW_THROUGH_DIST = 0.20;  // wrist must have crossed body by 20% of width

/**
 * CoachingState — returned by CoachingEngine.analyse() every frame.
 * @typedef {{
 *   phase:        string,
 *   score:        number,    // 0-100
 *   color:        string,    // 'green' | 'yellow' | 'red' | 'cyan'
 *   message:      string,    // coaching text for HUD
 *   swingCount:   number,    // total completed swings this session
 *   armLandmarks: object,    // convenience carry-through for renderer
 * }} CoachingState
 */

// ─────────────────────────────────────────────────────────────
export class CoachingEngine {
    constructor() {
        // State machine
        this.phase = Phase.IDLE;
        this.prevPhase = Phase.IDLE;
        this.swingCount = 0;
        this.lastScore = 0;

        // Per-swing metrics
        this._contactAngle = 0;
        this._followThroughReached = false;
        this._swingStartWristX = null;

        // Wrist position history (ring buffer, last 90 frames ≈ 3s at 30fps)
        this._wristHistory = [];
        this._historyMax = 90;

        // Last frame timestamp for velocity calc
        this._lastTimestamp = performance.now();
    }

    /**
     * Main entry point — call every frame with the 33 landmarks.
     * @param {Array|null} landmarks  – normalised [{x,y,z,visibility}]
     * @returns {CoachingState}
     */
    analyse(landmarks) {
        const now = performance.now();
        const dt = now - this._lastTimestamp;
        this._lastTimestamp = now;

        // ── No pose detected ───────────────────────────────────────
        if (!landmarks) {
            return this._state(Phase.IDLE, 0, 'cyan', '🎾 Position yourself in view', null);
        }

        // ── Extract the arm landmarks we care about ────────────────
        // We coach the RIGHT arm (player's primary hitting arm).
        // Mirror by checking which shoulder is more "dominant" (higher y = lower on screen).
        const ls = landmarks[LMKS.LEFT_SHOULDER];
        const rs = landmarks[LMKS.RIGHT_SHOULDER];
        const le = landmarks[LMKS.LEFT_ELBOW];
        const re = landmarks[LMKS.RIGHT_ELBOW];
        const lw = landmarks[LMKS.LEFT_WRIST];
        const rw = landmarks[LMKS.RIGHT_WRIST];

        // Pick the arm that is raised higher in frame (lower y value)
        // This auto-selects regardless of camera mirror direction
        const useLeft = lw.y < rw.y && lw.visibility > 0.5;
        const shoulder = useLeft ? ls : rs;
        const elbow = useLeft ? le : re;
        const wrist = useLeft ? lw : rw;

        // Guard: skip if the chosen arm landmarks are very low confidence
        if (shoulder.visibility < 0.4 || elbow.visibility < 0.4 || wrist.visibility < 0.4) {
            return this._state(Phase.IDLE, this.lastScore, 'cyan', '🎾 Raise your racket arm', {
                shoulder, elbow, wrist, useLeft
            });
        }

        // ── Calculate elbow angle (shoulder–elbow–wrist) ───────────
        const elbowAngle = _angleDeg(shoulder, elbow, wrist);

        // ── Calculate wrist velocity ──────────────────────────────
        this._wristHistory.push({ x: wrist.x, y: wrist.y, t: now });
        if (this._wristHistory.length > this._historyMax) this._wristHistory.shift();

        const wristVel = this._calcWristVelocity(dt);

        // ── Phase state machine ────────────────────────────────────
        this.prevPhase = this.phase;
        let nextPhase = this.phase;
        let score = this.lastScore;
        let color = 'cyan';
        let message = '';

        // Detect phase transitions
        if (elbowAngle > ELBOW_READY_ANGLE_MIN && wrist.y < shoulder.y) {
            // Arm is raised and bent — ready stance
            if (this.phase === Phase.IDLE) {
                nextPhase = Phase.READY;
                this._swingStartWristX = wrist.x;
                this._contactAngle = 0;
                this._followThroughReached = false;
            }
        }

        if (this.phase === Phase.READY && wristVel > WRIST_VELOCITY_SWING) {
            // Wrist is moving — backswing detected
            nextPhase = Phase.BACKSWING;
        }

        if (this.phase === Phase.BACKSWING && elbowAngle < ELBOW_CONTACT_ANGLE_MAX) {
            // Arm near full extension — contact point
            nextPhase = Phase.CONTACT;
            this._contactAngle = elbowAngle;
        }

        if (this.phase === Phase.CONTACT) {
            // Check follow-through: wrist should cross to opposite side of body
            const crossedBody = useLeft
                ? wrist.x > shoulder.x + FOLLOW_THROUGH_DIST
                : wrist.x < shoulder.x - FOLLOW_THROUGH_DIST;

            if (crossedBody) {
                this._followThroughReached = true;
                nextPhase = Phase.FOLLOW_THROUGH;
                this.swingCount += 1;
                score = this._scoreSwing();
            }
        }

        if (this.phase === Phase.FOLLOW_THROUGH && wrist.y > elbow.y) {
            // Arm dropping — reset to idle
            nextPhase = Phase.IDLE;
        }

        this.phase = nextPhase;
        this.lastScore = score;

        // ── Generate message & colour for this phase ───────────────
        switch (this.phase) {
            case Phase.IDLE:
                color = 'cyan';
                message = '🎾 Ready position — raise your arm';
                break;
            case Phase.READY:
                color = '#00e5ff';
                message = '✅ Good — start your backswing';
                break;
            case Phase.BACKSWING:
                color = 'yellow';
                message = '🔄 Backswing — load up power!';
                break;
            case Phase.CONTACT:
                color = elbowAngle < 20 ? 'green' : 'yellow';
                message = elbowAngle < 20
                    ? '💥 Great contact — arm extended!'
                    : '⚠️ Extend more at contact point';
                break;
            case Phase.FOLLOW_THROUGH:
                color = score >= 75 ? 'green' : score >= 50 ? 'yellow' : 'red';
                message = score >= 75
                    ? `✨ Perfect follow-through! (${score}/100)`
                    : score >= 50
                        ? `👍 Good swing — follow through more (${score}/100)`
                        : `🔁 Keep your follow-through going (${score}/100)`;
                break;
        }

        return this._state(this.phase, score, color, message, { shoulder, elbow, wrist, useLeft });
    }

    /** Score the just-completed swing out of 100. */
    _scoreSwing() {
        let score = 100;

        // Penalise poor elbow extension at contact (ideal < 20 deg)
        const contactPenalty = Math.min(this._contactAngle, 40); // max 40 pts off
        score -= contactPenalty;

        // Reward follow-through completion
        if (!this._followThroughReached) score -= 20;

        // Keep in range
        return Math.max(0, Math.min(100, Math.round(score)));
    }

    /** Average wrist velocity over last 5 frames. */
    _calcWristVelocity(dt) {
        if (this._wristHistory.length < 2 || dt <= 0) return 0;
        const h = this._wristHistory;
        const recent = h.slice(-5);
        if (recent.length < 2) return 0;
        const dx = recent[recent.length - 1].x - recent[0].x;
        const dy = recent[recent.length - 1].y - recent[0].y;
        const elapsed = recent[recent.length - 1].t - recent[0].t;
        return Math.sqrt(dx * dx + dy * dy) / Math.max(elapsed, 1);
    }

    /** Build a CoachingState object. */
    _state(phase, score, color, message, armLandmarks) {
        return { phase, score, color, message, swingCount: this.swingCount, armLandmarks };
    }

    /** Return the wrist position history (for arc rendering). */
    getWristHistory() {
        return [...this._wristHistory];
    }
}

// ─────────────────────────────────────────────────────────────
// ── Pure utility functions (no class state) ──────────────────

/**
 * Calculate the angle (in degrees) at the vertex point B formed
 * by three 2D/3D normalised landmark points A–B–C.
 * @param {{x,y}} a  – first point (e.g. shoulder)
 * @param {{x,y}} b  – vertex point (e.g. elbow)
 * @param {{x,y}} c  – third point (e.g. wrist)
 * @returns {number} angle in degrees 0–180
 */
function _angleDeg(a, b, c) {
    const ba = { x: a.x - b.x, y: a.y - b.y };
    const bc = { x: c.x - b.x, y: c.y - b.y };
    const dot = ba.x * bc.x + ba.y * bc.y;
    const magBa = Math.sqrt(ba.x ** 2 + ba.y ** 2);
    const magBc = Math.sqrt(bc.x ** 2 + bc.y ** 2);
    if (magBa === 0 || magBc === 0) return 0;
    const cos = Math.max(-1, Math.min(1, dot / (magBa * magBc)));
    return Math.round(Math.acos(cos) * (180 / Math.PI));
}
