using UnityEngine;

public class TennisBall : MonoBehaviour
{
    private BallSpawner spawner;
    private bool hasBeenHit = false;
    private float lifetime = 6f; // auto destroy if missed

    void Start()
    {
        spawner = Object.FindFirstObjectByType<BallSpawner>();
        Destroy(gameObject, lifetime);
    }

    void OnTriggerEnter(Collider other)
    {
        // Check if hit by the right controller collider
        if (hasBeenHit) return;
        if (other.CompareTag("RacketHitbox"))
        {
            hasBeenHit = true;
            spawner?.OnBallHit();
            Destroy(gameObject, 0.1f);
        }
    }
}