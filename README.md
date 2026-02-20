# Maestro 🎾
### Real-time AR Tennis Coaching — In Your Browser

Maestro uses your phone's camera and AI body pose detection to analyse your tennis swing form in real time, with 3D visual overlays and coaching feedback — no app installation required.

---

## Features

- 📷 **Live camera AR** — full-screen camera feed with 3D overlays rendered on top
- 🦾 **Real-time pose tracking** — MediaPipe BlazePose detects 33 body landmarks at 30fps
- 🔵 **Swing arc trail** — glowing tube that follows your wrist's recent path
- 👻 **Ghost ideal arc** — semi-transparent arc showing the ideal follow-through path
- 🟢 **Form ring** — colour-coded ring (green/yellow/red) around your wrist at key moments
- 📊 **Live coaching feedback** — phase detection, score out of 100, and coaching tips
- 📱 **Mobile-first** — designed for iPhone/Android, works on desktop too
- 🔄 **Front/rear camera** — switch cameras with one tap

---

## Tech Stack

| Role | Library | CDN |
|------|---------|-----|
| Body pose tracking | [MediaPipe Pose](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker) | jsDelivr |
| 3D rendering | [Three.js r169](https://threejs.org) | jsDelivr |
| Fonts | Inter | Google Fonts |

No backend. No install. Everything runs client-side.

---

## Architecture

Maestro is designed with clean separation of concerns for easy future upgrades:

```
index.html
├── js/ar-tracking.js      → Pose detection (swap for Mind AR body tracking when available)
├── js/coaching-engine.js  → Swing analysis logic (pure functions, no rendering deps)
├── js/three-renderer.js   → Three.js 3D overlay rendering
├── js/ui.js               → DOM HUD updates
└── css/styles.css         → Mobile-first styles
```

---

## Running Locally

You need an HTTP server (not `file://` — browsers block ES modules and camera from file protocol):

**Option 1 — VS Code Live Server extension:** Right-click `index.html` → Open with Live Server

**Option 2 — Python:**
```bash
python -m http.server 5173
# then open http://localhost:5173
```

**Option 3 — Node.js:**
```bash
npx serve .
```

---

## Deploying

### Vercel (recommended)
```bash
vercel --prod
```
`vercel.json` is already configured with the required COOP/COEP headers for MediaPipe WASM.

### GitHub Pages
Push to a GitHub repo and enable Pages from the root of `main`.
Add a `.nojekyll` file to the repo root to prevent Jekyll processing.

> **Note:** GitHub Pages does not serve `Cross-Origin-Opener-Policy` headers by default.
> If you encounter WASM threading issues, use Vercel or Netlify instead.

---

## Swing Coaching Logic

| Phase | Trigger |
|-------|---------|
| IDLE | No arm detected or arm lowered |
| READY | Racket arm raised above shoulder, elbow bent >50° |
| BACKSWING | Wrist velocity exceeds threshold |
| CONTACT | Elbow near full extension (<35°) |
| FOLLOW-THROUGH | Wrist crosses opposite side of body by >20% width |

**Score (0–100):** Calculated from elbow extension at contact and follow-through completeness.

---

## Future Upgrades

- Replace `ar-tracking.js` with Mind AR body tracking when it ships
- Swap `coaching-engine.js` for an ML-trained swing classifier
- Add serve and volley detection
- Multiplayer comparison mode
