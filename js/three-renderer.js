/**
 * three-renderer.js — Maestro
 * ============================================================
 * RENDERING MODULE — Three.js 3D overlay on top of the video feed.
 *
 * Renders:
 *   • Joint spheres at shoulder / elbow / wrist
 *   • Swing arc TRAIL  — wrist's recent path as a glowing tube
 *   • Ideal arc GHOST  — target follow-through arc in translucent blue
 *   • Feedback RING    — colour-coded glow ring around the wrist
 *   • Skeleton LINES   — shoulder→elbow→wrist connector lines
 *
 * Uses an ORTHOGRAPHIC camera whose units map 1:1 to CSS pixels,
 * so converting normalised MediaPipe coords (0-1) to screen coords
 * is simply: x = lmk.x * width,  y = lmk.y * height.
 *
 * NOTE: The video feed is CSS-mirrored with scaleX(-1), so we
 * mirror the x coordinate here too (x → width - x).
 *
 * To swap out Three.js for a different renderer, only this file
 * needs to change — the coaching engine is completely unaffected.
 * ============================================================
 */

import * as THREE from 'three';

// ─────────────────────────────────────────────────────────────
export class ThreeRenderer {
    /**
     * @param {HTMLCanvasElement} canvas  – the overlay <canvas> element
     */
    constructor(canvas) {
        this.canvas = canvas;
        this.w = canvas.clientWidth;
        this.h = canvas.clientHeight;

        // ── Renderer ─────────────────────────────────────────────
        this.renderer = new THREE.WebGLRenderer({
            canvas,
            alpha: true,        // transparent background so video shows through
            antialias: true,
        });
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(this.w, this.h);
        this.renderer.setClearColor(0x000000, 0);   // fully transparent

        // ── Scene ────────────────────────────────────────────────
        this.scene = new THREE.Scene();

        // ── Orthographic camera (screen-space, top-left origin) ──
        // left=0, right=w, top=0, bottom=h  (y increases downward, like CSS)
        this._setupCamera();

        // ── Shared materials ─────────────────────────────────────
        this.materials = {
            joint: new THREE.MeshBasicMaterial({ color: 0x00e5ff }),
            line: new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2, transparent: true, opacity: 0.6 }),
            arc: new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.75 }),
            ghost: new THREE.MeshBasicMaterial({ color: 0x3d5afe, transparent: true, opacity: 0.25, side: THREE.DoubleSide }),
            ring: new THREE.MeshBasicMaterial({ color: 0x00e676, transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
        };

        // ── Scene objects (created once, updated each frame) ─────
        this._joints = {};        // { shoulder, elbow, wrist } spheres
        this._lines = null;      // skeleton lines
        this._arcMesh = null;      // swing arc tube
        this._ghostArc = null;      // ideal follow-through arc
        this._ring = null;      // wrist feedback ring
        this._arcPoints = [];        // ring-buffer of THREE.Vector3 for arc

        this._initSceneObjects();

        // ── Resize observer ──────────────────────────────────────
        const ro = new ResizeObserver(() => this._onResize());
        ro.observe(canvas.parentElement);
    }

    // ── Public API ───────────────────────────────────────────────

    /**
     * Render one frame.
     * @param {Array|null}  landmarks    – normalised MediaPipe pose landmarks (33)
     * @param {CoachingState} coaching  – output of CoachingEngine.analyse()
     * @param {Array}        wristHistory – [{x,y}] from coaching engine
     */
    render(landmarks, coaching, wristHistory) {
        // Hide everything when no pose
        if (!landmarks || !coaching.armLandmarks) {
            this._setAllVisible(false);
            this.renderer.render(this.scene, this.camera);
            return;
        }
        this._setAllVisible(true);

        const { shoulder, elbow, wrist } = coaching.armLandmarks;
        const color = this._coachingColor(coaching.color);

        // ── 1. Joint spheres ───────────────────────────────────
        this._placeJoint('shoulder', shoulder, 0x7c4dff, 10);
        this._placeJoint('elbow', elbow, 0x00e5ff, 9);
        this._placeJoint('wrist', wrist, color, 11);

        // ── 2. Skeleton lines (shoulder → elbow → wrist) ───────
        this._updateSkeletonLines([shoulder, elbow, wrist]);

        // ── 3. Swing arc trail ─────────────────────────────────
        this._updateSwingArc(wristHistory);

        // ── 4. Ideal ghost arc ─────────────────────────────────
        this._updateGhostArc(shoulder, elbow, wrist, coaching.armLandmarks.useLeft);

        // ── 5. Feedback ring around wrist ─────────────────────
        this._updateFeedbackRing(wrist, color, coaching.phase);

        // ── 6. Render ─────────────────────────────────────────
        this.renderer.render(this.scene, this.camera);
    }

    // ── Private helpers ─────────────────────────────────────────

    _setupCamera() {
        const { w, h } = this;
        this.camera = new THREE.OrthographicCamera(0, w, 0, h, -1000, 1000);
        // Move camera so +y is DOWN (screen coords).
        // OrthographicCamera default: top=0, bottom=h means y=0 at top ✓
        this.camera.position.set(0, 0, 10);
        this.camera.lookAt(0, 0, 0);
    }

    _initSceneObjects() {
        const sphereGeo = new THREE.SphereGeometry(1, 12, 12);

        // Joint spheres
        ['shoulder', 'elbow', 'wrist'].forEach(name => {
            const mesh = new THREE.Mesh(sphereGeo, this.materials.joint.clone());
            mesh.visible = false;
            this._joints[name] = mesh;
            this.scene.add(mesh);
        });

        // Skeleton lines (6 vertices: 3 joints × 2 line segments)
        const lineGeo = new THREE.BufferGeometry();
        lineGeo.setAttribute('position',
            new THREE.BufferAttribute(new Float32Array(9), 3)); // 3 pts × xyz
        this._lines = new THREE.Line(lineGeo, this.materials.line);
        this._lines.visible = false;
        this.scene.add(this._lines);
    }

    /** Place and scale a joint sphere at normalised landmark coords. */
    _placeJoint(name, lmk, colorHex, radiusPx) {
        const mesh = this._joints[name];
        mesh.material.color.setHex(colorHex);
        mesh.scale.setScalar(radiusPx);
        mesh.position.set(this._lx(lmk.x), this._ly(lmk.y), 1);
        mesh.visible = true;
    }

    /** Update the skeleton line geometry. */
    _updateSkeletonLines(landmarks) {
        const pos = this._lines.geometry.attributes.position;
        landmarks.forEach((lmk, i) => {
            pos.setXYZ(i, this._lx(lmk.x), this._ly(lmk.y), 0);
        });
        pos.needsUpdate = true;
        this._lines.visible = true;
    }

    /** Draw the wrist trail as a thick tube following recent positions. */
    _updateSwingArc(wristHistory) {
        // Remove previous arc mesh
        if (this._arcMesh) { this.scene.remove(this._arcMesh); this._arcMesh = null; }
        if (wristHistory.length < 4) return;

        // Sample every 3rd point to avoid over-detailed curves (performance)
        const sampled = wristHistory.filter((_, i) => i % 3 === 0).slice(-20);
        if (sampled.length < 3) return;

        const pts = sampled.map(p =>
            new THREE.Vector3(this._lx(p.x), this._ly(p.y), 2));

        const curve = new THREE.CatmullRomCurve3(pts);
        const segments = Math.max(pts.length * 4, 20);
        const tubeGeo = new THREE.TubeGeometry(curve, segments, 5, 6, false);
        this._arcMesh = new THREE.Mesh(tubeGeo, this.materials.arc);
        this.scene.add(this._arcMesh);
    }

    /**
     * Draw the ghost ideal follow-through arc.
     * Modelled as a circular arc from the current arm position
     * sweeping ~90° across the body (inside→outside contact path).
     */
    _updateGhostArc(shoulder, elbow, wrist, useLeft) {
        if (this._ghostArc) { this.scene.remove(this._ghostArc); this._ghostArc = null; }

        // Centre of arc is at elbow position
        const cx = this._lx(elbow.x);
        const cy = this._ly(elbow.y);
        // Radius = elbow→wrist distance in screen pixels
        const radius = Math.hypot(
            this._lx(wrist.x) - cx,
            this._ly(wrist.y) - cy
        );
        if (radius < 20) return;

        // Sweep from current wrist angle, 90° in follow-through direction
        const startAngle = Math.atan2(this._ly(wrist.y) - cy, this._lx(wrist.x) - cx);
        const direction = useLeft ? 1 : -1;
        const endAngle = startAngle + direction * (Math.PI / 2);

        const pts = [];
        const steps = 24;
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const a = startAngle + (endAngle - startAngle) * t;
            pts.push(new THREE.Vector3(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius, 0.5));
        }
        const curve = new THREE.CatmullRomCurve3(pts);
        const tubeGeo = new THREE.TubeGeometry(curve, 20, 4, 6, false);
        this._ghostArc = new THREE.Mesh(tubeGeo, this.materials.ghost);
        this.scene.add(this._ghostArc);
    }

    /** Draw an animated ring around the wrist indicating form quality. */
    _updateFeedbackRing(wrist, colorHex, phase) {
        if (this._ring) { this.scene.remove(this._ring); this._ring = null; }

        const PHASES_SHOW = ['CONTACT', 'FOLLOW THROUGH'];
        if (!PHASES_SHOW.includes(phase)) return;

        const ringGeo = new THREE.RingGeometry(18, 24, 32);
        const mat = this.materials.ring.clone();
        mat.color.setHex(colorHex);
        this._ring = new THREE.Mesh(ringGeo, mat);
        this._ring.position.set(this._lx(wrist.x), this._ly(wrist.y), 3);
        this.scene.add(this._ring);
    }

    /** Convert normalised landmark x (0-1) to screen pixel, with mirror. */
    _lx(nx) {
        // The video is CSS mirrored (scaleX(-1)), so we mirror the x coord
        return (1 - nx) * this.w;
    }

    /** Convert normalised landmark y (0-1) to screen pixel. */
    _ly(ny) {
        return ny * this.h;
    }

    /** Map coaching color string / hex to Three.js hex int. */
    _coachingColor(colorStr) {
        const map = {
            green: 0x00e676,
            yellow: 0xffea00,
            red: 0xff1744,
            cyan: 0x00e5ff,
        };
        if (typeof colorStr === 'string' && map[colorStr]) return map[colorStr];
        // Handle '#rrggbb' hex strings
        if (typeof colorStr === 'string' && colorStr.startsWith('#')) {
            return parseInt(colorStr.slice(1), 16);
        }
        return 0x00e5ff;
    }

    /** Show or hide all coaching overlays. */
    _setAllVisible(visible) {
        Object.values(this._joints).forEach(m => { m.visible = visible; });
        if (this._lines) this._lines.visible = visible;
        if (this._arcMesh) this._arcMesh.visible = visible;
        if (this._ghostArc) this._ghostArc.visible = visible;
        if (this._ring) this._ring.visible = visible;
    }

    /** Handle canvas resize (e.g. device rotation). */
    _onResize() {
        this.w = this.canvas.clientWidth;
        this.h = this.canvas.clientHeight;
        this.renderer.setSize(this.w, this.h);
        // Rebuild camera for new dimensions
        this.camera.right = this.w;
        this.camera.bottom = this.h;
        this.camera.updateProjectionMatrix();
    }
}
