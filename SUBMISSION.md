# App Store Submission — VITImeasure

## Demo Credentials

Use the following credentials to review the app without completing the registration flow:

| Field    | Value                        |
|----------|------------------------------|
| Email    | demo@vitimeasure.com         |
| Password | VITIdemo2024!                |

> The demo account contains pre-populated scan history, stress log entries, and a completed onboarding flow so all features are immediately accessible.

## Key Features to Review

1. **Dashboard** — summary strip with patch count and VASI score trend
2. **Scan** — camera capture flow for a body location; AI analysis runs on the backend
3. **History** — per-patch scan timeline with repigmentation velocity chart
4. **Stress tracking** — daily stress tap (1–5), calendar heatmap, correlation insight
5. **Settings** — scan reminders, stress check-in notifications, Privacy Policy, Delete Account

## Permissions Used

| Permission | Why |
|------------|-----|
| Camera | Photograph vitiligo patches for analysis |
| Photo Library | Upload existing scan images |
| Notifications | Weekly scan reminders + daily stress check-ins (user-initiated in Settings) |

Notification permissions are **not** requested automatically on launch. The user must enable them explicitly in the Settings tab.

## Notes for Reviewers

- The app requires an internet connection to sync scans. Offline data is preserved locally on-device via the file system.
- The Delete Account feature calls `DELETE /api/auth/account` and erases all server-side data immediately.
- All AI measurements are estimates and the app displays a Medical Disclaimer on the Settings screen.
