/**
 * ar-tracking.js — Maestro
 * ============================================================
 * TRACKING MODULE — completely decoupled from rendering/coaching.
 *
 * Responsibilities:
 *   - Initialise MediaPipe PoseLandmarker (BlazePose)
 *   - Manage the camera stream (front/rear switching)
 *   - Run detectForVideo() on every animation frame
 *   - Emit pose results via onResultCallback
 *
 * To swap out the tracker later (e.g. for Mind AR body tracking
 * when it ships), only this file needs to change.
 * ============================================================
 *
 * MediaPipe landmark indices used by coaching-engine.js:
 *   11 = LEFT_SHOULDER      12 = RIGHT_SHOULDER
 *   13 = LEFT_ELBOW         14 = RIGHT_ELBOW
 *   15 = LEFT_WRIST         16 = RIGHT_WRIST
 *   23 = LEFT_HIP           24 = RIGHT_HIP
 * (Full list: https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker)
 */

// ── MediaPipe ES module import (mapped via importmap in index.html) ──
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';

// WASM assets are loaded from the same CDN package root
const MEDIAPIPE_CDN =
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';

const MODEL_URL =
    'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

// ─────────────────────────────────────────────────────────────
/** ARTracking — wraps MediaPipe pose detection */
export class ARTracking {
    /**
     * @param {HTMLVideoElement} videoEl   – the camera feed <video>
     * @param {Function} onResultCallback  – called with (landmarks, worldLandmarks)
     *        landmarks       : [{x,y,z,visibility}]  — normalised 0-1 to video size
     *        worldLandmarks  : [{x,y,z}]              — metric 3-D world coords
     */
    constructor(videoEl, onResultCallback) {
        this.videoEl = videoEl;
        this.onResult = onResultCallback;
        this.poseLandmarker = null;
        this.stream = null;
        this.rafId = null;
        this.isRunning = false;
        this.facingMode = 'environment'; // start with rear camera
        this.lastVideoTime = -1;
    }

    // ── Public API ───────────────────────────────────────────────

    /** Load MediaPipe model and start the camera. Call once on user gesture. */
    async start() {
        // Initialise the WASM runtime
        const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_CDN);

        this.poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: MODEL_URL,
                delegate: 'GPU',            // falls back to CPU automatically
            },
            runningMode: 'VIDEO',
            numPoses: 1,       // track one person for tennis coaching
            minPoseDetectionConfidence: 0.5,
            minPosePresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
        });

        await this._startCamera();
        this.isRunning = true;
        this._loop();
    }

    /** Pause detection and release camera. */
    stop() {
        this.isRunning = false;
        cancelAnimationFrame(this.rafId);
        this._releaseCamera();
    }

    /** Toggle between front (user) and rear (environment) camera. */
    async switchCamera() {
        this.facingMode = this.facingMode === 'environment' ? 'user' : 'environment';
        await this._startCamera();
    }

    // ── Private helpers ──────────────────────────────────────────

    /** Open camera stream and attach to the video element. */
    async _startCamera() {
        this._releaseCamera(); // stop previous stream first

        const constraints = {
            video: {
                facingMode: this.facingMode,
                width: { ideal: 1280 },
                height: { ideal: 720 },
                frameRate: { ideal: 30 },
            },
            audio: false,
        };

        try {
            this.stream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch (err) {
            // If rear camera unavailable, fall back to any video device
            console.warn('[ARTracking] Preferred camera unavailable, falling back:', err.message);
            this.facingMode = 'user';
            this.stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        }

        this.videoEl.srcObject = this.stream;
        await this.videoEl.play();
    }

    /** Stop and release any active MediaStream tracks. */
    _releaseCamera() {
        if (this.stream) {
            this.stream.getTracks().forEach(t => t.stop());
            this.stream = null;
        }
    }

    /**
     * Main detection loop — runs on every animation frame.
     * MediaPipe's VIDEO mode requires a monotonically-increasing timestamp.
     */
    _loop() {
        if (!this.isRunning) return;

        this.rafId = requestAnimationFrame(() => {
            if (
                this.videoEl.readyState >= 2 &&        // HAVE_CURRENT_DATA
                this.videoEl.currentTime !== this.lastVideoTime
            ) {
                this.lastVideoTime = this.videoEl.currentTime;
                const now = performance.now();

                const result = this.poseLandmarker.detectForVideo(this.videoEl, now);

                if (result.landmarks.length > 0) {
                    // Pass the first detected person's landmarks to the callback
                    this.onResult(result.landmarks[0], result.worldLandmarks[0] ?? []);
                } else {
                    // No pose found — emit null so UI can show "searching" state
                    this.onResult(null, null);
                }
            }

            this._loop(); // recurse
        });
    }
}
