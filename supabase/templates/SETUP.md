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

- `{{ .ConfirmationURL }}` — the action link (email confirmation and password reset)
- `{{ .TokenHash }}` — the hashed verification token (used by the invite template)
- `{{ .Email }}` — the recipient's email address
- `{{ .SiteURL }}` — your configured site URL

### Why the invite template doesn't use `{{ .ConfirmationURL }}`

The invite template constructs its link as `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite` instead of using `{{ .ConfirmationURL }}`. This is necessary because `{{ .ConfirmationURL }}` for invitations redirects to the Site URL root without a `type=invite` parameter, which prevents the app from detecting the invite flow and redirecting to the password-setting page. By constructing the URL directly, the invite link goes straight to the `/auth/confirm` handler with the correct `type=invite` parameter.

## Important: Site URL configuration

Make sure **Site URL** is set correctly in **Authentication → URL Configuration** so that `{{ .SiteURL }}` and `{{ .ConfirmationURL }}` point to your production domain, not `localhost`.
