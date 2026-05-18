DROP POLICY IF EXISTS "Authenticated read proposal-contracts" ON storage.objects;

CREATE POLICY "Read own proposal-contracts" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'proposal-contracts'
    AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'manager'::app_role)
    )
  );