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

        // Clean up previous ball
        if (currentBall != null)
            Destroy(currentBall);

        // Spawn new ball at spawn point
        currentBall = Instantiate(ballPrefab, spawnPoint.position, Quaternion.identity);

        // Calculate direction toward player
        Vector3 direction = (playerTarget.position - spawnPoint.position).normalized;

        // Add slight random vertical variation
        direction += new Vector3(
            Random.Range(-0.1f, 0.1f),
            Random.Range(-0.05f, 0.1f),
            0f
        );

        // Launch it
        Rigidbody rb = currentBall.GetComponent<Rigidbody>();
        if (rb != null)
            rb.linearVelocity = direction * ballSpeed;
    }

    public void OnBallHit()
    {
        // Called when player hits the ball
        // Wait then spawn the next one
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