import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * After a trial is created or updated, auto-link it to a field.
 *
 * Logic:
 * 1. Read the trial to get client_id, grower, location
 * 2. Look for an existing field matching client_id + location (or grower + location)
 * 3. If found, link the trial to that field (if not already linked)
 * 4. If not found, create a new field from the trial metadata and link it
 *
 * This is best-effort — failures are logged but don't break the upload.
 */
export async function autoLinkTrialToField(
  supabase: SupabaseClient,
  trialId: string
): Promise<void> {
  try {
    // 1. Fetch the trial
    const { data: trial } = await supabase
      .from('trials')
      .select('id, name, client_id, grower, location, gps, crop')
      .eq('id', trialId)
      .single()

    if (!trial) return

    // Need at least a location or grower to create a meaningful field
    const location = trial.location?.trim()
    const grower = trial.grower?.trim()

    if (!location && !grower) return

    // 2. Check if already linked to any field
    const { data: existingLink } = await supabase
      .from('field_trials')
      .select('id')
      .eq('trial_id', trialId)
      .limit(1)

    if (existingLink && existingLink.length > 0) return // already linked

    // 3. Try to find an existing field that matches
    let fieldId: string | null = null

    // Match by client_id + location first (strongest match)
    if (trial.client_id && location) {
      const { data: match } = await supabase
        .from('fields')
        .select('id')
        .eq('client_id', trial.client_id)
        .ilike('farm', location)
        .limit(1)

      if (match && match.length > 0) {
        fieldId = match[0].id
      }

      // Also try matching on region
      if (!fieldId) {
        const { data: match2 } = await supabase
          .from('fields')
          .select('id')
          .eq('client_id', trial.client_id)
          .ilike('region', location)
          .limit(1)

        if (match2 && match2.length > 0) {
          fieldId = match2[0].id
        }
      }
    }

    // Match by name containing location or grower
    if (!fieldId && location) {
      const { data: match } = await supabase
        .from('fields')
        .select('id')
        .ilike('name', `%${location}%`)
        .limit(1)

      if (match && match.length > 0) {
        fieldId = match[0].id
      }
    }

    // 4. If no matching field found, create one
    if (!fieldId) {
      // Resolve client_id from grower name if not set on the trial
      let clientId = trial.client_id
      if (!clientId && grower) {
        const { data: clientMatch } = await supabase
          .from('clients')
          .select('id')
          .ilike('name', grower)
          .limit(1)

        if (clientMatch && clientMatch.length > 0) {
          clientId = clientMatch[0].id
        }
      }

      const fieldName = location || grower || trial.name
      const { data: newField } = await supabase
        .from('fields')
        .insert({
          name: fieldName,
          client_id: clientId || null,
          farm: location || null,
          region: null,
          notes: `Auto-created from trial ${trialId}`,
        })
        .select('id')
        .single()

      if (!newField) return
      fieldId = newField.id
    }

    // 5. Link the trial to the field
    await supabase
      .from('field_trials')
      .upsert(
        { field_id: fieldId, trial_id: trialId },
        { onConflict: 'field_id,trial_id', ignoreDuplicates: true }
      )
  } catch (err) {
    // Best-effort — don't break the upload
    console.error('autoLinkTrialToField failed:', err)
  }
}
