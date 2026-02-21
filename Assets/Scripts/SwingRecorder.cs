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
    public Color goodColor = Color.green;
    public Color badColor = Color.red;
    public Color recordingColor = Color.yellow;

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
    private float sampleTimer = 0f;

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
                DrawLine(recordedPath, recordingColor);
            }
        }

        if (Input.GetKeyDown(KeyCode.Space))
        {
            if (!isRecording) StartRecording();
            else StopRecordingAndEvaluate();
        }
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
            DrawLine(recordedPath, goodColor);
            voiceFeedback?.Speak("Swing recorded. No ideal path set yet.");
        }
    }

    void EvaluateSwing()
    {
        float deviation = CalculateDeviation(recordedPath, idealPath);
        float threshold = 0.3f;

        Color result = deviation < threshold ? goodColor : badColor;
        DrawLine(recordedPath, result);

        string feedback = deviation < threshold
            ? "Good swing! Great form."
            : GetSpecificFeedback();

        Debug.Log(feedback);
        if (feedbackText) feedbackText.text = feedback;
        voiceFeedback?.Speak(feedback);

        // Report good swing to flow manager
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

    void DrawLine(List<Vector3> points, Color color)
    {
        if (swingLine == null || points.Count < 2) return;
        swingLine.positionCount = points.Count;
        swingLine.SetPositions(points.ToArray());
        swingLine.startColor = color;
        swingLine.endColor = color;
    }

    public void SaveAsIdealPath()
    {
        idealPath = new List<Vector3>(recordedPath);
        Debug.Log($"Ideal path saved with {idealPath.Count} points.");
        voiceFeedback?.Speak("Ideal path saved.");
    }
}