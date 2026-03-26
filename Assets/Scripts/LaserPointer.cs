using System.Collections.Generic;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

public class LaserPointer : MonoBehaviour
{
    public LineRenderer lineRenderer;
    public float rayLength = 5f;
    private GraphicRaycaster raycaster;

    void Start()
    {
        raycaster = FindObjectOfType<GraphicRaycaster>();
    }

    void Update()
    {
        lineRenderer.SetPosition(0, transform.position);
        lineRenderer.SetPosition(1, transform.position + transform.forward * rayLength);

        if (OVRInput.GetDown(OVRInput.Button.PrimaryIndexTrigger))
        {
            PointerEventData pointerData = new PointerEventData(EventSystem.current);
            pointerData.position = new Vector2(Screen.width / 2, Screen.height / 2);

            List<RaycastResult> results = new List<RaycastResult>();
            raycaster.Raycast(pointerData, results);

            foreach (RaycastResult result in results)
            {
                Button btn = result.gameObject.GetComponent<Button>();
                if (btn == null)
                    btn = result.gameObject.GetComponentInParent<Button>();
                if (btn != null)
                {
                    btn.onClick.Invoke();
                    return;
                }
            }
        }
    }
}