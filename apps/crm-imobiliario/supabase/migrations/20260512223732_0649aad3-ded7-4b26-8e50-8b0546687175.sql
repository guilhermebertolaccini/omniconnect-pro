-- Create public storage bucket for property documents (plans, permits, etc.)
INSERT INTO storage.buckets (id, name, public)
VALUES ('property-documents', 'property-documents', true)
ON CONFLICT (id) DO NOTHING;

-- Anyone can read (bucket is public)
CREATE POLICY "Public read property documents"
ON storage.objects FOR SELECT
USING (bucket_id = 'property-documents');

-- Admin and manager can upload
CREATE POLICY "Admin/manager upload property documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'property-documents'
  AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role))
);

-- Admin and manager can update
CREATE POLICY "Admin/manager update property documents"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'property-documents'
  AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role))
);

-- Admin and manager can delete
CREATE POLICY "Admin/manager delete property documents"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'property-documents'
  AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role))
);