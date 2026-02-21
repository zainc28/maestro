using UnityEngine;

public class VoiceFeedback : MonoBehaviour
{
#if UNITY_ANDROID && !UNITY_EDITOR
    private AndroidJavaObject tts;
    private AndroidJavaObject currentActivity;

    void Start()
    {
        currentActivity = new AndroidJavaClass("com.unity3d.player.UnityPlayer")
            .GetStatic<AndroidJavaObject>("currentActivity");
        tts = new AndroidJavaObject("android.speech.tts.TextToSpeech",
            currentActivity, null);
    }

    public void Speak(string text)
    {
        if (tts == null) return;
        tts.Call<int>("speak", text, 0, null, null);
    }

    void OnDestroy()
    {
        if (tts != null) tts.Call("shutdown");
    }

#else
    public void Speak(string text)
    {
        Debug.Log($"[TTS] {text}");
    }
#endif
}