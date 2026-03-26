using System.Collections.Generic;
using UnityEngine;
using TMPro;

public class SwingRecorder : MonoBehaviour
{
    [Header("Recording Settings")]
    public OVRInput.Button recordButton = OVRInput.Button.PrimaryIndexTrigger;
    public float sampleInterval = 0.05f;

    [Header("Line Rendering")]
    public LineRenderer swingLine;
    public LineRenderer ghostLine;
    public LineRenderer idealLine;
    public Color goodColor = Color.green;
    public Color badColor = Color.red;
    public Color recordingColor = Color.yellow;
    public Color ghostColor = new Color(0f, 1f, 1f, 0.4f);
    public Color idealColor = new Color(1f, 1f, 1f, 0.3f);

    [Header("UI")]
    public TMP_Text feedbackText;

    [Header("Voice")]
    public VoiceFeedback voiceFeedback;

    [Header("Flow")]
    public CoachFlow coachFlow;

    [Header("Ideal Path")]
    public List<Vector3> idealPath = new List<Vector3>();

    private List<Vector3> recordedPath = new List<Vector3>();
    private bool isRecording = false;
    private bool isRecordingIdeal = false;
    private List<Vector3> idealRecordPath = new List<Vector3>();
    private float sampleTimer = 0f;

    void Start()
    {
        // precorded ideal path
        idealPath = new List<Vector3>()
        {
            new Vector3( 0.4f,  0.8f, 0.3f),
            new Vector3( 0.3f,  0.85f, 0.35f),
            new Vector3( 0.2f,  0.9f, 0.4f),
            new Vector3( 0.1f,  0.95f, 0.45f),
            new Vector3( 0.0f,  1.0f, 0.5f),
            new Vector3(-0.1f,  1.05f, 0.5f),
            new Vector3(-0.2f,  1.1f, 0.5f),
            new Vector3(-0.3f,  1.15f, 0.45f),
            new Vector3(-0.4f,  1.2f, 0.4f),
            new Vector3(-0.5f,  1.25f, 0.35f),
            new Vector3(-0.6f,  1.3f, 0.3f),
        };

        // Convert to world space based on player position
        Transform playerTransform = Camera.main?.transform.parent;
        if (playerTransform != null)
        {
            for (int i = 0; i < idealPath.Count; i++)
                idealPath[i] = playerTransform.TransformPoint(idealPath[i]);
        }

        DrawLine(idealLine, idealPath, idealColor);
    }

    void Update()
    {
        if (OVRInput.GetDown(recordButton))
        {
            if (!isRecording) StartRecording();
            else StopRecordingAndEvaluate();
        }

        if (isRecording)
        {
            sampleTimer += Time.deltaTime;
            if (sampleTimer >= sampleInterval)
            {
                sampleTimer = 0f;
                Vector3 controllerPos = OVRInput.GetLocalControllerPosition(OVRInput.Controller.RTouch);
                controllerPos = Camera.main.transform.parent.TransformPoint(controllerPos);
                recordedPath.Add(controllerPos);
                DrawLine(swingLine, recordedPath, recordingColor);
            }
        }

        if (Input.GetKeyDown(KeyCode.Space))
        {
            if (!isRecording) StartRecording();
            else StopRecordingAndEvaluate();
        }

        // Hold both grips to override ideal path with custom recording
        bool bothGrips = OVRInput.Get(OVRInput.Button.PrimaryHandTrigger) &&
                         OVRInput.Get(OVRInput.Button.SecondaryHandTrigger);
        if (bothGrips && !isRecordingIdeal) StartIdealRecording();
        else if (!bothGrips && isRecordingIdeal) StopIdealRecording();

        if (isRecordingIdeal)
        {
            sampleTimer += Time.deltaTime;
            if (sampleTimer >= sampleInterval)
            {
                sampleTimer = 0f;
                Vector3 pos = OVRInput.GetLocalControllerPosition(OVRInput.Controller.RTouch);
                pos = Camera.main.transform.parent.TransformPoint(pos);
                idealRecordPath.Add(pos);
                DrawLine(ghostLine, idealRecordPath, ghostColor);
            }
        }

        // Always show saved ideal path
        if (idealPath.Count > 1)
            DrawLine(idealLine, idealPath, idealColor);
    }

