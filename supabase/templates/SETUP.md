# Email Template Setup

These HTML templates replace the default Supabase auth emails with branded Metagen / SoilTrack designs.

## How to apply

1. Open the **Supabase Dashboard** for the SoilTrack project
2. Go to **Authentication → Email Templates**
3. For each template type below, paste the corresponding HTML file contents into the template editor

| Template type in Dashboard | File                  | Subject line                          |
| -------------------------- | --------------------- | ------------------------------------- |
| **Invite user**            | `invite.html`         | You're invited to SoilTrack           |
| **Confirm signup**         | `confirmation.html`   | Confirm your SoilTrack email          |
| **Reset password**         | `reset-password.html` | Reset your SoilTrack password         |

4. Update the **Subject** field for each template to match the suggested subject lines above
5. Click **Save** for each template

## Template variables

These templates use Supabase's built-in Go template variables:

- `{{ .ConfirmationURL }}` — the action link (invite acceptance, email confirmation, or password reset)
- `{{ .Email }}` — the recipient's email address
- `{{ .SiteURL }}` — your configured site URL

## Important: Site URL configuration

Make sure **Site URL** is set correctly in **Authentication → URL Configuration** so that `{{ .ConfirmationURL }}` points to your production domain, not `localhost`. The confirmation URL should resolve to your `/auth/confirm` or `/auth/callback` route.
