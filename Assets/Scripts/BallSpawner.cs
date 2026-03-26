using UnityEngine;

public class BallSpawner : MonoBehaviour
{
    [Header("Ball Settings")]
    public GameObject ballPrefab;
    public Transform spawnPoint;
    public float ballSpeed = 8f;
    public float ballDelay = 2f;

    [Header("Target")]
    public Transform playerTarget; // assign OVRCameraRig
    public float targetHeightOffset = 1.2f; // chest height above rig root

    private GameObject currentBall;
    private bool gameActive = false;

    public void StartBallMode()
    {
        gameActive = true;
        Invoke(nameof(SpawnBall), ballDelay);
    }

    void SpawnBall()
    {
        if (!gameActive) return;

        if (currentBall != null)
            Destroy(currentBall);

        currentBall = Instantiate(ballPrefab, spawnPoint.position, Quaternion.identity);

        // Aim at player's chest, not rig root (which is often at floor level)
        Vector3 targetPos = playerTarget.position + Vector3.up * targetHeightOffset;
        Vector3 direction = (targetPos - spawnPoint.position).normalized;

        // Tight random variation — keeps balls hittable
        direction += new Vector3(
            Random.Range(-0.02f, 0.02f),  // tiny left/right
            Random.Range(-0.01f, 0.02f),  // slight vertical, biased up
            0f
        );
        direction.Normalize();

        Rigidbody rb = currentBall.GetComponent<Rigidbody>();
        if (rb != null)
            rb.linearVelocity = direction * ballSpeed;
    }

    public void OnBallHit()
    {
        Invoke(nameof(SpawnBall), ballDelay);
    }

    public void StopBallMode()
    {
        gameActive = false;
        CancelInvoke();
        if (currentBall != null)
            Destroy(currentBall);
    }
}