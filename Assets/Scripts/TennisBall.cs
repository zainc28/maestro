using UnityEngine;

public class TennisBall : MonoBehaviour
{
    [Header("Hit Settings")]
    public float hitForceMultiplier = 22f;
    public float minForwardSpeed = 14f;
    public float forwardBias = 0.65f;

    private BallSpawner spawner;
    private bool hasBeenHit = false;
    private float lifetime = 6f;

    void Start()
    {
        spawner = Object.FindFirstObjectByType<BallSpawner>();
        Destroy(gameObject, lifetime);
    }

    void OnTriggerEnter(Collider other)
    {
        if (hasBeenHit) return;
        if (!other.CompareTag("RacketHitbox")) return;

        hasBeenHit = true;
        spawner?.OnBallHit();

        Rigidbody rb = GetComponent<Rigidbody>();
        if (rb == null) { Destroy(gameObject, 0.1f); return; }

        // Get controller swing velocity
        Vector3 controllerVel = OVRInput.GetLocalControllerVelocity(OVRInput.Controller.RTouch);

        Transform trackingSpace = Camera.main?.transform.parent;
        if (trackingSpace != null)
            controllerVel = trackingSpace.TransformDirection(controllerVel);

        // "Forward" = back where the ball came from
        Vector3 forwardDir = (-rb.linearVelocity.normalized);

        Vector3 hitDir;
        if (controllerVel.magnitude > 0.5f)
        {
            Vector3 swingDir = controllerVel.normalized;
            hitDir = Vector3.Lerp(swingDir, forwardDir, forwardBias).normalized;
        }
        else
        {
            hitDir = forwardDir;
        }

        // Keep ball from going into the ground
        if (hitDir.y < 0.08f)
            hitDir.y = 0.08f;
        hitDir.Normalize();

        // Apply hit — big satisfying smack
        float speed = Mathf.Max(controllerVel.magnitude * hitForceMultiplier, minForwardSpeed);
        rb.linearVelocity = hitDir * speed;

        // Disable gravity briefly so it flies clean and fast
        rb.useGravity = false;
        Invoke(nameof(ReenableGravity), 0.4f);

        Destroy(gameObject, 3f);
    }

    void ReenableGravity()
    {
        Rigidbody rb = GetComponent<Rigidbody>();
        if (rb != null) rb.useGravity = true;
    }
}