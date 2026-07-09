DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'agent_test_session_messages'
      AND policyname = 'agent_test_session_messages_no_direct_client_access'
  ) THEN
    CREATE POLICY agent_test_session_messages_no_direct_client_access
      ON agent_test_session_messages
      FOR ALL
      TO anon, authenticated
      USING (false)
      WITH CHECK (false);
  END IF;
END $$;
