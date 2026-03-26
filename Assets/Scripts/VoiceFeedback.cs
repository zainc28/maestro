using UnityEngine;
using System.Collections.Generic;

public class VoiceFeedback : MonoBehaviour
{
    private AudioSource audioSource;

    private Dictionary<string, AudioClip> clips = new Dictionary<string, AudioClip>();

    private Dictionary<string, string> textToClip = new Dictionary<string, string>()
    {
        { "Hey! Welcome to Maestro. Are you ready to practice tennis?", "welcome" },
        { "Great! What would you like to practice today?", "choose_drill" },
        { "Great choice. Watch my form. Start behind your hips, then drive your arm forward and follow through.", "watch_form" },
        { "Now you try. Press the trigger to record your swing.", "your_turn" },
        { "Good swing! Great form.", "good_swing" },
        { "Keep your racket higher at impact.", "racket_higher" },
        { "Follow through more on your swing.", "follow_through" },
        { "Excellent! You're ready. Want to try returning some real balls?", "ready_balls" },
        { "Here we go!", "here_we_go" },
        { "Recording started. Swing now.", "recording_started" },
        { "Ideal path saved.", "ideal_saved" },
        { "Recording ideal path. Swing now.", "recording_started" },
        { "Ideal path saved!", "ideal_saved" },
        { "No problem! Come back when you're ready.", "welcome" },
        { "No problem, keep practicing!", "your_turn" },
    };

    void Start()
    {
        audioSource = gameObject.AddComponent<AudioSource>();
        audioSource.playOnAwake = false;

        AudioClip[] loaded = Resources.LoadAll<AudioClip>("Audio");
        foreach (AudioClip clip in loaded)
            clips[clip.name] = clip;

        Debug.Log($"[VoiceFeedback] Loaded {clips.Count} audio clips.");
    }

    public void Speak(string text)
    {
        Debug.Log($"[Voice] {text}");

        if (textToClip.TryGetValue(text, out string clipName))
        {
            if (clips.TryGetValue(clipName, out AudioClip clip))
            {
                audioSource.Stop();
                audioSource.clip = clip;
                audioSource.Play();
                return;
            }
            else
                Debug.LogWarning($"[VoiceFeedback] Clip not found: {clipName}");
        }
        else
            Debug.LogWarning($"[VoiceFeedback] No mapping for: {text}");
    }
}