/**
 * ui.js — Maestro
 * ============================================================
 * UI MODULE — pure DOM, zero Three.js / tracking dependencies.
 *
 * Updates the HUD elements based on a CoachingState object:
 *   • Phase badge (top-left)
 *   • Coach message text
 *   • Animated score bar + numeric value
 *   • Swing counter
 *
 * To swap the UI framework (e.g. move to React or Vue later),
 * only this file needs changing — the coaching engine is unchanged.
 * ============================================================
 */

export class UI {
    constructor() {
        // Cache DOM references once
        this.phaseBadge = document.getElementById('phase-badge');
        this.coachMsg = document.getElementById('coach-message');
        this.scoreBar = document.getElementById('score-bar');
        this.scoreValue = document.getElementById('score-value');
        this.swingCounter = document.getElementById('swing-counter');
        this.loadingOverlay = document.getElementById('loading-overlay');
        this.loadingText = document.querySelector('.loader-text');
    }

    /**
     * Update all HUD elements from a CoachingState.
     * @param {CoachingState} state
     */
    update(state) {
        const { phase, score, color, message, swingCount } = state;

        // Phase badge
        this.phaseBadge.textContent = phase;
        this.phaseBadge.style.color = this._cssColor(color);

        // Coaching message
        this.coachMsg.textContent = message;
        this.coachMsg.className = this._stateClass(color);

        // Score bar
        this.scoreBar.style.width = `${score}%`;
        this.scoreBar.className = this._stateClass(color);

        // Score numeric
        this.scoreValue.textContent = `${score}`;
        this.scoreValue.className = this._stateClass(color);

        // Swing counter
        this.swingCounter.textContent =
            swingCount === 0
                ? 'No swings yet — start your first swing!'
                : `🎾 Swings this session: ${swingCount}`;
    }

    /** Show loading screen with optional status text. */
    showLoading(text = 'Loading pose model…') {
        if (this.loadingText) this.loadingText.textContent = text;
        this.loadingOverlay.classList.remove('hidden');
    }

    /** Hide loading screen. */
    hideLoading() {
        this.loadingOverlay.classList.add('hidden');
    }

    // ── Helpers ────────────────────────────────────────────────

    /** Map coaching color string to a CSS color value. */
    _cssColor(color) {
        const map = {
            green: '#00e676',
            yellow: '#ffea00',
            red: '#ff1744',
            cyan: '#00e5ff',
        };
        return map[color] || color || '#00e5ff';
    }

    /** Map coaching color to a CSS class name for the state system. */
    _stateClass(color) {
        if (color === 'green') return 'state-good';
        if (color === 'yellow') return 'state-warn';
        if (color === 'red') return 'state-bad';
        return '';
    }
}