    void StartRecording()
    {
        isRecording = true;
        recordedPath.Clear();
        Debug.Log("Recording started...");
        if (feedbackText) feedbackText.text = "Recording... swing now!";
        voiceFeedback?.Speak("Recording started. Swing now.");
    }

    void StopRecordingAndEvaluate()
    {
        isRecording = false;
        Debug.Log($"Recording stopped. Captured {recordedPath.Count} points.");
        if (feedbackText) feedbackText.text = $"Captured {recordedPath.Count} points...";

        if (idealPath.Count > 0)
            EvaluateSwing();
        else
        {
            DrawLine(swingLine, recordedPath, goodColor);
            voiceFeedback?.Speak("Swing recorded. No ideal path set yet.");
        }
    }

    void EvaluateSwing()
    {
        float deviation = CalculateDeviation(recordedPath, idealPath);
        float threshold = 0.7f;

        Color result = deviation < threshold ? goodColor : badColor;
        DrawLine(swingLine, recordedPath, result);

        string feedback = deviation < threshold
            ? "Good swing! Great form."
            : GetSpecificFeedback();

        Debug.Log(feedback);
        if (feedbackText) feedbackText.text = feedback;
        voiceFeedback?.Speak(feedback);

        if (deviation < threshold)
            coachFlow?.RegisterGoodSwing();
    }

    string GetSpecificFeedback()
    {
        if (recordedPath.Count < 2) return "Swing too short. Try again.";

        Vector3 start = recordedPath[0];
        Vector3 end = recordedPath[recordedPath.Count - 1];
        Vector3 lowest = recordedPath[0];

        foreach (Vector3 p in recordedPath)
            if (p.y < lowest.y) lowest = p;

        if (lowest.y < start.y - 0.5f)
            return "Keep your racket higher at impact.";

        if (Vector3.Distance(start, end) < 0.3f)
            return "Follow through more on your swing.";

        if (Mathf.Abs(end.x - start.x) > 0.8f)
            return "Straighten your swing path.";

        return "Adjust your swing. Keep practicing.";
    }

    float CalculateDeviation(List<Vector3> recorded, List<Vector3> ideal)
    {
        float total = 0f;
        int count = Mathf.Min(recorded.Count, ideal.Count);
        if (count == 0) return 999f;

        for (int i = 0; i < count; i++)
        {
            int idealIndex = Mathf.RoundToInt((float)i / count * (ideal.Count - 1));
            total += Vector3.Distance(recorded[i], ideal[idealIndex]);
        }
        return total / count;
    }

    void DrawLine(LineRenderer lr, List<Vector3> points, Color color)
    {
        if (lr == null || points.Count < 2) return;
        lr.positionCount = points.Count;
        lr.SetPositions(points.ToArray());
        lr.startColor = color;
        lr.endColor = color;
    }

    public void SaveAsIdealPath()
    {
        idealPath = new List<Vector3>(recordedPath);
        Debug.Log($"Ideal path saved with {idealPath.Count} points.");
        voiceFeedback?.Speak("Ideal path saved.");
    }

    void StartIdealRecording()
    {
        isRecordingIdeal = true;
        idealRecordPath.Clear();
        if (feedbackText) feedbackText.text = "Recording ideal path...";
        voiceFeedback?.Speak("Recording ideal path. Swing now.");
    }

    void StopIdealRecording()
    {
        isRecordingIdeal = false;
        idealPath = new List<Vector3>(idealRecordPath);
        DrawLine(idealLine, idealPath, idealColor);
        if (feedbackText) feedbackText.text = "Ideal path saved!";
        voiceFeedback?.Speak("Ideal path saved.");
    }
}