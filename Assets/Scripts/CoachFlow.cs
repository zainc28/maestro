using UnityEngine;
using TMPro;
using UnityEngine.UI;

public class CoachFlow : MonoBehaviour
{
    public enum AppState
    {
        Intro,
        ReadyPrompt,
        DrillSelect,
        Coaching,
        BallMode
    }

    [Header("References")]
    public Animator coachAnimator;
    public VoiceFeedback voiceFeedback;
    public SwingRecorder swingRecorder;
    public TMP_Text feedbackText;

    [Header("UI Panels")]
    public GameObject readyPanel;
    public GameObject drillPanel;
    public GameObject coachingPanel;

    [Header("Panel Text")]
    public TMP_Text readyPanelText;
    public TMP_Text drillPanelText;

    [Header("Animation Clips")]
    public string waveAnimationName = "Wave";
    public string idleAnimationName = "Idle";
    public string swingAnimationName = "Swing";

    public AppState currentState = AppState.Intro;
    public int goodSwingCount = 0;

    void Start()
    {
        readyPanel.SetActive(false);
        drillPanel.SetActive(false);
        coachingPanel.SetActive(false);
        swingRecorder.enabled = false;
        EnterIntro();
    }

    void EnterIntro()
    {
        currentState = AppState.Intro;
        if (coachAnimator != null)
            coachAnimator.Play(idleAnimationName);
        Invoke(nameof(SayGreeting), 1.5f);
    }

    void SayGreeting()
    {
        voiceFeedback?.Speak("Hey! Welcome to Maestro. Are you ready to practice tennis?");
        if (readyPanelText) readyPanelText.text = "Are you ready to practice tennis?";
        if (feedbackText) feedbackText.text = "Are you ready to practice tennis?";
        Invoke(nameof(ShowReadyPanel), 2f);
    }

    void ShowReadyPanel()
    {
        currentState = AppState.ReadyPrompt;
        readyPanel.SetActive(true);
    }

    public void OnReadyYes()
    {
        readyPanel.SetActive(false);
        voiceFeedback?.Speak("Great! What would you like to practice today?");
        if (drillPanelText) drillPanelText.text = "Choose what to practice:";
        if (feedbackText) feedbackText.text = "Choose what to practice:";
        Invoke(nameof(ShowDrillPanel), 1.5f);
    }

    public void OnReadyNo()
    {
        readyPanel.SetActive(false);
        voiceFeedback?.Speak("No problem! Come back when you're ready.");
        if (feedbackText) feedbackText.text = "See you next time!";
    }

    void ShowDrillPanel()
    {
        currentState = AppState.DrillSelect;
        drillPanel.SetActive(true);
    }

    public void OnSelectBackhand()
    {
        drillPanel.SetActive(false);
        currentState = AppState.Coaching;

        if (coachAnimator != null)
            coachAnimator.Play(swingAnimationName);

        swingRecorder.enabled = true;
        goodSwingCount = 0;

        voiceFeedback?.Speak("Great choice. Watch my form. Start behind your hips, then drive your arm forward and follow through.");
        if (feedbackText) feedbackText.text = "Watch the coach, then try it yourself!";

        Invoke(nameof(PromptUserToSwing), 5f);
    }

    void PromptUserToSwing()
    {
        voiceFeedback?.Speak("Now you try. Press the trigger to record your swing.");
        if (feedbackText) feedbackText.text = "Your turn! Press trigger to swing.";
        coachingPanel.SetActive(true);
    }

    public void RegisterGoodSwing()
    {
        goodSwingCount++;
        if (goodSwingCount >= 2 && currentState == AppState.Coaching)
            Invoke(nameof(PromptBallMode), 1.5f);
    }

    void PromptBallMode()
    {
        voiceFeedback?.Speak("Excellent! You're ready. Want to try returning some real balls?");
        if (readyPanelText) readyPanelText.text = "Ready for real balls?";
        if (feedbackText) feedbackText.text = "Ready for real balls?";
        readyPanel.SetActive(true);
        currentState = AppState.BallMode;
    }

    public void OnBallModeYes()
    {
        readyPanel.SetActive(false);
        voiceFeedback?.Speak("Here we go!");
        if (feedbackText) feedbackText.text = "Return the ball!";
    }
}