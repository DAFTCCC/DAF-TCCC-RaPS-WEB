BEGIN;

CREATE OR REPLACE FUNCTION public.confirm_offline_evaluation_audit(
    p_evaluation_id uuid,
    p_field_started_at timestamptz,
    p_field_finalized_at timestamptz,
    p_field_result text,
    p_source_device_id text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private', 'auth'
AS $function$
DECLARE
    v_uid uuid := auth.uid();
    v_now timestamptz := clock_timestamp();
    v_eval public.evaluations%ROWTYPE;
    v_field_result text := upper(trim(coalesce(p_field_result, '')));
    v_existing_started_ms bigint;
    v_existing_finalized_ms bigint;
    v_existing_result text;
    v_field_started_ms bigint;
    v_field_finalized_ms bigint;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Authenticated RaPS session required.';
    END IF;

    IF p_evaluation_id IS NULL
       OR p_field_started_at IS NULL
       OR p_field_finalized_at IS NULL
       OR v_field_result = ''
    THEN
        RAISE EXCEPTION 'Evaluation ID, field timestamps, and field result are required.';
    END IF;

    IF p_field_finalized_at < p_field_started_at THEN
        RAISE EXCEPTION 'Field finalization time cannot precede field start time.';
    END IF;

    SELECT *
    INTO v_eval
    FROM public.evaluations
    WHERE id = p_evaluation_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'ok', false,
            'confirmed', false,
            'reason', 'evaluation_not_found'
        );
    END IF;

    IF v_eval.evaluator_id IS DISTINCT FROM v_uid THEN
        RETURN jsonb_build_object(
            'ok', false,
            'confirmed', false,
            'reason', 'evaluation_owned_by_other_evaluator'
        );
    END IF;

    IF v_eval.status::text <> 'finalized' THEN
        RETURN jsonb_build_object(
            'ok', false,
            'confirmed', false,
            'reason', 'evaluation_not_finalized'
        );
    END IF;

    IF upper(coalesce(v_eval.overall_result::text, '')) <> v_field_result THEN
        RETURN jsonb_build_object(
            'ok', false,
            'confirmed', false,
            'reason', 'field_result_mismatch',
            'serverResult', v_eval.overall_result::text,
            'fieldResult', v_field_result
        );
    END IF;

    /*
      The field timestamps must already have been uploaded before authoritative
      finalization. This prevents a later client from inventing or retroactively
      replacing offline field evidence after the server has finalized the row.
    */
    BEGIN
        v_existing_started_ms := nullif(v_eval.app_data->>'fieldStartedAt', '')::bigint;
        v_existing_finalized_ms := nullif(v_eval.app_data->>'fieldFinalizedAt', '')::bigint;
    EXCEPTION
        WHEN invalid_text_representation THEN
            RETURN jsonb_build_object(
                'ok', false,
                'confirmed', false,
                'reason', 'invalid_existing_field_evidence'
            );
    END;

    v_existing_result := upper(trim(coalesce(v_eval.app_data->>'fieldFinalResult', '')));
    v_field_started_ms := floor(extract(epoch FROM p_field_started_at) * 1000)::bigint;
    v_field_finalized_ms := floor(extract(epoch FROM p_field_finalized_at) * 1000)::bigint;

    IF v_existing_started_ms IS NULL
       OR v_existing_finalized_ms IS NULL
       OR v_existing_result = ''
    THEN
        RETURN jsonb_build_object(
            'ok', false,
            'confirmed', false,
            'reason', 'missing_preexisting_field_evidence'
        );
    END IF;

    IF v_existing_started_ms <> v_field_started_ms
       OR v_existing_finalized_ms <> v_field_finalized_ms
       OR v_existing_result <> v_field_result
    THEN
        RETURN jsonb_build_object(
            'ok', false,
            'confirmed', false,
            'reason', 'field_evidence_changed_after_upload'
        );
    END IF;

    UPDATE public.evaluations
    SET
        started_at = p_field_started_at,
        app_data =
            coalesce(app_data, '{}'::jsonb)
            ||
            jsonb_build_object(
                'offlineStarted', true,
                'serverVerificationStatus', 'verified',
                'serverClaimedAt', v_eval.started_at,
                'serverVerifiedAt', v_eval.completed_at,
                'serverAuditConfirmation',
                    jsonb_strip_nulls(
                        jsonb_build_object(
                            'confirmedAt', v_now,
                            'confirmedBy', v_uid,
                            'sourceDeviceId',
                                nullif(trim(p_source_device_id), '')
                        )
                    )
            ),
        client_modified_at = v_now,
        source_device_id =
            coalesce(
                nullif(trim(p_source_device_id), ''),
                source_device_id
            )
    WHERE id = p_evaluation_id
    RETURNING *
    INTO v_eval;

    RETURN jsonb_build_object(
        'ok', true,
        'confirmed', true,
        'evaluationId', v_eval.id,
        'serverClaimedAt', v_eval.started_at,
        'serverVerifiedAt', v_eval.completed_at,
        'confirmedAt', v_now,
        'serverModifiedAt', v_eval.client_modified_at
    );
END;
$function$;

REVOKE ALL
ON FUNCTION public.confirm_offline_evaluation_audit(
    uuid,
    timestamptz,
    timestamptz,
    text,
    text
)
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION public.confirm_offline_evaluation_audit(
    uuid,
    timestamptz,
    timestamptz,
    text,
    text
)
TO authenticated;

COMMIT;
